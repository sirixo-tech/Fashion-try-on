import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../device/kiosk_device_models.dart';
import '../device/kiosk_device_session_controller.dart';
import 'kiosk_garment_input.dart';
import 'kiosk_try_on_models.dart';
import 'model_garment_compatibility.dart';

abstract class KioskTryOnGateway {
  Future<KioskTryOnRun> createRun(KioskTryOnRequest request);

  Future<KioskTryOnRun> getRun(String runId);
}

abstract class KioskTryOnSessionGateway {
  Future<KioskTryOnSession> createTryOnSession();

  Future<KioskTryOnAsset> setSessionPerson({
    required String sessionId,
    required File personImage,
  });

  Future<List<KioskTryOnLook>> getSessionLooks(String sessionId);

  Future<KioskTryOnShare> createSessionShare(String sessionId);

  Future<KioskTryOnSession> completeTryOnSession(String sessionId);
}

class KioskTryOnApiConfig {
  const KioskTryOnApiConfig({
    required this.apiBaseUrl,
    this.runsPath = '/api/v1/kiosk/try-on/runs',
    this.sessionsPath = '/api/v1/kiosk/try-on/sessions',
  });

  factory KioskTryOnApiConfig.fromEnvironment() {
    return const KioskTryOnApiConfig(
      apiBaseUrl: String.fromEnvironment('SELFX_KIOSK_API_BASE_URL'),
    );
  }

  final String apiBaseUrl;
  final String runsPath;
  final String sessionsPath;

  bool get isConfigured => apiBaseUrl.trim().isNotEmpty;
}

class SelfxKioskTryOnGateway
    implements KioskTryOnGateway, KioskTryOnSessionGateway {
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
  Future<KioskTryOnSession> createTryOnSession() async {
    _assertConfigured();
    final response = await _requestWithDeviceAuth(
      forceRefresh: false,
      requestFactory: (accessToken) {
        return http.Request('POST', _sessionsUri())
          ..headers[HttpHeaders.authorizationHeader] =
              'Bearer ${accessToken.trim()}';
      },
    );
    return _decodeSession(response);
  }

  @override
  Future<KioskTryOnAsset> setSessionPerson({
    required String sessionId,
    required File personImage,
  }) async {
    _assertConfigured();
    if (!await personImage.exists()) {
      throw const KioskTryOnException(
        KioskTryOnFailureCode.personMissing,
        'Customer photo is unavailable.',
      );
    }

    final response = await _sendWithDeviceAuth(
      forceRefresh: false,
      requestFactory: (accessToken) async {
        final multipart = http.MultipartRequest(
          'POST',
          _sessionsUri('$sessionId/person'),
        );
        multipart.headers[HttpHeaders.authorizationHeader] =
            'Bearer ${accessToken.trim()}';
        multipart.files.add(
          await http.MultipartFile.fromPath(
            'personImage',
            personImage.path,
            contentType: _contentTypeFor(personImage.path),
          ),
        );
        return multipart;
      },
    );
    return _decodeAsset(response);
  }

  @override
  Future<KioskTryOnRun> createRun(KioskTryOnRequest request) async {
    _assertConfigured();
    if (!await request.garmentInput.exists()) {
      throw const KioskTryOnException(
        KioskTryOnFailureCode.garmentMissing,
        'Choose a garment image before generating.',
      );
    }
    final personImage = request.personImage;
    if (!request.usesStoredPerson &&
        (personImage == null || !await personImage.exists())) {
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
        if (!request.usesStoredPerson && personImage != null) {
          multipart.files.add(
            await http.MultipartFile.fromPath(
              'personImage',
              personImage.path,
              contentType: _contentTypeFor(personImage.path),
            ),
          );
        }
        if (!request.garmentInput.isCatalogProduct) {
          multipart.files.add(
            await http.MultipartFile.fromPath(
              'garmentImage',
              request.garmentInput.localPath,
              contentType: _contentTypeFor(request.garmentInput.localPath),
            ),
          );
        }
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

  @override
  Future<List<KioskTryOnLook>> getSessionLooks(String sessionId) async {
    _assertConfigured();
    final response = await _requestWithDeviceAuth(
      forceRefresh: false,
      requestFactory: (accessToken) {
        return http.Request('GET', _sessionsUri('$sessionId/looks'))
          ..headers[HttpHeaders.authorizationHeader] =
              'Bearer ${accessToken.trim()}';
      },
    );
    return _decodeLooks(response);
  }

  @override
  Future<KioskTryOnShare> createSessionShare(String sessionId) async {
    _assertConfigured();
    final response = await _requestWithDeviceAuth(
      forceRefresh: false,
      requestFactory: (accessToken) {
        return http.Request('POST', _sessionsUri('$sessionId/share'))
          ..headers[HttpHeaders.authorizationHeader] =
              'Bearer ${accessToken.trim()}';
      },
    );
    return _decodeShare(response);
  }

  @override
  Future<KioskTryOnSession> completeTryOnSession(String sessionId) async {
    _assertConfigured();
    final response = await _requestWithDeviceAuth(
      forceRefresh: false,
      requestFactory: (accessToken) {
        return http.Request('POST', _sessionsUri('$sessionId/complete'))
          ..headers[HttpHeaders.authorizationHeader] =
              'Bearer ${accessToken.trim()}';
      },
    );
    return _decodeSession(response);
  }

  Map<String, String> _fieldsFor(KioskTryOnRequest request) {
    return {
      'clientRequestId': request.clientRequestId,
      if (request.sessionId != null) 'sessionId': request.sessionId!,
      if (request.personAssetId != null)
        'personAssetId': request.personAssetId!,
      if (request.garmentInput.productId != null)
        'productId': request.garmentInput.productId!,
      'garmentSource': request.garmentInput.isCatalogProduct
          ? 'SELFX_CATALOG'
          : 'DIRECT_UPLOAD',
      'garmentIntent': request.garmentInput.intent.apiValue,
      'category': request.garmentInput.intent.categoryApiValue,
      'garmentPhotoType': request.garmentInput.photoType.apiValue,
      'modelCoverage': request.modelCoverage.apiValue,
      'generationProfile': 'BALANCED',
      'categoryResolutionSource': request.garmentInput.isCatalogProduct
          ? 'SELFX_CATALOG_METADATA'
          : request.garmentInput.intent == KioskGarmentIntent.auto
          ? 'AUTO_FALLBACK'
          : 'INTERNAL_LAB_OVERRIDE',
      'photoTypeResolutionSource': request.garmentInput.isCatalogProduct
          ? 'SELFX_CATALOG_METADATA'
          : request.garmentInput.photoType == KioskGarmentPhotoType.auto
          ? 'AUTO_FALLBACK'
          : 'INTERNAL_LAB_OVERRIDE',
      'profileResolutionSource': 'PLATFORM_DEFAULT',
      'disambiguationRequired': 'false',
      'disambiguationResolved':
          request.garmentInput.isCatalogProduct ||
              request.garmentInput.intent != KioskGarmentIntent.auto
          ? 'true'
          : 'false',
      'garmentAnalysisReasonCodes': '[]',
      'qualityWarningCodes': '[]',
      'qualityOverrideAccepted': 'false',
    };
  }

  KioskTryOnRun _decodeRun(http.Response response) {
    final json = _decodeObjectResponse(response);

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
          ? _failureCodeForRunCode(json['errorCode'] as String)
          : null,
      failureMessage: json['errorMessage'] is String
          ? json['errorMessage'] as String
          : null,
    );
  }

  KioskTryOnSession _decodeSession(http.Response response) {
    final json = _decodeObjectResponse(response);
    final sessionId = json['sessionId'];
    final status = json['status'];
    final createdAt = DateTime.tryParse('${json['createdAt']}');
    final updatedAt = DateTime.tryParse('${json['updatedAt']}');
    final expiresAt = DateTime.tryParse('${json['expiresAt']}');
    if (sessionId is! String ||
        status is! String ||
        createdAt == null ||
        updatedAt == null ||
        expiresAt == null) {
      throw const KioskTryOnException(
        KioskTryOnFailureCode.uploadFailed,
        'SelfX Try-On session response was incomplete.',
      );
    }
    return KioskTryOnSession(
      sessionId: sessionId,
      status: _mapSessionStatus(status),
      createdAt: createdAt,
      updatedAt: updatedAt,
      expiresAt: expiresAt,
      currentPersonAssetId: json['currentPersonAssetId'] is String
          ? json['currentPersonAssetId'] as String
          : null,
    );
  }

  KioskTryOnAsset _decodeAsset(http.Response response) {
    final json = _decodeObjectResponse(response);
    final assetId = json['assetId'];
    final purpose = json['purpose'];
    final contentType = json['contentType'];
    final sizeBytes = json['sizeBytes'];
    final width = json['width'];
    final height = json['height'];
    final expiresAt = DateTime.tryParse('${json['expiresAt']}');
    if (assetId is! String ||
        purpose is! String ||
        contentType is! String ||
        sizeBytes is! num ||
        width is! num ||
        height is! num ||
        expiresAt == null) {
      throw const KioskTryOnException(
        KioskTryOnFailureCode.uploadFailed,
        'SelfX Try-On asset response was incomplete.',
      );
    }
    return KioskTryOnAsset(
      assetId: assetId,
      purpose: _mapAssetPurpose(purpose),
      contentType: contentType,
      sizeBytes: sizeBytes.toInt(),
      width: width.toInt(),
      height: height.toInt(),
      expiresAt: expiresAt,
    );
  }

  List<KioskTryOnLook> _decodeLooks(http.Response response) {
    final json = _decodeObjectResponse(response);
    final data = json['data'];
    if (data is! List) {
      throw const KioskTryOnException(
        KioskTryOnFailureCode.uploadFailed,
        'SelfX Try-On looks response was incomplete.',
      );
    }
    return data
        .map((item) {
          if (item is! Map<String, dynamic>) {
            throw const KioskTryOnException(
              KioskTryOnFailureCode.uploadFailed,
              'SelfX Try-On look response was incomplete.',
            );
          }
          final lookId = item['lookId'];
          final runId = item['runId'];
          final personAssetId = item['personAssetId'];
          final resultAssetId = item['resultAssetId'];
          final resultReadUrl = item['resultReadUrl'];
          final createdAt = DateTime.tryParse('${item['createdAt']}');
          final expiresAt = DateTime.tryParse('${item['expiresAt']}');
          if (lookId is! String ||
              runId is! String ||
              personAssetId is! String ||
              resultAssetId is! String ||
              resultReadUrl is! String ||
              createdAt == null ||
              expiresAt == null) {
            throw const KioskTryOnException(
              KioskTryOnFailureCode.uploadFailed,
              'SelfX Try-On look response was incomplete.',
            );
          }
          return KioskTryOnLook(
            lookId: lookId,
            runId: runId,
            personAssetId: personAssetId,
            garmentAssetId: item['garmentAssetId'] is String
                ? item['garmentAssetId'] as String
                : null,
            productId: item['productId'] is String
                ? item['productId'] as String
                : null,
            resultAssetId: resultAssetId,
            resultReadUrl: resultReadUrl,
            createdAt: createdAt,
            expiresAt: expiresAt,
          );
        })
        .toList(growable: false);
  }

  KioskTryOnShare _decodeShare(http.Response response) {
    final json = _decodeObjectResponse(response);
    final shareUrl = json['shareUrl'];
    final expiresAt = DateTime.tryParse('${json['expiresAt']}');
    if (shareUrl is! String || expiresAt == null) {
      throw const KioskTryOnException(
        KioskTryOnFailureCode.uploadFailed,
        'SelfX Try-On share response was incomplete.',
      );
    }
    return KioskTryOnShare(shareUrl: shareUrl, expiresAt: expiresAt);
  }

  Map<String, dynamic> _decodeObjectResponse(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final terminalDeviceError = _terminalDeviceError(response);
      if (terminalDeviceError != null) {
        unawaited(
          deviceController.handleDeviceAuthRejected(terminalDeviceError),
        );
      }
      throw KioskTryOnException(
        _failureCodeForErrorResponse(response),
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
    return json;
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

  KioskTryOnSessionStatus _mapSessionStatus(String status) {
    return switch (status) {
      'ACTIVE' => KioskTryOnSessionStatus.active,
      'COMPLETED' => KioskTryOnSessionStatus.completed,
      'EXPIRED' => KioskTryOnSessionStatus.expired,
      _ => KioskTryOnSessionStatus.expired,
    };
  }

  KioskTryOnAssetPurpose _mapAssetPurpose(String purpose) {
    return switch (purpose) {
      'PERSON' => KioskTryOnAssetPurpose.person,
      'GARMENT' => KioskTryOnAssetPurpose.garment,
      'RESULT' => KioskTryOnAssetPurpose.result,
      _ => KioskTryOnAssetPurpose.result,
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

  Future<http.Response> _requestWithDeviceAuth({
    required bool forceRefresh,
    required http.Request Function(String accessToken) requestFactory,
  }) async {
    final accessToken = await _deviceAccessToken(forceRefresh: forceRefresh);
    final request = requestFactory(accessToken);
    final streamed = await client.send(request).timeout(timeout);
    final response = await http.Response.fromStream(streamed);
    if (!forceRefresh && _isTokenRefreshable(response)) {
      return _requestWithDeviceAuth(
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

  Uri _sessionsUri([String? childPath]) {
    final base = Uri.parse(config.apiBaseUrl.trim());
    final path = childPath == null
        ? config.sessionsPath
        : '${config.sessionsPath}/$childPath';
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

KioskTryOnFailureCode _failureCodeForErrorResponse(http.Response response) {
  if (response.statusCode == 401 || response.statusCode == 403) {
    return KioskTryOnFailureCode.deviceAuthenticationRejected;
  }
  return _failureCodeForApiCode(_errorCode(response.body));
}

KioskTryOnFailureCode _failureCodeForApiCode(String? code) {
  return switch (code) {
    'GARMENT_INTENT_UNRESOLVED' =>
      KioskTryOnFailureCode.garmentIntentUnresolved,
    'MODEL_IMAGE_INCOMPATIBLE_WITH_GARMENT' =>
      KioskTryOnFailureCode.modelImageIncompatibleWithGarment,
    _ => KioskTryOnFailureCode.uploadFailed,
  };
}

KioskTryOnFailureCode _failureCodeForRunCode(String code) {
  return switch (code) {
    'GARMENT_INTENT_UNRESOLVED' =>
      KioskTryOnFailureCode.garmentIntentUnresolved,
    'MODEL_IMAGE_INCOMPATIBLE_WITH_GARMENT' =>
      KioskTryOnFailureCode.modelImageIncompatibleWithGarment,
    _ => KioskTryOnFailureCode.generationFailed,
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
