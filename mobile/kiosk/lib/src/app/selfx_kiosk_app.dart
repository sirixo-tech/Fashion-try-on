import 'dart:io';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../camera/camera_plugin_service.dart';
import '../camera/camera_service.dart';
import '../live/person_analysis.dart';
import '../operator/operator_access.dart';
import '../quality/image_quality.dart';
import '../quality/opencv_kiosk_image_quality_analyzer.dart';
import '../session/capture_session_controller.dart';
import '../session/temporary_capture_store.dart';
import '../settings/camera_settings_store.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../ui/kiosk_home_screen.dart';

class SelfxKioskApp extends StatelessWidget {
  const SelfxKioskApp({
    super.key,
    required this.controller,
    this.operatorAccessController,
  });

  factory SelfxKioskApp.production() {
    final settingsStore = SharedPreferencesCameraSettingsStore(
      SharedPreferencesAsync(),
    );
    return SelfxKioskApp(
      controller: CaptureSessionController(
        cameraService: CameraPluginService(),
        settingsStore: settingsStore,
        analyzer: OpenCvKioskImageQualityAnalyzer(),
        liveFrameAnalyzer: LiveFrameAnalyzer(
          poseAnalyzer: Platform.isAndroid
              ? MlKitPersonPoseAnalyzer()
              : const UnavailablePersonPoseAnalyzer(
                  'LIVE_FRAMES_UNSUPPORTED_ON_WINDOWS',
                ),
          qualityAnalyzer: const LuminanceLiveImageQualityAnalyzer(),
        ),
        captureStore: TemporaryCaptureStore(),
      ),
      operatorAccessController: OperatorAccessController(
        verifier: const Sha256OperatorAccessVerifier(
          expectedDigest: demoOperatorPinSha256Digest,
        ),
      ),
    );
  }

  final CaptureSessionController controller;
  final OperatorAccessController? operatorAccessController;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SelfX Kiosk',
      debugShowCheckedModeBanner: false,
      theme: buildSelfxKioskTheme(),
      home: KioskHomeScreen(
        controller: controller,
        operatorAccessController:
            operatorAccessController ??
            OperatorAccessController(
              verifier: const Sha256OperatorAccessVerifier(
                expectedDigest: demoOperatorPinSha256Digest,
              ),
            ),
      ),
    );
  }
}

class SelfxKioskDependencies {
  const SelfxKioskDependencies({
    required this.cameraService,
    required this.settingsStore,
    required this.analyzer,
    required this.liveFrameAnalyzer,
    required this.captureStore,
  });

  final CameraService cameraService;
  final CameraSettingsStore settingsStore;
  final KioskImageQualityAnalyzer analyzer;
  final LiveFrameAnalyzer liveFrameAnalyzer;
  final TemporaryCaptureStore captureStore;
}
