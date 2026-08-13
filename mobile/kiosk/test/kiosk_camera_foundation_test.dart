import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/camera/camera_models.dart';
import 'package:selfx_kiosk/src/camera/camera_service.dart';
import 'package:selfx_kiosk/src/quality/image_quality.dart';
import 'package:selfx_kiosk/src/session/capture_audio_service.dart';
import 'package:selfx_kiosk/src/session/capture_flow.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/session/temporary_capture_store.dart';
import 'package:selfx_kiosk/src/settings/camera_settings_store.dart';

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

  testWidgets('home exposes KIOSK-1 foundation actions', (tester) async {
    final controller = testController();

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) {
              return Column(
                children: [
                  ElevatedButton(
                    key: const Key('start-camera-test'),
                    onPressed: () {},
                    child: const Text('Start Camera Test'),
                  ),
                  OutlinedButton(
                    key: const Key('camera-settings'),
                    onPressed: () {},
                    child: const Text('Camera Settings'),
                  ),
                  Text(
                    controller.acceptedCapture?.originalPath ?? 'local only',
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );

    expect(find.byKey(const Key('start-camera-test')), findsOneWidget);
    expect(find.byKey(const Key('camera-settings')), findsOneWidget);
    expect(find.text('local only'), findsOneWidget);
  });
}

CameraDevice testCamera(String id) => CameraDevice(id: id, label: 'Camera $id');

FakeCameraService readyCamera({bool failCapture = false}) {
  final camera = FakeCameraService(
    devices: [testCamera('camera-a')],
    failCapture: failCapture,
  );
  camera.setReady();
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

  @override
  ValueListenable<CameraState> get state => _state;

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

  void disconnect() {
    _state.value = _state.value.copyWith(
      status: CameraStatus.disconnected,
      failure: const CameraFailure(
        code: CameraFailureCode.disconnected,
        message: 'Disconnected.',
      ),
    );
  }

  void setReady() {
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
