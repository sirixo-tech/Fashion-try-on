import 'dart:convert';

import 'package:flutter/services.dart';

class KioskBootstrapConfig {
  const KioskBootstrapConfig({required this.apiBaseUrl});

  static const assetPath = 'assets/config/production.json';

  static const _apiBaseUrlOverride = String.fromEnvironment(
    'SELFX_KIOSK_API_BASE_URL',
  );

  final String apiBaseUrl;

  static Future<KioskBootstrapConfig> load({AssetBundle? bundle}) async {
    final overrideUrl = _apiBaseUrlOverride.trim();
    if (overrideUrl.isNotEmpty) {
      return KioskBootstrapConfig(apiBaseUrl: overrideUrl);
    }

    final source = await (bundle ?? rootBundle).loadString(assetPath);
    final decoded = jsonDecode(source);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Kiosk bootstrap config must be a JSON map.');
    }

    final apiBaseUrl = decoded['selfxKioskApiBaseUrl'];
    if (apiBaseUrl is! String || apiBaseUrl.trim().isEmpty) {
      throw const FormatException(
        'Kiosk bootstrap config requires selfxKioskApiBaseUrl.',
      );
    }

    return KioskBootstrapConfig(apiBaseUrl: apiBaseUrl.trim());
  }
}
