import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:selfx_kiosk/src/config/kiosk_runtime_configuration.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_gateway.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_models.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_session_controller.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_storage.dart';
import 'package:selfx_kiosk/src/session/capture_scope.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_gateway.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/model_garment_compatibility.dart';

void main() {
  test('uses production kiosk endpoint with device session token', () async {
    final tempDir = await Directory.systemTemp.createTemp('selfx-tryon-');
    addTearDown(() async {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });
    final request = await tryOnRequest(tempDir);
    final deviceController = testDeviceController('device-token');
    final gateway = SelfxKioskTryOnGateway(
      config: const KioskTryOnApiConfig(apiBaseUrl: 'https://api.selfx.test'),
      deviceController: deviceController,
      client: MockClient((http.Request request) async {
        expect(request.url.path, '/api/v1/kiosk/try-on/runs');
        expect(request.headers[HttpHeaders.authorizationHeader], 'Bearer device-token');
        expect(
          request.headers[HttpHeaders.contentTypeHeader],
          startsWith('multipart/form-data; boundary='),
        );
        return jsonResponse({'id': 'run-1', 'status': 'QUEUED'});
      }),
    );

    final run = await gateway.createRun(request);

    expect(run.id, 'run-1');
    expect(run.status, KioskTryOnStatus.queued);
    deviceController.dispose();
  });

  test('refreshes device session once on expired access token', () async {
    final tempDir = await Directory.systemTemp.createTemp('selfx-tryon-');
    addTearDown(() async {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });
    final request = await tryOnRequest(tempDir);
    final deviceGateway = FakeDeviceGateway(
      refreshedCredentials: credentials('fresh-device-token'),
    );
    final store = InMemoryDeviceStore()..refreshToken = 'refresh-token';
    final deviceController = KioskDeviceSessionController(
      gateway: deviceGateway,
      store: store,
    )
      ..accessToken = 'expired-device-token'
      ..accessTokenExpiresAt = DateTime.now().subtract(const Duration(minutes: 1))
      ..state = KioskStartupState.active;
    final seenTokens = <String>[];
    final gateway = SelfxKioskTryOnGateway(
      config: const KioskTryOnApiConfig(apiBaseUrl: 'https://api.selfx.test'),
      deviceController: deviceController,
      client: MockClient((http.Request request) async {
        seenTokens.add(request.headers[HttpHeaders.authorizationHeader] ?? '');
        return jsonResponse({'id': 'run-1', 'status': 'QUEUED'});
      }),
    );

    await gateway.createRun(request);

    expect(seenTokens, ['Bearer fresh-device-token']);
    expect(deviceGateway.refreshCalls, 1);
    deviceController.dispose();
  });

  test('revoked device response clears auth and returns to pairing', () async {
    final tempDir = await Directory.systemTemp.createTemp('selfx-tryon-');
    addTearDown(() async {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });
    final request = await tryOnRequest(tempDir);
    final deviceController = testDeviceController('device-token');
    final gateway = SelfxKioskTryOnGateway(
      config: const KioskTryOnApiConfig(apiBaseUrl: 'https://api.selfx.test'),
      deviceController: deviceController,
      client: MockClient((http.Request request) async {
        return http.Response(
          jsonEncode({
            'error': {
              'code': 'DEVICE_REVOKED',
              'message': 'Kiosk device has been revoked.',
            },
          }),
          403,
          headers: {HttpHeaders.contentTypeHeader: 'application/json'},
        );
      }),
    );

    await expectLater(
      gateway.createRun(request),
      throwsA(
        isA<KioskTryOnException>().having(
          (error) => error.code,
          'code',
          KioskTryOnFailureCode.deviceAuthenticationRejected,
        ),
      ),
    );
    await Future<void>.delayed(Duration.zero);

    expect(deviceController.accessToken, isNull);
    expect(deviceController.state, KioskStartupState.waitingForPairing);
    deviceController.dispose();
  });
}

Future<KioskTryOnRequest> tryOnRequest(Directory tempDir) async {
  final person = File('${tempDir.path}${Platform.pathSeparator}person.jpg');
  final garment = File('${tempDir.path}${Platform.pathSeparator}garment.jpg');
  await person.writeAsBytes([1, 2, 3]);
  await garment.writeAsBytes([1, 2, 3]);
  return KioskTryOnRequest(
    clientRequestId: 'attempt-1',
    personImage: person,
    garmentInput: KioskGarmentInput(
      source: KioskGarmentInputSource.capturedGarment,
      localPath: garment.path,
      intent: KioskGarmentIntent.top,
      photoType: KioskGarmentPhotoType.flatLay,
    ),
    captureScope: CaptureScope.fullBody,
    modelCoverage: ModelCoverage.fullBody,
    targetMetadata: TryOnTargetPreparationMetadata(
      originalPath: person.path,
      preparedPath: person.path,
      originalWidth: 100,
      originalHeight: 200,
      cropX: 0,
      cropY: 0,
      cropWidth: 100,
      cropHeight: 200,
      scope: CaptureScope.fullBody,
      usedTargetRegion: false,
      windowsFullFrameFallback: true,
    ),
  );
}

KioskDeviceSessionController testDeviceController(String accessToken) {
  return KioskDeviceSessionController(
    gateway: FakeDeviceGateway(),
    store: InMemoryDeviceStore(),
  )
    ..accessToken = accessToken
    ..accessTokenExpiresAt = DateTime.now().add(const Duration(minutes: 5))
    ..state = KioskStartupState.active;
}

http.Response jsonResponse(Map<String, dynamic> body) {
  return http.Response(
    jsonEncode({
      ...body,
      'createdAt': '2026-08-15T00:00:00.000Z',
      'updatedAt': '2026-08-15T00:00:00.000Z',
    }),
    201,
    headers: {HttpHeaders.contentTypeHeader: 'application/json'},
  );
}

KioskDeviceCredentials credentials(String accessToken) {
  return KioskDeviceCredentials(
    accessToken: accessToken,
    accessTokenExpiresAt: DateTime.now().add(const Duration(minutes: 15)),
    refreshToken: 'next-refresh-token',
    refreshTokenExpiresAt: DateTime.now().add(const Duration(hours: 1)),
    device: const KioskDeviceIdentity(
      id: 'device-1',
      displayName: 'Test device',
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

class InMemoryDeviceStore implements KioskDeviceCredentialStore {
  String? refreshToken;

  @override
  Future<void> clearRefreshToken() async {
    refreshToken = null;
  }

  @override
  Future<String> installationId() async => 'installation-1';

  @override
  Future<String?> readRefreshToken() async => refreshToken;

  @override
  Future<void> writeRefreshToken(String token) async {
    refreshToken = token;
  }
}

class FakeDeviceGateway implements KioskDeviceGateway {
  FakeDeviceGateway({KioskDeviceCredentials? refreshedCredentials})
    : refreshedCredentials =
          refreshedCredentials ?? credentials('device-token');

  final KioskDeviceCredentials refreshedCredentials;
  int refreshCalls = 0;

  @override
  Future<KioskPairingSession> createPairingSession({
    required String installationId,
    required String platform,
    required String appVersion,
  }) async {
    return KioskPairingSession(
      pairingSessionId: 'pairing-1',
      pairingCode: '123456',
      provisioningSecret: 'secret',
      expiresAt: DateTime.now().add(const Duration(minutes: 5)),
      serverTime: DateTime.now(),
      ttlSeconds: 300,
      pollIntervalSeconds: 3,
    );
  }

  @override
  Future<KioskDeviceCredentials> exchangeProvisioningGrant({
    required String pairingSessionId,
    required String provisioningSecret,
    required String provisioningGrant,
  }) async {
    return refreshedCredentials;
  }

  @override
  Future<KioskPairingStatusResult> getPairingStatus({
    required String sessionId,
    required String provisioningSecret,
  }) async {
    return KioskPairingStatusResult(
      status: KioskProvisioningStatus.waiting,
      serverTime: DateTime.now(),
      expiresAt: DateTime.now().add(const Duration(minutes: 5)),
    );
  }

  @override
  Future<KioskDeviceIdentity> heartbeat({
    required String accessToken,
    required String platform,
    required String appVersion,
  }) async {
    return refreshedCredentials.device;
  }

  @override
  Future<KioskRuntimeConfiguration> configuration(String accessToken) async {
    return defaultRuntimeConfiguration;
  }

  @override
  Future<KioskDeviceIdentity> me(String accessToken) async {
    return refreshedCredentials.device;
  }

  @override
  Future<KioskDeviceCredentials> refreshSession(String refreshToken) async {
    refreshCalls += 1;
    return refreshedCredentials;
  }
}
