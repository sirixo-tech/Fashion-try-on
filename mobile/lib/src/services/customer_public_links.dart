import '../auth/customer_api.dart';

class CustomerPublicLinks {
  static const website = 'https://selfxweb-production.up.railway.app';
  static const terms = String.fromEnvironment(
    'SELFX_TERMS_URL',
    defaultValue: '$website/terms',
  );
  static const privacy = String.fromEnvironment(
    'SELFX_PRIVACY_URL',
    defaultValue: '$website/privacy',
  );
  static const support = String.fromEnvironment(
    'SELFX_SUPPORT_URL',
    defaultValue: '$website/support',
  );
  static const email = 'sirixollc@gmail.com';
  static bool secureUrl(String value) {
    final uri = Uri.tryParse(value);
    return uri != null &&
        uri.scheme == 'https' &&
        uri.host.isNotEmpty &&
        uri.userInfo.isEmpty;
  }

  static Future<Map<String, dynamic>> load(CustomerApi api) async {
    final defaults = <String, dynamic>{
      'termsUrl': terms,
      'privacyUrl': privacy,
      'supportUrl': support,
      'supportEmail': email,
      'pushAvailable': false,
    };
    try {
      final data = await api.request('/app/config', method: 'GET');
      for (final key in ['termsUrl', 'privacyUrl', 'supportUrl']) {
        if (data[key] is String && secureUrl(data[key] as String)) {
          defaults[key] = data[key];
        }
      }
      if (data['supportEmail'] is String &&
          RegExp(
            r'^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$',
          ).hasMatch(data['supportEmail'] as String)) {
        defaults['supportEmail'] = data['supportEmail'];
      }
      defaults['pushAvailable'] = data['pushAvailable'] == true;
    } catch (_) {
      /* Bundled official contacts work before sign-in and offline. */
    }
    return defaults;
  }
}
