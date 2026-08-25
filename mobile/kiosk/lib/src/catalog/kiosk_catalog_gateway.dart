import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../device/kiosk_device_models.dart';
import '../device/kiosk_device_session_controller.dart';
import 'kiosk_catalog_models.dart';

abstract class KioskCatalogGateway {
  Future<KioskCatalogRevision> getCatalogRevision();

  Future<KioskCatalogSnapshot> getCatalogSnapshot();

  Future<List<KioskCatalogCategory>> getCatalogCategories({
    required KioskCatalogAudience audience,
  });

  Future<KioskCatalogPage> getCatalogProducts({
    required KioskCatalogAudience audience,
    String? categorySlug,
    required int page,
    required int pageSize,
  });
}

class UnavailableKioskCatalogGateway implements KioskCatalogGateway {
  const UnavailableKioskCatalogGateway();

  @override
  Future<KioskCatalogRevision> getCatalogRevision() {
    throw const KioskCatalogException(
      'KIOSK_API_NOT_CONFIGURED',
      'SelfX catalog is not configured on this kiosk.',
    );
  }

  @override
  Future<KioskCatalogSnapshot> getCatalogSnapshot() {
    throw const KioskCatalogException(
      'KIOSK_API_NOT_CONFIGURED',
      'SelfX catalog is not configured on this kiosk.',
    );
  }

  @override
  Future<List<KioskCatalogCategory>> getCatalogCategories({
    required KioskCatalogAudience audience,
  }) {
    throw const KioskCatalogException(
      'KIOSK_API_NOT_CONFIGURED',
      'SelfX catalog is not configured on this kiosk.',
    );
  }

  @override
  Future<KioskCatalogPage> getCatalogProducts({
    required KioskCatalogAudience audience,
    String? categorySlug,
    required int page,
    required int pageSize,
  }) {
    throw const KioskCatalogException(
      'KIOSK_API_NOT_CONFIGURED',
      'SelfX catalog is not configured on this kiosk.',
    );
  }
}

class KioskCatalogApiConfig {
  const KioskCatalogApiConfig({
    required this.apiBaseUrl,
    this.catalogPath = '/api/v1/kiosk/catalog',
  });

  factory KioskCatalogApiConfig.fromEnvironment() {
    return const KioskCatalogApiConfig(
      apiBaseUrl: String.fromEnvironment('SELFX_KIOSK_API_BASE_URL'),
    );
  }

  final String apiBaseUrl;
  final String catalogPath;

  bool get isConfigured => apiBaseUrl.trim().isNotEmpty;
}

class SelfxKioskCatalogGateway implements KioskCatalogGateway {
  SelfxKioskCatalogGateway({
    required this.config,
    required this.deviceController,
    http.Client? client,
    this.timeout = const Duration(seconds: 30),
  }) : client = client ?? http.Client();

  final KioskCatalogApiConfig config;
  final KioskDeviceSessionController deviceController;
  final http.Client client;
  final Duration timeout;

  @override
  Future<KioskCatalogRevision> getCatalogRevision() async {
    _assertConfigured();
    final response = await _getWithDeviceAuth(
      _catalogUri('revision'),
      forceRefresh: false,
    );
    return KioskCatalogRevision.fromJson(_decodeObject(response));
  }

  @override
  Future<KioskCatalogSnapshot> getCatalogSnapshot() async {
    _assertConfigured();
    final response = await _getWithDeviceAuth(
      _catalogUri('snapshot'),
      forceRefresh: false,
    );
    return KioskCatalogSnapshot.fromJson(_decodeObject(response));
  }

  @override
  Future<List<KioskCatalogCategory>> getCatalogCategories({
    required KioskCatalogAudience audience,
  }) async {
    _assertConfigured();
    final response = await _getWithDeviceAuth(
      _catalogUri(
        'categories',
        queryParameters: {'audience': audience.apiValue},
      ),
      forceRefresh: false,
    );
    final json = _decodeObject(response);
    final data = json['data'];
    if (data is! List) {
      throw const KioskCatalogException(
        'CATALOG_RESPONSE_INVALID',
        'SelfX returned an unexpected catalog response.',
      );
    }
    return data
        .map((item) {
          if (item is! Map<String, dynamic>) {
            throw const KioskCatalogException(
              'CATALOG_RESPONSE_INVALID',
              'SelfX returned an unexpected catalog response.',
            );
          }
          return KioskCatalogCategory.fromJson(item);
        })
        .toList(growable: false);
  }

  @override
  Future<KioskCatalogPage> getCatalogProducts({
    required KioskCatalogAudience audience,
    String? categorySlug,
    required int page,
    required int pageSize,
  }) async {
    _assertConfigured();
    final query = {
      'audience': audience.apiValue,
      'page': page.toString(),
      'pageSize': pageSize.toString(),
      if (categorySlug != null && categorySlug.trim().isNotEmpty)
        'category': categorySlug.trim(),
    };
    final response = await _getWithDeviceAuth(
      _catalogUri('products', queryParameters: query),
      forceRefresh: false,
    );
    return KioskCatalogPage.fromJson(_decodeObject(response));
  }

  Future<http.Response> _getWithDeviceAuth(
    Uri uri, {
    required bool forceRefresh,
  }) async {
    final accessToken = await _deviceAccessToken(forceRefresh: forceRefresh);
    final response = await client
        .get(
          uri,
          headers: {
            HttpHeaders.acceptHeader: 'application/json',
            HttpHeaders.authorizationHeader: 'Bearer ${accessToken.trim()}',
          },
        )
        .timeout(timeout);
    if (!forceRefresh && _isTokenRefreshable(response)) {
      return _getWithDeviceAuth(uri, forceRefresh: true);
    }
    if (_isTerminalDeviceResponse(response)) {
      await deviceController.handleDeviceAuthRejected(
        const KioskDeviceException(
          'DEVICE_REVOKED',
          'Kiosk device authentication was rejected.',
        ),
      );
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
      throw KioskCatalogException(error.code, error.message);
    }
  }

  Uri _catalogUri(String childPath, {Map<String, String>? queryParameters}) {
    final base = Uri.parse(config.apiBaseUrl.trim());
    return base.replace(
      path: _joinPaths(base.path, '${config.catalogPath}/$childPath'),
      queryParameters: queryParameters,
    );
  }

  String _joinPaths(String basePath, String childPath) {
    final left = basePath.endsWith('/')
        ? basePath.substring(0, basePath.length - 1)
        : basePath;
    final right = childPath.startsWith('/') ? childPath : '/$childPath';
    return '$left$right';
  }

  void _assertConfigured() {
    if (!config.isConfigured) {
      throw const KioskCatalogException(
        'KIOSK_API_NOT_CONFIGURED',
        'SelfX API is not configured on this kiosk.',
      );
    }
  }
}

Map<String, dynamic> _decodeObject(http.Response response) {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw KioskCatalogException(_errorCode(response), _safeMessage(response));
  }
  final json = jsonDecode(response.body);
  if (json is! Map<String, dynamic>) {
    throw const KioskCatalogException(
      'CATALOG_RESPONSE_INVALID',
      'SelfX returned an unexpected catalog response.',
    );
  }
  return json;
}

bool _isTokenRefreshable(http.Response response) {
  if (response.statusCode != 401) {
    return false;
  }
  final code = _errorCode(response);
  return code == 'DEVICE_TOKEN_INVALID' || code == 'DEVICE_TOKEN_EXPIRED';
}

bool _isTerminalDeviceResponse(http.Response response) {
  if (response.statusCode != 401 && response.statusCode != 403) {
    return false;
  }
  final code = _errorCode(response);
  return code == 'DEVICE_UNPAIRED' ||
      code == 'DEVICE_INACTIVE' ||
      code == 'DEVICE_REVOKED' ||
      code == 'DEVICE_DELETED';
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
  if (response.statusCode == 401 || response.statusCode == 403) {
    return 'DEVICE_AUTH_REJECTED';
  }
  if (response.statusCode == 404) {
    return 'CATALOG_NOT_FOUND';
  }
  if (response.statusCode >= 500) {
    return 'CATALOG_SERVER_ERROR';
  }
  return 'CATALOG_REQUEST_FAILED';
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
  return 'SelfX could not load garments.';
}
