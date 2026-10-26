import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../camera/camera_plugin_service.dart';
import '../camera/camera_service.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../catalog/kiosk_catalog_repository.dart';
import '../config/kiosk_bootstrap_config.dart';
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
import '../tryon/kiosk_try_on_models.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../tryon/model_coverage_analyzer.dart';
import '../ui/kiosk_startup_screen.dart';
import '../ui/kiosk_inactivity_warning.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import '../upload/kiosk_customer_upload_gateway.dart';

class SelfxKioskApp extends StatefulWidget {
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
    this.customerSessionIdleTimeoutOverride,
  });

  factory SelfxKioskApp.production({
    required KioskBootstrapConfig bootstrapConfig,
  }) {
    final preferences = SharedPreferencesAsync();
    final settingsStore = SharedPreferencesCameraSettingsStore(preferences);
    final apiBaseUrl = bootstrapConfig.apiBaseUrl;
    final deviceGateway = SelfxKioskDeviceGateway(
      config: KioskDeviceApiConfig(apiBaseUrl: apiBaseUrl),
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
    late final KioskTryOnSessionController tryOnController;
    final catalogGateway = KioskCatalogRepository(
      remote: SelfxKioskCatalogGateway(
        config: KioskCatalogApiConfig(apiBaseUrl: apiBaseUrl),
        deviceController: deviceController,
      ),
      preferences: preferences,
      canApplyUpdates: () => tryOnController.canActivateRuntimeConfiguration,
    );
    tryOnController = KioskTryOnSessionController(
      gateway: SelfxKioskTryOnGateway(
        config: KioskTryOnApiConfig(apiBaseUrl: apiBaseUrl),
        deviceController: deviceController,
      ),
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
          config: KioskCustomerUploadApiConfig(apiBaseUrl: apiBaseUrl),
        ),
        captureStore: captureStore,
      ),
      catalogGateway: catalogGateway,
      extractionService: SelfxGarmentExtractionService(
        config: KioskGarmentExtractionApiConfig(apiBaseUrl: apiBaseUrl),
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
  final Duration? customerSessionIdleTimeoutOverride;

  @override
  State<SelfxKioskApp> createState() => _SelfxKioskAppState();
}

class _SelfxKioskAppState extends State<SelfxKioskApp> {
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SelfX Kiosk',
      debugShowCheckedModeBanner: false,
      theme: buildSelfxKioskTheme(),
      navigatorKey: _navigatorKey,
      builder: (context, child) => KioskCustomerSessionIdleGuard(
        navigatorKey: _navigatorKey,
        captureController: widget.controller,
        tryOnController: widget.tryOnController,
        uploadController: widget.uploadController,
        configurationController: widget.configurationController,
        timeoutOverride: widget.customerSessionIdleTimeoutOverride,
        child: child ?? const SizedBox.shrink(),
      ),
      home: KioskStartupScreen(
        deviceController: widget.deviceController,
        captureController: widget.controller,
        tryOnController: widget.tryOnController,
        uploadController: widget.uploadController,
        catalogGateway: widget.catalogGateway,
        extractionService: widget.extractionService,
        configurationController: widget.configurationController,
        operatorAccessController:
            widget.operatorAccessController ??
            OperatorAccessController(
              verifier: const Sha256OperatorAccessVerifier(
                expectedDigest: demoOperatorPinSha256Digest,
              ),
            ),
      ),
    );
  }
}

class KioskCustomerSessionIdleGuard extends StatefulWidget {
  const KioskCustomerSessionIdleGuard({
    super.key,
    required this.navigatorKey,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
    required this.configurationController,
    required this.child,
    this.timeoutOverride,
    this.now,
  });

  final GlobalKey<NavigatorState> navigatorKey;
  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskRuntimeConfigurationController configurationController;
  final Widget child;
  final Duration? timeoutOverride;
  final DateTime Function()? now;

  @override
  State<KioskCustomerSessionIdleGuard> createState() =>
      _KioskCustomerSessionIdleGuardState();
}

class _KioskCustomerSessionIdleGuardState
    extends State<KioskCustomerSessionIdleGuard> {
  Timer? _idleTimer;
  Timer? _warningTimer;
  Timer? _warningTicker;
  int? _remainingSeconds;
  DateTime? _idleDeadline;
  int? _trackedSessionRevision;
  bool _endingSession = false;
  bool _trackingSession = false;
  DateTime? _purchaseDeadline;

  @override
  void initState() {
    super.initState();
    widget.tryOnController.addListener(_syncTimer);
    _syncTimer();
  }

  @override
  void didUpdateWidget(covariant KioskCustomerSessionIdleGuard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.tryOnController != widget.tryOnController) {
      oldWidget.tryOnController.removeListener(_syncTimer);
      widget.tryOnController.addListener(_syncTimer);
    }
    _syncTimer();
  }

  @override
  void dispose() {
    widget.tryOnController.removeListener(_syncTimer);
    _cancelTimers();
    super.dispose();
  }

  void _syncTimer() {
    if (_endingSession) return;
    if (!widget.tryOnController.customerSessionActive) {
      _cancelTimers();
      _hideWarning();
      _trackingSession = false;
      _trackedSessionRevision = null;
      return;
    }
    if (_purchaseDeadline != widget.tryOnController.purchaseDisplayUntil) {
      _purchaseDeadline = widget.tryOnController.purchaseDisplayUntil;
      _restartTimer();
    }
    if (!_trackingSession ||
        _trackedSessionRevision !=
            widget.tryOnController.customerSessionRevision) {
      _trackingSession = true;
      _trackedSessionRevision = widget.tryOnController.customerSessionRevision;
      _restartTimer();
    }
  }

  void _recordActivity() {
    if (!widget.tryOnController.customerSessionActive || _endingSession) {
      return;
    }
    _restartTimer();
  }

  void _restartTimer() {
    _cancelTimers();
    _hideWarning();
    final requestedHold =
        _purchaseDeadline?.difference(widget.now?.call() ?? DateTime.now()) ??
        Duration.zero;
    final hold = requestedHold > const Duration(minutes: 5)
        ? const Duration(minutes: 5)
        : requestedHold;
    final timeout = hold > _timeout ? hold : _timeout;
    _idleDeadline = (widget.now?.call() ?? DateTime.now()).add(timeout);
    final warningWindow = timeout < const Duration(seconds: 30)
        ? timeout
        : const Duration(seconds: 30);
    _warningTimer = Timer(timeout - warningWindow, () {
      if (!mounted ||
          !widget.tryOnController.customerSessionActive ||
          _endingSession) {
        return;
      }
      _updateRemainingTime();
      _warningTicker = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted || _endingSession) return;
        _updateRemainingTime();
      });
    });
    _idleTimer = Timer(timeout, () {
      unawaited(_endIdleSession());
    });
  }

  void _updateRemainingTime() {
    final remaining =
        (_idleDeadline!
                    .difference(widget.now?.call() ?? DateTime.now())
                    .inMilliseconds /
                1000)
            .ceil()
            .clamp(0, 30);
    setState(() => _remainingSeconds = remaining);
  }

  void _cancelTimers() {
    _idleTimer?.cancel();
    _warningTimer?.cancel();
    _warningTicker?.cancel();
    _idleTimer = null;
    _warningTimer = null;
    _warningTicker = null;
  }

  void _hideWarning() {
    if (_remainingSeconds != null && mounted) {
      setState(() => _remainingSeconds = null);
    }
  }

  Duration get _timeout =>
      widget.timeoutOverride ??
      Duration(
        seconds: widget
            .configurationController
            .configuration
            .sessionIdleTimeoutSeconds
            .clamp(30, 900)
            .toInt(),
      );

  Future<void> _endIdleSession() async {
    if (_endingSession || !widget.tryOnController.customerSessionActive) {
      return;
    }
    _endingSession = true;
    _cancelTimers();
    if (mounted) setState(() => _remainingSeconds = 0);
    final revision = widget.tryOnController.customerSessionRevision;
    try {
      await widget.uploadController.cancel();
      if (!mounted ||
          revision != widget.tryOnController.customerSessionRevision) {
        return;
      }
      await widget.tryOnController.finish(
        widget.captureController,
        reason: KioskTryOnSessionCompletionReason.idleTimeout,
      );
      if (mounted) {
        widget.navigatorKey.currentState?.popUntil((route) => route.isFirst);
      }
    } finally {
      _endingSession = false;
      if (mounted) _syncTimer();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (_) => _recordActivity(),
      onPointerMove: (_) => _recordActivity(),
      onPointerSignal: (_) => _recordActivity(),
      child: Stack(
        fit: StackFit.expand,
        children: [
          widget.child,
          if (_remainingSeconds != null)
            Positioned.fill(
              child: BlockSemantics(
                child: Semantics(
                  liveRegion: true,
                  onTap: _endingSession ? null : _recordActivity,
                  child: Listener(
                    // This full-screen hit-test boundary prevents touches from
                    // reaching the underlying page while keeping the popup's
                    // button accessible. The outer listener resumes on touch.
                    behavior: HitTestBehavior.opaque,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        ColoredBox(color: Colors.black.withValues(alpha: 0.52)),
                        KioskInactivityWarning(
                          remainingSeconds: _remainingSeconds!,
                          onKeepBrowsing: _endingSession
                              ? null
                              : _recordActivity,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
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
