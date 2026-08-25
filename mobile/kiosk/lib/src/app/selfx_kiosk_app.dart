import 'dart:io';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../camera/camera_plugin_service.dart';
import '../camera/camera_service.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../catalog/kiosk_catalog_repository.dart';
import '../config/kiosk_runtime_configuration_controller.dart';
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
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_try_on_gateway.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../tryon/model_coverage_analyzer.dart';
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
    required this.catalogGateway,
    required this.configurationController,
    this.extractionService = const UnavailableGarmentExtractionService(),
    this.operatorAccessController,
  });

  factory SelfxKioskApp.production() {
    final preferences = SharedPreferencesAsync();
    final settingsStore = SharedPreferencesCameraSettingsStore(preferences);
    final deviceGateway = SelfxKioskDeviceGateway(
      config: KioskDeviceApiConfig.fromEnvironment(),
    );
    final deviceController = KioskDeviceSessionController(
      gateway: deviceGateway,
      store: SecureKioskDeviceCredentialStore(),
    );
    final configurationController = KioskRuntimeConfigurationController(
      gateway: deviceGateway,
      deviceController: deviceController,
      preferences: preferences,
    );
    final tryOnController = KioskTryOnSessionController(
      gateway: SelfxKioskTryOnGateway(
        config: KioskTryOnApiConfig.fromEnvironment(),
        deviceController: deviceController,
      ),
    );
    final catalogGateway = KioskCatalogRepository(
      remote: SelfxKioskCatalogGateway(
        config: KioskCatalogApiConfig.fromEnvironment(),
        deviceController: deviceController,
      ),
      preferences: preferences,
      canApplyUpdates: () => tryOnController.canActivateRuntimeConfiguration,
    );
    final captureStore = TemporaryCaptureStore();
    return SelfxKioskApp(
      deviceController: deviceController,
      configurationController: configurationController,
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
        modelCoverageAnalyzer: Platform.isAndroid
            ? MlKitStillImageModelCoverageAnalyzer()
            : const UnavailableModelCoverageAnalyzer(
                'MODEL_COVERAGE_UNSUPPORTED_ON_WINDOWS',
              ),
        captureStore: captureStore,
      ),
      tryOnController: tryOnController,
      uploadController: KioskCustomerUploadController(
        deviceController: deviceController,
        gateway: SelfxKioskCustomerUploadGateway(
          config: KioskCustomerUploadApiConfig.fromEnvironment(),
        ),
        captureStore: captureStore,
      ),
      catalogGateway: catalogGateway,
      extractionService: SelfxGarmentExtractionService(
        config: KioskGarmentExtractionApiConfig.fromEnvironment(),
        deviceController: deviceController,
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
  final KioskCatalogGateway catalogGateway;
  final GarmentExtractionService extractionService;
  final KioskRuntimeConfigurationController configurationController;
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
        catalogGateway: catalogGateway,
        extractionService: extractionService,
        configurationController: configurationController,
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
    required this.configurationController,
  });

  final CameraService cameraService;
  final CameraSettingsStore settingsStore;
  final KioskImageQualityAnalyzer analyzer;
  final LiveFrameAnalyzer liveFrameAnalyzer;
  final TemporaryCaptureStore captureStore;
  final KioskTryOnGateway tryOnGateway;
  final KioskDeviceGateway deviceGateway;
  final KioskDeviceCredentialStore deviceCredentialStore;
  final KioskRuntimeConfigurationController configurationController;
}
