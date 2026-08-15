import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../device/kiosk_device_models.dart';
import '../device/kiosk_device_session_controller.dart';
import 'kiosk_garment_input.dart';
import 'kiosk_try_on_models.dart';

abstract class KioskTryOnGateway {
  Future<KioskTryOnRun> createRun(KioskTryOnRequest request);

  Future<KioskTryOnRun> getRun(String runId);
}

class KioskTryOnApiConfig {
  const KioskTryOnApiConfig({
    required this.apiBaseUrl,
    this.runsPath = '/api/v1/kiosk/try-on/runs',
  });

  factory KioskTryOnApiConfig.fromEnvironment() {
    return const KioskTryOnApiConfig(
      apiBaseUrl: String.fromEnvironment('SELFX_KIOSK_API_BASE_URL'),
    );
  }

  final String apiBaseUrl;
  final String runsPath;

  bool get isConfigured => apiBaseUrl.trim().isNotEmpty;
}

class SelfxKioskTryOnGateway implements KioskTryOnGateway {
  SelfxKioskTryOnGateway({
    required this.config,
    required this.deviceController,
    http.Client? client,
    this.timeout = const Duration(seconds: 45),
  }) : client = client ?? http.Client();

  final KioskTryOnApiConfig config;
  final KioskDeviceSessionController deviceController;
  final http.Client client;
  final Duration timeout;

  @override
  Future<KioskTryOnRun> createRun(KioskTryOnRequest request) async {
    _assertConfigured();
    if (!await request.garmentInput.exists()) {
      throw const KioskTryOnException(
        KioskTryOnFailureCode.garmentMissing,
        'Choose a garment image before generating.',
      );
    }
    if (!await request.personImage.exists()) {
      throw const KioskTryOnException(
        KioskTryOnFailureCode.personMissing,
        'Customer photo is unavailable.',
      );
    }

    final response = await _sendWithDeviceAuth(
      forceRefresh: false,
      requestFactory: (accessToken) async {
        final multipart = http.MultipartRequest('POST', _runsUri());
        multipart.headers[HttpHeaders.authorizationHeader] =
            'Bearer ${accessToken.trim()}';
        multipart.fields.addAll(_fieldsFor(request));
        multipart.files.add(
          await http.MultipartFile.fromPath(
            'personImage',
            request.personImage.path,
            contentType: _contentTypeFor(request.personImage.path),
          ),
        );
        multipart.files.add(
          await http.MultipartFile.fromPath(
            'garmentImage',
            request.garmentInput.localPath,
            contentType: _contentTypeFor(request.garmentInput.localPath),
          ),
        );
        return multipart;
      },
    );
    return _decodeRun(response);
  }

  @override
  Future<KioskTryOnRun> getRun(String runId) async {
    _assertConfigured();
    final response = await _getWithDeviceAuth(runId, forceRefresh: false);
    return _decodeRun(response);
  }

  Map<String, String> _fieldsFor(KioskTryOnRequest request) {
    return {
      'clientRequestId': request.clientRequestId,
      'garmentSource': 'DIRECT_UPLOAD',
      'garmentIntent': request.garmentInput.intent.apiValue,
      'category': request.garmentInput.intent.categoryApiValue,
      'garmentPhotoType': request.garmentInput.photoType.apiValue,
      'generationProfile': 'BALANCED',
      'categoryResolutionSource':
          request.garmentInput.intent == KioskGarmentIntent.auto
          ? 'AUTO_FALLBACK'
          : 'INTERNAL_LAB_OVERRIDE',
      'photoTypeResolutionSource':
          request.garmentInput.photoType == KioskGarmentPhotoType.auto
          ? 'AUTO_FALLBACK'
          : 'INTERNAL_LAB_OVERRIDE',
      'profileResolutionSource': 'PLATFORM_DEFAULT',
      'disambiguationRequired': 'false',
      'disambiguationResolved':
          request.garmentInput.intent == KioskGarmentIntent.auto
          ? 'false'
          : 'true',
      'garmentAnalysisReasonCodes': '[]',
      'qualityWarningCodes': '[]',
      'qualityOverrideAccepted': 'false',
    };
  }

  KioskTryOnRun _decodeRun(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      if (_isDeviceAuthRejected(response)) {
        unawaited(deviceController.handleDeviceAuthRejected());
      }
      throw KioskTryOnException(
        response.statusCode == 401 || response.statusCode == 403
            ? KioskTryOnFailureCode.deviceAuthenticationRejected
            : KioskTryOnFailureCode.uploadFailed,
        _safeErrorMessage(response.body),
      );
    }

    final json = jsonDecode(response.body);
    if (json is! Map<String, dynamic>) {
      throw const KioskTryOnException(
        KioskTryOnFailureCode.uploadFailed,
        'SelfX returned an unexpected Try-On response.',
      );
    }

    final id = json['id'];
    final status = json['status'];
    if (id is! String || status is! String) {
      throw const KioskTryOnException(
        KioskTryOnFailureCode.uploadFailed,
        'SelfX Try-On run response was incomplete.',
      );
    }

    return KioskTryOnRun(
      id: id,
      status: _mapStatus(status),
      resultImage: json['resultImage'] is String
          ? json['resultImage'] as String
          : null,
      failureCode: json['errorCode'] is String
          ? KioskTryOnFailureCode.generationFailed
          : null,
      failureMessage: json['errorMessage'] is String
          ? json['errorMessage'] as String
          : null,
    );
  }

  KioskTryOnStatus _mapStatus(String status) {
    return switch (status) {
      'QUEUED' => KioskTryOnStatus.queued,
      'PROCESSING' => KioskTryOnStatus.processing,
      'COMPLETED' => KioskTryOnStatus.succeeded,
      'SUCCEEDED' => KioskTryOnStatus.succeeded,
      'FAILED' => KioskTryOnStatus.failed,
      _ => KioskTryOnStatus.failed,
    };
  }

  Future<http.Response> _sendWithDeviceAuth({
    required bool forceRefresh,
    required Future<http.BaseRequest> Function(String accessToken)
    requestFactory,
  }) async {
    final accessToken = await _deviceAccessToken(forceRefresh: forceRefresh);
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

  Future<http.Response> _getWithDeviceAuth(
    String runId, {
    required bool forceRefresh,
  }) async {
    final accessToken = await _deviceAccessToken(forceRefresh: forceRefresh);
    final response = await client
        .get(
          _runsUri(runId),
          headers: {
            HttpHeaders.authorizationHeader: 'Bearer ${accessToken.trim()}',
          },
        )
        .timeout(timeout);
    if (!forceRefresh && _isTokenRefreshable(response)) {
      return _getWithDeviceAuth(runId, forceRefresh: true);
    }
    return response;
  }

  Future<String> _deviceAccessToken({required bool forceRefresh}) async {
    try {
      return await deviceController.requireAccessToken(
        forceRefresh: forceRefresh,
      );
    } on KioskDeviceException catch (error) {
      if (error.isRevoked) {
        await deviceController.handleDeviceAuthRejected();
      }
      throw KioskTryOnException(
        KioskTryOnFailureCode.deviceAuthenticationRejected,
        error.message,
      );
    }
  }

  Uri _runsUri([String? runId]) {
    final base = Uri.parse(config.apiBaseUrl.trim());
    final path = runId == null ? config.runsPath : '${config.runsPath}/$runId';
    return base.replace(path: _joinPaths(base.path, path));
  }

  String _joinPaths(String basePath, String childPath) {
    final left = basePath.endsWith('/')
        ? basePath.substring(0, basePath.length - 1)
        : basePath;
    final right = childPath.startsWith('/') ? childPath : '/$childPath';
    return '$left$right';
  }

  void _assertConfigured() {
    if (config.apiBaseUrl.trim().isEmpty) {
      throw const KioskTryOnException(
        KioskTryOnFailureCode.configurationMissing,
        'SelfX API is not configured on this kiosk.',
      );
    }
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
    } catch (_) {
      // Keep customer-facing errors generic when the API response is not JSON.
    }
    return 'SelfX could not create the Try-On run.';
  }
}

bool _isTokenRefreshable(http.Response response) {
  if (response.statusCode != 401) {
    return false;
  }
  final code = _errorCode(response.body);
  return code == 'DEVICE_TOKEN_INVALID' || code == 'DEVICE_TOKEN_EXPIRED';
}

bool _isDeviceAuthRejected(http.Response response) {
  if (response.statusCode != 401 && response.statusCode != 403) {
    return false;
  }
  final code = _errorCode(response.body);
  return code == 'DEVICE_TOKEN_INVALID' ||
      code == 'DEVICE_TOKEN_EXPIRED' ||
      code == 'DEVICE_UNPAIRED' ||
      code == 'DEVICE_INACTIVE' ||
      code == 'DEVICE_REVOKED' ||
      code == 'DEVICE_DELETED';
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
