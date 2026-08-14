import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import 'kiosk_garment_input.dart';
import 'kiosk_try_on_models.dart';

abstract class KioskTryOnGateway {
  Future<KioskTryOnRun> createRun(KioskTryOnRequest request);

  Future<KioskTryOnRun> getRun(String runId);
}

class KioskTryOnApiConfig {
  const KioskTryOnApiConfig({
    required this.apiBaseUrl,
    required this.accessToken,
    this.runsPath = '/api/v1/try-on-lab/runs',
  });

  factory KioskTryOnApiConfig.fromEnvironment() {
    return const KioskTryOnApiConfig(
      apiBaseUrl: String.fromEnvironment('SELFX_KIOSK_API_BASE_URL'),
      accessToken: String.fromEnvironment('SELFX_KIOSK_DEV_ACCESS_TOKEN'),
    );
  }

  final String apiBaseUrl;
  final String accessToken;
  final String runsPath;

  bool get isConfigured =>
      apiBaseUrl.trim().isNotEmpty && accessToken.trim().isNotEmpty;
}

class SelfxKioskTryOnGateway implements KioskTryOnGateway {
  SelfxKioskTryOnGateway({
    required this.config,
    http.Client? client,
    this.timeout = const Duration(seconds: 45),
  }) : client = client ?? http.Client();

  final KioskTryOnApiConfig config;
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

    final multipart = http.MultipartRequest('POST', _runsUri());
    multipart.headers[HttpHeaders.authorizationHeader] =
        'Bearer ${config.accessToken.trim()}';
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

    final streamed = await client.send(multipart).timeout(timeout);
    final response = await http.Response.fromStream(streamed);
    return _decodeRun(response);
  }

  @override
  Future<KioskTryOnRun> getRun(String runId) async {
    _assertConfigured();
    final response = await client
        .get(
          _runsUri(runId),
          headers: {
            HttpHeaders.authorizationHeader:
                'Bearer ${config.accessToken.trim()}',
          },
        )
        .timeout(timeout);
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
      throw KioskTryOnException(
        response.statusCode == 401 || response.statusCode == 403
            ? KioskTryOnFailureCode.authenticationMissing
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
      'FAILED' => KioskTryOnStatus.failed,
      _ => KioskTryOnStatus.failed,
    };
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
    if (config.accessToken.trim().isEmpty) {
      throw const KioskTryOnException(
        KioskTryOnFailureCode.authenticationMissing,
        'Development kiosk Try-On access token is not configured.',
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
