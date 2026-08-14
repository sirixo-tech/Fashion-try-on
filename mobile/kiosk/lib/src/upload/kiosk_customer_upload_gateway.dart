import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'kiosk_customer_upload_models.dart';

class KioskCustomerUploadApiConfig {
  const KioskCustomerUploadApiConfig({required this.apiBaseUrl});

  factory KioskCustomerUploadApiConfig.fromEnvironment() {
    return const KioskCustomerUploadApiConfig(
      apiBaseUrl: String.fromEnvironment('SELFX_KIOSK_API_BASE_URL'),
    );
  }

  final String apiBaseUrl;
}

abstract class KioskCustomerUploadGateway {
  Future<KioskCustomerUploadSession> createSession(String accessToken);

  Future<KioskCustomerUploadSession> getSession({
    required String accessToken,
    required String sessionId,
  });

  Future<KioskCustomerUploadSession> cancelSession({
    required String accessToken,
    required String sessionId,
  });

  Future<KioskCustomerUploadSession> consumeSession({
    required String accessToken,
    required String sessionId,
  });

  Future<void> downloadReadyPhoto({
    required String readUrl,
    required String targetPath,
  });
}

class SelfxKioskCustomerUploadGateway implements KioskCustomerUploadGateway {
  SelfxKioskCustomerUploadGateway({
    required this.config,
    http.Client? client,
    this.timeout = const Duration(seconds: 30),
  }) : client = client ?? http.Client();

  final KioskCustomerUploadApiConfig config;
  final http.Client client;
  final Duration timeout;

  @override
  Future<KioskCustomerUploadSession> createSession(String accessToken) async {
    _assertConfigured();
    final response = await client
        .post(
          _uri('/api/v1/kiosk/customer-upload-sessions'),
          headers: _authHeaders(accessToken),
        )
        .timeout(timeout);
    return _session(_decode(response), requirePublicUrl: true);
  }

  @override
  Future<KioskCustomerUploadSession> getSession({
    required String accessToken,
    required String sessionId,
  }) async {
    _assertConfigured();
    final response = await client
        .get(
          _uri('/api/v1/kiosk/customer-upload-sessions/$sessionId'),
          headers: _authHeaders(accessToken),
        )
        .timeout(timeout);
    return _session(_decode(response));
  }

  @override
  Future<KioskCustomerUploadSession> cancelSession({
    required String accessToken,
    required String sessionId,
  }) async {
    _assertConfigured();
    final response = await client
        .post(
          _uri('/api/v1/kiosk/customer-upload-sessions/$sessionId/cancel'),
          headers: _authHeaders(accessToken),
        )
        .timeout(timeout);
    return _session(_decode(response));
  }

  @override
  Future<KioskCustomerUploadSession> consumeSession({
    required String accessToken,
    required String sessionId,
  }) async {
    _assertConfigured();
    final response = await client
        .post(
          _uri('/api/v1/kiosk/customer-upload-sessions/$sessionId/consume'),
          headers: _authHeaders(accessToken),
        )
        .timeout(timeout);
    return _session(_decode(response));
  }

  @override
  Future<void> downloadReadyPhoto({
    required String readUrl,
    required String targetPath,
  }) async {
    final response = await client.get(Uri.parse(readUrl)).timeout(timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw const KioskCustomerUploadException(
        'CUSTOMER_UPLOAD_DOWNLOAD_FAILED',
        'Uploaded photo could not be opened.',
      );
    }
    await File(targetPath).writeAsBytes(response.bodyBytes, flush: true);
  }

  Uri _uri(String path) {
    final base = Uri.parse(config.apiBaseUrl.trim());
    return base.replace(path: _joinPaths(base.path, path));
  }

  String _joinPaths(String basePath, String childPath) {
    final left = basePath.endsWith('/')
        ? basePath.substring(0, basePath.length - 1)
        : basePath;
    final right = childPath.startsWith('/') ? childPath : '/$childPath';
    return '$left$right';
  }

  Map<String, String> _authHeaders(String accessToken) => {
    HttpHeaders.acceptHeader: 'application/json',
    HttpHeaders.contentTypeHeader: 'application/json',
    HttpHeaders.authorizationHeader: 'Bearer ${accessToken.trim()}',
  };

  void _assertConfigured() {
    if (config.apiBaseUrl.trim().isEmpty) {
      throw const KioskCustomerUploadException(
        'KIOSK_API_NOT_CONFIGURED',
        'SelfX API is not configured on this kiosk.',
      );
    }
  }
}

Map<String, dynamic> _decode(http.Response response) {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw KioskCustomerUploadException(
      _errorCode(response),
      _safeMessage(response),
    );
  }
  final json = jsonDecode(response.body);
  if (json is! Map<String, dynamic>) {
    throw const KioskCustomerUploadException(
      'CUSTOMER_UPLOAD_RESPONSE_INVALID',
      'SelfX returned an unexpected upload response.',
    );
  }
  return json;
}

KioskCustomerUploadSession _session(
  Map<String, dynamic> json, {
  bool requirePublicUrl = false,
}) {
  final publicUploadUrl = json['publicUploadUrl'] is String
      ? json['publicUploadUrl'] as String
      : null;
  if (requirePublicUrl && publicUploadUrl == null) {
    throw const KioskCustomerUploadException(
      'CUSTOMER_UPLOAD_RESPONSE_INVALID',
      'SelfX returned an incomplete upload response.',
    );
  }
  return KioskCustomerUploadSession(
    sessionId: _string(json, 'sessionId'),
    status: _status(_string(json, 'status')),
    expiresAt: DateTime.parse(_string(json, 'expiresAt')),
    serverTime: DateTime.parse(_string(json, 'serverTime')),
    pollIntervalSeconds: json['pollIntervalSeconds'] is int
        ? json['pollIntervalSeconds'] as int
        : 3,
    publicUploadUrl: publicUploadUrl,
    rejectionCode: json['rejectionCode'] is String
        ? json['rejectionCode'] as String
        : null,
    photo: json['photo'] is Map<String, dynamic>
        ? _photo(json['photo'] as Map<String, dynamic>)
        : null,
  );
}

KioskCustomerUploadPhoto _photo(Map<String, dynamic> json) {
  return KioskCustomerUploadPhoto(
    readUrl: _string(json, 'readUrl'),
    contentType: _string(json, 'contentType'),
    sizeBytes: _int(json, 'sizeBytes'),
    width: _int(json, 'width'),
    height: _int(json, 'height'),
  );
}

KioskCustomerUploadStatus _status(String value) {
  return switch (value) {
    'UPLOADING' => KioskCustomerUploadStatus.uploading,
    'VALIDATING' => KioskCustomerUploadStatus.validating,
    'READY' => KioskCustomerUploadStatus.ready,
    'REJECTED' => KioskCustomerUploadStatus.rejected,
    'EXPIRED' => KioskCustomerUploadStatus.expired,
    'CONSUMED' => KioskCustomerUploadStatus.consumed,
    'CANCELLED' => KioskCustomerUploadStatus.cancelled,
    _ => KioskCustomerUploadStatus.waiting,
  };
}

String _string(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is String) {
    return value;
  }
  throw const KioskCustomerUploadException(
    'CUSTOMER_UPLOAD_RESPONSE_INVALID',
    'SelfX returned an unexpected upload response.',
  );
}

int _int(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is int) {
    return value;
  }
  throw const KioskCustomerUploadException(
    'CUSTOMER_UPLOAD_RESPONSE_INVALID',
    'SelfX returned an unexpected upload response.',
  );
}

String _errorCode(http.Response response) {
  try {
    final json = jsonDecode(response.body);
    if (json is Map<String, dynamic>) {
      final error = json['error'];
      if (error is Map<String, dynamic> && error['code'] is String) {
        return error['code'] as String;
      }
    }
  } catch (_) {}
  return 'CUSTOMER_UPLOAD_REQUEST_FAILED';
}

String _safeMessage(http.Response response) {
  try {
    final json = jsonDecode(response.body);
    if (json is Map<String, dynamic>) {
      final error = json['error'];
      if (error is Map<String, dynamic> && error['message'] is String) {
        return error['message'] as String;
      }
    }
  } catch (_) {}
  return 'SelfX upload request failed.';
}
