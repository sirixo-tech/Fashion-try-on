import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/acquisition/photo_acquisition.dart';
import 'package:selfx_kiosk/src/camera/camera_models.dart';
import 'package:selfx_kiosk/src/camera/camera_orientation.dart';
import 'package:selfx_kiosk/src/camera/camera_preview_viewport.dart';
import 'package:selfx_kiosk/src/camera/camera_service.dart';
import 'package:selfx_kiosk/src/catalog/kiosk_catalog_gateway.dart';
import 'package:selfx_kiosk/src/catalog/kiosk_catalog_models.dart';
import 'package:selfx_kiosk/src/config/kiosk_runtime_configuration.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_gateway.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_models.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_session_controller.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_storage.dart';
import 'package:selfx_kiosk/src/idle/kiosk_idle_presentation.dart';
import 'package:selfx_kiosk/src/live/live_frame.dart';
import 'package:selfx_kiosk/src/live/person_analysis.dart';
import 'package:selfx_kiosk/src/operator/operator_access.dart';
import 'package:selfx_kiosk/src/quality/image_quality.dart';
import 'package:selfx_kiosk/src/session/capture_audio_service.dart';
import 'package:selfx_kiosk/src/session/capture_flow.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/session/temporary_capture_store.dart';
import 'package:selfx_kiosk/src/settings/camera_settings_store.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_gateway.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/tryon/model_coverage_analyzer.dart';
import 'package:selfx_kiosk/src/tryon/model_garment_compatibility.dart';
import 'package:selfx_kiosk/src/ui/browse_products_screen.dart';
import 'package:selfx_kiosk/src/ui/camera_capture_screen.dart';
import 'package:selfx_kiosk/src/ui/camera_settings_screen.dart';
import 'package:selfx_kiosk/src/ui/capture_review_screen.dart';
import 'package:selfx_kiosk/src/ui/garment_selection_screen.dart';
import 'package:selfx_kiosk/src/ui/kiosk_home_screen.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_controller.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_gateway.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_models.dart';

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

      final accepted = await controller.usePhoto();

      expect(accepted.accepted, isTrue);
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

      final accepted = await controller.usePhoto();

      expect(accepted.accepted, isFalse);
      expect(controller.acceptedCapture, isNull);
      expect(controller.imageUsabilityResult?.isUsable, isFalse);
    });

    test('Use Photo rejects capture when no model is detected', () async {
      final controller = testController(
        modelCoverageAnalyzer: const FakeModelCoverageAnalyzer(
          ModelCoverageAnalysis.unknown(
            reasonCode: 'MODEL_PERSON_NOT_DETECTED',
          ),
        ),
      );
      await controller.capturePhoto();

      expect(controller.imageUsabilityResult?.isUsable, isFalse);
      expect(
        controller.imageUsabilityResult?.message,
        "Failed to detect a person. Please retake your photo.",
      );

      final accepted = await controller.usePhoto();

      expect(accepted.accepted, isFalse);
      expect(
        accepted.message,
        "Failed to detect a person. Please retake your photo.",
      );
      expect(controller.acceptedCapture, isNull);
      expect(
        controller.pendingModelCoverageAnalysis?.reasonCode,
        'MODEL_PERSON_NOT_DETECTED',
      );
    });

    test(
      'selecting garment capture after accepted model photo starts from preview',
      () async {
        final camera = readyCamera();
        final settings = InMemoryCameraSettingsStore()
          ..captureCountdownSeconds = 5;
        final controller = testController(
          camera: camera,
          settings: settings,
          countdownTickDuration: const Duration(milliseconds: 1),
        );
        await controller.capturePhoto();
        final accepted = await controller.usePhoto();

        controller.selectCapturePurpose(PhotoAcquisitionPurpose.garment);
        await controller.beginAssistedCapture();
        await Future<void>.delayed(const Duration(milliseconds: 40));

        expect(accepted.accepted, isTrue);
        expect(controller.acceptedCapture?.originalPath, 'capture-1.jpg');
        expect(camera.captureCount, 2);
        expect(controller.capture?.originalPath, 'capture-2.jpg');
        expect(controller.flowState.stage, CaptureFlowStage.review);
      },
    );

    test(
      'preserving captured garment input keeps the accepted person photo',
      () async {
        final camera = readyCamera();
        final controller = testController(camera: camera);

        await controller.capturePhoto();
        final accepted = await controller.usePhoto();

        expect(accepted.accepted, isTrue);
        expect(
          controller.activeAcceptedPersonPhoto?.capture.originalPath,
          'capture-1.jpg',
        );

        controller.selectCapturePurpose(PhotoAcquisitionPurpose.garment);
        await controller.capturePhoto();
        expect(controller.capture?.originalPath, 'capture-2.jpg');

        controller.preservePendingCaptureAsExternalInput();

        expect(controller.capture, isNull);
        expect(
          controller.activeAcceptedPersonPhoto?.capture.originalPath,
          'capture-1.jpg',
        );
        expect(controller.activeAcceptedPersonPhoto?.coverage, isNotNull);
      },
    );

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
      'countdown preference defaults and clamps to the manual range',
      () async {
        final settings = InMemoryCameraSettingsStore();

        expect(
          await settings.readCaptureCountdownSeconds(),
          defaultCaptureCountdownSeconds,
        );

        await settings.saveCaptureCountdownSeconds(15);
        expect(await settings.readCaptureCountdownSeconds(), 15);

        await settings.saveCaptureCountdownSeconds(7);
        expect(await settings.readCaptureCountdownSeconds(), 7);

        await settings.saveCaptureCountdownSeconds(0);
        expect(
          await settings.readCaptureCountdownSeconds(),
          minCaptureCountdownSeconds,
        );

        await settings.saveCaptureCountdownSeconds(99);
        expect(
          await settings.readCaptureCountdownSeconds(),
          maxCaptureCountdownSeconds,
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

    testWidgets('countdown control shows the remaining number', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CaptureGuidancePanel(
              state: const CameraState(status: CameraStatus.ready),
              flowState: const CaptureFlowState(
                stage: CaptureFlowStage.countdown,
                countdownSeconds: 7,
                secondsRemaining: 4,
              ),
              readinessResult: null,
              onBack: () {},
              onCapture: () {},
              onCancelCountdown: () {},
              onCaptureAnyway: () {},
              canFlipCamera: false,
              onFlipCamera: null,
            ),
          ),
        ),
      );

      expect(find.text('4'), findsOneWidget);
      expect(find.byIcon(Icons.timer_outlined), findsNothing);
    });

    test('shutter audio is not played when still capture fails', () async {
      final camera = readyCamera(failCapture: true);
      final audioService = FakeCaptureAudioService();
      final controller = testController(
        camera: camera,
        audioService: audioService,
      );

      await expectLater(controller.capturePhoto(), throwsA(isA<Exception>()));

      expect(audioService.events, isNot(contains('shutter')));
    });
  });

  group('Camera orientation calibration', () {
    test('AUTO is the default local camera orientation mode', () async {
      final settings = InMemoryCameraSettingsStore();

      expect(
        await settings.readCameraOrientationMode(),
        CameraOrientationMode.auto,
      );
    });

    testWidgets('orientation selector is available for normal camera', (
      tester,
    ) async {
      final controller = testController(
        camera: FakeCameraService(
          devices: [
            testCamera(
              'android-integrated',
              facing: CameraFacing.back,
              sensorOrientation: 90,
            ),
          ],
        ),
      );

      await tester.pumpCameraSettings(controller);

      expect(find.byKey(const Key('camera-orientation-mode')), findsOneWidget);
      expect(find.text('Camera Orientation'), findsOneWidget);

      controller.dispose();
    });

    testWidgets('orientation selector is available for external camera', (
      tester,
    ) async {
      final controller = testController(
        camera: FakeCameraService(
          devices: [
            testCamera(
              'android-usb',
              facing: CameraFacing.external,
              sensorOrientation: 270,
            ),
          ],
        ),
      );

      await tester.pumpCameraSettings(controller);

      expect(find.byKey(const Key('camera-orientation-mode')), findsOneWidget);
      expect(find.text('Camera Orientation'), findsOneWidget);

      controller.dispose();
    });

    testWidgets('missing sensor orientation does not hide calibration', (
      tester,
    ) async {
      final controller = testController(
        camera: FakeCameraService(
          devices: [
            testCamera(
              'android-usb',
              facing: CameraFacing.external,
              sensorOrientation: null,
            ),
          ],
        ),
      );

      await tester.pumpCameraSettings(controller);

      expect(find.byKey(const Key('camera-orientation-mode')), findsOneWidget);
      expect(find.text('Sensor orientation'), findsWidgets);
      expect(find.text('Unknown'), findsWidgets);

      controller.dispose();
    });

    test('manual orientation modes resolve to expected rotations', () {
      const resolver = CameraOrientationResolver();

      expect(
        resolver
            .resolve(
              mode: CameraOrientationMode.deg0,
              displayOrientation: DeviceOrientation.portraitUp,
              lensFacingLabel: 'external',
              sensorOrientationDegrees: 90,
            )
            .effectiveRotationDegrees,
        0,
      );
      expect(
        resolver
            .resolve(
              mode: CameraOrientationMode.deg90,
              displayOrientation: DeviceOrientation.portraitUp,
              lensFacingLabel: 'external',
              sensorOrientationDegrees: 90,
            )
            .effectiveRotationDegrees,
        90,
      );
      expect(
        resolver
            .resolve(
              mode: CameraOrientationMode.deg180,
              displayOrientation: DeviceOrientation.portraitUp,
              lensFacingLabel: 'external',
              sensorOrientationDegrees: 90,
            )
            .effectiveRotationDegrees,
        180,
      );
      expect(
        resolver
            .resolve(
              mode: CameraOrientationMode.deg270,
              displayOrientation: DeviceOrientation.portraitUp,
              lensFacingLabel: 'external',
              sensorOrientationDegrees: 90,
            )
            .effectiveRotationDegrees,
        270,
      );
    });

    test(
      'external camera manual 90 resolves without sensor orientation metadata',
      () {
        const resolver = CameraOrientationResolver();

        final resolution = resolver.resolve(
          mode: CameraOrientationMode.deg90,
          displayOrientation: DeviceOrientation.portraitUp,
          lensFacingLabel: CameraFacing.external.name,
          sensorOrientationDegrees: null,
        );

        expect(resolution.sensorOrientationDegrees, isNull);
        expect(resolution.effectiveRotationDegrees, 90);
        expect(
          resolver.resolveLiveFrameRotationDegrees(
            mode: CameraOrientationMode.deg90,
            sensorOrientationDegrees: null,
          ),
          90,
        );
      },
    );

    test(
      'external camera manual 270 resolves without sensor orientation metadata',
      () {
        const resolver = CameraOrientationResolver();

        final resolution = resolver.resolve(
          mode: CameraOrientationMode.deg270,
          displayOrientation: DeviceOrientation.portraitUp,
          lensFacingLabel: CameraFacing.external.name,
          sensorOrientationDegrees: null,
        );

        expect(resolution.sensorOrientationDegrees, isNull);
        expect(resolution.effectiveRotationDegrees, 270);
        expect(
          resolver.resolveLiveFrameRotationDegrees(
            mode: CameraOrientationMode.deg270,
            sensorOrientationDegrees: null,
          ),
          270,
        );
      },
    );

    test('manual calibration does not depend on AUTO metadata', () {
      const resolver = CameraOrientationResolver();

      expect(
        resolver
            .resolve(
              mode: CameraOrientationMode.auto,
              displayOrientation: DeviceOrientation.portraitUp,
              lensFacingLabel: CameraFacing.external.name,
              sensorOrientationDegrees: null,
            )
            .effectiveRotationDegrees,
        0,
      );
      expect(
        resolver
            .resolve(
              mode: CameraOrientationMode.deg90,
              displayOrientation: DeviceOrientation.portraitUp,
              lensFacingLabel: CameraFacing.external.name,
              sensorOrientationDegrees: null,
            )
            .effectiveRotationDegrees,
        90,
      );
    });

    test('90 and 270 degree rotation swap preview dimensions', () {
      const source = FrameDimensions(width: 1920, height: 1080);

      expect(rotatedFrameDimensions(source, 90).width, 1080);
      expect(rotatedFrameDimensions(source, 90).height, 1920);
      expect(rotatedFrameDimensions(source, 270).width, 1080);
      expect(rotatedFrameDimensions(source, 270).height, 1920);
      expect(rotatedFrameDimensions(source, 180).width, 1920);
      expect(rotatedFrameDimensions(source, 180).height, 1080);
    });

    test('normalized target subject regions rotate consistently', () {
      const region = TargetSubjectRegion(
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.4,
      );

      final clockwise = region.rotated(90);
      expect(clockwise.x, closeTo(0.4, 0.0001));
      expect(clockwise.y, closeTo(0.1, 0.0001));
      expect(clockwise.width, closeTo(0.4, 0.0001));
      expect(clockwise.height, closeTo(0.3, 0.0001));

      final halfTurn = region.rotated(180);
      expect(halfTurn.x, closeTo(0.6, 0.0001));
      expect(halfTurn.y, closeTo(0.4, 0.0001));
      expect(halfTurn.width, closeTo(0.3, 0.0001));
      expect(halfTurn.height, closeTo(0.4, 0.0001));

      final counterClockwise = region.rotated(270);
      expect(counterClockwise.x, closeTo(0.2, 0.0001));
      expect(counterClockwise.y, closeTo(0.6, 0.0001));
      expect(counterClockwise.width, closeTo(0.4, 0.0001));
      expect(counterClockwise.height, closeTo(0.3, 0.0001));
    });

    test(
      'manual setting persists, restores, and updates camera service',
      () async {
        final camera = readyCamera();
        final settings = InMemoryCameraSettingsStore();
        final controller = testController(camera: camera, settings: settings);

        await controller.updateCameraOrientationMode(
          CameraOrientationMode.deg90,
        );

        expect(
          await settings.readCameraOrientationMode(),
          CameraOrientationMode.deg90,
        );
        expect(camera.orientationMode, CameraOrientationMode.deg90);
        expect(camera.state.value.capabilities.effectivePreviewWidth, 1080);
        expect(camera.state.value.capabilities.effectivePreviewHeight, 1920);

        final restored = testController(camera: camera, settings: settings);
        await restored.loadOperatorSettings();

        expect(restored.cameraOrientationMode, CameraOrientationMode.deg90);
        expect(camera.orientationMode, CameraOrientationMode.deg90);
      },
    );

    testWidgets('orientation selector remains available after restore', (
      tester,
    ) async {
      final settings = InMemoryCameraSettingsStore()
        ..cameraOrientationMode = CameraOrientationMode.deg270;
      final controller = testController(
        settings: settings,
        camera: FakeCameraService(
          devices: [
            testCamera(
              'windows-usb',
              facing: CameraFacing.external,
              sensorOrientation: null,
            ),
          ],
        ),
      );

      await tester.pumpCameraSettings(controller);

      expect(find.byKey(const Key('camera-orientation-mode')), findsOneWidget);
      expect(controller.cameraOrientationMode, CameraOrientationMode.deg270);
      expect(
        await settings.readCameraOrientationMode(),
        CameraOrientationMode.deg270,
      );

      controller.dispose();
    });

    test(
      'garment and model capture use the same orientation resolver',
      () async {
        final camera = readyCamera();
        final settings = InMemoryCameraSettingsStore()
          ..cameraOrientationMode = CameraOrientationMode.deg270;
        final controller = testController(camera: camera, settings: settings);

        await controller.loadOperatorSettings();
        controller.selectCapturePurpose(PhotoAcquisitionPurpose.model);
        await controller.capturePhoto();
        final modelCapture = controller.capture;

        await controller.discardPendingCapture();
        controller.selectCapturePurpose(PhotoAcquisitionPurpose.garment);
        await controller.capturePhoto();
        final garmentCapture = controller.capture;

        expect(modelCapture?.orientationMode, CameraOrientationMode.deg270);
        expect(garmentCapture?.orientationMode, CameraOrientationMode.deg270);
        expect(camera.orientationMode, CameraOrientationMode.deg270);
      },
    );

    test('manual capture normalization is reported once', () async {
      final result = CameraCaptureResult(
        originalPath: 'capture-normalized.jpg',
        createdAt: DateTime(2026, 8, 17),
        deviceId: 'usb',
        isTemporary: true,
        orientationMode: CameraOrientationMode.deg90,
        normalizationDegrees: 90,
        orientationNormalized: true,
      );

      expect(result.orientationNormalized, isTrue);
      expect(result.normalizationDegrees, 90);
    });

    testWidgets('camera preview viewport contains effective aspect ratio', (
      tester,
    ) async {
      final state = const CameraState(
        status: CameraStatus.ready,
        capabilities: CameraCapabilities(
          previewWidth: 1920,
          previewHeight: 1080,
          effectivePreviewWidth: 1080,
          effectivePreviewHeight: 1920,
          orientationMode: CameraOrientationMode.deg90,
          effectiveRotationDegrees: 90,
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Center(
            child: SizedBox(
              width: 400,
              height: 600,
              child: CameraPreviewViewport(
                state: state,
                preview: const ColoredBox(
                  key: Key('camera-preview-content'),
                  color: Colors.black,
                ),
              ),
            ),
          ),
        ),
      );

      final previewSize = tester.getSize(
        find.byKey(const Key('camera-preview-content')),
      );

      expect(previewSize.width, moreOrLessEquals(337.5));
      expect(previewSize.height, 600);
    });

    testWidgets(
      'camera preview viewport cover crops rotated preview without stretching',
      (tester) async {
        final state = const CameraState(
          status: CameraStatus.ready,
          capabilities: CameraCapabilities(
            previewWidth: 1920,
            previewHeight: 1080,
            effectivePreviewWidth: 1080,
            effectivePreviewHeight: 1920,
            orientationMode: CameraOrientationMode.deg90,
            effectiveRotationDegrees: 90,
          ),
        );

        await tester.pumpWidget(
          MaterialApp(
            home: Center(
              child: SizedBox(
                width: 400,
                height: 600,
                child: CameraPreviewViewport(
                  state: state,
                  fit: BoxFit.cover,
                  preview: const ColoredBox(
                    key: Key('camera-preview-content'),
                    color: Colors.black,
                  ),
                ),
              ),
            ),
          ),
        );

        final previewSize = tester.getSize(
          find.byKey(const Key('camera-preview-content')),
        );

        expect(previewSize.width, 400);
        expect(previewSize.height, moreOrLessEquals(711.11, epsilon: 0.01));
        expect(
          previewSize.width / previewSize.height,
          moreOrLessEquals(1080 / 1920, epsilon: 0.001),
        );
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

      expect(find.byKey(const Key('capture-photo')), findsOneWidget);
      expect(find.byKey(const Key('upload-person-photo')), findsOneWidget);
      expect(find.byKey(const Key('flip-person-camera')), findsOneWidget);
      expect(find.text('How would you like to add your photo?'), findsNothing);
      expect(find.text('What are you trying on?'), findsNothing);
      expect(find.byKey(const Key('garment-image-path')), findsNothing);
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

      expect(find.byKey(const Key('capture-photo')), findsOneWidget);
      expect(find.byKey(const Key('upload-person-photo')), findsOneWidget);
    });
  });

  group('Model capture review actions', () {
    testWidgets('usable model photo offers garment capture and catalog', (
      tester,
    ) async {
      final captureController = testController();
      final tryOnController = KioskTryOnSessionController(
        gateway: FakeKioskTryOnGateway(),
      );
      await captureController.capturePhoto();

      await tester.pumpWidget(
        MaterialApp(
          home: CaptureReviewScreen(
            controller: captureController,
            tryOnController: tryOnController,
            uploadController: testUploadController(
              captureController.captureStore,
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('take-garment-photo')), findsOneWidget);
      expect(find.byKey(const Key('browse-catalog')), findsOneWidget);
      expect(find.byKey(const Key('upload-model-photo')), findsNothing);
      expect(find.byKey(const Key('use-photo')), findsNothing);

      captureController.dispose();
      tryOnController.dispose();
    });

    testWidgets('failed model detection offers retake and upload replacement', (
      tester,
    ) async {
      final captureController = testController(
        modelCoverageAnalyzer: const FakeModelCoverageAnalyzer(
          ModelCoverageAnalysis.unknown(
            reasonCode: 'MODEL_PERSON_NOT_DETECTED',
          ),
        ),
      );
      final tryOnController = KioskTryOnSessionController(
        gateway: FakeKioskTryOnGateway(),
      );
      await captureController.capturePhoto();

      await tester.pumpWidget(
        MaterialApp(
          home: CaptureReviewScreen(
            controller: captureController,
            tryOnController: tryOnController,
            uploadController: testUploadController(
              captureController.captureStore,
            ),
          ),
        ),
      );

      expect(find.byKey(const Key('retake-photo')), findsOneWidget);
      expect(find.byKey(const Key('upload-model-photo')), findsOneWidget);
      expect(find.byKey(const Key('take-garment-photo')), findsNothing);
      expect(find.byKey(const Key('browse-catalog')), findsNothing);

      captureController.dispose();
      tryOnController.dispose();
    });
  });

  group('KIOSK-4C.1 garment selection', () {
    testWidgets(
      'customer garment screen uses picker preview and camera capture only',
      (tester) async {
        final captureController = testController();
        final tryOnController = KioskTryOnSessionController(
          gateway: FakeKioskTryOnGateway(),
        );

        await tester.pumpWidget(
          MaterialApp(
            home: GarmentSelectionScreen(
              captureController: captureController,
              tryOnController: tryOnController,
              uploadController: testUploadController(
                captureController.captureStore,
              ),
            ),
          ),
        );

        expect(find.byKey(const Key('garment-image-path')), findsNothing);
        expect(find.textContaining('KIOSK-3A'), findsNothing);
        expect(find.text('Choose Your Look'), findsOneWidget);
        expect(find.byKey(const Key('browse-products-source')), findsOneWidget);
        expect(find.byKey(const Key('capture-garment-source')), findsOneWidget);
        expect(find.byKey(const Key('garment-intent-TOP')), findsNothing);
        expect(
          find.text('SelfX identifies the garment automatically'),
          findsOneWidget,
        );
        expect(find.text('Auto photo'), findsNothing);
        expect(find.text('Flat lay'), findsNothing);
        expect(find.text('On model'), findsNothing);

        await tester.tap(find.byKey(const Key('capture-garment-source')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));

        expect(find.byKey(const Key('capture-photo')), findsOneWidget);
        expect(tryOnController.pendingGarmentIntent, KioskGarmentIntent.auto);
        expect(find.byKey(const Key('use-phone-garment-source')), findsNothing);

        captureController.dispose();
      },
    );

    testWidgets('catalog product tap selects one garment before continuing', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(630, 1365);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final captureController = testController();
      final tryOnController = KioskTryOnSessionController(
        gateway: FakeKioskTryOnGateway(),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: BrowseProductsScreen(
            captureController: captureController,
            tryOnController: tryOnController,
            uploadController: testUploadController(
              captureController.captureStore,
            ),
            catalogGateway: FakeKioskCatalogGateway(
              products: [
                testCatalogProduct(id: 'product-1', name: 'Formal trouser'),
                testCatalogProduct(id: 'product-2', name: 'Grey trouser'),
              ],
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1));

      expect(find.text('Formal trouser'), findsOneWidget);
      expect(find.text('Grey trouser'), findsOneWidget);
      expect(find.text('Try'), findsNothing);
      expect(tryOnController.garmentInput, isNull);
      expect(
        tester
            .widget<ElevatedButton>(
              find.byKey(const Key('continue-selected-product')),
            )
            .onPressed,
        isNull,
      );

      await tester.tap(find.text('Formal trouser'));
      await tester.pump();

      expect(tryOnController.garmentInput, isNull);
      expect(find.text('Creating Try-On'), findsNothing);
      expect(
        tester
            .widget<ElevatedButton>(
              find.byKey(const Key('continue-selected-product')),
            )
            .onPressed,
        isNotNull,
      );

      await tester.tap(find.text('Grey trouser'));
      await tester.pump();

      expect(tryOnController.garmentInput, isNull);
      expect(find.text('Grey trouser'), findsWidgets);

      captureController.dispose();
    });
  });
}

const testIdlePresentation = KioskIdlePresentation(
  mode: KioskIdlePresentationMode.static,
  slideDuration: Duration(seconds: 30),
  assets: [fallbackIdleAsset],
);

final tinyPng = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
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
          tryOnController: KioskTryOnSessionController(
            gateway: FakeKioskTryOnGateway(),
          ),
          uploadController: testUploadController(controller.captureStore),
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

  Future<void> pumpCameraSettings(CaptureSessionController controller) async {
    await pumpWidget(
      MaterialApp(home: CameraSettingsScreen(controller: controller)),
    );
    await pumpAndSettle();
  }
}

KioskCustomerUploadController testUploadController(
  TemporaryCaptureStore captureStore,
) {
  final deviceController = KioskDeviceSessionController(
    gateway: FakeKioskDeviceGateway(),
    store: InMemoryKioskDeviceCredentialStore(),
  )..accessToken = 'test-device-access-token';
  return KioskCustomerUploadController(
    deviceController: deviceController,
    gateway: FakeKioskCustomerUploadGateway(),
    captureStore: captureStore,
  );
}

KioskCatalogProduct testCatalogProduct({
  required String id,
  required String name,
}) {
  return KioskCatalogProduct(
    id: id,
    name: name,
    audience: KioskCatalogAudience.men.apiValue,
    category: const KioskCatalogProductCategory(
      id: 'category-bottoms',
      name: 'Bottoms',
      slug: 'bottoms',
      audience: 'MEN',
    ),
    garmentIntent: KioskGarmentIntent.bottom,
    garmentCategory: 'BOTTOMS',
    garmentPhotoType: KioskGarmentPhotoType.auto,
    image: KioskCatalogProductImage(
      url: 'https://example.test/$id.png',
      cacheKey: '$id-cache',
      contentType: 'image/png',
      width: 800,
      height: 1200,
    ),
    updatedAt: '2026-08-25T00:00:00.000Z',
  );
}

class FakeKioskCatalogGateway implements KioskCatalogGateway {
  const FakeKioskCatalogGateway({required this.products});

  final List<KioskCatalogProduct> products;

  @override
  Future<KioskCatalogRevision> getCatalogRevision() async {
    return KioskCatalogRevision(
      revision: 'test-revision-${products.length}',
      scope: 'STORE',
      productCount: products.length,
      categoryCount: 1,
      updatedAt: '2026-08-25T00:00:00.000Z',
    );
  }

  @override
  Future<KioskCatalogSnapshot> getCatalogSnapshot() async {
    return KioskCatalogSnapshot(
      revision: 'test-revision-${products.length}',
      scope: 'STORE',
      productCount: products.length,
      categoryCount: 1,
      updatedAt: '2026-08-25T00:00:00.000Z',
      categories: await getCatalogCategories(
        audience: KioskCatalogAudience.men,
      ),
      products: products,
    );
  }

  @override
  Future<List<KioskCatalogCategory>> getCatalogCategories({
    required KioskCatalogAudience audience,
  }) async {
    return const [
      KioskCatalogCategory(
        id: 'category-bottoms',
        name: 'Bottoms',
        slug: 'bottoms',
        productCount: 2,
        audience: 'MEN',
      ),
    ];
  }

  @override
  Future<KioskCatalogPage> getCatalogProducts({
    required KioskCatalogAudience audience,
    String? categorySlug,
    required int page,
    required int pageSize,
  }) async {
    return KioskCatalogPage(
      products: products,
      pagination: const KioskCatalogPagination(
        page: 1,
        pageSize: 12,
        total: 2,
        totalPages: 1,
        hasMore: false,
      ),
    );
  }
}

class FakeKioskTryOnGateway implements KioskTryOnGateway {
  @override
  Future<KioskTryOnRun> createRun(KioskTryOnRequest request) async {
    return const KioskTryOnRun(id: 'run-test', status: KioskTryOnStatus.queued);
  }

  @override
  Future<KioskTryOnRun> getRun(String runId) async {
    return KioskTryOnRun(id: runId, status: KioskTryOnStatus.processing);
  }
}

class FakeKioskCustomerUploadGateway implements KioskCustomerUploadGateway {
  @override
  Future<KioskCustomerUploadSession> createSession(
    String accessToken, {
    required PhotoAcquisitionPurpose purpose,
  }) async {
    return KioskCustomerUploadSession(
      sessionId: 'upload-session',
      status: KioskCustomerUploadStatus.waiting,
      purpose: purpose,
      expiresAt: DateTime.now().add(const Duration(minutes: 5)),
      serverTime: DateTime.now(),
      pollIntervalSeconds: 3,
      publicUploadUrl: 'https://try.selfx.test/upload/capability',
    );
  }

  @override
  Future<KioskCustomerUploadSession> getSession({
    required String accessToken,
    required String sessionId,
  }) async {
    return KioskCustomerUploadSession(
      sessionId: sessionId,
      status: KioskCustomerUploadStatus.waiting,
      purpose: PhotoAcquisitionPurpose.model,
      expiresAt: DateTime.now().add(const Duration(minutes: 5)),
      serverTime: DateTime.now(),
      pollIntervalSeconds: 3,
      publicUploadUrl: 'https://try.selfx.test/upload/capability',
    );
  }

  @override
  Future<KioskCustomerUploadSession> cancelSession({
    required String accessToken,
    required String sessionId,
  }) async {
    return KioskCustomerUploadSession(
      sessionId: sessionId,
      status: KioskCustomerUploadStatus.cancelled,
      purpose: PhotoAcquisitionPurpose.model,
      expiresAt: DateTime.now(),
      serverTime: DateTime.now(),
      pollIntervalSeconds: 3,
    );
  }

  @override
  Future<KioskCustomerUploadSession> consumeSession({
    required String accessToken,
    required String sessionId,
    required PhotoAcquisitionPurpose purpose,
  }) async {
    return KioskCustomerUploadSession(
      sessionId: sessionId,
      status: KioskCustomerUploadStatus.consumed,
      purpose: purpose,
      expiresAt: DateTime.now(),
      serverTime: DateTime.now(),
      pollIntervalSeconds: 3,
    );
  }

  @override
  Future<void> downloadReadyPhoto({
    required String readUrl,
    required String targetPath,
  }) async {}
}

class FakeKioskDeviceGateway implements KioskDeviceGateway {
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
  Future<KioskDeviceCredentials> exchangeProvisioningGrant({
    required String pairingSessionId,
    required String provisioningSecret,
    required String provisioningGrant,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<KioskDeviceCredentials> refreshSession(String refreshToken) {
    throw UnimplementedError();
  }

  @override
  Future<KioskDeviceIdentity> me(String accessToken) {
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
  Future<KioskRuntimeConfiguration> configuration(String accessToken) async {
    return defaultRuntimeConfiguration;
  }
}

class InMemoryKioskDeviceCredentialStore implements KioskDeviceCredentialStore {
  String? refreshToken;

  @override
  Future<String> installationId() async => 'test-installation';

  @override
  Future<String?> readRefreshToken() async => refreshToken;

  @override
  Future<void> writeRefreshToken(String token) async {
    refreshToken = token;
  }

  @override
  Future<void> clearRefreshToken() async {
    refreshToken = null;
  }
}

CameraDevice testCamera(
  String id, {
  CameraFacing facing = CameraFacing.unknown,
  int? sensorOrientation,
}) {
  return CameraDevice(
    id: id,
    label: 'Camera $id',
    facing: facing,
    sensorOrientation: sensorOrientation,
  );
}

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
  ModelCoverageAnalyzer? modelCoverageAnalyzer,
  Duration? countdownTickDuration,
}) {
  return CaptureSessionController(
    cameraService: camera ?? readyCamera(),
    settingsStore: settings ?? InMemoryCameraSettingsStore(),
    analyzer: analyzer ?? FakeQualityAnalyzer.pass(),
    captureStore: captureStore ?? InMemoryTemporaryCaptureStore(),
    audioService: audioService ?? const SilentCaptureAudioService(),
    modelCoverageAnalyzer:
        modelCoverageAnalyzer ?? const FakeModelCoverageAnalyzer(),
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
  CameraOrientationMode orientationMode = defaultCameraOrientationMode;

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
      orientationMode: orientationMode,
      normalizationDegrees: orientationMode.manualDegrees ?? 0,
      orientationNormalized:
          orientationMode != CameraOrientationMode.auto &&
          orientationMode != CameraOrientationMode.deg0,
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
  Future<void> updateOrientationMode(CameraOrientationMode mode) async {
    orientationMode = mode;
    _state.value = _state.value.copyWith(
      capabilities: CameraCapabilities(
        previewWidth: _state.value.capabilities.previewWidth,
        previewHeight: _state.value.capabilities.previewHeight,
        effectivePreviewWidth:
            mode == CameraOrientationMode.deg90 ||
                mode == CameraOrientationMode.deg270
            ? _state.value.capabilities.previewHeight
            : _state.value.capabilities.previewWidth,
        effectivePreviewHeight:
            mode == CameraOrientationMode.deg90 ||
                mode == CameraOrientationMode.deg270
            ? _state.value.capabilities.previewWidth
            : _state.value.capabilities.previewHeight,
        supportsPreview: _state.value.capabilities.supportsPreview,
        supportsStillCapture: _state.value.capabilities.supportsStillCapture,
        supportsLiveFrames: _state.value.capabilities.supportsLiveFrames,
        nativeBackend: _state.value.capabilities.nativeBackend,
        orientationMode: mode,
        effectiveRotationDegrees: mode.manualDegrees ?? 0,
        notes: _state.value.capabilities.notes,
      ),
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
  Future<void> warmUpProfile(CaptureAudioProfile profile) async {
    events.add('warm:${profile.name}');
  }

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

class FakeModelCoverageAnalyzer implements ModelCoverageAnalyzer {
  const FakeModelCoverageAnalyzer([
    this.result = const ModelCoverageAnalysis.resolved(
      coverage: ModelCoverage.fullBody,
      confidence: 0.9,
      reasonCode: 'MODEL_FULL_BODY_COVERAGE',
    ),
  ]);

  final ModelCoverageAnalysis result;

  @override
  Future<ModelCoverageAnalysis> analyze(File image) async => result;

  @override
  Future<void> dispose() async {}
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => this.isEmpty ? null : first;
}
