import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:selfx_kiosk/src/config/kiosk_runtime_configuration.dart';
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

    test(
      'startup restores device identity from secure refresh credential',
      () async {
        final store = MemoryKioskDeviceCredentialStore(
          refreshToken: 'refresh-a',
        );
        final controller = KioskDeviceSessionController(
          gateway: FakeKioskDeviceGateway(),
          store: store,
        );

        await controller.start();

        expect(controller.state, KioskStartupState.active);
        expect(controller.device?.id, 'device-1');
        expect(await store.readRefreshToken(), 'refresh-b');
        controller.dispose();
      },
    );

    test(
      'startup network failure keeps persisted refresh credential',
      () async {
        final store = MemoryKioskDeviceCredentialStore(
          refreshToken: 'refresh-a',
        );
        final controller = KioskDeviceSessionController(
          gateway: FakeKioskDeviceGateway(
            refreshFailure: const SocketException('offline'),
          ),
          store: store,
        );

        await controller.start();

        expect(controller.state, KioskStartupState.networkUnavailable);
        expect(await store.readRefreshToken(), 'refresh-a');
        expect(controller.pairingSession, isNull);
        controller.dispose();
      },
    );

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

    test('heartbeat access expiry refreshes once and stays paired', () async {
      final store = MemoryKioskDeviceCredentialStore(refreshToken: 'refresh-a');
      final gateway = FakeKioskDeviceGateway(
        heartbeatFailures: [
          const KioskDeviceException(
            'DEVICE_TOKEN_EXPIRED',
            'Access token expired.',
          ),
        ],
        credentialsResponse: credentials(
          accessToken: 'fresh-access',
          refreshToken: 'refresh-b',
        ),
      );
      final controller =
          KioskDeviceSessionController(gateway: gateway, store: store)
            ..accessToken = 'stale-access'
            ..accessTokenExpiresAt = DateTime.now().add(
              const Duration(minutes: 5),
            )
            ..device = credentials().device
            ..state = KioskStartupState.active;

      await controller.heartbeat();

      expect(gateway.refreshCount, 1);
      expect(gateway.heartbeatAccessTokens, ['stale-access', 'fresh-access']);
      expect(await store.readRefreshToken(), 'refresh-b');
      expect(controller.state, KioskStartupState.active);
      expect(controller.pairingSession, isNull);
      controller.dispose();
    });

    test('heartbeat transient failures do not clear pairing', () async {
      for (final failure in <Object>[
        const SocketException('offline'),
        TimeoutException('timeout'),
        const KioskDeviceException('KIOSK_RATE_LIMITED', 'Slow down.'),
        const KioskDeviceException('KIOSK_REQUEST_FAILED', 'Server failed.'),
      ]) {
        final store = MemoryKioskDeviceCredentialStore(
          refreshToken: 'refresh-a',
        );
        final controller =
            KioskDeviceSessionController(
                gateway: FakeKioskDeviceGateway(heartbeatFailures: [failure]),
                store: store,
              )
              ..accessToken = 'access-a'
              ..accessTokenExpiresAt = DateTime.now().add(
                const Duration(minutes: 5),
              )
              ..device = credentials().device
              ..state = KioskStartupState.active;

        await controller.heartbeat();

        expect(await store.readRefreshToken(), 'refresh-a');
        expect(controller.state, KioskStartupState.active);
        expect(controller.pairingSession, isNull);
        controller.dispose();
      }
    });

    test(
      'terminal heartbeat response clears credential and returns to pairing',
      () async {
        final store = MemoryKioskDeviceCredentialStore(
          refreshToken: 'refresh-a',
        );
        final controller =
            KioskDeviceSessionController(
                gateway: FakeKioskDeviceGateway(
                  heartbeatFailures: [
                    const KioskDeviceException(
                      'DEVICE_REVOKED',
                      'Device revoked.',
                    ),
                  ],
                ),
                store: store,
              )
              ..accessToken = 'access-a'
              ..accessTokenExpiresAt = DateTime.now().add(
                const Duration(minutes: 5),
              )
              ..device = credentials().device
              ..state = KioskStartupState.active;

        await controller.heartbeat();

        expect(await store.readRefreshToken(), isNull);
        expect(controller.state, KioskStartupState.waitingForPairing);
        controller.dispose();
      },
    );

    test(
      'refresh persistence failure is surfaced before committing access token',
      () async {
        final store = MemoryKioskDeviceCredentialStore(
          refreshToken: 'refresh-a',
          failWrites: true,
        );
        final controller =
            KioskDeviceSessionController(
                gateway: FakeKioskDeviceGateway(
                  credentialsResponse: credentials(
                    accessToken: 'fresh-access',
                    refreshToken: 'refresh-b',
                  ),
                ),
                store: store,
              )
              ..accessToken = 'stale-access'
              ..accessTokenExpiresAt = DateTime.now().subtract(
                const Duration(minutes: 1),
              )
              ..device = credentials().device
              ..state = KioskStartupState.active;

        await expectLater(
          controller.requireAccessToken(),
          throwsA(isA<StateError>()),
        );

        expect(controller.accessToken, 'stale-access');
        expect(await store.readRefreshToken(), 'refresh-a');
        controller.dispose();
      },
    );

    test(
      'timer derives remaining time from expiresAt and serverTime',
      () async {
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
      },
    );

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

    testWidgets('pairing screen never renders provisioning secrets', (
      tester,
    ) async {
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

    test('JSON device requests keep JSON content type', () async {
      final gateway = SelfxKioskDeviceGateway(
        config: const KioskDeviceApiConfig(
          apiBaseUrl: 'https://api.selfx.test',
        ),
        client: MockClient((http.Request request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/api/v1/kiosk/provisioning/sessions');
          expect(request.headers[HttpHeaders.acceptHeader], 'application/json');
          expect(
            request.headers[HttpHeaders.contentTypeHeader],
            'application/json',
          );
          expect(jsonDecode(request.body), {
            'installationId': 'install-test',
            'platform': 'windows',
            'appVersion': '1.0.0',
          });
          return http.Response(
            jsonEncode({
              'pairingSessionId': 'pairing-session',
              'pairingCode': '123456',
              'provisioningSecret': 'secret',
              'expiresAt': DateTime.now()
                  .add(const Duration(minutes: 8))
                  .toIso8601String(),
              'serverTime': DateTime.now().toIso8601String(),
              'ttlSeconds': 480,
              'pollIntervalSeconds': 3,
            }),
            201,
            headers: {HttpHeaders.contentTypeHeader: 'application/json'},
          );
        }),
      );

      final session = await gateway.createPairingSession(
        installationId: 'install-test',
        platform: 'windows',
        appVersion: '1.0.0',
      );

      expect(session.pairingCode, '123456');
    });

    test('bodyless device identity request omits JSON content type', () async {
      final gateway = SelfxKioskDeviceGateway(
        config: const KioskDeviceApiConfig(
          apiBaseUrl: 'https://api.selfx.test',
        ),
        client: MockClient((http.Request request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/api/v1/kiosk/session/me');
          expect(request.headers[HttpHeaders.acceptHeader], 'application/json');
          expect(
            request.headers[HttpHeaders.authorizationHeader],
            'Bearer device-token',
          );
          expect(
            request.headers,
            isNot(contains(HttpHeaders.contentTypeHeader)),
          );
          return http.Response(
            jsonEncode(deviceJson()),
            200,
            headers: {HttpHeaders.contentTypeHeader: 'application/json'},
          );
        }),
      );

      final device = await gateway.me('device-token');

      expect(device.id, 'device-1');
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

KioskDeviceCredentials credentials({
  String accessToken = 'access-a',
  String refreshToken = 'refresh-b',
}) {
  return KioskDeviceCredentials(
    accessToken: accessToken,
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
      latestConfigurationVersion: 1,
    ),
  );
}

Map<String, dynamic> deviceJson() {
  return {
    'id': 'device-1',
    'displayName': 'Paired Kiosk',
    'status': 'ACTIVE',
    'assignment': {
      'scope': 'PLATFORM',
      'organizationId': null,
      'organizationName': null,
      'storeId': null,
      'storeName': null,
    },
    'platform': 'windows',
    'appVersion': '1.0.0',
    'installationId': 'install-test',
    'pairedAt': DateTime.now().toIso8601String(),
    'lastSeenAt': null,
    'inactiveAt': null,
    'revokedAt': null,
    'deletedAt': null,
    'createdAt': DateTime.now().toIso8601String(),
    'updatedAt': DateTime.now().toIso8601String(),
    'latestConfigurationVersion': 1,
  };
}

class FakeKioskDeviceGateway implements KioskDeviceGateway {
  FakeKioskDeviceGateway({
    KioskPairingSession? session,
    List<KioskPairingSession>? sessions,
    this.revokedRefreshToken,
    this.refreshFailure,
    KioskDeviceCredentials? credentialsResponse,
    List<Object>? heartbeatFailures,
  }) : sessions = sessions ?? [session ?? pairingSession()],
       credentialsResponse = credentialsResponse ?? credentials(),
       heartbeatFailures = heartbeatFailures ?? [];

  final List<KioskPairingSession> sessions;
  final String? revokedRefreshToken;
  final Object? refreshFailure;
  final KioskDeviceCredentials credentialsResponse;
  final List<Object> heartbeatFailures;
  int createCount = 0;
  int refreshCount = 0;
  int heartbeatCount = 0;
  final List<String> heartbeatAccessTokens = [];

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
    refreshCount += 1;
    final failure = refreshFailure;
    if (failure != null) {
      throw failure;
    }
    if (refreshToken == revokedRefreshToken) {
      throw const KioskDeviceException('DEVICE_REVOKED', 'Device revoked.');
    }
    return credentialsResponse;
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
    heartbeatAccessTokens.add(accessToken);
    final index = heartbeatCount;
    heartbeatCount += 1;
    if (index < heartbeatFailures.length) {
      throw heartbeatFailures[index];
    }
    return credentialsResponse.device;
  }

  @override
  Future<KioskRuntimeConfiguration> configuration(String accessToken) async {
    return defaultRuntimeConfiguration;
  }
}

class MemoryKioskDeviceCredentialStore implements KioskDeviceCredentialStore {
  MemoryKioskDeviceCredentialStore({
    String? refreshToken,
    this.failWrites = false,
  }) {
    _refreshToken = refreshToken;
  }

  String? _refreshToken;
  final bool failWrites;
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
    if (failWrites) {
      throw StateError('secure storage write failed');
    }
    _refreshToken = token;
  }
}
