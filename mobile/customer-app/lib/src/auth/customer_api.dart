import 'dart:convert';
import 'package:http/http.dart' as http;

class CustomerApiException implements Exception {
  final String code;
  final String message;
  final int status;
  const CustomerApiException(this.code, this.message, [this.status = 0]);
  @override
  String toString() => message;
}

class CustomerProfile {
  final String id, email, displayName, language;
  final bool notifications;
  final List<String> methods;
  const CustomerProfile({
    required this.id,
    required this.email,
    required this.displayName,
    this.language = 'en',
    this.notifications = false,
    this.methods = const [],
  });
  factory CustomerProfile.fromJson(Map<String, dynamic> json) =>
      CustomerProfile(
        id: json['id'] as String,
        email: json['email'] as String? ?? '',
        displayName: json['displayName'] as String,
        language: json['language'] as String? ?? 'en',
        notifications: json['notifications'] as bool? ?? false,
        methods: List<String>.from(json['methods'] as List? ?? []),
      );
}

class CustomerCapabilities {
  final bool enabled, google, apple;
  final String termsVersion;
  const CustomerCapabilities({
    this.enabled = false,
    this.google = false,
    this.apple = false,
    this.termsVersion = '2026-10-25',
  });
  factory CustomerCapabilities.fromJson(Map<String, dynamic> json) =>
      CustomerCapabilities(
        enabled: json['enabled'] == true,
        google: (json['providers'] as Map?)?['google'] == true,
        apple: (json['providers'] as Map?)?['apple'] == true,
        termsVersion: json['termsVersion'] as String,
      );
}

abstract interface class CustomerApi {
  Future<Map<String, dynamic>> request(
    String path, {
    String method = 'POST',
    Map<String, dynamic>? body,
    String? token,
  });
}

class HttpCustomerApi implements CustomerApi {
  final Uri base;
  final http.Client client;
  HttpCustomerApi(String baseUrl, {http.Client? client})
    : base = _validateBase(baseUrl),
      client = client ?? http.Client();
  static Uri _validateBase(String value) {
    final uri = Uri.tryParse(value);
    const local = bool.fromEnvironment('SELFX_ALLOW_LOCAL_API');
    if (uri == null ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        (uri.path != '/' && uri.path.isNotEmpty) ||
        (uri.scheme != 'https' &&
            !(local &&
                uri.scheme == 'http' &&
                ['localhost', '127.0.0.1', '10.0.2.2'].contains(uri.host)))) {
      throw const CustomerApiException(
        'CONFIGURATION_REQUIRED',
        'A secure SelfX API address is required.',
      );
    }
    return uri;
  }

  @override
  Future<Map<String, dynamic>> request(
    String path, {
    String method = 'POST',
    Map<String, dynamic>? body,
    String? token,
  }) async {
    if (!path.startsWith('/') || path.contains('://')) {
      throw ArgumentError('Invalid customer route');
    }
    try {
      final request = http.Request(
        method,
        base.resolve('/api/v1/customer$path'),
      );
      request.followRedirects = false;
      request.headers.addAll({
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      });
      if (body != null) request.body = jsonEncode(body);
      final response = await http.Response.fromStream(
        await client.send(request).timeout(const Duration(seconds: 20)),
      ).timeout(const Duration(seconds: 20));
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final error = data['error'] as Map?;
        throw CustomerApiException(
          error?['code'] as String? ?? 'REQUEST_FAILED',
          error?['message'] as String? ??
              'We couldn’t complete that. Please try again.',
          response.statusCode,
        );
      }
      return data;
    } on CustomerApiException {
      rethrow;
    } catch (_) {
      throw const CustomerApiException(
        'CONNECTION_UNAVAILABLE',
        'Unable to reach SelfX. Check your connection and try again.',
      );
    }
  }
}
