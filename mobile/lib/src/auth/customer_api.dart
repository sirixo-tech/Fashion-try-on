import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

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
  final String? phoneNumber, pendingPhoneNumber;
  const CustomerProfile({
    required this.id,
    required this.email,
    required this.displayName,
    this.language = 'en',
    this.notifications = false,
    this.methods = const [],
    this.phoneNumber,
    this.pendingPhoneNumber,
  });
  factory CustomerProfile.fromJson(Map<String, dynamic> json) =>
      CustomerProfile(
        id: json['id'] as String,
        email: json['email'] as String? ?? '',
        displayName: json['displayName'] as String,
        language: json['language'] as String? ?? 'en',
        notifications: json['notifications'] as bool? ?? false,
        methods: List<String>.from(json['methods'] as List? ?? []),
        phoneNumber: json['phoneNumber'] as String?,
        pendingPhoneNumber: json['pendingPhoneNumber'] as String?,
      );
}

class CustomerCapabilities {
  final bool enabled, google, apple, phone, emailCode;
  final String termsVersion;
  const CustomerCapabilities({
    this.enabled = false,
    this.google = false,
    this.apple = false,
    this.phone = false,
    this.emailCode = false,
    this.termsVersion = '2026-10-25',
  });
  factory CustomerCapabilities.fromJson(Map<String, dynamic> json) =>
      CustomerCapabilities(
        enabled: json['enabled'] == true,
        google: (json['providers'] as Map?)?['google'] == true,
        apple: (json['providers'] as Map?)?['apple'] == true,
        phone: (json['providers'] as Map?)?['phone'] == true,
        emailCode: (json['providers'] as Map?)?['emailCode'] == true,
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

abstract interface class CustomerMediaApi {
  Future<Map<String, dynamic>> upload(
    String path,
    Uint8List bytes,
    String mime,
    String token,
  );
  Future<Uint8List> download(String path, String token);
}

class HttpCustomerApi implements CustomerApi, CustomerMediaApi {
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

  Uri route(String path) {
    if (!path.startsWith('/') ||
        path.startsWith('//') ||
        path.contains('://') ||
        path.contains('..')) {
      throw ArgumentError('Invalid customer route');
    }
    return base.resolve('/api/v1/customer$path');
  }

  Map<String, dynamic> decode(http.Response response) {
    Map<String, dynamic> data = {};
    try {
      data = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      /* Error below remains readable for gateway responses. */
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = data['error'] is Map ? data['error'] as Map : null;
      throw CustomerApiException(
        error?['code'] as String? ?? 'REQUEST_FAILED',
        error?['message'] as String? ??
            'We couldn’t complete that. Please try again.',
        response.statusCode,
      );
    }
    return data;
  }

  @override
  Future<Map<String, dynamic>> upload(
    String path,
    Uint8List bytes,
    String mime,
    String token,
  ) async {
    try {
      final request = http.MultipartRequest('POST', route(path))
        ..followRedirects = false;
      request.headers.addAll({
        'Accept': 'application/json',
        'Authorization': 'Bearer $token',
      });
      request.files.add(
        http.MultipartFile.fromBytes(
          'image',
          bytes,
          filename: 'photo.${mime.split('/').last}',
          contentType: MediaType.parse(mime),
        ),
      );
      return decode(
        await http.Response.fromStream(
          await client.send(request).timeout(const Duration(seconds: 60)),
        ).timeout(const Duration(seconds: 60)),
      );
    } on CustomerApiException {
      rethrow;
    } catch (_) {
      throw const CustomerApiException(
        'UPLOAD_CONNECTION',
        'Your photo could not be uploaded. Check your connection and try again.',
      );
    }
  }

  @override
  Future<Uint8List> download(String path, String token) async {
    try {
      final request = http.Request('GET', route(path))..followRedirects = false;
      request.headers['Authorization'] = 'Bearer $token';
      final stream = await client
          .send(request)
          .timeout(const Duration(seconds: 30));
      if (stream.statusCode < 200 || stream.statusCode >= 300) {
        decode(await http.Response.fromStream(stream));
      }
      final bytes = BytesBuilder(copy: false);
      await for (final chunk in stream.stream.timeout(
        const Duration(seconds: 30),
      )) {
        bytes.add(chunk);
        if (bytes.length > 20 * 1024 * 1024) {
          throw const CustomerApiException(
            'RESULT_TOO_LARGE',
            'This result could not be downloaded.',
          );
        }
      }
      return bytes.takeBytes();
    } on CustomerApiException {
      rethrow;
    } catch (_) {
      throw const CustomerApiException(
        'DOWNLOAD_CONNECTION',
        'Unable to download. Check your connection and try again.',
      );
    }
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
      final request = http.Request(method, route(path));
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
        final error = data['error'] is Map ? data['error'] as Map : null;
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
