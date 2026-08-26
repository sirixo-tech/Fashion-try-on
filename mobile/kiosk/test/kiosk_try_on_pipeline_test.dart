import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:selfx_kiosk/src/camera/camera_models.dart';
import 'package:selfx_kiosk/src/camera/camera_orientation.dart';
import 'package:selfx_kiosk/src/camera/camera_service.dart';
import 'package:selfx_kiosk/src/live/live_frame.dart';
import 'package:selfx_kiosk/src/live/person_analysis.dart';
import 'package:selfx_kiosk/src/quality/image_quality.dart';
import 'package:selfx_kiosk/src/session/capture_audio_service.dart';
import 'package:selfx_kiosk/src/session/capture_scope.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/session/temporary_capture_store.dart';
import 'package:selfx_kiosk/src/settings/camera_settings_store.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_gateway.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/tryon/model_garment_compatibility.dart';
import 'package:selfx_kiosk/src/tryon/try_on_target_preparer.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('TryOnTargetPreparer', () {
    test('maps normalized target region to a clamped full-resolution crop', () {
      final crop = calculatePreparedTargetCrop(
        imageWidth: 1000,
        imageHeight: 1600,
        scope: CaptureScope.top,
        targetRegion: const TargetSubjectRegion(
          x: 0.3,
          y: 0.12,
          width: 0.4,
          height: 0.38,
        ),
      );

      expect(crop.x, lessThan(300));
      expect(crop.y, lessThan(192));
      expect(crop.width, greaterThan(400));
      expect(crop.height, greaterThan(608));
      expect(crop.x + crop.width, lessThanOrEqualTo(1000));
      expect(crop.y + crop.height, lessThanOrEqualTo(1600));
    });

    test('bottom scope keeps upper body context instead of over-cropping', () {
      final crop = calculatePreparedTargetCrop(
        imageWidth: 900,
        imageHeight: 1400,
        scope: CaptureScope.bottom,
        targetRegion: const TargetSubjectRegion(
          x: 0.34,
          y: 0.42,
          width: 0.32,
          height: 0.44,
        ),
      );

      expect(crop.y, lessThan(0.42 * 1400));
      expect(crop.height, greaterThan(0.44 * 1400));
    });

    test('falls back to full image when no target region exists', () {
      final crop = calculatePreparedTargetCrop(
        imageWidth: 640,
        imageHeight: 960,
        scope: CaptureScope.fullBody,
      );

      expect(crop.x, 0);
      expect(crop.y, 0);
      expect(crop.width, 640);
      expect(crop.height, 960);
    });

    test('writes a prepared target image and records metadata', () async {
      final temp = await Directory.systemTemp.createTemp('selfx-kiosk-3a-');
      addTearDown(() => temp.delete(recursive: true));
      final original = await _writeImage(temp, 'person.jpg', 800, 1200);
      final store = TestTemporaryCaptureStore(temp);
      final preparer = TryOnTargetPreparer(captureStore: store);

      final prepared = await preparer.prepare(
        originalPath: original.path,
        scope: CaptureScope.fullBody,
        targetMetadata: CaptureTargetMetadata(
          scope: CaptureScope.fullBody,
          targetRegion: const TargetSubjectRegion(
            x: 0.2,
            y: 0.1,
            width: 0.6,
            height: 0.78,
          ),
          lockState: PrimarySubjectLockState.locked,
          visualProminenceScore: 0.92,
          observedFrameCount: 4,
          analyzerDisplayName: 'Test analyzer',
          supportsMultiplePeople: true,
          capturedAt: DateTime.now(),
        ),
      );

      expect(await prepared.file.exists(), isTrue);
      expect(prepared.metadata.usedTargetRegion, isTrue);
      expect(prepared.metadata.windowsFullFrameFallback, isFalse);
      expect(prepared.metadata.cropWidth, lessThanOrEqualTo(800));
      expect(prepared.metadata.cropHeight, lessThanOrEqualTo(1200));
    });
  });

  group('KioskTryOnSessionController', () {
    test('creates one canonical run and reaches polling success', () async {
      final harness = await _sessionHarness(
        statuses: [
          const KioskTryOnRun(id: 'run-1', status: KioskTryOnStatus.processing),
          const KioskTryOnRun(
            id: 'run-1',
            status: KioskTryOnStatus.succeeded,
            resultImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
          ),
        ],
      );
      addTearDown(harness.dispose);

      await harness.session.submitFromCapture(harness.capture);
      await Future<void>.delayed(const Duration(milliseconds: 30));

      expect(harness.gateway.createCount, 1);
      expect(harness.gateway.pollCount, greaterThanOrEqualTo(1));
      expect(harness.session.status, KioskTryOnStatus.succeeded);
      expect(harness.session.result?.generatedImage, contains('data:image'));
      expect(harness.gateway.lastRequest?.garmentInput.intent.apiValue, 'TOP');
      expect(
        harness.gateway.lastRequest?.modelCoverage,
        ModelCoverage.upperBody,
      );
      expect(
        harness.gateway.lastRequest?.targetMetadata.usedTargetRegion,
        isTrue,
      );
    });

    test('terminal failure shows safe customer state', () async {
      final harness = await _sessionHarness(
        createRun: const KioskTryOnRun(
          id: 'run-failed',
          status: KioskTryOnStatus.failed,
          failureCode: KioskTryOnFailureCode.generationFailed,
          failureMessage: 'Provider stack trace should not be shown',
        ),
      );
      addTearDown(harness.dispose);

      await harness.session.submitFromCapture(harness.capture);

      expect(harness.session.status, KioskTryOnStatus.failed);
      expect(harness.session.customerMessage, isNot(contains('FASHN')));
      expect(harness.gateway.createCount, 1);
    });

    test('polling timeout does not create a duplicate run', () async {
      final harness = await _sessionHarness(statuses: const []);
      addTearDown(harness.dispose);

      await harness.session.submitFromCapture(harness.capture);
      await harness.session.submitFromCapture(harness.capture);
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(harness.gateway.createCount, 1);
      expect(harness.session.status, KioskTryOnStatus.timedOut);
    });

    test(
      'finish clears ephemeral garment, run and accepted capture state',
      () async {
        final harness = await _sessionHarness(
          createRun: const KioskTryOnRun(
            id: 'run-done',
            status: KioskTryOnStatus.succeeded,
            resultImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
          ),
        );
        addTearDown(harness.dispose);

        await harness.session.submitFromCapture(harness.capture);
        await harness.session.finish(harness.capture);

        expect(harness.session.garmentInput, isNull);
        expect(harness.session.run, isNull);
        expect(harness.capture.acceptedCapture, isNull);
        expect(harness.capture.acceptedModelCoverage, isNull);
        expect(harness.capture.acceptedCaptureTargetMetadata, isNull);
      },
    );

    test(
      'retake clears stale target region but keeps selected garment',
      () async {
        final harness = await _sessionHarness();
        addTearDown(harness.dispose);

        await harness.session.retakePhoto(harness.capture);

        expect(harness.session.garmentInput, isNotNull);
        expect(harness.capture.acceptedCapture, isNull);
        expect(harness.capture.acceptedModelCoverage, isNull);
        expect(harness.capture.acceptedCaptureTargetMetadata, isNull);
      },
    );

    test(
      'blocks incompatible model coverage before provider submission',
      () async {
        final harness = await _sessionHarness(
          garmentIntent: KioskGarmentIntent.bottom,
          captureScope: CaptureScope.top,
        );
        addTearDown(harness.dispose);

        await harness.session.submitFromCapture(harness.capture);

        expect(harness.gateway.createCount, 0);
        expect(
          harness.session.failureCode,
          KioskTryOnFailureCode.modelImageIncompatibleWithGarment,
        );
        expect(
          harness.session.customerTitle,
          'Update your photo to try bottoms',
        );
        expect(
          harness.session.customerMessage,
          'We need to see more of your lower body for this item.',
        );
      },
    );

    test('allows automatic captured garment generation', () async {
      final harness = await _sessionHarness(
        garmentIntent: KioskGarmentIntent.auto,
      );
      addTearDown(harness.dispose);

      await harness.session.submitFromCapture(harness.capture);

      expect(harness.gateway.createCount, 1);
      expect(
        harness.gateway.lastRequest?.garmentInput.intent,
        KioskGarmentIntent.auto,
      );
      expect(harness.session.failureCode, isNull);
    });

    test(
      'blocks automatic captured garment when person coverage is unknown',
      () async {
        final harness = await _sessionHarness(
          garmentIntent: KioskGarmentIntent.auto,
        );
        addTearDown(harness.dispose);
        harness.capture.acceptedModelCoverage = ModelCoverage.unknown;

        await harness.session.submitFromCapture(harness.capture);

        expect(harness.gateway.createCount, 0);
        expect(
          harness.session.failureCode,
          KioskTryOnFailureCode.modelImageIncompatibleWithGarment,
        );
      },
    );

    test(
      'try another garment retains model coverage and clears run state',
      () async {
        final harness = await _sessionHarness(
          createRun: const KioskTryOnRun(
            id: 'run-done',
            status: KioskTryOnStatus.succeeded,
            resultImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
          ),
        );
        addTearDown(harness.dispose);

        await harness.session.submitFromCapture(harness.capture);
        harness.session.tryAnotherGarment();

        expect(harness.capture.acceptedCapture, isNotNull);
        expect(harness.capture.acceptedModelCoverage, ModelCoverage.upperBody);
        expect(harness.session.garmentInput, isNull);
        expect(harness.session.run, isNull);
        expect(harness.session.result, isNull);
      },
    );

    test(
      'does not leak provider-specific details into kiosk request domain',
      () async {
        final harness = await _sessionHarness();
        addTearDown(harness.dispose);

        await harness.session.submitFromCapture(harness.capture);

        final request = harness.gateway.lastRequest;
        expect(request, isNotNull);
        expect(
          request!.garmentInput.source,
          KioskGarmentInputSource.developmentLocalFile,
        );
        expect(request.clientRequestId, startsWith('kiosk-'));
        expect(request.toString(), isNot(contains('FASHN')));
      },
    );
  });
}

Future<_SessionHarness> _sessionHarness({
  KioskTryOnRun createRun = const KioskTryOnRun(
    id: 'run-1',
    status: KioskTryOnStatus.queued,
  ),
  List<KioskTryOnRun> statuses = const [],
  KioskGarmentIntent garmentIntent = KioskGarmentIntent.top,
  CaptureScope captureScope = CaptureScope.top,
}) async {
  final temp = await Directory.systemTemp.createTemp('selfx-kiosk-3a-');
  final person = await _writeImage(temp, 'person.jpg', 800, 1200);
  final garment = await _writeImage(temp, 'garment.jpg', 640, 640);
  final gateway = FakeKioskTryOnGateway(
    createRunResult: createRun,
    statuses: statuses,
  );
  final session =
      KioskTryOnSessionController(
        gateway: gateway,
        targetPreparer: TryOnTargetPreparer(
          captureStore: TestTemporaryCaptureStore(temp),
        ),
        pollInterval: const Duration(milliseconds: 5),
        pollTimeout: const Duration(milliseconds: 25),
      )..selectGarment(
        KioskGarmentInput(
          source: KioskGarmentInputSource.developmentLocalFile,
          localPath: garment.path,
          intent: garmentIntent,
        ),
      );
  final capture =
      CaptureSessionController(
          cameraService: FakeCameraService(),
          settingsStore: InMemoryCameraSettingsStore(),
          analyzer: FakeQualityAnalyzer(),
          captureStore: TestTemporaryCaptureStore(temp),
          audioService: const SilentCaptureAudioService(),
        )
        ..captureScope = captureScope
        ..acceptedModelCoverage = modelCoverageForCaptureScope(captureScope)
        ..acceptedCapture = CameraCaptureResult(
          originalPath: person.path,
          createdAt: DateTime.now(),
          deviceId: 'test-camera',
          isTemporary: true,
        )
        ..acceptedCaptureTargetMetadata = CaptureTargetMetadata(
          scope: captureScope,
          targetRegion: const TargetSubjectRegion(
            x: 0.22,
            y: 0.08,
            width: 0.56,
            height: 0.52,
          ),
          lockState: PrimarySubjectLockState.locked,
          visualProminenceScore: 0.9,
          observedFrameCount: 3,
          analyzerDisplayName: 'Test analyzer',
          supportsMultiplePeople: true,
          capturedAt: DateTime.now(),
        );

  return _SessionHarness(temp, gateway, session, capture);
}

Future<File> _writeImage(
  Directory directory,
  String name,
  int width,
  int height,
) async {
  final file = File('${directory.path}${Platform.pathSeparator}$name');
  final image = img.Image(width: width, height: height);
  img.fill(image, color: img.ColorRgb8(245, 245, 245));
  await file.writeAsBytes(img.encodeJpg(image, quality: 90));
  return file;
}

class _SessionHarness {
  const _SessionHarness(this.temp, this.gateway, this.session, this.capture);

  final Directory temp;
  final FakeKioskTryOnGateway gateway;
  final KioskTryOnSessionController session;
  final CaptureSessionController capture;

  Future<void> dispose() async {
    session.dispose();
    capture.dispose();
    if (await temp.exists()) {
      await temp.delete(recursive: true);
    }
  }
}

class FakeKioskTryOnGateway implements KioskTryOnGateway {
  FakeKioskTryOnGateway({
    required this.createRunResult,
    required this.statuses,
  });

  final KioskTryOnRun createRunResult;
  final List<KioskTryOnRun> statuses;
  int createCount = 0;
  int pollCount = 0;
  KioskTryOnRequest? lastRequest;

  @override
  Future<KioskTryOnRun> createRun(KioskTryOnRequest request) async {
    createCount += 1;
    lastRequest = request;
    return createRunResult;
  }

  @override
  Future<KioskTryOnRun> getRun(String runId) async {
    pollCount += 1;
    if (statuses.isEmpty) {
      return KioskTryOnRun(id: runId, status: KioskTryOnStatus.processing);
    }
    final index = (pollCount - 1).clamp(0, statuses.length - 1);
    return statuses[index];
  }
}

class TestTemporaryCaptureStore extends TemporaryCaptureStore {
  TestTemporaryCaptureStore(this.directory);

  final Directory directory;

  @override
  Future<String> createTempCapturePath({
    required String prefix,
    required String extension,
  }) async {
    final safeExtension = extension.startsWith('.') ? extension : '.$extension';
    return '${directory.path}${Platform.pathSeparator}$prefix-${DateTime.now().microsecondsSinceEpoch}$safeExtension';
  }

  @override
  Future<void> clearAll() async {}

  @override
  Future<void> deleteCapture(String? path) async {}
}

class FakeCameraService implements CameraService {
  final _state = ValueNotifier(const CameraState());

  @override
  ValueListenable<CameraState> get state => _state;

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
        width: 800,
        height: 1200,
        sharpness: 80,
        brightness: 120,
        contrast: 55,
      ),
      issues: [],
    );
  }

  @override
  void dispose() {}
}
