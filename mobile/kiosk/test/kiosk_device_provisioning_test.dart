import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:selfx_kiosk/src/device/kiosk_device_gateway.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_models.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_session_controller.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_storage.dart';
import 'package:selfx_kiosk/src/ui/kiosk_pairing_screen.dart';

void main() {
  group('KIOSK-4A device provisioning startup', () {
    test('startup with no credential routes to pairing session', () async {
      final gateway = FakeKioskDeviceGateway();
      final controller = KioskDeviceSessionController(
        gateway: gateway,
        store: MemoryKioskDeviceCredentialStore(),
      );

      await controller.start();

      expect(controller.state, KioskStartupState.waitingForPairing);
      expect(controller.pairingSession?.pairingCode, '004281');
      expect(gateway.createCount, 1);
      controller.dispose();
    });

    test('startup restores device identity from secure refresh credential', () async {
      final store = MemoryKioskDeviceCredentialStore(refreshToken: 'refresh-a');
      final controller = KioskDeviceSessionController(
        gateway: FakeKioskDeviceGateway(),
        store: store,
      );

      await controller.start();

      expect(controller.state, KioskStartupState.active);
      expect(controller.device?.id, 'device-1');
      expect(await store.readRefreshToken(), 'refresh-b');
      controller.dispose();
    });

    test('revoked restore clears credential and returns to pairing', () async {
      final store = MemoryKioskDeviceCredentialStore(refreshToken: 'revoked');
      final controller = KioskDeviceSessionController(
        gateway: FakeKioskDeviceGateway(revokedRefreshToken: 'revoked'),
        store: store,
      );

      await controller.start();

      expect(controller.state, KioskStartupState.waitingForPairing);
      expect(await store.readRefreshToken(), isNull);
      controller.dispose();
    });

    test('timer derives remaining time from expiresAt and serverTime', () async {
      final serverTime = DateTime.now().add(const Duration(minutes: 2));
      final session = pairingSession(
        serverTime: serverTime,
        expiresAt: serverTime.add(const Duration(minutes: 8)),
      );
      final controller = KioskDeviceSessionController(
        gateway: FakeKioskDeviceGateway(session: session),
        store: MemoryKioskDeviceCredentialStore(),
      );

      await controller.requestPairingSession();

      final remaining = controller.remainingFor(session);
      expect(remaining.inSeconds, inInclusiveRange(477, 480));
      controller.dispose();
    });

    test('expired pairing causes a new session/code request', () async {
      final expired = pairingSession(
        code: '111111',
        expiresAt: DateTime.now().subtract(const Duration(seconds: 1)),
      );
      final next = pairingSession(code: '222222');
      final gateway = FakeKioskDeviceGateway(sessions: [expired, next]);
      final controller = KioskDeviceSessionController(
        gateway: gateway,
        store: MemoryKioskDeviceCredentialStore(),
      );

      await controller.requestPairingSession();
      await controller.pollNow();

      expect(controller.pairingSession?.pairingCode, '222222');
      expect(gateway.createCount, greaterThanOrEqualTo(2));
      controller.dispose();
    });

    testWidgets('pairing screen never renders provisioning secrets', (tester) async {
      final session = pairingSession(secret: 'super-secret-provisioning-value');
      final controller = KioskDeviceSessionController(
        gateway: FakeKioskDeviceGateway(session: session),
        store: MemoryKioskDeviceCredentialStore(),
      );
      await controller.requestPairingSession();

      await tester.pumpWidget(
        MaterialApp(home: KioskPairingScreen(controller: controller)),
      );

      expect(find.text('004 281'), findsOneWidget);
      expect(find.textContaining('super-secret'), findsNothing);
      controller.dispose();
    });
  });
}

KioskPairingSession pairingSession({
  String code = '004281',
  String secret = 'provisioning-secret',
  DateTime? serverTime,
  DateTime? expiresAt,
}) {
  final now = serverTime ?? DateTime.now();
  return KioskPairingSession(
    pairingSessionId: '018f0000-0000-7000-8000-000000000001',
    pairingCode: code,
    provisioningSecret: secret,
    expiresAt: expiresAt ?? now.add(const Duration(minutes: 8)),
    serverTime: now,
    ttlSeconds: 480,
    pollIntervalSeconds: 3,
  );
}

KioskDeviceCredentials credentials({String refreshToken = 'refresh-b'}) {
  return KioskDeviceCredentials(
    accessToken: 'access-a',
    accessTokenExpiresAt: DateTime.now().add(const Duration(minutes: 15)),
    refreshToken: refreshToken,
    refreshTokenExpiresAt: DateTime.now().add(const Duration(days: 30)),
    device: const KioskDeviceIdentity(
      id: 'device-1',
      displayName: 'Paired Kiosk',
      status: KioskDeviceStatus.active,
      assignment: KioskDeviceAssignment(
        scope: KioskAssignmentScope.platform,
        organizationId: null,
        organizationName: null,
        storeId: null,
        storeName: null,
      ),
      platform: 'windows',
      appVersion: '1.0.0',
      lastSeenAt: null,
    ),
  );
}

class FakeKioskDeviceGateway implements KioskDeviceGateway {
  FakeKioskDeviceGateway({
    KioskPairingSession? session,
    List<KioskPairingSession>? sessions,
    this.revokedRefreshToken,
  }) : sessions = sessions ?? [session ?? pairingSession()];

  final List<KioskPairingSession> sessions;
  final String? revokedRefreshToken;
  int createCount = 0;

  @override
  Future<KioskPairingSession> createPairingSession({
    required String installationId,
    required String platform,
    required String appVersion,
  }) async {
    final index = createCount.clamp(0, sessions.length - 1);
    createCount += 1;
    return sessions[index];
  }

  @override
  Future<KioskPairingStatusResult> getPairingStatus({
    required String sessionId,
    required String provisioningSecret,
  }) async {
    return KioskPairingStatusResult(
      status: KioskProvisioningStatus.waiting,
      serverTime: DateTime.now(),
      expiresAt: DateTime.now().add(const Duration(minutes: 8)),
    );
  }

  @override
  Future<KioskDeviceCredentials> exchangeProvisioningGrant({
    required String pairingSessionId,
    required String provisioningSecret,
    required String provisioningGrant,
  }) async {
    return credentials();
  }

  @override
  Future<KioskDeviceCredentials> refreshSession(String refreshToken) async {
    if (refreshToken == revokedRefreshToken) {
      throw const KioskDeviceException('DEVICE_REVOKED', 'Device revoked.');
    }
    return credentials();
  }

  @override
  Future<KioskDeviceIdentity> me(String accessToken) async {
    return credentials().device;
  }

  @override
  Future<KioskDeviceIdentity> heartbeat({
    required String accessToken,
    required String platform,
    required String appVersion,
  }) async {
    return credentials().device;
  }
}

class MemoryKioskDeviceCredentialStore implements KioskDeviceCredentialStore {
  MemoryKioskDeviceCredentialStore({String? refreshToken}) {
    _refreshToken = refreshToken;
  }

  String? _refreshToken;
  final String _installationId = 'install-test';

  @override
  Future<void> clearRefreshToken() async {
    _refreshToken = null;
  }

  @override
  Future<String> installationId() async {
    return _installationId;
  }

  @override
  Future<String?> readRefreshToken() async {
    return _refreshToken;
  }

  @override
  Future<void> writeRefreshToken(String token) async {
    _refreshToken = token;
  }
}
