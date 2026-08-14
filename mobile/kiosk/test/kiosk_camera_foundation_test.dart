import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/camera/camera_models.dart';
import 'package:selfx_kiosk/src/camera/camera_service.dart';
import 'package:selfx_kiosk/src/idle/kiosk_idle_presentation.dart';
import 'package:selfx_kiosk/src/live/live_frame.dart';
import 'package:selfx_kiosk/src/operator/operator_access.dart';
import 'package:selfx_kiosk/src/quality/image_quality.dart';
import 'package:selfx_kiosk/src/session/capture_audio_service.dart';
import 'package:selfx_kiosk/src/session/capture_flow.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/session/temporary_capture_store.dart';
import 'package:selfx_kiosk/src/settings/camera_settings_store.dart';
import 'package:selfx_kiosk/src/ui/kiosk_home_screen.dart';

void main() {
  group('CameraService foundation behavior', () {
    test('no cameras detected', () async {
      final camera = FakeCameraService(devices: []);
      final devices = await camera.rediscoverDevices();

      expect(devices, isEmpty);
      expect(camera.state.value.status, CameraStatus.noDevices);
      expect(camera.state.value.failure?.code, CameraFailureCode.noCameras);
    });

    test('one camera detected and initialization succeeds', () async {
      final device = testCamera('camera-a');
      final camera = FakeCameraService(devices: [device]);

      await camera.initialize();

      expect(camera.state.value.devices, [device]);
      expect(camera.state.value.selectedDevice, device);
      expect(camera.state.value.status, CameraStatus.ready);
    });

    test(
      'multiple cameras detected and selected preferred camera is persisted',
      () async {
        final first = testCamera('integrated');
        final second = testCamera('usb');
        final camera = FakeCameraService(devices: [first, second]);
        final settings = InMemoryCameraSettingsStore();
        final controller = testController(camera: camera, settings: settings);

        await controller.startCamera();
        await controller.selectCamera(second);

        expect(camera.state.value.devices, [first, second]);
        expect(camera.state.value.selectedDevice, second);
        expect(await settings.readPreferredCameraId(), second.id);
      },
    );

    test('preferred camera is restored', () async {
      final preferred = testCamera('usb');
      final camera = FakeCameraService(
        devices: [testCamera('integrated'), preferred],
      );
      final settings = InMemoryCameraSettingsStore()
        ..preferredCameraId = preferred.id;
      final controller = testController(camera: camera, settings: settings);

      await controller.startCamera();

      expect(camera.state.value.selectedDevice, preferred);
    });

    test(
      'missing preferred camera falls back to first available camera',
      () async {
        final fallback = testCamera('integrated');
        final camera = FakeCameraService(devices: [fallback]);
        final settings = InMemoryCameraSettingsStore()
          ..preferredCameraId = 'missing';
        final controller = testController(camera: camera, settings: settings);

        await controller.startCamera();

        expect(camera.state.value.selectedDevice, fallback);
        expect(camera.state.value.status, CameraStatus.ready);
      },
    );

    test('initialization failure is exposed as a camera failure', () async {
      final camera = FakeCameraService(
        devices: [testCamera('camera-a')],
        failInitialize: true,
      );
      final controller = testController(camera: camera);

      await expectLater(controller.startCamera(), throwsA(isA<Exception>()));
      expect(camera.state.value.status, CameraStatus.failed);
      expect(
        camera.state.value.failure?.code,
        CameraFailureCode.initializationFailed,
      );
    });

    test('capture success records a local capture', () async {
      final camera = readyCamera();
      final controller = testController(camera: camera);

      await controller.capturePhoto();

      expect(controller.capture?.originalPath, 'capture-1.jpg');
      expect(controller.qualityResult?.status, ImageQualityStatus.pass);
      expect(controller.flowState.stage, CaptureFlowStage.review);
    });

    test('capture failure leaves recoverable camera state', () async {
      final camera = readyCamera(failCapture: true);
      final controller = testController(camera: camera);

      await expectLater(controller.capturePhoto(), throwsA(isA<Exception>()));
      expect(camera.state.value.status, CameraStatus.failed);
      expect(camera.state.value.failure?.code, CameraFailureCode.captureFailed);
    });

    test('camera disconnect is represented without crashing', () async {
      final camera = readyCamera();

      camera.disconnect();

      expect(camera.state.value.status, CameraStatus.disconnected);
      expect(camera.state.value.failure?.code, CameraFailureCode.disconnected);
    });

    test('camera rediscovery can reconnect a preferred camera', () async {
      final preferred = testCamera('usb');
      final camera = FakeCameraService(devices: [preferred]);
      final settings = InMemoryCameraSettingsStore()
        ..preferredCameraId = preferred.id;
      final controller = testController(camera: camera, settings: settings);

      camera.disconnect();
      await controller.refreshCameras();

      expect(camera.state.value.selectedDevice, preferred);
      expect(camera.state.value.status, CameraStatus.ready);
    });
  });

  group('Capture session lifecycle', () {
    test('Retake clears old capture', () async {
      final store = InMemoryTemporaryCaptureStore();
      final controller = testController(captureStore: store);
      await controller.capturePhoto();

      await controller.retake();

      expect(controller.capture, isNull);
      expect(controller.qualityResult, isNull);
      expect(store.deletedPaths, contains('capture-1.jpg'));
    });

    test('Use Photo accepts only local non-blocked capture', () async {
      final controller = testController();
      await controller.capturePhoto();

      final accepted = controller.usePhoto();

      expect(accepted, isTrue);
      expect(controller.acceptedCapture?.originalPath, 'capture-1.jpg');
      expect(controller.flowState.stage, CaptureFlowStage.photoReady);
    });

    test('Use Photo does not accept invalid blocked capture', () async {
      final controller = testController(
        analyzer: FakeQualityAnalyzer(
          result: createInvalidImageQualityResult(
            ImageQualityIssueCode.imageInvalid,
            'Invalid image.',
          ),
        ),
      );
      await controller.capturePhoto();

      final accepted = controller.usePhoto();

      expect(accepted, isFalse);
      expect(controller.acceptedCapture, isNull);
    });

    test('capture replacement cleans the old temporary capture', () async {
      final store = InMemoryTemporaryCaptureStore();
      final controller = testController(captureStore: store);

      await controller.capturePhoto();
      await controller.capturePhoto();

      expect(controller.capture?.originalPath, 'capture-2.jpg');
      expect(store.deletedPaths, contains('capture-1.jpg'));
    });
  });

  group('Assisted capture countdown', () {
    test(
      'countdown preference defaults and stays in supported range',
      () async {
        final settings = InMemoryCameraSettingsStore();

        expect(
          await settings.readCaptureCountdownSeconds(),
          defaultCaptureCountdownSeconds,
        );

        await settings.saveCaptureCountdownSeconds(15);
        expect(await settings.readCaptureCountdownSeconds(), 15);

        await settings.saveCaptureCountdownSeconds(7);
        expect(
          await settings.readCaptureCountdownSeconds(),
          defaultCaptureCountdownSeconds,
        );
        expect(await settings.readCaptureSoundsEnabled(), isTrue);
      },
    );

    test('countdown cancellation prevents delayed capture', () async {
      final camera = readyCamera();
      final settings = InMemoryCameraSettingsStore()
        ..captureCountdownSeconds = 5;
      final controller = testController(
        camera: camera,
        settings: settings,
        countdownTickDuration: const Duration(milliseconds: 3),
      );

      await controller.beginAssistedCapture();
      await controller.cancelCountdown();
      await Future<void>.delayed(const Duration(milliseconds: 30));

      expect(camera.captureCount, 0);
      expect(controller.capture, isNull);
      expect(controller.flowState.stage, CaptureFlowStage.preview);
    });

    test('countdown completion captures exactly one still image', () async {
      final camera = readyCamera();
      final settings = InMemoryCameraSettingsStore()
        ..captureCountdownSeconds = 5;
      final controller = testController(
        camera: camera,
        settings: settings,
        countdownTickDuration: const Duration(milliseconds: 1),
      );

      await controller.beginAssistedCapture();
      await Future<void>.delayed(const Duration(milliseconds: 40));

      expect(camera.captureCount, 1);
      expect(controller.capture?.originalPath, 'capture-1.jpg');
      expect(controller.flowState.stage, CaptureFlowStage.review);
    });

    test(
      'repeated Take Photo presses do not start parallel captures',
      () async {
        final camera = readyCamera();
        final settings = InMemoryCameraSettingsStore()
          ..captureCountdownSeconds = 5;
        final controller = testController(
          camera: camera,
          settings: settings,
          countdownTickDuration: const Duration(milliseconds: 1),
        );

        await controller.beginAssistedCapture();
        await controller.beginAssistedCapture();
        await Future<void>.delayed(const Duration(milliseconds: 40));

        expect(camera.captureCount, 1);
        expect(controller.flowState.stage, CaptureFlowStage.review);
      },
    );

    test('disabled capture sounds remain silent', () async {
      final camera = readyCamera();
      final settings = InMemoryCameraSettingsStore()
        ..captureCountdownSeconds = 5
        ..captureSoundsEnabled = false;
      final audioService = FakeCaptureAudioService();
      final controller = testController(
        camera: camera,
        settings: settings,
        audioService: audioService,
        countdownTickDuration: const Duration(milliseconds: 1),
      );

      await controller.beginAssistedCapture();
      await Future<void>.delayed(const Duration(milliseconds: 40));

      expect(camera.captureCount, 1);
      expect(audioService.events, isEmpty);
    });

    test(
      'capture success audio is not played when still capture fails',
      () async {
        final camera = readyCamera(failCapture: true);
        final audioService = FakeCaptureAudioService();
        final controller = testController(
          camera: camera,
          audioService: audioService,
        );

        await expectLater(controller.capturePhoto(), throwsA(isA<Exception>()));

        expect(audioService.events, isNot(contains('success')));
        expect(audioService.events, isNot(contains('shutter')));
      },
    );
  });

  group('Image quality semantics', () {
    test('image quality PASS', () {
      final result = normalizeImageQualityResult(
        const CompleteImageQualityMetrics(
          width: 1200,
          height: 1600,
          sharpness: 80,
          brightness: 120,
          contrast: 42,
        ),
        ImageQualityTarget.person,
      );

      expect(result.status, ImageQualityStatus.pass);
      expect(result.passed, isTrue);
    });

    test('quality WARNING remains usable', () {
      final result = normalizeImageQualityResult(
        const CompleteImageQualityMetrics(
          width: 1200,
          height: 1600,
          sharpness: 10,
          brightness: 120,
          contrast: 42,
        ),
        ImageQualityTarget.person,
      );

      expect(result.status, ImageQualityStatus.warning);
      expect(result.passed, isTrue);
      expect(result.issues.single.code, ImageQualityIssueCode.imageTooBlurry);
    });

    test('invalid capture is BLOCKED', () {
      final result = createInvalidImageQualityResult(
        ImageQualityIssueCode.imageDecodeFailed,
        'Could not decode.',
      );

      expect(result.status, ImageQualityStatus.blocked);
      expect(result.passed, isFalse);
    });

    test('quality analysis unavailable does not invalidate image', () {
      final result = createUnavailableImageQualityResult(
        width: 1024,
        height: 768,
      );

      expect(result.status, ImageQualityStatus.warning);
      expect(result.passed, isTrue);
      expect(
        result.issues.single.code,
        ImageQualityIssueCode.imageQualityAnalysisUnavailable,
      );
      expect(result.metrics.sharpness, isNull);
    });

    test('analyzer resources are disposed appropriately', () {
      final analyzer = FakeQualityAnalyzer.pass();

      analyzer.dispose();

      expect(analyzer.disposed, isTrue);
    });
  });

  group('KIOSK-2C customer home and operator access', () {
    testWidgets('home starts customer flow without visible settings controls', (
      tester,
    ) async {
      await tester.pumpHome(controller: testController());

      expect(find.byKey(const Key('start-try-on')), findsOneWidget);
      expect(find.text('Start Try-On'), findsOneWidget);
      expect(find.byKey(const Key('operator-menu-button')), findsNothing);
      expect(find.byKey(const Key('camera-settings')), findsNothing);

      await tester.tap(find.byKey(const Key('start-try-on')));
      await tester.pumpAndSettle();

      expect(find.text('What are you trying on?'), findsOneWidget);
    });

    testWidgets('hidden top-left double tap reveals operator access briefly', (
      tester,
    ) async {
      await tester.pumpHome(
        controller: testController(),
        operatorAccessController: testOperatorAccessController(
          config: const OperatorAccessConfig(
            revealDuration: Duration(milliseconds: 120),
          ),
        ),
      );

      await tester.revealOperatorAccess();

      expect(find.byKey(const Key('operator-menu-button')), findsOneWidget);

      await tester.pump(const Duration(milliseconds: 140));

      expect(find.byKey(const Key('operator-menu-button')), findsNothing);
    });

    testWidgets('operator PIN unlocks settings and leaving settings re-locks', (
      tester,
    ) async {
      final access = testOperatorAccessController();
      await tester.pumpHome(
        controller: testController(),
        operatorAccessController: access,
      );

      await tester.revealOperatorAccess();
      await tester.tap(find.byKey(const Key('operator-menu-button')));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('operator-pin-field')),
        '123456',
      );
      await tester.tap(find.byKey(const Key('operator-pin-submit')));
      await tester.pumpAndSettle();

      expect(find.text('Operator Settings'), findsOneWidget);
      expect(access.state.unlocked, isTrue);

      await tester.tap(find.byIcon(Icons.arrow_back));
      await tester.pumpAndSettle();

      expect(access.state.unlocked, isFalse);

      await tester.revealOperatorAccess();
      await tester.tap(find.byKey(const Key('operator-menu-button')));
      await tester.pumpAndSettle();

      expect(find.text('Enter operator PIN'), findsOneWidget);
    });

    testWidgets('operator lockout does not block customer Try-On', (
      tester,
    ) async {
      await tester.pumpHome(
        controller: testController(),
        operatorAccessController: testOperatorAccessController(
          config: const OperatorAccessConfig(
            maxFailedAttempts: 2,
            lockoutDuration: Duration(seconds: 60),
          ),
        ),
      );

      await tester.revealOperatorAccess();
      await tester.tap(find.byKey(const Key('operator-menu-button')));
      await tester.pumpAndSettle();

      for (var attempt = 0; attempt < 2; attempt++) {
        await tester.enterText(
          find.byKey(const Key('operator-pin-field')),
          '000000',
        );
        await tester.tap(find.byKey(const Key('operator-pin-submit')));
        await tester.pumpAndSettle();
      }

      expect(
        find.textContaining('Operator access is temporarily locked'),
        findsOneWidget,
      );

      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('start-try-on')));
      await tester.pumpAndSettle();

      expect(find.text('What are you trying on?'), findsOneWidget);
    });
  });
}

const testIdlePresentation = KioskIdlePresentation(
  mode: KioskIdlePresentationMode.static,
  slideDuration: Duration(seconds: 30),
  assets: [fallbackIdleAsset],
);

OperatorAccessController testOperatorAccessController({
  OperatorAccessConfig config = const OperatorAccessConfig(),
}) {
  return OperatorAccessController(
    verifier: const Sha256OperatorAccessVerifier(
      expectedDigest: demoOperatorPinSha256Digest,
    ),
    config: config,
  );
}

extension _KioskHomeTester on WidgetTester {
  Future<void> pumpHome({
    required CaptureSessionController controller,
    OperatorAccessController? operatorAccessController,
  }) async {
    await pumpWidget(
      MaterialApp(
        home: KioskHomeScreen(
          controller: controller,
          operatorAccessController:
              operatorAccessController ?? testOperatorAccessController(),
          presentation: testIdlePresentation,
        ),
      ),
    );
  }

  Future<void> revealOperatorAccess() async {
    final hotspot = find.byKey(const Key('operator-hotspot'));
    await tap(hotspot);
    await pump(const Duration(milliseconds: 50));
    await tap(hotspot);
    await pump();
  }
}

CameraDevice testCamera(String id) => CameraDevice(id: id, label: 'Camera $id');

FakeCameraService readyCamera({
  bool failCapture = false,
  bool supportsLiveFrames = false,
}) {
  final camera = FakeCameraService(
    devices: [testCamera('camera-a')],
    failCapture: failCapture,
  );
  camera.setReady(supportsLiveFrames: supportsLiveFrames);
  return camera;
}

CaptureSessionController testController({
  FakeCameraService? camera,
  InMemoryCameraSettingsStore? settings,
  FakeQualityAnalyzer? analyzer,
  InMemoryTemporaryCaptureStore? captureStore,
  CaptureAudioService? audioService,
  Duration? countdownTickDuration,
}) {
  return CaptureSessionController(
    cameraService: camera ?? readyCamera(),
    settingsStore: settings ?? InMemoryCameraSettingsStore(),
    analyzer: analyzer ?? FakeQualityAnalyzer.pass(),
    captureStore: captureStore ?? InMemoryTemporaryCaptureStore(),
    audioService: audioService ?? const SilentCaptureAudioService(),
    countdownTickDuration: countdownTickDuration,
  );
}

class FakeCameraService implements CameraService {
  FakeCameraService({
    required this.devices,
    this.failInitialize = false,
    this.failCapture = false,
  }) : _state = ValueNotifier(const CameraState());

  final List<CameraDevice> devices;
  final bool failInitialize;
  final bool failCapture;
  final ValueNotifier<CameraState> _state;
  int captureCount = 0;
  final StreamController<LiveCameraFrame> _liveFrames =
      StreamController<LiveCameraFrame>.broadcast();
  bool liveFramesStarted = false;

  @override
  ValueListenable<CameraState> get state => _state;

  @override
  Stream<LiveCameraFrame> get liveFrames => _liveFrames.stream;

  @override
  Future<CameraCaptureResult> captureStill() async {
    if (failCapture) {
      _state.value = _state.value.copyWith(
        status: CameraStatus.failed,
        failure: const CameraFailure(
          code: CameraFailureCode.captureFailed,
          message: 'Capture failed.',
        ),
      );
      throw Exception('capture failed');
    }
    captureCount += 1;
    return CameraCaptureResult(
      originalPath: 'capture-$captureCount.jpg',
      createdAt: DateTime(2026, 8, 13),
      deviceId: _state.value.selectedDevice?.id ?? devices.first.id,
      isTemporary: true,
    );
  }

  @override
  Widget buildPreview(BuildContext context) {
    return const ColoredBox(color: Colors.black);
  }

  @override
  Future<void> dispose() async {
    await _liveFrames.close();
    _state.dispose();
  }

  @override
  Future<void> initialize({String? preferredCameraId}) async {
    await rediscoverDevices();
    if (devices.isEmpty) {
      return;
    }
    if (failInitialize) {
      _state.value = _state.value.copyWith(
        status: CameraStatus.failed,
        failure: const CameraFailure(
          code: CameraFailureCode.initializationFailed,
          message: 'Initialization failed.',
        ),
      );
      throw Exception('initialization failed');
    }
    final preferred = devices
        .where((device) => device.id == preferredCameraId)
        .firstOrNull;
    _state.value = _state.value.copyWith(
      status: CameraStatus.ready,
      selectedDevice: preferred ?? devices.first,
      capabilities: const CameraCapabilities(
        previewWidth: 1920,
        previewHeight: 1080,
        supportsLiveFrames: false,
      ),
      clearFailure: true,
    );
  }

  @override
  Future<List<CameraDevice>> rediscoverDevices() async {
    _state.value = _state.value.copyWith(
      status: devices.isEmpty ? CameraStatus.noDevices : CameraStatus.idle,
      devices: devices,
      failure: devices.isEmpty
          ? const CameraFailure(
              code: CameraFailureCode.noCameras,
              message: 'No cameras.',
            )
          : null,
      clearFailure: devices.isNotEmpty,
    );
    return devices;
  }

  @override
  Future<void> selectCamera(CameraDevice device) async {
    _state.value = _state.value.copyWith(
      status: CameraStatus.ready,
      selectedDevice: device,
      clearFailure: true,
    );
  }

  @override
  Future<void> startLiveFrames() async {
    if (!_state.value.capabilities.supportsLiveFrames) {
      throw Exception('live frames unsupported');
    }
    liveFramesStarted = true;
  }

  @override
  Future<void> stopLiveFrames() async {
    liveFramesStarted = false;
  }

  void disconnect() {
    _state.value = _state.value.copyWith(
      status: CameraStatus.disconnected,
      failure: const CameraFailure(
        code: CameraFailureCode.disconnected,
        message: 'Disconnected.',
      ),
    );
  }

  void setReady({bool supportsLiveFrames = false}) {
    _state.value = CameraState(
      status: CameraStatus.ready,
      devices: devices,
      selectedDevice: devices.first,
      capabilities: const CameraCapabilities(
        previewWidth: 1920,
        previewHeight: 1080,
        supportsLiveFrames: false,
      ),
    );
    if (supportsLiveFrames) {
      _state.value = _state.value.copyWith(
        capabilities: const CameraCapabilities(
          previewWidth: 1920,
          previewHeight: 1080,
          supportsLiveFrames: true,
        ),
      );
    }
  }
}

class FakeQualityAnalyzer implements KioskImageQualityAnalyzer {
  FakeQualityAnalyzer({required this.result});

  factory FakeQualityAnalyzer.pass() {
    return FakeQualityAnalyzer(
      result: normalizeImageQualityResult(
        const CompleteImageQualityMetrics(
          width: 1024,
          height: 1536,
          sharpness: 80,
          brightness: 120,
          contrast: 45,
        ),
        ImageQualityTarget.person,
      ),
    );
  }

  final ImageQualityResult result;
  bool disposed = false;

  @override
  Future<ImageQualityResult> analyzeStillImage(
    String imagePath,
    ImageQualityTarget target,
  ) async {
    return result;
  }

  @override
  void dispose() {
    disposed = true;
  }
}

class FakeCaptureAudioService implements CaptureAudioService {
  final List<String> events = [];

  @override
  Future<void> playCountdownStart(CaptureAudioProfile profile) async {
    events.add('start:${profile.name}');
  }

  @override
  Future<void> playFinalCountdownTick(
    CaptureAudioProfile profile,
    int secondsRemaining,
  ) async {
    events.add('tick:$secondsRemaining');
  }

  @override
  Future<void> playShutter(CaptureAudioProfile profile) async {
    events.add('shutter');
  }

  @override
  Future<void> playCaptureSuccess(CaptureAudioProfile profile) async {
    events.add('success');
  }

  @override
  Future<void> previewProfile(CaptureAudioProfile profile) async {
    events.add('preview:${profile.name}');
  }

  @override
  Future<void> stop() async {
    events.add('stop');
  }

  @override
  Future<void> dispose() async {}
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => this.isEmpty ? null : first;
}
