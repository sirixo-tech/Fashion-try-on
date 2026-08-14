import 'dart:io';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../camera/camera_plugin_service.dart';
import '../camera/camera_service.dart';
import '../device/kiosk_device_gateway.dart';
import '../device/kiosk_device_session_controller.dart';
import '../device/kiosk_device_storage.dart';
import '../live/person_analysis.dart';
import '../operator/operator_access.dart';
import '../quality/image_quality.dart';
import '../quality/opencv_kiosk_image_quality_analyzer.dart';
import '../session/capture_session_controller.dart';
import '../session/temporary_capture_store.dart';
import '../settings/camera_settings_store.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../tryon/kiosk_try_on_gateway.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../ui/kiosk_startup_screen.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import '../upload/kiosk_customer_upload_gateway.dart';

class SelfxKioskApp extends StatelessWidget {
  const SelfxKioskApp({
    super.key,
    required this.controller,
    required this.tryOnController,
    required this.deviceController,
    required this.uploadController,
    this.operatorAccessController,
  });

  factory SelfxKioskApp.production() {
    final settingsStore = SharedPreferencesCameraSettingsStore(
      SharedPreferencesAsync(),
    );
    final deviceController = KioskDeviceSessionController(
      gateway: SelfxKioskDeviceGateway(
        config: KioskDeviceApiConfig.fromEnvironment(),
      ),
      store: SecureKioskDeviceCredentialStore(),
    );
    final captureStore = TemporaryCaptureStore();
    return SelfxKioskApp(
      deviceController: deviceController,
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
        captureStore: captureStore,
      ),
      tryOnController: KioskTryOnSessionController(
        gateway: SelfxKioskTryOnGateway(
          config: KioskTryOnApiConfig.fromEnvironment(),
        ),
      ),
      uploadController: KioskCustomerUploadController(
        deviceController: deviceController,
        gateway: SelfxKioskCustomerUploadGateway(
          config: KioskCustomerUploadApiConfig.fromEnvironment(),
        ),
        captureStore: captureStore,
      ),
      operatorAccessController: OperatorAccessController(
        verifier: const Sha256OperatorAccessVerifier(
          expectedDigest: demoOperatorPinSha256Digest,
        ),
      ),
    );
  }

  final CaptureSessionController controller;
  final KioskTryOnSessionController tryOnController;
  final KioskDeviceSessionController deviceController;
  final KioskCustomerUploadController uploadController;
  final OperatorAccessController? operatorAccessController;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SelfX Kiosk',
      debugShowCheckedModeBanner: false,
      theme: buildSelfxKioskTheme(),
      home: KioskStartupScreen(
        deviceController: deviceController,
        captureController: controller,
        tryOnController: tryOnController,
        uploadController: uploadController,
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
    required this.tryOnGateway,
    required this.deviceGateway,
    required this.deviceCredentialStore,
  });

  final CameraService cameraService;
  final CameraSettingsStore settingsStore;
  final KioskImageQualityAnalyzer analyzer;
  final LiveFrameAnalyzer liveFrameAnalyzer;
  final TemporaryCaptureStore captureStore;
  final KioskTryOnGateway tryOnGateway;
  final KioskDeviceGateway deviceGateway;
  final KioskDeviceCredentialStore deviceCredentialStore;
}
