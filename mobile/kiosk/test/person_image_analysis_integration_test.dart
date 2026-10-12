import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/acquisition/photo_acquisition.dart';
import 'package:selfx_kiosk/src/inference/accepted_person_image_analysis.dart';
import 'package:selfx_kiosk/src/inference/image_inference.dart';
import 'package:selfx_kiosk/src/inference/person_image_analysis_controller.dart';
import 'package:selfx_kiosk/src/session/capture_audio_service.dart';
import 'package:selfx_kiosk/src/session/capture_flow.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/session/temporary_capture_store.dart';
import 'package:selfx_kiosk/src/settings/camera_settings_store.dart';

import 'kiosk_camera_foundation_test.dart'
    show readyCamera, FakeQualityAnalyzer, FakeModelCoverageAnalyzer;

void main() {
  test(
    'camera acceptance returns before inference and runs once per image',
    () async {
      final service = _ControlledInference();
      final capture = _capture(service);
      addTearDown(capture.dispose);
      await capture.capturePhoto();
      expect(service.paths, isEmpty);
      expect((await capture.usePhoto()).accepted, isTrue);
      expect(capture.flowState.stage, CaptureFlowStage.photoReady);
      expect(
        capture.personImageAnalysis.snapshot.status,
        PersonImageAnalysisStatus.pending,
      );
      await _flush();
      expect(service.paths, [capture.acceptedCapture!.originalPath]);
      expect(service.results.single.isCompleted, isFalse);
      await capture.usePhoto();
      await _flush();
      expect(service.paths, hasLength(1));
      service.results.single.complete(_success);
      await _flush();
      final analysis =
          capture.personImageAnalysis.snapshot.analysis
              as ObjectModelValidationAnalysis;
      expect(analysis.result, same(_success));
      expect(
        capture.personImageAnalysis.snapshot.status,
        PersonImageAnalysisStatus.available,
      );
      expect(capture.flowState.stage, CaptureFlowStage.photoReady);
    },
  );

  test(
    'mobile acceptance shares the hook; unavailable inference is advisory',
    () async {
      final service = _ControlledInference();
      final capture = _capture(service);
      addTearDown(capture.dispose);
      expect(
        (await capture.acceptMobileUpload(
          originalPath: 'phone.jpg',
          width: 800,
          height: 1200,
        )).accepted,
        isTrue,
      );
      await _flush();
      expect(service.paths, ['phone.jpg']);
      service.results.single.complete(
        const ImageInferenceResult.unavailable(
          ImageInferenceFailure.initializationFailed,
        ),
      );
      await _flush();
      expect(
        capture.personImageAnalysis.snapshot.status,
        PersonImageAnalysisStatus.unavailable,
      );
      expect(capture.activeAcceptedPersonPhoto, isNotNull);
      expect(capture.flowState.stage, CaptureFlowStage.photoReady);
    },
  );

  test(
    'rejected person photos and garment captures never trigger inference',
    () async {
      final service = _ControlledInference();
      final capture = _capture(service);
      addTearDown(capture.dispose);
      expect((await capture.usePhoto()).accepted, isFalse);
      await capture.capturePhoto();
      capture.imageUsabilityResult = const ImageUsabilityResult.unusable(
        'Test rejection',
      );
      expect((await capture.usePhoto()).accepted, isFalse);
      capture.selectCapturePurpose(PhotoAcquisitionPurpose.garment);
      await capture.capturePhoto();
      expect((await capture.usePhoto()).accepted, isFalse);
      await _flush();
      expect(service.paths, isEmpty);
    },
  );

  test(
    'replacement discards old results and serializes the newest photo',
    () async {
      final service = _ControlledInference();
      final capture = _capture(service);
      addTearDown(capture.dispose);
      await capture.acceptMobileUpload(
        originalPath: 'first.jpg',
        width: 800,
        height: 1200,
      );
      await _flush();
      await capture.acceptMobileUpload(
        originalPath: 'second.jpg',
        width: 800,
        height: 1200,
      );
      expect(capture.personImageAnalysis.snapshot.analysis, isNull);
      await _flush();
      expect(service.paths, ['first.jpg']);
      service.results[0].complete(_success);
      await _flush();
      expect(service.paths, ['first.jpg', 'second.jpg']);
      expect(capture.personImageAnalysis.snapshot.analysis, isNull);
      service.results[1].complete(_success);
      await _flush();
      expect(
        capture.personImageAnalysis.snapshot.status,
        PersonImageAnalysisStatus.available,
      );
      await capture.resetSession();
      expect(capture.personImageAnalysis.snapshot.analysis, isNull);
      expect(
        capture.personImageAnalysis.snapshot.status,
        PersonImageAnalysisStatus.idle,
      );
    },
  );

  for (final cleanup in ['retake', 'reset', 'dispose']) {
    test(
      '$cleanup clears state and suppresses late inference completion',
      () async {
        final service = _ControlledInference();
        final capture = _capture(service);
        await capture.acceptMobileUpload(
          originalPath: 'pending.jpg',
          width: 800,
          height: 1200,
        );
        await _flush();
        var notifications = 0;
        capture.personImageAnalysis.addListener(() => notifications++);
        switch (cleanup) {
          case 'retake':
            await capture.retake();
          case 'reset':
            await capture.resetSession();
          case 'dispose':
            capture.dispose();
        }
        final afterCleanup = notifications;
        expect(
          capture.personImageAnalysis.snapshot.status,
          PersonImageAnalysisStatus.idle,
        );
        service.results.single.complete(_success);
        await _flush();
        expect(capture.personImageAnalysis.snapshot.analysis, isNull);
        expect(notifications, afterCleanup);
        if (cleanup != 'dispose') capture.dispose();
        await _flush();
        expect(service.disposeCalls, 1);
      },
    );
  }

  test(
    'unexpected analyzer exceptions do not affect the accepted photo',
    () async {
      final service = _ControlledInference();
      final capture = _capture(service);
      addTearDown(capture.dispose);
      await capture.acceptMobileUpload(
        originalPath: 'phone.jpg',
        width: 800,
        height: 1200,
      );
      await _flush();
      service.results.single.completeError(StateError('Test failure'));
      await _flush();
      expect(
        capture.personImageAnalysis.snapshot.status,
        PersonImageAnalysisStatus.unavailable,
      );
      expect(capture.activeAcceptedPersonPhoto, isNotNull);
      expect(capture.flowState.stage, CaptureFlowStage.photoReady);
    },
  );

  test(
    'clearing before deferred work starts cancels the pending image',
    () async {
      final service = _ControlledInference();
      final analysis = PersonImageAnalysisController(
        ObjectModelValidationAnalyzer(service),
      );
      addTearDown(analysis.dispose);
      analysis.acceptImage('discarded.jpg', createdAt: DateTime(2026));
      analysis.clear();
      await _flush();
      expect(service.paths, isEmpty);
      analysis.acceptImage('next.jpg', createdAt: DateTime(2026, 1, 2));
      await _flush();
      expect(service.paths, ['next.jpg']);
      service.results.single.complete(_success);
      await _flush();
      expect(analysis.snapshot.status, PersonImageAnalysisStatus.available);
    },
  );
}

final _success = ImageInferenceResult.success(const [
  ImagePrediction(label: 'ordinary object', score: 0.8),
], const Duration(milliseconds: 2));

Future<void> _flush() => Future<void>.delayed(Duration.zero);

CaptureSessionController _capture(_ControlledInference service) =>
    CaptureSessionController(
      cameraService: readyCamera(),
      settingsStore: InMemoryCameraSettingsStore(),
      analyzer: FakeQualityAnalyzer.pass(),
      captureStore: InMemoryTemporaryCaptureStore(),
      audioService: const SilentCaptureAudioService(),
      modelCoverageAnalyzer: const FakeModelCoverageAnalyzer(),
      personImageAnalyzer: ObjectModelValidationAnalyzer(service),
    );

class _ControlledInference implements ImageInferenceService {
  final paths = <String>[];
  final results = <Completer<ImageInferenceResult>>[];
  int disposeCalls = 0;
  @override
  Future<ImageInferenceFailure?> initialize() =>
      throw StateError('Adapter must use service lazy initialization');
  @override
  Future<ImageInferenceResult> classifyFile(String path, {int topK = 5}) {
    paths.add(path);
    final result = Completer<ImageInferenceResult>();
    results.add(result);
    return result.future;
  }

  @override
  Future<ImageInferenceResult> classifyBytes(Uint8List bytes, {int topK = 5}) =>
      throw UnimplementedError();
  @override
  Future<void> dispose() async {
    disposeCalls++;
  }
}
