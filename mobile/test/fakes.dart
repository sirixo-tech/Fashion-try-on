import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_identity.dart';
import 'package:selfx_customer/src/auth/session_store.dart';

class MemorySessionStore implements CustomerSessionStore {
  String? token;
  bool complete;
  final saved = <String>[];
  MemorySessionStore({this.complete = true, this.token});
  @override
  Future<String?> readRefreshToken() async => token;
  @override
  Future<void> saveRefreshToken(String value) async {
    token = value;
    saved.add(value);
  }

  @override
  Future<void> clearRefreshToken() async {
    token = null;
  }

  @override
  Future<bool> onboardingComplete() async => complete;
  @override
  Future<void> finishOnboarding() async {
    complete = true;
  }
}

class FakeIdentity implements CustomerIdentity {
  @override
  bool get googleAvailable => true;
  @override
  bool get appleAvailable => false;
  String? lastProvider;
  @override
  Future<Map<String, dynamic>> authenticate(
    String provider,
    CustomerApi api,
  ) async {
    lastProvider = provider;
    return {'provider': provider, 'idToken': 'synthetic-provider-token'};
  }

  @override
  Future<void> signOut() async {}
}

class FakeCustomerApi implements CustomerApi {
  int trialRemaining = 10;
  bool phoneAvailable = false;
  final calls =
      <
        ({
          String path,
          String method,
          Map<String, dynamic>? body,
          String? token,
        })
      >[];
  Map<String, dynamic> profile = {
    'id': 'customer-a',
    'email': 'customer@example.test',
    'displayName': 'Ava Morgan',
    'language': 'en',
    'notifications': false,
    'emailVerified': true,
    'methods': ['EMAIL_PASSWORD'],
  };
  Future<Map<String, dynamic>> Function(
    String path,
    String method,
    Map<String, dynamic>? body,
  )?
  handler;
  int refreshes = 0;
  Map<String, dynamic> bundle() => {
    'accessToken': 'synthetic-access',
    'refreshToken': 'synthetic-refresh',
    'accessTokenExpiresAt': DateTime.now()
        .add(const Duration(minutes: 10))
        .toIso8601String(),
    'customer': profile,
  };
  @override
  Future<Map<String, dynamic>> request(
    String path, {
    String method = 'POST',
    Map<String, dynamic>? body,
    String? token,
  }) async {
    calls.add((path: path, method: method, body: body, token: token));
    if (handler != null) return handler!(path, method, body);
    if (path == '/auth/capabilities') {
      return {
        'enabled': true,
        'providers': {
          'google': true,
          'apple': true,
          'emailCode': true,
          'phone': phoneAvailable,
        },
        'termsVersion': '2026-10-25',
      };
    }
    if ([
      '/auth/login',
      '/auth/oauth',
      '/auth/email-code/login',
      '/auth/phone/login',
    ].contains(path)) {
      return bundle();
    }
    if (path == '/auth/email-code/request') {
      return {'loginProof': 'b' * 43, 'resendAfterSeconds': 60};
    }
    if (path == '/auth/phone/request') {
      return {'projectId': 'synthetic-project', 'resendAfterSeconds': 60};
    }
    if (path == '/me/phone') {
      profile = {...profile, 'phoneNumber': '+919876543210'};
      return profile;
    }
    if (path == '/auth/refresh') {
      refreshes++;
      return bundle();
    }
    if (path == '/auth/signup') {
      return {
        'message': 'Check your email for a verification code.',
        'signupProof': 'a' * 43,
      };
    }
    if (path == '/me' && method == 'GET') return profile;
    if (path == '/me/photo') return {'photo': null};
    if (path == '/experience') {
      return {
        'generationAvailable': true,
        'consentVersion': '2026-10-26',
        'consentStatement':
            'I allow SelfX to process my chosen photos. Original photos expire within 7 days and results within 30 days.',
        'storeConsentStatement':
            'The Store pays. Personal credits are not used.',
        'trial': {
          'granted': 10,
          'used': 10 - trialRemaining,
          'reserved': 0,
          'remaining': trialRemaining,
        },
        'saved': 0,
        'pendingRunId': null,
      };
    }
    if (path.startsWith('/looks')) {
      return {
        'data': <Map<String, dynamic>>[],
        'pagination': {'page': 1, 'total': 0, 'hasMore': false},
      };
    }
    if (path == '/me' && method == 'PATCH') {
      profile = {...profile, ...?body};
      return profile;
    }
    return {
      'message': path == '/auth/verify-email'
          ? 'Email verified. You can now sign in.'
          : 'Request completed.',
    };
  }
}
