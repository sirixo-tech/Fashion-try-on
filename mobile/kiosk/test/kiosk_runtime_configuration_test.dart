import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:selfx_kiosk/src/camera/camera_models.dart';
import 'package:selfx_kiosk/src/camera/camera_orientation.dart';
import 'package:selfx_kiosk/src/camera/camera_service.dart';
import 'package:selfx_kiosk/src/config/kiosk_runtime_configuration.dart';
import 'package:selfx_kiosk/src/config/kiosk_runtime_configuration_controller.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_gateway.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_models.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_session_controller.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_storage.dart';
import 'package:selfx_kiosk/src/live/live_frame.dart';
import 'package:selfx_kiosk/src/quality/image_quality.dart';
import 'package:selfx_kiosk/src/session/capture_audio_service.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/session/temporary_capture_store.dart';
import 'package:selfx_kiosk/src/settings/camera_settings_store.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_gateway.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/tryon/model_garment_compatibility.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'parses remote runtime configuration into kiosk presentation settings',
    () {
      final configuration = KioskRuntimeConfiguration.fromJson({
        'version': 7,
        'display': {
          'idleMode': 'SLIDESHOW',
          'slideDurationSeconds': 12,
          'title': 'SelfX Studio',
          'subtitle': 'Try the new collection',
          'ctaLabel': 'Begin',
          'assets': [_bundledAssetJson()],
        },
        'capture': {
          'countdownSeconds': 15,
          'soundEnabled': true,
          'soundProfile': 'STUDIO',
          'guidanceAudioEnabled': true,
        },
        'experience': {
          'enabledGarmentIntents': ['TOP', 'FULL_OUTFIT'],
          'sessionIdleTimeoutSeconds': 180,
        },
        'updatedAt': '2026-08-16T00:00:00.000Z',
      });

      final presentation = configuration.toIdlePresentation();

      expect(configuration.version, 7);
      expect(presentation.title, 'SelfX Studio');
      expect(presentation.ctaLabel, 'Begin');
      expect(presentation.isSlideshow, isFalse);
      expect(configuration.countdownSeconds, 15);
      expect(configuration.captureAudioProfile, CaptureAudioProfile.classic);
      expect(configuration.guidanceAudioEnabled, isTrue);
      expect(configuration.enabledGarmentIntents, [
        KioskGarmentIntent.top,
        KioskGarmentIntent.fullOutfit,
      ]);
      expect(configuration.sessionIdleTimeoutSeconds, 180);
    },
  );

  test('muted remote sound profile disables effective capture sounds', () {
    final configuration = KioskRuntimeConfiguration.fromJson({
      'version': 2,
      'display': {
        'assets': [_bundledAssetJson()],
      },
      'capture': {
        'countdownSeconds': 10,
        'soundEnabled': true,
        'soundProfile': 'MUTED',
        'guidanceAudioEnabled': false,
      },
      'experience': {
        'enabledGarmentIntents': ['BOTTOM'],
        'sessionIdleTimeoutSeconds': 120,
      },
      'updatedAt': '2026-08-16T00:00:00.000Z',
    });

    expect(configuration.effectiveSoundEnabled, isFalse);
    expect(configuration.enabledGarmentIntents, [KioskGarmentIntent.bottom]);
  });

  test('loads bundled defaults when no cached configuration exists', () async {
    final harness = RuntimeConfigHarness();

    await harness.controller.loadCachedOrDefault();

    expect(harness.controller.configuration.version, 1);
    expect(harness.controller.statusLabel, 'Bundled defaults');
    expect(harness.gateway.configurationCalls, 0);
  });

  test('loads a valid cached configuration while offline', () async {
    final cache = MemoryRuntimeConfigurationCache(
      jsonEncode(_configurationJson(version: 4, ctaLabel: 'Cached Start')),
    );
    final harness = RuntimeConfigHarness(cache: cache);

    await harness.controller.loadCachedOrDefault();

    expect(harness.controller.configuration.version, 4);
    expect(harness.controller.configuration.ctaLabel, 'Cached Start');
    expect(harness.gateway.configurationCalls, 0);
  });

  test('does not redownload when server and local versions match', () async {
    final harness = RuntimeConfigHarness(
      cache: MemoryRuntimeConfigurationCache(
        jsonEncode(_configurationJson(version: 3)),
      ),
      latestConfigurationVersion: 3,
    );
    await harness.controller.loadCachedOrDefault();

    await harness.controller.syncIfNeeded();

    expect(harness.controller.configuration.version, 3);
    expect(harness.gateway.configurationCalls, 0);
  });

  test('downloads and activates newer configuration when safe', () async {
    final harness = RuntimeConfigHarness(latestConfigurationVersion: 5);
    harness.gateway.remote = _runtimeConfiguration(
      version: 5,
      ctaLabel: 'Begin',
    );

    await harness.controller.syncIfNeeded();

    expect(harness.gateway.configurationCalls, 1);
    expect(harness.controller.configuration.version, 5);
    expect(harness.controller.configuration.ctaLabel, 'Begin');
    expect(harness.cache.value, contains('"version":5'));
  });

  test(
    'keeps previous active configuration when required asset download fails',
    () async {
      final harness = RuntimeConfigHarness(
        cache: MemoryRuntimeConfigurationCache(
          jsonEncode(_configurationJson(version: 2, ctaLabel: 'Still Active')),
        ),
        latestConfigurationVersion: 3,
        client: MockClient(
          (_) async => http.Response(
            'missing',
            404,
            headers: {'content-type': 'text/plain'},
          ),
        ),
      );
      harness.gateway.remote = _runtimeConfiguration(
        version: 3,
        assets: [_remoteAsset('hero', 'https://cdn.selfx.test/hero.png')],
      );
      await harness.controller.loadCachedOrDefault();

      await harness.controller.syncIfNeeded();

      expect(harness.controller.configuration.version, 2);
      expect(harness.controller.configuration.ctaLabel, 'Still Active');
      expect(harness.controller.pendingConfiguration, isNull);
      expect(harness.cache.value, contains('"version":2'));
    },
  );

  test(
    'activates a candidate only after every remote asset is ready',
    () async {
      final temp = await Directory.systemTemp.createTemp('selfx-kiosk-config-');
      addTearDown(() => temp.delete(recursive: true));
      final requested = <Uri>[];
      final harness = RuntimeConfigHarness(
        latestConfigurationVersion: 6,
        cacheDirectory: temp,
        client: MockClient((request) async {
          requested.add(request.url);
          return http.Response.bytes(
            [137, 80, 78, 71],
            200,
            headers: {'content-type': 'image/png'},
          );
        }),
      );
      harness.gateway.remote = _runtimeConfiguration(
        version: 6,
        assets: [
          _remoteAsset('hero-a', 'https://cdn.selfx.test/a.png'),
          _remoteAsset('hero-b', 'https://cdn.selfx.test/b.png'),
        ],
      );

      await harness.controller.syncIfNeeded(activateImmediately: false);

      expect(requested, hasLength(2));
      expect(harness.controller.configuration.version, 1);
      expect(harness.controller.pendingConfiguration?.version, 6);
      for (final asset in harness.controller.pendingConfiguration!.assets) {
        expect(asset.localImagePath, isNotNull);
        expect(await File(asset.localImagePath!).exists(), isTrue);
      }

      final activated = harness.controller.activatePendingConfiguration();
      expect(activated?.version, 6);
      expect(harness.controller.configuration.version, 6);
    },
  );

  test('prepares remote video assets for playback', () async {
    final temp = await Directory.systemTemp.createTemp('selfx-kiosk-config-');
    addTearDown(() => temp.delete(recursive: true));
    final harness = RuntimeConfigHarness(
      latestConfigurationVersion: 7,
      cacheDirectory: temp,
      client: MockClient((request) async {
        return http.Response.bytes(
          [0, 0, 0, 24],
          200,
          headers: {'content-type': 'video/mp4'},
        );
      }),
    );
    harness.gateway.remote = _runtimeConfiguration(
      version: 7,
      assets: [
        KioskRuntimeAsset(
          id: 'hero-video',
          type: RuntimeKioskAssetType.remoteVideo,
          label: 'Hero video',
          url: 'https://cdn.selfx.test/hero.mp4',
          contentType: 'video/mp4',
        ),
      ],
    );

    await harness.controller.syncIfNeeded();

    final asset = harness.controller.configuration.assets.single;
    expect(asset.localImagePath, isNull);
    expect(asset.assetVideoPath, isNotNull);
    expect(asset.assetVideoPath, endsWith('.mp4'));
    expect(await File(asset.assetVideoPath!).exists(), isTrue);
  });

  test('allows only one configuration sync at a time', () async {
    final gate = Completer<KioskRuntimeConfiguration>();
    final harness = RuntimeConfigHarness(latestConfigurationVersion: 8);
    harness.gateway.remoteCompleter = gate;

    final first = harness.controller.syncIfNeeded(force: true);
    final second = harness.controller.syncIfNeeded(force: true);
    gate.complete(_runtimeConfiguration(version: 8));
    await Future.wait([first, second]);

    expect(harness.gateway.configurationCalls, 1);
    expect(harness.controller.configuration.version, 8);
  });

  test(
    'configuration sync refreshes expired access token and retries once',
    () async {
      final harness = RuntimeConfigHarness(latestConfigurationVersion: 5);
      harness.gateway.configurationFailures = [
        const KioskDeviceException(
          'DEVICE_TOKEN_EXPIRED',
          'Access token expired.',
        ),
      ];
      harness.deviceController.accessToken = 'stale-device-token';
      await harness.credentialStore.writeRefreshToken('refresh-token');
      harness.gateway.refreshedCredentials = _credentials(
        accessToken: 'fresh-device-token',
        refreshToken: 'next-refresh-token',
        latestConfigurationVersion: 5,
      );

      await harness.controller.syncIfNeeded();

      expect(harness.gateway.refreshCalls, 1);
      expect(harness.gateway.configurationAccessTokens, [
        'stale-device-token',
        'fresh-device-token',
      ]);
      expect(harness.controller.configuration.version, 2);
      expect(harness.credentialStore.refreshToken, 'next-refresh-token');
    },
  );

  test(
    'configuration sync failure keeps cached configuration and pairing',
    () async {
      final cache = MemoryRuntimeConfigurationCache(
        jsonEncode(_configurationJson(version: 4, ctaLabel: 'Cached Start')),
      );
      final harness = RuntimeConfigHarness(
        cache: cache,
        latestConfigurationVersion: 5,
      );
      harness.gateway.configurationFailures = [
        const KioskDeviceException('KIOSK_RATE_LIMITED', 'Rate limited.'),
      ];
      await harness.controller.loadCachedOrDefault();

      await harness.controller.syncIfNeeded();

      expect(harness.controller.configuration.version, 4);
      expect(harness.credentialStore.refreshToken, isNull);
      expect(harness.deviceController.state, KioskStartupState.checking);
    },
  );

  test(
    'keeps a newer configuration pending during an active customer session',
    () async {
      final harness = RuntimeConfigHarness(latestConfigurationVersion: 9);
      final tryOnController = KioskTryOnSessionController(
        gateway: FakeTryOnGateway(),
      );
      harness.gateway.remote = _runtimeConfiguration(
        version: 9,
        intents: [KioskGarmentIntent.bottom],
      );
      tryOnController.beginCustomerSession();

      await harness.controller.syncIfNeeded(
        activateImmediately: tryOnController.canActivateRuntimeConfiguration,
      );

      expect(harness.controller.configuration.version, 1);
      expect(harness.controller.pendingConfiguration?.version, 9);
      expect(
        tryOnController.enabledGarmentIntents,
        contains(KioskGarmentIntent.top),
      );

      tryOnController.endCustomerSession();
      final activated = harness.controller.activatePendingConfiguration();
      tryOnController.applyEnabledGarmentIntents(
        activated!.enabledGarmentIntents,
      );

      expect(harness.controller.configuration.version, 9);
      expect(tryOnController.enabledGarmentIntents, [
        KioskGarmentIntent.bottom,
      ]);
    },
  );

  test('remote enabled garment intents control available categories', () {
    final tryOnController = KioskTryOnSessionController(
      gateway: FakeTryOnGateway(),
    );

    tryOnController.applyEnabledGarmentIntents([KioskGarmentIntent.bottom]);

    expect(tryOnController.enabledGarmentIntents, [KioskGarmentIntent.bottom]);
    expect(
      tryOnController.enabledGarmentIntents,
      isNot(contains(KioskGarmentIntent.top)),
    );
    expect(
      tryOnController.enabledGarmentIntents,
      isNot(contains(KioskGarmentIntent.fullOutfit)),
    );
  });

  test(
    'remote enabled garment intents preserve live captured auto garment',
    () {
      final tryOnController =
          KioskTryOnSessionController(gateway: FakeTryOnGateway())
            ..selectGarment(
              const KioskGarmentInput(
                source: KioskGarmentInputSource.cameraCapture,
                localPath: 'captured-garment.jpg',
                intent: KioskGarmentIntent.auto,
              ),
            );

      tryOnController.applyEnabledGarmentIntents([KioskGarmentIntent.bottom]);

      expect(tryOnController.garmentInput?.intent, KioskGarmentIntent.auto);
      expect(tryOnController.pendingGarmentIntent, KioskGarmentIntent.auto);
    },
  );

  test(
    'KIOSK-5B compatibility still blocks unsupported filtered categories',
    () {
      final result = const ModelGarmentCompatibilityService().check(
        coverage: ModelCoverage.upperBody,
        intent: KioskGarmentIntent.bottom,
      );

      expect(result.supported, isFalse);
      expect(result.guidance?.title, 'Update your photo to try bottoms');
    },
  );

  test(
    'try-on session completion does not mutate the configuration cache',
    () async {
      final cache = MemoryRuntimeConfigurationCache(
        jsonEncode(_configurationJson(version: 11)),
      );
      final tryOnController = KioskTryOnSessionController(
        gateway: FakeTryOnGateway(),
      );
      final captureController = CaptureSessionController(
        cameraService: FakeCameraService(),
        settingsStore: InMemoryCameraSettingsStore(),
        analyzer: FakeQualityAnalyzer(),
        captureStore: InMemoryTemporaryCaptureStore(),
      );

      tryOnController.beginCustomerSession();
      await tryOnController.finish(captureController);
      tryOnController.endCustomerSession();

      expect(cache.value, contains('"version":11'));
    },
  );
}

class RuntimeConfigHarness {
  RuntimeConfigHarness({
    MemoryRuntimeConfigurationCache? cache,
    http.Client? client,
    Directory? cacheDirectory,
    int latestConfigurationVersion = 1,
  }) : cache = cache ?? MemoryRuntimeConfigurationCache() {
    gateway = FakeDeviceGateway();
    credentialStore = MemoryDeviceCredentialStore();
    deviceController =
        KioskDeviceSessionController(
            gateway: gateway,
            store: credentialStore,
            platform: 'windows',
          )
          ..accessToken = 'device-token'
          ..accessTokenExpiresAt = DateTime.now().add(const Duration(hours: 1))
          ..device = _device(latestConfigurationVersion);
    controller = KioskRuntimeConfigurationController(
      gateway: gateway,
      deviceController: deviceController,
      cache: this.cache,
      client: client,
      cacheDirectoryProvider: cacheDirectory == null
          ? null
          : () async => cacheDirectory,
    );
  }

  final MemoryRuntimeConfigurationCache cache;
  late final FakeDeviceGateway gateway;
  late final MemoryDeviceCredentialStore credentialStore;
  late final KioskDeviceSessionController deviceController;
  late final KioskRuntimeConfigurationController controller;
}

class MemoryRuntimeConfigurationCache
    implements KioskRuntimeConfigurationCache {
  MemoryRuntimeConfigurationCache([this.value]);

  String? value;

  @override
  Future<String?> readConfigurationJson() async => value;

  @override
  Future<void> writeConfigurationJson(String value) async {
    this.value = value;
  }
}

class FakeDeviceGateway implements KioskDeviceGateway {
  KioskRuntimeConfiguration remote = _runtimeConfiguration(version: 2);
  Completer<KioskRuntimeConfiguration>? remoteCompleter;
  List<KioskDeviceException> configurationFailures = [];
  KioskDeviceCredentials? refreshedCredentials;
  int configurationCalls = 0;
  int refreshCalls = 0;
  final List<String> configurationAccessTokens = [];

  @override
  Future<KioskRuntimeConfiguration> configuration(String accessToken) async {
    configurationAccessTokens.add(accessToken);
    configurationCalls += 1;
    final index = configurationCalls - 1;
    if (index < configurationFailures.length) {
      throw configurationFailures[index];
    }
    final completer = remoteCompleter;
    if (completer != null) {
      return completer.future;
    }
    return remote;
  }

  @override
  Future<KioskDeviceCredentials> exchangeProvisioningGrant({
    required String pairingSessionId,
    required String provisioningSecret,
    required String provisioningGrant,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<KioskDeviceIdentity> heartbeat({
    required String accessToken,
    required String platform,
    required String appVersion,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<KioskPairingSession> createPairingSession({
    required String installationId,
    required String platform,
    required String appVersion,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<KioskPairingStatusResult> getPairingStatus({
    required String sessionId,
    required String provisioningSecret,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<KioskDeviceIdentity> me(String accessToken) {
    throw UnimplementedError();
  }

  @override
  Future<KioskDeviceCredentials> refreshSession(String refreshToken) {
    refreshCalls += 1;
    return Future.value(refreshedCredentials ?? _credentials());
  }
}

class MemoryDeviceCredentialStore implements KioskDeviceCredentialStore {
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

KioskDeviceCredentials _credentials({
  String accessToken = 'device-token',
  String refreshToken = 'next-refresh-token',
  int latestConfigurationVersion = 1,
}) {
  return KioskDeviceCredentials(
    accessToken: accessToken,
    accessTokenExpiresAt: DateTime.now().add(const Duration(minutes: 15)),
    refreshToken: refreshToken,
    refreshTokenExpiresAt: DateTime.now().add(const Duration(days: 30)),
    device: _device(latestConfigurationVersion),
  );
}

class FakeTryOnGateway implements KioskTryOnGateway {
  @override
  Future<KioskTryOnRun> createRun(KioskTryOnRequest request) {
    throw UnimplementedError();
  }

  @override
  Future<KioskTryOnRun> getRun(String runId) {
    throw UnimplementedError();
  }
}

class FakeCameraService implements CameraService {
  @override
  final ValueNotifier<CameraState> state = ValueNotifier(const CameraState());

  @override
  Stream<LiveCameraFrame> get liveFrames => const Stream.empty();

  @override
  Widget buildPreview(BuildContext context) => const SizedBox.shrink();

  @override
  Future<CameraCaptureResult> captureStill() {
    throw UnimplementedError();
  }

  @override
  Future<void> dispose() async {}

  @override
  Future<void> initialize({String? preferredCameraId}) async {}

  @override
  Future<List<CameraDevice>> rediscoverDevices() async => const [];

  @override
  Future<void> selectCamera(CameraDevice device) async {}

  @override
  Future<void> updateOrientationMode(CameraOrientationMode mode) async {}

  @override
  Future<void> startLiveFrames() async {}

  @override
  Future<void> stopLiveFrames() async {}
}

class FakeQualityAnalyzer implements KioskImageQualityAnalyzer {
  @override
  Future<ImageQualityResult> analyzeStillImage(
    String imagePath,
    ImageQualityTarget target,
  ) async {
    return const ImageQualityResult(
      status: ImageQualityStatus.pass,
      passed: true,
      score: 100,
      metrics: ImageQualityMetrics(
        width: 1000,
        height: 1400,
        sharpness: 100,
        brightness: 120,
        contrast: 40,
      ),
      issues: [],
    );
  }

  @override
  void dispose() {}
}

KioskRuntimeConfiguration _runtimeConfiguration({
  required int version,
  String ctaLabel = 'Start Try-On',
  List<KioskRuntimeAsset>? assets,
  List<KioskGarmentIntent>? intents,
}) {
  return KioskRuntimeConfiguration.fromJson(
    _configurationJson(
      version: version,
      ctaLabel: ctaLabel,
      assets: assets?.map((asset) => asset.toJson()).toList(),
      intents: intents?.map((intent) => intent.apiValue).toList(),
    ),
  );
}

Map<String, dynamic> _configurationJson({
  required int version,
  String ctaLabel = 'Start Try-On',
  List<Map<String, dynamic>>? assets,
  List<String>? intents,
}) {
  return {
    'version': version,
    'display': {
      'idleMode': 'STATIC',
      'slideDurationSeconds': 6,
      'title': 'SelfX Virtual Try-On',
      'subtitle': 'Find your perfect fit in seconds.',
      'ctaLabel': ctaLabel,
      'assets': assets ?? [_bundledAssetJson()],
    },
    'capture': {
      'countdownSeconds': 5,
      'soundEnabled': true,
      'soundProfile': 'SELFX_SIGNATURE',
      'guidanceAudioEnabled': false,
    },
    'experience': {
      'enabledGarmentIntents': intents ?? ['TOP', 'BOTTOM', 'FULL_OUTFIT'],
      'sessionIdleTimeoutSeconds': 120,
    },
    'updatedAt': '2026-08-16T00:00:00.000Z',
  };
}

Map<String, dynamic> _bundledAssetJson() {
  return {
    'id': 'asset-1',
    'type': 'BUNDLED_IMAGE',
    'label': 'Default',
    'bundledAssetKey': 'selfx-default-kiosk-video',
  };
}

KioskRuntimeAsset _remoteAsset(String id, String url) {
  return KioskRuntimeAsset(
    id: id,
    type: RuntimeKioskAssetType.remoteImage,
    label: id,
    url: url,
  );
}

KioskDeviceIdentity _device(int latestConfigurationVersion) {
  return KioskDeviceIdentity(
    id: 'device-1',
    displayName: 'SelfX Kiosk',
    status: KioskDeviceStatus.active,
    assignment: const KioskDeviceAssignment(
      scope: KioskAssignmentScope.platform,
      organizationId: null,
      organizationName: null,
      storeId: null,
      storeName: null,
    ),
    platform: 'windows',
    appVersion: '1.0.0',
    lastSeenAt: DateTime.now(),
    latestConfigurationVersion: latestConfigurationVersion,
  );
}
