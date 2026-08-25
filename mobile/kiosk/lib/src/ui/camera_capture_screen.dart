import 'package:flutter/material.dart';

import '../acquisition/photo_acquisition.dart';
import '../camera/camera_models.dart';
import '../camera/camera_preview_viewport.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../live/capture_readiness_engine.dart';
import '../session/capture_flow.dart';
import '../session/capture_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/garment_reference_profile.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'capture_review_screen.dart';
import 'garment_review_screen.dart';
import 'responsive_kiosk_layout.dart';
import 'try_on_generation_screen.dart';

class CameraCaptureScreen extends StatefulWidget {
  const CameraCaptureScreen({
    super.key,
    required this.controller,
    required this.tryOnController,
    required this.uploadController,
    this.catalogGateway = const UnavailableKioskCatalogGateway(),
    this.purpose = PhotoAcquisitionPurpose.model,
    this.garmentIntent,
    this.extractionService = const UnavailableGarmentExtractionService(),
  });

  final CaptureSessionController controller;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final PhotoAcquisitionPurpose purpose;
  final KioskGarmentIntent? garmentIntent;
  final GarmentExtractionService extractionService;

  @override
  State<CameraCaptureScreen> createState() => _CameraCaptureScreenState();
}

class _CameraCaptureScreenState extends State<CameraCaptureScreen> {
  bool _starting = true;
  bool _switchingCamera = false;
  String? _reviewCapturePath;

  @override
  void initState() {
    super.initState();
    widget.controller.selectCapturePurpose(widget.purpose);
    widget.controller.addListener(_handleControllerChanged);
    _start();
  }

  @override
  void dispose() {
    widget.controller.removeListener(_handleControllerChanged);
    super.dispose();
  }

  Future<void> _start() async {
    try {
      await widget.controller.startCamera();
    } catch (_) {
      // The controller publishes camera failures for the UI to render.
    } finally {
      if (mounted) {
        setState(() => _starting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: AnimatedBuilder(
        animation: Listenable.merge([
          widget.controller,
          widget.controller.cameraService.state,
        ]),
        builder: (context, _) {
          final cameraState = widget.controller.cameraService.state.value;
          final flowState = widget.controller.flowState;
          return Stack(
            fit: StackFit.expand,
            children: [
              _PreviewPanel(
                starting: _starting,
                state: cameraState,
                preview: widget.controller.cameraService.buildPreview(context),
                onRetry: _start,
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: CaptureGuidancePanel(
                  state: cameraState,
                  flowState: flowState,
                  readinessResult: widget.controller.readinessResult,
                  onBack: () => Navigator.of(context).pop(),
                  onCapture: _capture,
                  onCancelCountdown: widget.controller.cancelCountdown,
                  onCaptureAnyway: widget.controller.captureAnyway,
                  canFlipCamera:
                      widget.purpose == PhotoAcquisitionPurpose.model &&
                      widget.controller.canFlipCamera,
                  onFlipCamera:
                      widget.purpose == PhotoAcquisitionPurpose.model &&
                          cameraState.status == CameraStatus.ready &&
                          flowState.stage == CaptureFlowStage.preview &&
                          !_switchingCamera
                      ? _flipCamera
                      : null,
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _capture() {
    return widget.controller.beginAssistedCapture();
  }

  Future<void> _flipCamera() async {
    if (_switchingCamera || !widget.controller.canFlipCamera) {
      return;
    }
    setState(() => _switchingCamera = true);
    try {
      await widget.controller.flipCamera();
    } catch (_) {
      // Camera selection failures are published by the camera service state.
    } finally {
      if (mounted) {
        setState(() => _switchingCamera = false);
      }
    }
  }

  void _handleControllerChanged() {
    final flowState = widget.controller.flowState;
    final capturePath = widget.controller.capture?.originalPath;
    if (flowState.stage == CaptureFlowStage.review &&
        capturePath != null &&
        _reviewCapturePath != capturePath) {
      _reviewCapturePath = capturePath;
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (!mounted) {
          return;
        }
        final route = _routeForCapturedPhoto(capturePath);
        await Navigator.of(context).push(route);
        if (mounted &&
            widget.controller.flowState.stage == CaptureFlowStage.preview) {
          _reviewCapturePath = null;
        }
      });
    } else if (flowState.stage == CaptureFlowStage.preview) {
      _reviewCapturePath = null;
    }
  }

  MaterialPageRoute<void> _routeForCapturedPhoto(String capturePath) {
    if (widget.purpose != PhotoAcquisitionPurpose.garment) {
      return MaterialPageRoute<void>(
        builder: (_) => CaptureReviewScreen(
          controller: widget.controller,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          extractionService: widget.extractionService,
        ),
      );
    }

    final garmentInput = KioskGarmentInput(
      source: KioskGarmentInputSource.capturedGarment,
      localPath: capturePath,
      intent: widget.garmentIntent ?? KioskGarmentIntent.auto,
      photoType: resolveGarmentReferenceProfile(
        bodyContext: widget.controller.captureTargetMetadata,
      ).photoType,
    );
    if (widget.tryOnController.garmentPreviewEnabled ||
        garmentInput.intent == KioskGarmentIntent.auto) {
      return MaterialPageRoute<void>(
        builder: (_) => GarmentReviewScreen(
          captureController: widget.controller,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          garmentInput: garmentInput,
          pendingCameraCapture: true,
          extractionService: widget.extractionService,
        ),
      );
    }

    widget.tryOnController.selectGarment(garmentInput);
    widget.controller.preservePendingCaptureAsExternalInput();
    return MaterialPageRoute<void>(
      builder: (_) => TryOnGenerationScreen(
        captureController: widget.controller,
        tryOnController: widget.tryOnController,
        uploadController: widget.uploadController,
        catalogGateway: widget.catalogGateway,
        extractionService: widget.extractionService,
      ),
    );
  }
}

class _PreviewPanel extends StatelessWidget {
  const _PreviewPanel({
    required this.starting,
    required this.state,
    required this.preview,
    required this.onRetry,
  });

  final bool starting;
  final CameraState state;
  final Widget preview;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final showPreview =
        state.status == CameraStatus.ready ||
        state.status == CameraStatus.capturing;
    return ColoredBox(
      color: Colors.black,
      child: showPreview
          ? CameraPreviewViewport(
              state: state,
              preview: preview,
              fit: BoxFit.cover,
            )
          : _CameraStateView(
              starting: starting,
              state: state,
              onRetry: onRetry,
            ),
    );
  }
}

class CaptureGuidancePanel extends StatelessWidget {
  const CaptureGuidancePanel({
    super.key,
    required this.state,
    required this.flowState,
    required this.readinessResult,
    required this.onBack,
    required this.onCapture,
    required this.onCancelCountdown,
    required this.onCaptureAnyway,
    required this.canFlipCamera,
    required this.onFlipCamera,
  });

  final CameraState state;
  final CaptureFlowState flowState;
  final CaptureReadinessResult? readinessResult;
  final VoidCallback onBack;
  final VoidCallback onCapture;
  final VoidCallback onCancelCountdown;
  final VoidCallback onCaptureAnyway;
  final bool canFlipCamera;
  final VoidCallback? onFlipCamera;

  @override
  Widget build(BuildContext context) {
    return _CaptureControls(
      state: state,
      flowState: flowState,
      readinessResult: readinessResult,
      onBack: onBack,
      onCapture: onCapture,
      onCancelCountdown: onCancelCountdown,
      onCaptureAnyway: onCaptureAnyway,
      canFlipCamera: canFlipCamera,
      onFlipCamera: onFlipCamera,
    );
  }
}

class _CaptureControls extends StatelessWidget {
  const _CaptureControls({
    required this.state,
    required this.flowState,
    required this.readinessResult,
    required this.onBack,
    required this.onCapture,
    required this.onCancelCountdown,
    required this.onCaptureAnyway,
    required this.canFlipCamera,
    required this.onFlipCamera,
  });

  final CameraState state;
  final CaptureFlowState flowState;
  final CaptureReadinessResult? readinessResult;
  final VoidCallback onBack;
  final VoidCallback onCapture;
  final VoidCallback onCancelCountdown;
  final VoidCallback onCaptureAnyway;
  final bool canFlipCamera;
  final VoidCallback? onFlipCamera;

  @override
  Widget build(BuildContext context) {
    final stage = flowState.stage;
    final isCountdown = stage == CaptureFlowStage.countdown;
    final canCaptureAnyway =
        readinessResult?.canCaptureAnyway == true &&
        stage == CaptureFlowStage.preparing;
    final primaryLabel = switch (stage) {
      CaptureFlowStage.preparing =>
        canCaptureAnyway ? 'Capture Anyway' : 'Getting Ready',
      CaptureFlowStage.countdown =>
        flowState.secondsRemaining == null
            ? 'Get Ready'
            : 'Photo in ${flowState.secondsRemaining}',
      CaptureFlowStage.capturing => 'Capturing',
      CaptureFlowStage.analyzing => 'Checking Photo',
      _ => 'Take Photo',
    };
    final countdownText = isCountdown && flowState.secondsRemaining != null
        ? '${flowState.secondsRemaining}'
        : null;
    final primaryAction = switch (stage) {
      CaptureFlowStage.preparing when canCaptureAnyway => onCaptureAnyway,
      CaptureFlowStage.preview
          when state.canCapture && flowState.canBeginCapture =>
        onCapture,
      _ => null,
    };
    final leftAction = isCountdown ? onCancelCountdown : onBack;
    final leftIcon = isCountdown ? Icons.close : Icons.arrow_back;
    final leftTooltip = isCountdown ? 'Cancel countdown' : 'Back';
    final layout = KioskLayoutMetrics.fromSize(MediaQuery.sizeOf(context));
    final primarySize = layout.scaled(66, small: 58, large: 76, extraLarge: 88);
    final railSize = layout.scaled(54, small: 48, large: 62, extraLarge: 72);

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          layout.pagePadding,
          10,
          layout.pagePadding,
          layout.scaled(24, small: 16, large: 34, extraLarge: 44),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (flowState.errorMessage != null) ...[
              DecoratedBox(
                decoration: BoxDecoration(
                  color: SelfxKioskTokens.surface.withValues(alpha: 0.94),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: SelfxKioskTokens.border),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                  child: Text(
                    flowState.errorMessage!,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
            SizedBox(
              height: primarySize,
              child: Row(
                children: [
                  Expanded(
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: _CameraRailButton(
                        key: const Key('camera-back'),
                        tooltip: leftTooltip,
                        icon: leftIcon,
                        dimension: railSize,
                        onPressed: leftAction,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Center(
                      child: _PrimaryCameraActionButton(
                        key: const Key('capture-photo'),
                        label: primaryLabel,
                        icon: countdownText == null
                            ? _captureIconFor(stage, canCaptureAnyway)
                            : null,
                        centerText: countdownText,
                        dimension: primarySize,
                        onPressed: primaryAction,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: _CameraRailButton(
                        key: const Key('flip-person-camera'),
                        tooltip: 'Flip camera',
                        icon: Icons.cameraswitch_outlined,
                        dimension: railSize,
                        onPressed: canFlipCamera ? onFlipCamera : null,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PrimaryCameraActionButton extends StatelessWidget {
  const _PrimaryCameraActionButton({
    super.key,
    required this.label,
    required this.icon,
    this.centerText,
    required this.dimension,
    required this.onPressed,
  });

  final String label;
  final IconData? icon;
  final String? centerText;
  final double dimension;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: label,
      child: Semantics(
        button: true,
        label: label,
        child: SizedBox.square(
          dimension: dimension,
          child: FilledButton(
            onPressed: onPressed,
            style: FilledButton.styleFrom(
              backgroundColor: SelfxKioskTokens.primary,
              foregroundColor: SelfxKioskTokens.onPrimary,
              disabledBackgroundColor: SelfxKioskTokens.primary.withValues(
                alpha: 0.42,
              ),
              disabledForegroundColor: SelfxKioskTokens.onPrimary.withValues(
                alpha: 0.72,
              ),
              padding: EdgeInsets.zero,
              shape: const StadiumBorder(),
            ),
            child: centerText != null
                ? Text(
                    centerText!,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      color: SelfxKioskTokens.onPrimary,
                      fontWeight: FontWeight.w900,
                    ),
                  )
                : Icon(icon, size: dimension * 0.45),
          ),
        ),
      ),
    );
  }
}

class _CameraRailButton extends StatelessWidget {
  const _CameraRailButton({
    super.key,
    required this.tooltip,
    required this.icon,
    required this.dimension,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final double dimension;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: SizedBox.square(
        dimension: dimension,
        child: IconButton(
          onPressed: onPressed,
          icon: Icon(icon),
          color: SelfxKioskTokens.textPrimary,
          disabledColor: SelfxKioskTokens.textMuted,
          style: IconButton.styleFrom(
            backgroundColor: SelfxKioskTokens.surface,
            side: const BorderSide(color: SelfxKioskTokens.border),
            shape: const StadiumBorder(),
          ),
        ),
      ),
    );
  }
}

IconData _captureIconFor(CaptureFlowStage stage, bool canCaptureAnyway) {
  return switch (stage) {
    CaptureFlowStage.preparing when canCaptureAnyway =>
      Icons.camera_alt_outlined,
    CaptureFlowStage.preparing => Icons.hourglass_top,
    CaptureFlowStage.countdown => Icons.timer_outlined,
    CaptureFlowStage.capturing => Icons.camera,
    CaptureFlowStage.analyzing => Icons.manage_search,
    _ => Icons.camera_alt_outlined,
  };
}

class _CameraStateView extends StatelessWidget {
  const _CameraStateView({
    required this.starting,
    required this.state,
    required this.onRetry,
  });

  final bool starting;
  final CameraState state;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final isBusy =
        starting ||
        state.status == CameraStatus.discovering ||
        state.status == CameraStatus.initializing;
    final failure = state.failure;
    return ColoredBox(
      color: const Color(0xFF030712),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (isBusy) const CircularProgressIndicator(color: Colors.white),
              if (!isBusy)
                const Icon(
                  Icons.videocam_off_outlined,
                  color: Colors.white,
                  size: 64,
                ),
              const SizedBox(height: 24),
              Text(
                isBusy
                    ? 'Starting camera'
                    : failure?.message ?? 'Camera unavailable',
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(color: Colors.white),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              if (!isBusy)
                FilledButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Retry'),
                  style: FilledButton.styleFrom(
                    backgroundColor: SelfxKioskTokens.primary,
                    foregroundColor: SelfxKioskTokens.onPrimary,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 34,
                      vertical: 16,
                    ),
                    textStyle: Theme.of(context).textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800),
                    shape: const StadiumBorder(),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
