import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/kiosk_runtime_configuration.dart';
import 'kiosk_device_models.dart';

class KioskDeviceApiConfig {
  const KioskDeviceApiConfig({required this.apiBaseUrl});

  factory KioskDeviceApiConfig.fromEnvironment() {
    return const KioskDeviceApiConfig(
      apiBaseUrl: String.fromEnvironment('SELFX_KIOSK_API_BASE_URL'),
    );
  }

  final String apiBaseUrl;
}

abstract class KioskDeviceGateway {
  Future<KioskPairingSession> createPairingSession({
    required String installationId,
    required String platform,
    required String appVersion,
  });

  Future<KioskPairingStatusResult> getPairingStatus({
    required String sessionId,
    required String provisioningSecret,
  });

  Future<KioskDeviceCredentials> exchangeProvisioningGrant({
    required String pairingSessionId,
    required String provisioningSecret,
    required String provisioningGrant,
  });

  Future<KioskDeviceCredentials> refreshSession(String refreshToken);

  Future<KioskDeviceIdentity> me(String accessToken);

  Future<KioskDeviceIdentity> heartbeat({
    required String accessToken,
    required String platform,
    required String appVersion,
  });

  Future<KioskRuntimeConfiguration> configuration(String accessToken);
}

class SelfxKioskDeviceGateway implements KioskDeviceGateway {
  SelfxKioskDeviceGateway({
    required this.config,
    http.Client? client,
    this.timeout = const Duration(seconds: 30),
  }) : client = client ?? http.Client();

  final KioskDeviceApiConfig config;
  final http.Client client;
  final Duration timeout;

  @override
  Future<KioskPairingSession> createPairingSession({
    required String installationId,
    required String platform,
    required String appVersion,
  }) async {
    _assertConfigured();
    final response = await client
        .post(
          _uri('/api/v1/kiosk/provisioning/sessions'),
          headers: _jsonHeaders(),
          body: jsonEncode({
            'installationId': installationId,
            'platform': platform,
            'appVersion': appVersion,
          }),
        )
        .timeout(timeout);
    final json = _decode(response);
    return KioskPairingSession(
      pairingSessionId: _string(json, 'pairingSessionId'),
      pairingCode: _string(json, 'pairingCode'),
      provisioningSecret: _string(json, 'provisioningSecret'),
      expiresAt: DateTime.parse(_string(json, 'expiresAt')),
      serverTime: DateTime.parse(_string(json, 'serverTime')),
      ttlSeconds: _int(json, 'ttlSeconds'),
      pollIntervalSeconds: _int(json, 'pollIntervalSeconds'),
    );
  }

  @override
  Future<KioskPairingStatusResult> getPairingStatus({
    required String sessionId,
    required String provisioningSecret,
  }) async {
    _assertConfigured();
    final response = await client
        .get(
          _uri('/api/v1/kiosk/provisioning/sessions/$sessionId'),
          headers: {'x-selfx-provisioning-secret': provisioningSecret},
        )
        .timeout(timeout);
    final json = _decode(response);
    return KioskPairingStatusResult(
      status: _pairingStatus(_string(json, 'status')),
      serverTime: DateTime.parse(_string(json, 'serverTime')),
      expiresAt: DateTime.parse(_string(json, 'expiresAt')),
      provisioningGrant: json['provisioningGrant'] is String
          ? json['provisioningGrant'] as String
          : null,
    );
  }

  @override
  Future<KioskDeviceCredentials> exchangeProvisioningGrant({
    required String pairingSessionId,
    required String provisioningSecret,
    required String provisioningGrant,
  }) async {
    _assertConfigured();
    final response = await client
        .post(
          _uri('/api/v1/kiosk/session/exchange'),
          headers: _jsonHeaders(),
          body: jsonEncode({
            'pairingSessionId': pairingSessionId,
            'provisioningSecret': provisioningSecret,
            'provisioningGrant': provisioningGrant,
          }),
        )
        .timeout(timeout);
    return _credentials(_decode(response));
  }

  @override
  Future<KioskDeviceCredentials> refreshSession(String refreshToken) async {
    _assertConfigured();
    final response = await client
        .post(
          _uri('/api/v1/kiosk/session/refresh'),
          headers: _jsonHeaders(),
          body: jsonEncode({'refreshToken': refreshToken}),
        )
        .timeout(timeout);
    return _credentials(_decode(response));
  }

  @override
  Future<KioskDeviceIdentity> me(String accessToken) async {
    _assertConfigured();
    final response = await client
        .get(
          _uri('/api/v1/kiosk/session/me'),
          headers: _authHeaders(accessToken),
        )
        .timeout(timeout);
    return _device(_decode(response));
  }

  @override
  Future<KioskDeviceIdentity> heartbeat({
    required String accessToken,
    required String platform,
    required String appVersion,
  }) async {
    _assertConfigured();
    final response = await client
        .post(
          _uri('/api/v1/kiosk/heartbeat'),
          headers: _jsonAuthHeaders(accessToken),
          body: jsonEncode({'platform': platform, 'appVersion': appVersion}),
        )
        .timeout(timeout);
    return _device(_decode(response));
  }

  @override
  Future<KioskRuntimeConfiguration> configuration(String accessToken) async {
    _assertConfigured();
    final response = await client
        .get(
          _uri('/api/v1/kiosk/configuration'),
          headers: _authHeaders(accessToken),
        )
        .timeout(timeout);
    return KioskRuntimeConfiguration.fromJson(_decode(response));
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

  Map<String, String> _jsonHeaders() => {
    HttpHeaders.acceptHeader: 'application/json',
    HttpHeaders.contentTypeHeader: 'application/json',
  };

  Map<String, String> _authHeaders(String accessToken) => {
    HttpHeaders.acceptHeader: 'application/json',
    HttpHeaders.authorizationHeader: 'Bearer ${accessToken.trim()}',
  };

  Map<String, String> _jsonAuthHeaders(String accessToken) => {
    ..._jsonHeaders(),
    HttpHeaders.authorizationHeader: 'Bearer ${accessToken.trim()}',
  };

  void _assertConfigured() {
    if (config.apiBaseUrl.trim().isEmpty) {
      throw const KioskDeviceException(
        'KIOSK_API_NOT_CONFIGURED',
        'SelfX API is not configured on this kiosk.',
      );
    }
  }
}

Map<String, dynamic> _decode(http.Response response) {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw KioskDeviceException(_errorCode(response), _safeMessage(response));
  }
  final json = jsonDecode(response.body);
  if (json is! Map<String, dynamic>) {
    throw const KioskDeviceException(
      'KIOSK_RESPONSE_INVALID',
      'SelfX returned an unexpected kiosk response.',
    );
  }
  return json;
}

KioskDeviceCredentials _credentials(Map<String, dynamic> json) {
  return KioskDeviceCredentials(
    accessToken: _string(json, 'accessToken'),
    accessTokenExpiresAt: DateTime.parse(_string(json, 'accessTokenExpiresAt')),
    refreshToken: _string(json, 'refreshToken'),
    refreshTokenExpiresAt: DateTime.parse(
      _string(json, 'refreshTokenExpiresAt'),
    ),
    device: _device(_map(json, 'device')),
  );
}

KioskDeviceIdentity _device(Map<String, dynamic> json) {
  return KioskDeviceIdentity(
    id: _string(json, 'id'),
    displayName: _string(json, 'displayName'),
    status: _deviceStatus(_string(json, 'status')),
    assignment: _assignment(_map(json, 'assignment')),
    platform: json['platform'] is String ? json['platform'] as String : null,
    appVersion: json['appVersion'] is String
        ? json['appVersion'] as String
        : null,
    lastSeenAt: json['lastSeenAt'] is String
        ? DateTime.parse(json['lastSeenAt'] as String)
        : null,
    latestConfigurationVersion: json['latestConfigurationVersion'] is int
        ? json['latestConfigurationVersion'] as int
        : 1,
  );
}

KioskDeviceAssignment _assignment(Map<String, dynamic> json) {
  return KioskDeviceAssignment(
    scope: _assignmentScope(_string(json, 'scope')),
    organizationId: json['organizationId'] is String
        ? json['organizationId'] as String
        : null,
    organizationName: json['organizationName'] is String
        ? json['organizationName'] as String
        : null,
    storeId: json['storeId'] is String ? json['storeId'] as String : null,
    storeName: json['storeName'] is String ? json['storeName'] as String : null,
  );
}

KioskProvisioningStatus _pairingStatus(String value) {
  return switch (value) {
    'WAITING' => KioskProvisioningStatus.waiting,
    'PAIRED' => KioskProvisioningStatus.paired,
    'EXPIRED' => KioskProvisioningStatus.expired,
    _ => KioskProvisioningStatus.expired,
  };
}

KioskDeviceStatus _deviceStatus(String value) {
  return switch (value) {
    'ACTIVE' => KioskDeviceStatus.active,
    'INACTIVE' => KioskDeviceStatus.inactive,
    'DELETED' => KioskDeviceStatus.deleted,
    _ => KioskDeviceStatus.revoked,
  };
}

KioskAssignmentScope _assignmentScope(String value) {
  return switch (value) {
    'ORGANIZATION' => KioskAssignmentScope.organization,
    'STORE' => KioskAssignmentScope.store,
    _ => KioskAssignmentScope.platform,
  };
}

Map<String, dynamic> _map(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is Map<String, dynamic>) {
    return value;
  }
  throw const KioskDeviceException(
    'KIOSK_RESPONSE_INVALID',
    'SelfX returned an unexpected kiosk response.',
  );
}

String _string(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is String) {
    return value;
  }
  throw const KioskDeviceException(
    'KIOSK_RESPONSE_INVALID',
    'SelfX returned an unexpected kiosk response.',
  );
}

int _int(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is int) {
    return value;
  }
  throw const KioskDeviceException(
    'KIOSK_RESPONSE_INVALID',
    'SelfX returned an unexpected kiosk response.',
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
  return 'KIOSK_REQUEST_FAILED';
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
  return 'SelfX kiosk request failed.';
}
