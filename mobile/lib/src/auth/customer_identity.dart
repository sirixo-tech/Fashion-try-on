import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'customer_api.dart';

abstract interface class CustomerIdentity {
  bool get googleAvailable;
  bool get appleAvailable;
  Future<Map<String, dynamic>> authenticate(String provider, CustomerApi api);
  Future<void> signOut();
}

class NativeCustomerIdentity implements CustomerIdentity {
  static const _googleClient = String.fromEnvironment('SELFX_GOOGLE_CLIENT_ID');
  static const _googleServerClient = String.fromEnvironment(
    'SELFX_GOOGLE_SERVER_CLIENT_ID',
  );
  Future<void>? _googleInitialization;
  @override
  bool get googleAvailable =>
      !kIsWeb &&
      [
        TargetPlatform.android,
        TargetPlatform.iOS,
      ].contains(defaultTargetPlatform) &&
      (defaultTargetPlatform == TargetPlatform.android ||
          _googleServerClient.isNotEmpty);
  @override
  bool get appleAvailable =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;
  @override
  Future<Map<String, dynamic>> authenticate(
    String provider,
    CustomerApi api,
  ) async {
    try {
      if (provider == 'GOOGLE' && googleAvailable) {
        _googleInitialization ??= GoogleSignIn.instance.initialize(
          clientId: _googleClient.isEmpty ? null : _googleClient,
          serverClientId: _googleServerClient.isEmpty
              ? null
              : _googleServerClient,
        );
        await _googleInitialization;
        final account = await GoogleSignIn.instance.authenticate();
        final idToken = account.authentication.idToken;
        if (idToken == null) {
          throw const CustomerApiException(
            'OAUTH_FAILED',
            'Google sign-in could not be completed.',
          );
        }
        return {
          'provider': provider,
          'idToken': idToken,
          if (account.displayName != null) 'displayName': account.displayName,
        };
      }
      if (provider == 'APPLE' && appleAvailable) {
        final challenge = await api.request('/auth/apple-challenge');
        final credential = await SignInWithApple.getAppleIDCredential(
          scopes: [
            AppleIDAuthorizationScopes.email,
            AppleIDAuthorizationScopes.fullName,
          ],
          nonce: challenge['nonceHash'] as String,
        );
        if (credential.identityToken == null) {
          throw const CustomerApiException(
            'OAUTH_FAILED',
            'Apple sign-in could not be completed.',
          );
        }
        final name = [
          credential.givenName,
          credential.familyName,
        ].whereType<String>().join(' ');
        return {
          'provider': provider,
          'idToken': credential.identityToken,
          'challengeId': challenge['challengeId'],
          if (name.isNotEmpty) 'displayName': name,
        };
      }
      throw const CustomerApiException(
        'OAUTH_UNAVAILABLE',
        'This sign-in method is not available on this device.',
      );
    } on GoogleSignInException catch (error) {
      if (error.code == GoogleSignInExceptionCode.canceled) {
        throw const CustomerApiException(
          'OAUTH_CANCELLED',
          'Sign-in cancelled.',
        );
      }
      throw const CustomerApiException(
        'OAUTH_FAILED',
        'Google sign-in is unavailable. Try email sign-in.',
      );
    } on SignInWithAppleAuthorizationException catch (error) {
      if (error.code == AuthorizationErrorCode.canceled) {
        throw const CustomerApiException(
          'OAUTH_CANCELLED',
          'Sign-in cancelled.',
        );
      }
      throw const CustomerApiException(
        'OAUTH_FAILED',
        'Apple sign-in is unavailable. Try email sign-in.',
      );
    } on CustomerApiException {
      rethrow;
    } catch (_) {
      throw const CustomerApiException(
        'OAUTH_FAILED',
        'Sign-in could not be completed. Try email sign-in.',
      );
    }
  }

  @override
  Future<void> signOut() async {
    if (_googleInitialization != null) {
      try {
        await GoogleSignIn.instance.signOut();
      } catch (_) {
        /* SelfX credentials are still cleared. */
      }
    }
  }
}
