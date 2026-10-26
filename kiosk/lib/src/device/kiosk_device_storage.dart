import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class KioskDeviceCredentialStore {
  Future<String> installationId();

  Future<String?> readRefreshToken();

  Future<void> writeRefreshToken(String token);

  Future<void> clearRefreshToken();
}

class SecureKioskDeviceCredentialStore implements KioskDeviceCredentialStore {
  SecureKioskDeviceCredentialStore({FlutterSecureStorage? storage})
    : storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage storage;

  static const _installationIdKey = 'selfx_kiosk_installation_id';
  static const _refreshTokenKey = 'selfx_kiosk_device_refresh_token';

  @override
  Future<String> installationId() async {
    final existing = await storage.read(key: _installationIdKey);
    if (existing != null && existing.isNotEmpty) {
      return existing;
    }
    final created = _secureId();
    await storage.write(key: _installationIdKey, value: created);
    return created;
  }

  @override
  Future<String?> readRefreshToken() {
    return storage.read(key: _refreshTokenKey);
  }

  @override
  Future<void> writeRefreshToken(String token) {
    return storage.write(key: _refreshTokenKey, value: token);
  }

  @override
  Future<void> clearRefreshToken() {
    return storage.delete(key: _refreshTokenKey);
  }
}

String _secureId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20),
  ].join('-');
}
