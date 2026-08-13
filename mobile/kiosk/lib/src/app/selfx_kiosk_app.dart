import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../camera/camera_plugin_service.dart';
import '../camera/camera_service.dart';
import '../quality/image_quality.dart';
import '../quality/opencv_kiosk_image_quality_analyzer.dart';
import '../session/capture_session_controller.dart';
import '../session/temporary_capture_store.dart';
import '../settings/camera_settings_store.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../ui/kiosk_home_screen.dart';

class SelfxKioskApp extends StatelessWidget {
  const SelfxKioskApp({super.key, required this.controller});

  factory SelfxKioskApp.production() {
    final settingsStore = SharedPreferencesCameraSettingsStore(
      SharedPreferencesAsync(),
    );
    return SelfxKioskApp(
      controller: CaptureSessionController(
        cameraService: CameraPluginService(),
        settingsStore: settingsStore,
        analyzer: OpenCvKioskImageQualityAnalyzer(),
        captureStore: TemporaryCaptureStore(),
      ),
    );
  }

  final CaptureSessionController controller;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SelfX Kiosk',
      debugShowCheckedModeBanner: false,
      theme: buildSelfxKioskTheme(),
      home: KioskHomeScreen(controller: controller),
    );
  }
}

class SelfxKioskDependencies {
  const SelfxKioskDependencies({
    required this.cameraService,
    required this.settingsStore,
    required this.analyzer,
    required this.captureStore,
  });

  final CameraService cameraService;
  final CameraSettingsStore settingsStore;
  final KioskImageQualityAnalyzer analyzer;
  final TemporaryCaptureStore captureStore;
}
