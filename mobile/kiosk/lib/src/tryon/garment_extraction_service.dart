import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../device/kiosk_device_models.dart';
import '../device/kiosk_device_session_controller.dart';
import '../session/temporary_capture_store.dart';
import 'kiosk_garment_input.dart';

enum GarmentExtractionStatus { unavailable, succeeded, failed }

enum GarmentExtractionFailureKind { image, temporary }

class GarmentExtractionResult {
  const GarmentExtractionResult({
    required this.status,
    this.previewPath,
    this.message,
    this.code,
    this.failureKind = GarmentExtractionFailureKind.temporary,
  });

  final GarmentExtractionStatus status;
  final String? previewPath;
  final String? message;
  final String? code;
  final GarmentExtractionFailureKind failureKind;

  bool get hasPreview =>
      status == GarmentExtractionStatus.succeeded &&
      previewPath != null &&
      previewPath!.trim().isNotEmpty;
}

abstract class GarmentExtractionService {
  Future<GarmentExtractionResult> extractPreview(KioskGarmentInput input);
}

class UnavailableGarmentExtractionService implements GarmentExtractionService {
  const UnavailableGarmentExtractionService();

  @override
  Future<GarmentExtractionResult> extractPreview(
    KioskGarmentInput input,
  ) async {
    return const GarmentExtractionResult(
      status: GarmentExtractionStatus.unavailable,
      message: 'Garment extraction is not configured on this kiosk.',
      code: 'GARMENT_PREVIEW_CONFIGURATION_ERROR',
    );
  }
}

class KioskGarmentExtractionApiConfig {
  const KioskGarmentExtractionApiConfig({
    required this.apiBaseUrl,
    this.extractionsPath = '/api/v1/kiosk/garment-extractions',
  });

  factory KioskGarmentExtractionApiConfig.fromEnvironment() {
    return const KioskGarmentExtractionApiConfig(
      apiBaseUrl: String.fromEnvironment('SELFX_KIOSK_API_BASE_URL'),
    );
  }

  final String apiBaseUrl;
  final String extractionsPath;

  bool get isConfigured => apiBaseUrl.trim().isNotEmpty;
}

class SelfxGarmentExtractionService implements GarmentExtractionService {
  SelfxGarmentExtractionService({
    required this.config,
    required this.deviceController,
    required this.captureStore,
    http.Client? client,
    this.timeout = const Duration(seconds: 125),
  }) : client = client ?? http.Client();

  final KioskGarmentExtractionApiConfig config;
  final KioskDeviceSessionController deviceController;
  final TemporaryCaptureStore captureStore;
  final http.Client client;
  final Duration timeout;

  @override
  Future<GarmentExtractionResult> extractPreview(
    KioskGarmentInput input,
  ) async {
    if (!config.isConfigured) {
      return const GarmentExtractionResult(
        status: GarmentExtractionStatus.failed,
        message: 'SelfX API is not configured on this kiosk.',
        code: 'GARMENT_PREVIEW_CONFIGURATION_ERROR',
      );
    }
    if (!await input.exists()) {
      return const GarmentExtractionResult(
        status: GarmentExtractionStatus.failed,
        message: 'Garment photo is unavailable.',
        code: 'GARMENT_PREVIEW_IMAGE_MISSING',
        failureKind: GarmentExtractionFailureKind.image,
      );
    }

    try {
      final response = await _sendWithDeviceAuth(
        forceRefresh: false,
        requestFactory: (accessToken) async {
          final multipart = http.MultipartRequest('POST', _extractionsUri());
          multipart.headers[HttpHeaders.authorizationHeader] =
              'Bearer ${accessToken.trim()}';
          multipart.fields['garmentIntent'] = input.intent.apiValue;
          multipart.files.add(
            await http.MultipartFile.fromPath(
              'garmentImage',
              input.localPath,
              contentType: _contentTypeFor(input.localPath),
            ),
          );
          return multipart;
        },
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final terminalDeviceError = _terminalDeviceError(response);
        if (terminalDeviceError != null) {
          unawaited(
            deviceController.handleDeviceAuthRejected(terminalDeviceError),
          );
        }
        return GarmentExtractionResult(
          status: GarmentExtractionStatus.failed,
          message: _safeErrorMessage(response.body),
          code: _errorCode(response.body),
          failureKind: _failureKindFor(_errorCode(response.body)),
        );
      }

      final dataUri = _dataUriFrom(response.body);
      if (dataUri == null) {
        return const GarmentExtractionResult(
          status: GarmentExtractionStatus.failed,
          message: 'SelfX did not return a garment image.',
          code: 'GARMENT_PREVIEW_RESPONSE_INVALID',
        );
      }

      final savedPath = await _saveDataUri(dataUri);
      return GarmentExtractionResult(
        status: GarmentExtractionStatus.succeeded,
        previewPath: savedPath,
      );
    } on KioskDeviceException catch (error) {
      if (error.isRevoked) {
        await deviceController.handleDeviceAuthRejected();
      }
      return GarmentExtractionResult(
        status: GarmentExtractionStatus.failed,
        message: error.message,
        code: error.code,
      );
    } on TimeoutException {
      return const GarmentExtractionResult(
        status: GarmentExtractionStatus.failed,
        message: 'SelfX could not prepare the garment image in time.',
        code: 'GARMENT_PREVIEW_TIMEOUT',
      );
    } on SocketException {
      return const GarmentExtractionResult(
        status: GarmentExtractionStatus.failed,
        message: 'SelfX could not be reached.',
        code: 'GARMENT_PREVIEW_NETWORK_UNAVAILABLE',
      );
    } catch (_) {
      return const GarmentExtractionResult(
        status: GarmentExtractionStatus.failed,
        message: 'SelfX could not prepare the garment image.',
        code: 'GARMENT_PREVIEW_FAILED',
      );
    }
  }

  Future<http.Response> _sendWithDeviceAuth({
    required bool forceRefresh,
    required Future<http.BaseRequest> Function(String accessToken)
    requestFactory,
  }) async {
    final accessToken = await deviceController.requireAccessToken(
      forceRefresh: forceRefresh,
    );
    final request = await requestFactory(accessToken);
    final streamed = await client.send(request).timeout(timeout);
    final response = await http.Response.fromStream(streamed);
    if (!forceRefresh && _isTokenRefreshable(response)) {
      return _sendWithDeviceAuth(
        forceRefresh: true,
        requestFactory: requestFactory,
      );
    }
    return response;
  }

  Uri _extractionsUri() {
    final base = Uri.parse(config.apiBaseUrl.trim());
    return base.replace(path: _joinPaths(base.path, config.extractionsPath));
  }

  String _joinPaths(String basePath, String childPath) {
    final left = basePath.endsWith('/')
        ? basePath.substring(0, basePath.length - 1)
        : basePath;
    final right = childPath.startsWith('/') ? childPath : '/$childPath';
    return '$left$right';
  }

  String? _dataUriFrom(String body) {
    try {
      final json = jsonDecode(body);
      if (json is Map<String, dynamic> && json['imageDataUri'] is String) {
        return json['imageDataUri'] as String;
      }
    } catch (_) {}
    return null;
  }

  Future<String> _saveDataUri(String dataUri) async {
    final match = RegExp(
      r'^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$',
    ).firstMatch(dataUri.trim());
    if (match == null) {
      throw const FormatException('Unsupported garment image data URI.');
    }
    final mimeType = match.group(1)!;
    final extension = switch (mimeType) {
      'image/jpeg' => '.jpg',
      'image/webp' => '.webp',
      _ => '.png',
    };
    final bytes = base64Decode(match.group(2)!.replaceAll(RegExp(r'\s'), ''));
    final path = await captureStore.createTempCapturePath(
      prefix: 'garment-extracted',
      extension: extension,
    );
    await File(path).writeAsBytes(bytes, flush: true);
    return path;
  }

  String _safeErrorMessage(String body) {
    try {
      final json = jsonDecode(body);
      if (json is Map<String, dynamic>) {
        final error = json['error'];
        if (error is Map<String, dynamic> && error['message'] is String) {
          return error['message'] as String;
        }
      }
    } catch (_) {}
    return 'SelfX could not prepare the garment image.';
  }
}

GarmentExtractionFailureKind _failureKindFor(String? code) {
  return switch (code) {
    'GARMENT_EXTRACTION_IMAGE_INVALID' ||
    'GARMENT_EXTRACTION_NO_GARMENT' ||
    'GARMENT_EXTRACTION_GARMENT_NOT_FOUND' ||
    'GARMENT_EXTRACTION_GARMENT_UNCLEAR' ||
    'GARMENT_EXTRACTION_MULTIPART_INVALID' ||
    'GARMENT_PREVIEW_IMAGE_MISSING' => GarmentExtractionFailureKind.image,
    _ => GarmentExtractionFailureKind.temporary,
  };
}

bool _isTokenRefreshable(http.Response response) {
  if (response.statusCode != 401) {
    return false;
  }
  final code = _errorCode(response.body);
  return code == 'DEVICE_TOKEN_INVALID' || code == 'DEVICE_TOKEN_EXPIRED';
}

KioskDeviceException? _terminalDeviceError(http.Response response) {
  if (response.statusCode != 401 && response.statusCode != 403) {
    return null;
  }
  final code = _errorCode(response.body);
  if (code == 'DEVICE_UNPAIRED' ||
      code == 'DEVICE_INACTIVE' ||
      code == 'DEVICE_REVOKED' ||
      code == 'DEVICE_DELETED') {
    return KioskDeviceException(
      code!,
      'Kiosk device authentication was rejected.',
    );
  }
  return null;
}

String? _errorCode(String body) {
  try {
    final json = jsonDecode(body);
    if (json is Map<String, dynamic>) {
      final error = json['error'];
      if (error is Map<String, dynamic> && error['code'] is String) {
        return error['code'] as String;
      }
    }
  } catch (_) {}
  return null;
}

MediaType _contentTypeFor(String path) {
  final lower = path.toLowerCase();
  if (lower.endsWith('.png')) {
    return MediaType('image', 'png');
  }
  if (lower.endsWith('.webp')) {
    return MediaType('image', 'webp');
  }
  return MediaType('image', 'jpeg');
}
