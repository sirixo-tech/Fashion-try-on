import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

abstract interface class CustomerSessionStore {
  Future<String?> readRefreshToken();
  Future<void> saveRefreshToken(String token);
  Future<void> clearRefreshToken();
  Future<bool> onboardingComplete();
  Future<void> finishOnboarding();
}

class SecureCustomerSessionStore implements CustomerSessionStore {
  final FlutterSecureStorage storage;
  final SharedPreferencesAsync preferences;
  SecureCustomerSessionStore({
    FlutterSecureStorage? storage,
    SharedPreferencesAsync? preferences,
  }) : storage = storage ?? const FlutterSecureStorage(),
       preferences = preferences ?? SharedPreferencesAsync();
  static const _tokenKey = 'selfx.customer.refresh.v1';
  @override
  Future<String?> readRefreshToken() => storage.read(key: _tokenKey);
  @override
  Future<void> saveRefreshToken(String token) =>
      storage.write(key: _tokenKey, value: token);
  @override
  Future<void> clearRefreshToken() => storage.delete(key: _tokenKey);
  @override
  Future<bool> onboardingComplete() async =>
      await preferences.getBool('selfx.customer.onboarding.v1') ?? false;
  @override
  Future<void> finishOnboarding() =>
      preferences.setBool('selfx.customer.onboarding.v1', true);
}
