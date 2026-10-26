import 'dart:convert';

import 'package:flutter/services.dart';

class CustomerBootstrapConfig {
  const CustomerBootstrapConfig({required this.apiBaseUrl});

  static const assetPath = 'assets/config/production.json';
  final String apiBaseUrl;

  static Future<CustomerBootstrapConfig> load({
    AssetBundle? bundle,
    String apiBaseUrlOverride = const String.fromEnvironment(
      'SELFX_API_BASE_URL',
    ),
  }) async {
    final overrideUrl = apiBaseUrlOverride.trim();
    if (overrideUrl.isNotEmpty) {
      return CustomerBootstrapConfig(apiBaseUrl: overrideUrl);
    }

    final decoded = jsonDecode(
      await (bundle ?? rootBundle).loadString(assetPath),
    );
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException(
        'Customer bootstrap config must be a JSON map.',
      );
    }
    final apiBaseUrl = decoded['selfxCustomerApiBaseUrl'];
    if (apiBaseUrl is! String || apiBaseUrl.trim().isEmpty) {
      throw const FormatException(
        'Customer bootstrap config requires selfxCustomerApiBaseUrl.',
      );
    }
    // HttpCustomerApi remains the shared HTTPS/origin validation boundary.
    return CustomerBootstrapConfig(apiBaseUrl: apiBaseUrl.trim());
  }
}
