import 'dart:async';
import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/camera/camera_models.dart';
import 'package:selfx_kiosk/src/live/capture_readiness_engine.dart';
import 'package:selfx_kiosk/src/live/frame_analysis_scheduler.dart';
import 'package:selfx_kiosk/src/live/live_frame.dart';
import 'package:selfx_kiosk/src/live/person_analysis.dart';
import 'package:selfx_kiosk/src/session/capture_audio_service.dart';
import 'package:selfx_kiosk/src/session/capture_scope.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/session/temporary_capture_store.dart';
import 'package:selfx_kiosk/src/settings/camera_settings_store.dart';

import 'kiosk_camera_foundation_test.dart'
    show FakeCameraService, FakeQualityAnalyzer, readyCamera;

void main() {
  group('FrameAnalysisScheduler', () {
    test('newest frame wins without unbounded queueing', () async {
      final analyzed = <int>[];
      final gate = Completer<void>();
      final scheduler = FrameAnalysisScheduler(
        config: const FrameAnalysisSchedulerConfig(initialTargetFps: 3),
        analyze: (frame) async {
          analyzed.add(frame.timestamp.millisecondsSinceEpoch);
          if (analyzed.length == 1) {
            await gate.future;
          }
        },
      );

      scheduler.submit(testFrame(1));
      scheduler.submit(testFrame(2));
      scheduler.submit(testFrame(3));
      scheduler.submit(testFrame(4));
      gate.complete();
      await scheduler.flush();

      expect(analyzed, [1, 4]);
      expect(scheduler.diagnostics.value.droppedFrameCount, 2);
      scheduler.dispose();
    });
  });

  group('CaptureReadinessEngine', () {
    test('requires stable readiness before final countdown', () {
      final engine = CaptureReadinessEngine(scope: CaptureScope.fullBody)
        ..start();

      final first = engine.update(
        analysisFor(scope: CaptureScope.fullBody, people: [fullBodyPerson()]),
      );
      final second = engine.update(
        analysisFor(scope: CaptureScope.fullBody, people: [fullBodyPerson()]),
      );
      final third = engine.update(
        analysisFor(scope: CaptureScope.fullBody, people: [fullBodyPerson()]),
      );

      expect(first.status, CaptureReadinessStatus.readyCandidate);
      expect(second.isReadyForFinalCountdown, isFalse);
      expect(third.status, CaptureReadinessStatus.ready);
      expect(third.isReadyForFinalCountdown, isTrue);
    });

    test('scope-aware body coverage semantics', () {
      expect(
        bodyCoverageForScope(CaptureScope.top, topPerson()),
        BodyCoverage.topReady,
      );
      expect(
        bodyCoverageForScope(CaptureScope.bottom, bottomPerson()),
        BodyCoverage.bottomReady,
      );
      expect(
        bodyCoverageForScope(CaptureScope.fullBody, fullBodyPerson()),
        BodyCoverage.fullBodyReady,
      );
      expect(
        bodyCoverageForScope(CaptureScope.top, bottomPerson()),
        BodyCoverage.insufficient,
      );
    });

    test('analyzer failure causes degradation instead of camera failure', () {
      final engine = CaptureReadinessEngine(scope: CaptureScope.top)..start();

      final result = engine.update(
        analysisFor(
          scope: CaptureScope.top,
          pose: PoseAnalysisResult.unavailable('POSE_DOWN'),
          quality: LiveImageQualityResult.unavailable('QUALITY_DOWN'),
        ),
      );

      expect(result.status, CaptureReadinessStatus.degraded);
      expect(result.warningCodes, contains('POSE_DOWN'));
      expect(result.warningCodes, contains('QUALITY_DOWN'));
    });

    test('readiness timeout exposes Capture Anyway', () {
      var now = DateTime(2026, 8, 13);
      final engine = CaptureReadinessEngine(
        scope: CaptureScope.fullBody,
        clock: () => now,
      )..start();
      now = now.add(const Duration(seconds: 26));

      final result = engine.update(
        analysisFor(scope: CaptureScope.fullBody, people: const []),
      );

      expect(result.status, CaptureReadinessStatus.timedOut);
      expect(result.canCaptureAnyway, isTrue);
    });
  });

  test('unsupported live streaming falls back to scripted capture', () async {
    final camera = readyCamera();
    final settings = InMemoryCameraSettingsStore()..captureCountdownSeconds = 5;
    final controller = testController(
      camera: camera,
      settings: settings,
      countdownTickDuration: const Duration(milliseconds: 1),
    );

    await controller.beginAssistedCapture();
    await Future<void>.delayed(const Duration(milliseconds: 40));

    expect(camera.liveFramesStarted, isFalse);
    expect(camera.captureCount, 1);
  });

  test(
    'live streaming support still uses scripted capture by default',
    () async {
      final camera = readyCamera(supportsLiveFrames: true);
      final settings = InMemoryCameraSettingsStore()
        ..captureCountdownSeconds = 5;
      final controller = testController(
        camera: camera,
        settings: settings,
        countdownTickDuration: const Duration(milliseconds: 1),
      );

      await controller.beginAssistedCapture();
      await Future<void>.delayed(const Duration(milliseconds: 40));

      expect(camera.liveFramesStarted, isFalse);
      expect(camera.captureCount, 1);
    },
  );

  test('Capture Anyway does not bypass technical capture failure', () async {
    final camera = readyCamera(failCapture: true);
    final controller = testController(camera: camera);
    controller.readinessResult = const CaptureReadinessResult(
      status: CaptureReadinessStatus.timedOut,
      guidanceCode: CaptureGuidanceCode.troubleFraming,
      guidanceMessage: "We're having trouble getting the perfect framing.",
      bodyCoverage: BodyCoverage.insufficient,
      subjectState: PrimarySubjectReadinessState.none,
      lightingState: SubjectLightingState.unknown,
      sharpnessState: SharpnessState.unknown,
      stableReadyFrames: 0,
      canCaptureAnyway: true,
      isReadyForFinalCountdown: false,
    );

    await expectLater(controller.captureAnyway(), throwsA(isA<Exception>()));
    expect(camera.state.value.status, CameraStatus.failed);
  });

  group('PrimarySubjectResolver', () {
    test('creates a primary subject from a valid prominent observation', () {
      final resolver = PrimarySubjectResolver();

      final subject = resolver.resolve(
        pose: PoseAnalysisResult(available: true, people: [fullBodyPerson()]),
        frameDimensions: const FrameDimensions(width: 1000, height: 1600),
        scope: CaptureScope.fullBody,
        observedAt: DateTime(2026, 8, 13),
      );

      expect(subject, isNotNull);
      expect(subject!.lockState, PrimarySubjectLockState.locked);
      expect(subject.isUsableForScope, isTrue);
      expect(subject.visualProminenceScore, greaterThan(0));
      expect(subject.analyzerCapabilities.supportsMultiplePeople, isFalse);
    });

    test('keeps normalized target region inside frame bounds', () {
      final region = TargetSubjectRegion.fromObservation(
        person: fullBodyPerson(
          bounds: const Rect.fromLTWH(-80, 20, 1200, 1700),
        ),
        frameDimensions: const FrameDimensions(width: 1000, height: 1600),
        scope: CaptureScope.fullBody,
      );

      expect(region.x, inInclusiveRange(0, 1));
      expect(region.y, inInclusiveRange(0, 1));
      expect(region.width, inInclusiveRange(0, 1));
      expect(region.height, inInclusiveRange(0, 1));
      expect(region.x + region.width, lessThanOrEqualTo(1));
      expect(region.y + region.height, lessThanOrEqualTo(1));
    });

    test('short positional movement retains the subject lock', () {
      final resolver = PrimarySubjectResolver();
      final first = resolver.resolve(
        pose: PoseAnalysisResult(available: true, people: [fullBodyPerson()]),
        frameDimensions: const FrameDimensions(width: 1000, height: 1600),
        scope: CaptureScope.fullBody,
        observedAt: DateTime(2026, 8, 13),
      );
      final moved = resolver.resolve(
        pose: PoseAnalysisResult(
          available: true,
          people: [
            fullBodyPerson(bounds: const Rect.fromLTWH(320, 195, 400, 1180)),
          ],
        ),
        frameDimensions: const FrameDimensions(width: 1000, height: 1600),
        scope: CaptureScope.fullBody,
        observedAt: DateTime(2026, 8, 13, 0, 0, 0, 300),
      );

      expect(first, isNotNull);
      expect(moved, isNotNull);
      expect(moved!.firstObservedAt, first!.firstObservedAt);
      expect(moved.observedFrameCount, 2);
      expect(moved.lockState, PrimarySubjectLockState.locked);
    });

    test('small confidence fluctuation does not release the locked target', () {
      final resolver = PrimarySubjectResolver();
      resolver.resolve(
        pose: PoseAnalysisResult(
          available: true,
          people: [fullBodyPerson(confidence: 0.86)],
        ),
        frameDimensions: const FrameDimensions(width: 1000, height: 1600),
        scope: CaptureScope.fullBody,
        observedAt: DateTime(2026, 8, 13),
      );

      final subject = resolver.resolve(
        pose: PoseAnalysisResult(
          available: true,
          people: [fullBodyPerson(confidence: 0.72)],
        ),
        frameDimensions: const FrameDimensions(width: 1000, height: 1600),
        scope: CaptureScope.fullBody,
        observedAt: DateTime(2026, 8, 13, 0, 0, 0, 350),
      );

      expect(subject, isNotNull);
      expect(subject!.lockState, PrimarySubjectLockState.locked);
      expect(subject.observedFrameCount, 2);
    });

    test('target disappearance releases lock after configured threshold', () {
      final resolver = PrimarySubjectResolver(
        config: const PrimarySubjectResolverConfig(releaseAfterAbsentFrames: 2),
      );
      resolver.resolve(
        pose: PoseAnalysisResult(available: true, people: [fullBodyPerson()]),
        frameDimensions: const FrameDimensions(width: 1000, height: 1600),
        scope: CaptureScope.fullBody,
        observedAt: DateTime(2026, 8, 13),
      );

      final firstMissing = resolver.resolve(
        pose: const PoseAnalysisResult(available: true, people: []),
        frameDimensions: const FrameDimensions(width: 1000, height: 1600),
        scope: CaptureScope.fullBody,
        observedAt: DateTime(2026, 8, 13, 0, 0, 0, 300),
      );
      final released = resolver.resolve(
        pose: const PoseAnalysisResult(available: true, people: []),
        frameDimensions: const FrameDimensions(width: 1000, height: 1600),
        scope: CaptureScope.fullBody,
        observedAt: DateTime(2026, 8, 13, 0, 0, 0, 600),
      );

      expect(firstMissing?.lockState, PrimarySubjectLockState.absent);
      expect(released, isNull);
      expect(resolver.lockedSubject, isNull);
    });

    test('session reset releases subject lock', () {
      final resolver = PrimarySubjectResolver();
      resolver.resolve(
        pose: PoseAnalysisResult(available: true, people: [fullBodyPerson()]),
        frameDimensions: const FrameDimensions(width: 1000, height: 1600),
        scope: CaptureScope.fullBody,
        observedAt: DateTime(2026, 8, 13),
      );

      resolver.reset();

      expect(resolver.lockedSubject, isNull);
    });

    test('final countdown does not silently switch target', () {
      final resolver = PrimarySubjectResolver(
        config: const PrimarySubjectResolverConfig(releaseAfterAbsentFrames: 3),
      );
      final first = resolver.resolve(
        pose: PoseAnalysisResult(
          available: true,
          people: [
            fullBodyPerson(bounds: const Rect.fromLTWH(250, 180, 360, 1180)),
          ],
        ),
        frameDimensions: const FrameDimensions(width: 1000, height: 1600),
        scope: CaptureScope.fullBody,
        observedAt: DateTime(2026, 8, 13),
      );

      final duringCountdown = resolver.resolve(
        pose: PoseAnalysisResult(
          available: true,
          people: [
            fullBodyPerson(bounds: const Rect.fromLTWH(650, 180, 300, 1180)),
          ],
        ),
        frameDimensions: const FrameDimensions(width: 1000, height: 1600),
        scope: CaptureScope.fullBody,
        observedAt: DateTime(2026, 8, 13, 0, 0, 0, 300),
        allowSubjectReselection: false,
      );

      expect(first, isNotNull);
      expect(duringCountdown, isNotNull);
      expect(duringCountdown!.lockState, PrimarySubjectLockState.absent);
      expect(duringCountdown.targetRegion.x, first!.targetRegion.x);
    });

    test('BOTTOM target region keeps upper-person context for ML Kit pose', () {
      final region = TargetSubjectRegion.fromObservation(
        person: bottomPerson(),
        frameDimensions: const FrameDimensions(width: 1000, height: 1600),
        scope: CaptureScope.bottom,
      );

      expect(region.y, lessThan(0.12));
      expect(CaptureScope.bottom.guidance, contains('face visible'));
    });
  });
}

SemanticFrameAnalysis analysisFor({
  required CaptureScope scope,
  List<PersonObservation> people = const [],
  PoseAnalysisResult? pose,
  LiveImageQualityResult quality = const LiveImageQualityResult(
    available: true,
    lightingState: SubjectLightingState.good,
    sharpnessState: SharpnessState.good,
    subjectBrightness: 120,
    backgroundBrightness: 120,
  ),
  PrimarySubject? primarySubject,
}) {
  final resolvedSubject =
      primarySubject ??
      (pose?.available == false
          ? null
          : PrimarySubjectResolver().resolve(
              pose: pose ?? PoseAnalysisResult(available: true, people: people),
              frameDimensions: const FrameDimensions(width: 1000, height: 1600),
              scope: scope,
              observedAt: DateTime(2026, 8, 13),
            ));
  return SemanticFrameAnalysis(
    scope: scope,
    frameDimensions: const FrameDimensions(width: 1000, height: 1600),
    pose: pose ?? PoseAnalysisResult(available: true, people: people),
    primarySubject: resolvedSubject,
    quality: quality,
    analyzedAt: DateTime(2026, 8, 13),
    poseLatency: const Duration(milliseconds: 12),
    qualityLatency: const Duration(milliseconds: 4),
  );
}

PersonObservation topPerson({
  Rect bounds = const Rect.fromLTWH(300, 180, 400, 560),
  double confidence = 0.86,
}) {
  return person(
    bounds: bounds,
    names: const ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'],
    confidence: confidence,
  );
}

PersonObservation bottomPerson({
  Rect bounds = const Rect.fromLTWH(300, 560, 400, 820),
  double confidence = 0.86,
}) {
  return person(
    bounds: bounds,
    names: const [
      'leftHip',
      'rightHip',
      'leftKnee',
      'rightKnee',
      'leftAnkle',
      'rightAnkle',
    ],
    confidence: confidence,
  );
}

PersonObservation fullBodyPerson({
  Rect bounds = const Rect.fromLTWH(300, 180, 400, 1180),
  double confidence = 0.86,
}) {
  return person(
    bounds: bounds,
    names: const [
      'leftShoulder',
      'rightShoulder',
      'leftHip',
      'rightHip',
      'leftKnee',
      'rightKnee',
      'leftAnkle',
      'rightAnkle',
    ],
    confidence: confidence,
  );
}

PersonObservation person({
  required Rect bounds,
  required List<String> names,
  double confidence = 0.86,
}) {
  final points = <String, LandmarkObservation>{};
  for (var i = 0; i < names.length; i++) {
    points[names[i]] = LandmarkObservation(
      name: names[i],
      position: Offset(
        bounds.left + bounds.width * (0.25 + (i % 2) * 0.5),
        bounds.top + bounds.height * ((i + 1) / (names.length + 1)),
      ),
      confidence: confidence,
    );
  }
  return PersonObservation(
    bounds: bounds,
    landmarks: points,
    averageConfidence: confidence,
  );
}

LiveCameraFrame testFrame(int stamp) {
  return LiveCameraFrame(
    dimensions: const FrameDimensions(width: 16, height: 16),
    format: FramePixelFormat.nv21,
    timestamp: DateTime.fromMillisecondsSinceEpoch(stamp),
    rotationDegrees: 0,
    planes: [LiveFramePlane(bytes: Uint8List(256), bytesPerRow: 16)],
  );
}

CaptureSessionController testController({
  FakeCameraService? camera,
  InMemoryCameraSettingsStore? settings,
  Duration? countdownTickDuration,
}) {
  return CaptureSessionController(
    cameraService: camera ?? readyCamera(),
    settingsStore: settings ?? InMemoryCameraSettingsStore(),
    analyzer: FakeQualityAnalyzer.pass(),
    captureStore: InMemoryTemporaryCaptureStore(),
    audioService: const SilentCaptureAudioService(),
    countdownTickDuration: countdownTickDuration,
  );
}
