import 'package:flutter/material.dart';

import '../acquisition/photo_acquisition.dart';
import '../camera/camera_models.dart';
import '../camera/camera_preview_viewport.dart';
import '../live/capture_readiness_engine.dart';
import '../session/capture_flow.dart';
import '../session/capture_session_controller.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/garment_reference_profile.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'capture_review_screen.dart';
import 'garment_review_screen.dart';
import 'kiosk_chrome.dart';
import 'selfx_kiosk_button.dart';

class CameraCaptureScreen extends StatefulWidget {
  const CameraCaptureScreen({
    super.key,
    required this.controller,
    required this.tryOnController,
    required this.uploadController,
    this.purpose = PhotoAcquisitionPurpose.model,
    this.garmentIntent,
    this.extractionService = const UnavailableGarmentExtractionService(),
  });

  final CaptureSessionController controller;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final PhotoAcquisitionPurpose purpose;
  final KioskGarmentIntent? garmentIntent;
  final GarmentExtractionService extractionService;

  @override
  State<CameraCaptureScreen> createState() => _CameraCaptureScreenState();
}

class _CameraCaptureScreenState extends State<CameraCaptureScreen> {
  bool _starting = true;
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
    return KioskScaffold(
      title: widget.purpose == PhotoAcquisitionPurpose.garment
          ? 'Garment Photo'
          : 'Camera Test',
      subtitle: widget.purpose == PhotoAcquisitionPurpose.garment
          ? '${widget.garmentIntent?.label ?? 'Garment'} reference'
          : '${widget.controller.captureScope.label} capture guidance',
      leading: IconButton(
        onPressed: () => Navigator.of(context).pop(),
        icon: const Icon(Icons.arrow_back),
      ),
      child: AnimatedBuilder(
        animation: Listenable.merge([
          widget.controller,
          widget.controller.cameraService.state,
        ]),
        builder: (context, _) {
          final cameraState = widget.controller.cameraService.state.value;
          final flowState = widget.controller.flowState;
          return LayoutBuilder(
            builder: (context, constraints) {
              final portrait =
                  constraints.maxHeight > constraints.maxWidth * 1.12;
              final compact =
                  constraints.maxWidth < 920 || constraints.maxHeight < 620;
              final preview = _PreviewPanel(
                starting: _starting,
                state: cameraState,
                preview: widget.controller.cameraService.buildPreview(context),
                onRetry: _start,
              );
              final guidancePanel = CaptureGuidancePanel(
                state: cameraState,
                flowState: flowState,
                readinessResult: widget.controller.readinessResult,
                onCapture: _capture,
                onRetry: _start,
                onCancelCountdown: widget.controller.cancelCountdown,
                onCaptureAnyway: widget.controller.captureAnyway,
              );

              if (portrait || compact) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(child: preview),
                    const SizedBox(height: 12),
                    guidancePanel,
                  ],
                );
              }

              return Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(flex: 3, child: preview),
                  const SizedBox(width: 24),
                  SizedBox(
                    width: 380,
                    child: Align(
                      alignment: Alignment.bottomCenter,
                      child: guidancePanel,
                    ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }

  Future<void> _capture() {
    return widget.controller.beginAssistedCapture();
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
        final route = widget.purpose == PhotoAcquisitionPurpose.garment
            ? MaterialPageRoute<void>(
                builder: (_) => GarmentReviewScreen(
                  captureController: widget.controller,
                  tryOnController: widget.tryOnController,
                  uploadController: widget.uploadController,
                  garmentInput: KioskGarmentInput(
                    source: KioskGarmentInputSource.capturedGarment,
                    localPath: capturePath,
                    intent:
                        widget.garmentIntent ?? KioskGarmentIntent.fullOutfit,
                    photoType: resolveGarmentReferenceProfile(
                      bodyContext: widget.controller.captureTargetMetadata,
                    ).photoType,
                  ),
                  pendingCameraCapture: true,
                  extractionService: widget.extractionService,
                ),
              )
            : MaterialPageRoute<void>(
                builder: (_) => CaptureReviewScreen(
                  controller: widget.controller,
                  tryOnController: widget.tryOnController,
                  uploadController: widget.uploadController,
                  extractionService: widget.extractionService,
                ),
              );
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
    return Card(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (showPreview)
              CameraPreviewViewport(state: state, preview: preview)
            else
              _CameraStateView(
                starting: starting,
                state: state,
                onRetry: onRetry,
              ),
          ],
        ),
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
    required this.onCapture,
    required this.onRetry,
    required this.onCancelCountdown,
    required this.onCaptureAnyway,
  });

  final CameraState state;
  final CaptureFlowState flowState;
  final CaptureReadinessResult? readinessResult;
  final VoidCallback onCapture;
  final VoidCallback onRetry;
  final VoidCallback onCancelCountdown;
  final VoidCallback onCaptureAnyway;

  @override
  Widget build(BuildContext context) {
    return _CaptureControls(
      state: state,
      flowState: flowState,
      readinessResult: readinessResult,
      onCapture: onCapture,
      onRetry: onRetry,
      onCancelCountdown: onCancelCountdown,
      onCaptureAnyway: onCaptureAnyway,
    );
  }
}

class _CaptureControls extends StatelessWidget {
  const _CaptureControls({
    required this.state,
    required this.flowState,
    required this.readinessResult,
    required this.onCapture,
    required this.onRetry,
    required this.onCancelCountdown,
    required this.onCaptureAnyway,
  });

  final CameraState state;
  final CaptureFlowState flowState;
  final CaptureReadinessResult? readinessResult;
  final VoidCallback onCapture;
  final VoidCallback onRetry;
  final VoidCallback onCancelCountdown;
  final VoidCallback onCaptureAnyway;

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
    final secondaryLabel = switch (stage) {
      CaptureFlowStage.countdown => 'Cancel',
      CaptureFlowStage.preparing when canCaptureAnyway => 'Try Again',
      _ => 'Retry Camera',
    };
    final primaryAction = switch (stage) {
      CaptureFlowStage.preparing when canCaptureAnyway => onCaptureAnyway,
      CaptureFlowStage.preview
          when state.canCapture && flowState.canBeginCapture =>
        onCapture,
      _ => null,
    };
    final secondaryAction = switch (stage) {
      CaptureFlowStage.countdown => onCancelCountdown,
      _ => onRetry,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (flowState.errorMessage != null) ...[
          Text(
            flowState.errorMessage!,
            textAlign: TextAlign.center,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
          const SizedBox(height: 10),
        ],
        Row(
          children: [
            Expanded(
              child: SelfxKioskButton(
                key: const Key('capture-photo'),
                label: primaryLabel,
                onPressed: primaryAction,
                icon: Icons.camera_alt_outlined,
                variant: SelfxKioskButtonVariant.primary,
                minHeight: 64,
                textAlign: TextAlign.center,
                mainAxisAlignment: MainAxisAlignment.center,
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 12,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: SelfxKioskButton(
                label: secondaryLabel,
                onPressed: secondaryAction,
                icon: isCountdown ? Icons.close : Icons.refresh,
                variant: SelfxKioskButtonVariant.secondary,
                minHeight: 64,
                textAlign: TextAlign.center,
                mainAxisAlignment: MainAxisAlignment.center,
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 12,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
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
      color: const Color(0xFF102A43),
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
                OutlinedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Retry'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
