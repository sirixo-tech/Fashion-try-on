import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../device/kiosk_device_models.dart';
import '../device/kiosk_device_session_controller.dart';

abstract interface class KioskShoppingGateway {
  Future<Map<String, dynamic>> request(
    String method,
    String path, [
    Map<String, dynamic>? body,
  ]);
}

abstract interface class KioskShoppingGatewayOwner {
  KioskShoppingGateway get shopping;
}

class KioskShoppingException implements Exception {
  const KioskShoppingException(this.code, this.message);
  final String code, message;
  @override
  String toString() => message;
}

class SelfxKioskShoppingGateway implements KioskShoppingGateway {
  SelfxKioskShoppingGateway({
    required this.baseUrl,
    required this.deviceController,
    http.Client? client,
  }) : client = client ?? http.Client();
  final String baseUrl;
  final KioskDeviceSessionController deviceController;
  final http.Client client;
  @override
  Future<Map<String, dynamic>> request(
    String method,
    String path, [
    Map<String, dynamic>? body,
  ]) {
    final base = Uri.tryParse(baseUrl);
    if (base == null ||
        base.userInfo.isNotEmpty ||
        base.hasQuery ||
        base.hasFragment ||
        (base.scheme != 'https' &&
            !(base.scheme == 'http' &&
                ['localhost', '127.0.0.1', '::1'].contains(base.host))) ||
        !path.startsWith('/api/v1/kiosk/') ||
        path.contains('..') ||
        path.contains('?') ||
        path.contains('#')) {
      throw const KioskShoppingException(
        'SHOPPING_INVALID_PATH',
        'Purchasing is unavailable.',
      );
    }
    return deviceController.withDeviceAccess((token) async {
      final uri = Uri.parse('${baseUrl.replaceAll(RegExp(r'/+$'), '')}$path');
      final request = http.Request(method, uri)
        ..followRedirects = false
        ..headers.addAll({
          HttpHeaders.authorizationHeader: 'Bearer $token',
          HttpHeaders.contentTypeHeader: 'application/json',
          HttpHeaders.acceptHeader: 'application/json',
        });
      if (body != null) request.body = jsonEncode(body);
      final response = await http.Response.fromStream(
        await client.send(request).timeout(const Duration(seconds: 30)),
      ).timeout(const Duration(seconds: 30));
      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        throw const KioskShoppingException(
          'SHOPPING_RESPONSE_INVALID',
          'Purchasing is temporarily unavailable.',
        );
      }
      if (response.statusCode >= 400) {
        final error = decoded['error'];
        final code = error is Map
            ? error['code']?.toString() ?? 'SHOPPING_FAILED'
            : 'SHOPPING_FAILED';
        if (response.statusCode == 401) {
          throw KioskDeviceException(code, 'Kiosk access needs refreshing.');
        }
        throw KioskShoppingException(
          code,
          error is Map
              ? error['message']?.toString() ??
                    'Purchase could not be completed.'
              : 'Purchase could not be completed.',
        );
      }
      return decoded;
    });
  }
}
