import 'package:flutter/material.dart';

import '../acquisition/photo_acquisition.dart';
import '../camera/camera_models.dart';
import '../camera/camera_preview_viewport.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../live/capture_readiness_engine.dart';
import '../session/capture_flow.dart';
import '../session/capture_scope.dart';
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
              if (_showFramingGuide(cameraState, flowState))
                Positioned.fill(
                  child: IgnorePointer(
                    child: CaptureFramingGuideOverlay(
                      purpose: widget.purpose,
                      captureScope: widget.controller.captureScope,
                    ),
                  ),
                ),
              if (flowState.stage == CaptureFlowStage.countdown &&
                  flowState.secondsRemaining != null)
                Positioned.fill(
                  child: IgnorePointer(
                    child: CaptureCountdownOverlay(
                      secondsRemaining: flowState.secondsRemaining!,
                      guidance: flowState.guidance.message,
                      progress: flowState.countdownProgress,
                    ),
                  ),
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
    if (widget.tryOnController.garmentPreviewEnabled) {
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

bool _showFramingGuide(CameraState cameraState, CaptureFlowState flowState) {
  final cameraIsLive =
      cameraState.status == CameraStatus.ready ||
      cameraState.status == CameraStatus.capturing;
  final captureIsFraming =
      flowState.stage == CaptureFlowStage.preview ||
      flowState.stage == CaptureFlowStage.preparing ||
      flowState.stage == CaptureFlowStage.countdown;
  return cameraIsLive && captureIsFraming;
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

class CaptureFramingGuideOverlay extends StatelessWidget {
  const CaptureFramingGuideOverlay({
    super.key,
    required this.purpose,
    required this.captureScope,
  });

  final PhotoAcquisitionPurpose purpose;
  final CaptureScope captureScope;

  @override
  Widget build(BuildContext context) {
    final title = purpose == PhotoAcquisitionPurpose.garment
        ? 'Garment guide'
        : switch (captureScope) {
            CaptureScope.top => 'Upper body guide',
            CaptureScope.bottom => 'Lower body guide',
            CaptureScope.fullBody => 'Full body guide',
          };
    final message = purpose == PhotoAcquisitionPurpose.garment
        ? 'Keep the garment inside the frame'
        : switch (captureScope) {
            CaptureScope.top => 'Frame head, shoulders and torso',
            CaptureScope.bottom => 'Frame waist, legs and feet',
            CaptureScope.fullBody => 'Frame shoulders to feet',
          };
    final icon = purpose == PhotoAcquisitionPurpose.garment
        ? Icons.checkroom_outlined
        : switch (captureScope) {
            CaptureScope.top => Icons.accessibility_new_outlined,
            CaptureScope.bottom => Icons.directions_walk_outlined,
            CaptureScope.fullBody => Icons.person_outline,
          };

    return LayoutBuilder(
      builder: (context, constraints) {
        final layout = KioskLayoutMetrics.fromConstraints(constraints);
        final bottomPadding = layout.scaled(
          126,
          small: 104,
          large: 148,
          extraLarge: 174,
        );
        final horizontalPadding = layout.scaled(
          34,
          small: 18,
          large: 46,
          extraLarge: 58,
        );
        final topPadding = layout.scaled(
          34,
          small: 18,
          large: 44,
          extraLarge: 58,
        );
        final contentSize = Size(
          (constraints.maxWidth - (horizontalPadding * 2))
              .clamp(1, constraints.maxWidth)
              .toDouble(),
          (constraints.maxHeight - topPadding - bottomPadding)
              .clamp(1, constraints.maxHeight)
              .toDouble(),
        );
        final guideRect = _framingGuideRect(
          contentSize,
          purpose: purpose,
          captureScope: captureScope,
        );

        return Padding(
          padding: EdgeInsets.fromLTRB(
            horizontalPadding,
            topPadding,
            horizontalPadding,
            bottomPadding,
          ),
          child: Stack(
            key: const Key('camera-framing-guide'),
            fit: StackFit.expand,
            children: [
              CustomPaint(
                painter: _FramingGuidePainter(
                  purpose: purpose,
                  captureScope: captureScope,
                ),
              ),
              Positioned(
                left: guideRect.left.clamp(0, contentSize.width - 1).toDouble(),
                right: (contentSize.width - guideRect.right)
                    .clamp(0, contentSize.width - 1)
                    .toDouble(),
                top: (guideRect.top - layout.scaled(70, small: 58))
                    .clamp(0, contentSize.height - 1)
                    .toDouble(),
                child: Center(
                  child: _FramingGuideLabel(
                    icon: icon,
                    title: title,
                    message: message,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _FramingGuideLabel extends StatelessWidget {
  const _FramingGuideLabel({
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final layout = KioskLayoutMetrics.fromSize(MediaQuery.sizeOf(context));
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.48),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.18),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: layout.scaled(14, small: 11, large: 17, extraLarge: 20),
          vertical: layout.scaled(9, small: 7, large: 11, extraLarge: 13),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              color: SelfxKioskTokens.secondary,
              size: layout.scaled(20, small: 17, large: 23, extraLarge: 27),
            ),
            const SizedBox(width: 9),
            Flexible(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    key: const Key('camera-framing-guide-label'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Colors.white,
                      fontFamily: SelfxKioskTokens.bodyFontFamily,
                      fontSize: layout.scaled(
                        16,
                        small: 13,
                        large: 18,
                        extraLarge: 21,
                      ),
                      fontWeight: FontWeight.w900,
                      height: 1.05,
                      letterSpacing: 0,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    message,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.86),
                      fontFamily: SelfxKioskTokens.bodyFontFamily,
                      fontSize: layout.scaled(
                        12,
                        small: 10,
                        large: 14,
                        extraLarge: 16,
                      ),
                      fontWeight: FontWeight.w800,
                      height: 1.05,
                      letterSpacing: 0,
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

class _FramingGuidePainter extends CustomPainter {
  const _FramingGuidePainter({
    required this.purpose,
    required this.captureScope,
  });

  final PhotoAcquisitionPurpose purpose;
  final CaptureScope captureScope;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = _framingGuideRect(
      size,
      purpose: purpose,
      captureScope: captureScope,
    );
    final rrect = RRect.fromRectAndRadius(rect, const Radius.circular(28));
    final whitePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.4
      ..color = Colors.white.withValues(alpha: 0.76);
    final orangePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..color = SelfxKioskTokens.primary.withValues(alpha: 0.92);

    canvas.drawRRect(rrect, whitePaint);
    _drawGuideCorners(canvas, rect, orangePaint);

    final innerPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..color = Colors.white.withValues(alpha: 0.54);

    if (purpose == PhotoAcquisitionPurpose.garment) {
      _drawGarmentGuide(canvas, rect, innerPaint);
    } else {
      _drawPersonGuide(canvas, rect, innerPaint, captureScope);
    }
  }

  @override
  bool shouldRepaint(covariant _FramingGuidePainter oldDelegate) {
    return oldDelegate.purpose != purpose ||
        oldDelegate.captureScope != captureScope;
  }
}

Rect _framingGuideRect(
  Size size, {
  required PhotoAcquisitionPurpose purpose,
  required CaptureScope captureScope,
}) {
  final widthFactor = purpose == PhotoAcquisitionPurpose.garment
      ? 0.72
      : switch (captureScope) {
          CaptureScope.top => 0.64,
          CaptureScope.bottom => 0.62,
          CaptureScope.fullBody => 0.58,
        };
  final heightFactor = purpose == PhotoAcquisitionPurpose.garment
      ? 0.48
      : switch (captureScope) {
          CaptureScope.top => 0.56,
          CaptureScope.bottom => 0.72,
          CaptureScope.fullBody => 0.84,
        };
  final centerYFactor = purpose == PhotoAcquisitionPurpose.garment
      ? 0.48
      : switch (captureScope) {
          CaptureScope.top => 0.43,
          CaptureScope.bottom => 0.52,
          CaptureScope.fullBody => 0.52,
        };

  final guideWidth = size.width * widthFactor;
  final guideHeight = size.height * heightFactor;
  final left = (size.width - guideWidth) / 2;
  final top = (size.height * centerYFactor) - (guideHeight / 2);
  return Rect.fromLTWH(
    left,
    top.clamp(0, size.height - guideHeight).toDouble(),
    guideWidth,
    guideHeight,
  );
}

void _drawGuideCorners(Canvas canvas, Rect rect, Paint paint) {
  final corner = (rect.shortestSide * 0.22).clamp(34.0, 78.0);
  final path = Path()
    ..moveTo(rect.left, rect.top + corner)
    ..lineTo(rect.left, rect.top)
    ..lineTo(rect.left + corner, rect.top)
    ..moveTo(rect.right - corner, rect.top)
    ..lineTo(rect.right, rect.top)
    ..lineTo(rect.right, rect.top + corner)
    ..moveTo(rect.right, rect.bottom - corner)
    ..lineTo(rect.right, rect.bottom)
    ..lineTo(rect.right - corner, rect.bottom)
    ..moveTo(rect.left + corner, rect.bottom)
    ..lineTo(rect.left, rect.bottom)
    ..lineTo(rect.left, rect.bottom - corner);
  canvas.drawPath(path, paint);
}

void _drawGarmentGuide(Canvas canvas, Rect rect, Paint paint) {
  final center = rect.center;
  final hangerTop = Offset(center.dx, rect.top + rect.height * 0.22);
  final hangerLeft = Offset(
    rect.left + rect.width * 0.34,
    rect.top + rect.height * 0.34,
  );
  final hangerRight = Offset(
    rect.right - rect.width * 0.34,
    rect.top + rect.height * 0.34,
  );
  final garmentTop = rect.top + rect.height * 0.38;
  final garmentBottom = rect.bottom - rect.height * 0.18;
  final garmentLeft = rect.left + rect.width * 0.28;
  final garmentRight = rect.right - rect.width * 0.28;
  final garmentPath = Path()
    ..moveTo(hangerLeft.dx, hangerLeft.dy)
    ..quadraticBezierTo(
      hangerTop.dx,
      hangerTop.dy,
      hangerRight.dx,
      hangerRight.dy,
    )
    ..moveTo(garmentLeft, garmentTop)
    ..lineTo(rect.left + rect.width * 0.18, garmentTop + rect.height * 0.08)
    ..lineTo(rect.left + rect.width * 0.25, garmentTop + rect.height * 0.2)
    ..lineTo(garmentLeft, garmentTop + rect.height * 0.15)
    ..lineTo(garmentLeft, garmentBottom)
    ..lineTo(garmentRight, garmentBottom)
    ..lineTo(garmentRight, garmentTop + rect.height * 0.15)
    ..lineTo(rect.right - rect.width * 0.25, garmentTop + rect.height * 0.2)
    ..lineTo(rect.right - rect.width * 0.18, garmentTop + rect.height * 0.08)
    ..lineTo(garmentRight, garmentTop);
  canvas.drawPath(garmentPath, paint);
}

void _drawPersonGuide(
  Canvas canvas,
  Rect rect,
  Paint paint,
  CaptureScope scope,
) {
  final centerX = rect.center.dx;
  final headRadius = rect.width * (scope == CaptureScope.top ? 0.12 : 0.095);
  final headCenter = Offset(centerX, rect.top + rect.height * 0.15);
  canvas.drawCircle(headCenter, headRadius, paint);

  final shoulderY = rect.top + rect.height * 0.3;
  final waistY =
      rect.top + rect.height * (scope == CaptureScope.top ? 0.66 : 0.48);
  final hipY =
      rect.top + rect.height * (scope == CaptureScope.top ? 0.82 : 0.58);
  final bodyPath = Path()
    ..moveTo(rect.left + rect.width * 0.28, shoulderY)
    ..quadraticBezierTo(
      centerX,
      shoulderY - rect.height * 0.05,
      rect.right - rect.width * 0.28,
      shoulderY,
    )
    ..moveTo(rect.left + rect.width * 0.32, shoulderY)
    ..lineTo(rect.left + rect.width * 0.38, waistY)
    ..lineTo(rect.left + rect.width * 0.34, hipY)
    ..moveTo(rect.right - rect.width * 0.32, shoulderY)
    ..lineTo(rect.right - rect.width * 0.38, waistY)
    ..lineTo(rect.right - rect.width * 0.34, hipY);
  canvas.drawPath(bodyPath, paint);

  if (scope == CaptureScope.top) {
    return;
  }

  final footY = rect.bottom - rect.height * 0.07;
  final leftHip = Offset(rect.left + rect.width * 0.43, hipY);
  final rightHip = Offset(rect.right - rect.width * 0.43, hipY);
  final leftKnee = Offset(
    rect.left + rect.width * 0.39,
    rect.top + rect.height * 0.74,
  );
  final rightKnee = Offset(
    rect.right - rect.width * 0.39,
    rect.top + rect.height * 0.74,
  );
  final leftFoot = Offset(rect.left + rect.width * 0.34, footY);
  final rightFoot = Offset(rect.right - rect.width * 0.34, footY);
  final legPath = Path()
    ..moveTo(leftHip.dx, leftHip.dy)
    ..lineTo(leftKnee.dx, leftKnee.dy)
    ..lineTo(leftFoot.dx, leftFoot.dy)
    ..moveTo(rightHip.dx, rightHip.dy)
    ..lineTo(rightKnee.dx, rightKnee.dy)
    ..lineTo(rightFoot.dx, rightFoot.dy);
  canvas.drawPath(legPath, paint);
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
      CaptureFlowStage.countdown => 'Hold Still',
      CaptureFlowStage.capturing => 'Capturing',
      CaptureFlowStage.analyzing => 'Checking Photo',
      _ => 'Capture',
    };
    final primaryAction = switch (stage) {
      CaptureFlowStage.preparing when canCaptureAnyway => onCaptureAnyway,
      CaptureFlowStage.preview
          when state.canCapture && flowState.canBeginCapture =>
        onCapture,
      _ => null,
    };
    final leftAction = isCountdown ? onCancelCountdown : onBack;
    final leftIcon = isCountdown ? Icons.close : Icons.arrow_back;
    final leftLabel = isCountdown ? 'Cancel' : 'Back';
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
                        label: leftLabel,
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
                        icon: _captureIconFor(stage, canCaptureAnyway),
                        centerText: null,
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
                        label: 'Flip',
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

class CaptureCountdownOverlay extends StatelessWidget {
  const CaptureCountdownOverlay({
    super.key,
    required this.secondsRemaining,
    required this.guidance,
    required this.progress,
  });

  final int secondsRemaining;
  final String guidance;
  final double progress;

  @override
  Widget build(BuildContext context) {
    final layout = KioskLayoutMetrics.fromSize(MediaQuery.sizeOf(context));
    final badgeSize = layout.scaled(
      178,
      small: 136,
      large: 210,
      extraLarge: 250,
    );
    final numberSize = layout.scaled(
      96,
      small: 74,
      large: 120,
      extraLarge: 146,
    );
    final textWidth = layout.scaled(
      330,
      small: 250,
      large: 410,
      extraLarge: 500,
    );
    final alignment = layout.portrait
        ? const Alignment(0, -0.34)
        : const Alignment(0, -0.08);

    return SafeArea(
      bottom: false,
      child: Align(
        alignment: alignment,
        child: Semantics(
          key: const Key('camera-countdown-overlay'),
          label: 'Photo in $secondsRemaining seconds. $guidance.',
          liveRegion: true,
          child: TweenAnimationBuilder<double>(
            key: ValueKey<int>(secondsRemaining),
            tween: Tween<double>(begin: 0.92, end: 1),
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutBack,
            builder: (context, scale, child) {
              return Transform.scale(scale: scale, child: child);
            },
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox.square(
                  dimension: badgeSize,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.black.withValues(alpha: 0.48),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.32),
                            width: 2,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.28),
                              blurRadius: 30,
                              offset: const Offset(0, 14),
                            ),
                          ],
                        ),
                      ),
                      CircularProgressIndicator(
                        value: progress.clamp(0, 1),
                        strokeWidth: layout.scaled(
                          7,
                          small: 5,
                          large: 8,
                          extraLarge: 10,
                        ),
                        backgroundColor: Colors.white.withValues(alpha: 0.2),
                        valueColor: const AlwaysStoppedAnimation<Color>(
                          SelfxKioskTokens.primary,
                        ),
                      ),
                      Center(
                        child: Text(
                          '$secondsRemaining',
                          key: const Key('camera-countdown-number'),
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: numberSize,
                            fontWeight: FontWeight.w900,
                            height: 0.92,
                            letterSpacing: 0,
                            shadows: [
                              Shadow(
                                color: Colors.black.withValues(alpha: 0.34),
                                blurRadius: 14,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: textWidth),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.44),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.2),
                      ),
                    ),
                    child: Padding(
                      padding: EdgeInsets.symmetric(
                        horizontal: layout.scaled(
                          18,
                          small: 14,
                          large: 22,
                          extraLarge: 26,
                        ),
                        vertical: layout.scaled(
                          9,
                          small: 7,
                          large: 10,
                          extraLarge: 12,
                        ),
                      ),
                      child: Text(
                        guidance,
                        key: const Key('camera-countdown-guidance'),
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: layout.scaled(
                            24,
                            small: 18,
                            large: 28,
                            extraLarge: 34,
                          ),
                          fontWeight: FontWeight.w900,
                          height: 1.08,
                          letterSpacing: 0,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
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
        child: SizedBox(
          height: dimension,
          width: dimension * 2.35,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(
                SelfxKioskTokens.buttonRadius,
              ),
              gradient: onPressed == null
                  ? null
                  : const LinearGradient(
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                      colors: [
                        SelfxKioskTokens.primaryGradientStart,
                        SelfxKioskTokens.primaryGradientEnd,
                      ],
                    ),
            ),
            child: FilledButton(
              onPressed: onPressed,
              style: FilledButton.styleFrom(
                backgroundColor: onPressed == null
                    ? SelfxKioskTokens.primaryGradientStart.withValues(
                        alpha: 0.42,
                      )
                    : Colors.transparent,
                foregroundColor: SelfxKioskTokens.onPrimary,
                disabledBackgroundColor: SelfxKioskTokens.primaryGradientStart
                    .withValues(alpha: 0.42),
                disabledForegroundColor: SelfxKioskTokens.onPrimary.withValues(
                  alpha: 0.72,
                ),
                shadowColor: Colors.transparent,
                padding: EdgeInsets.zero,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(
                    SelfxKioskTokens.buttonRadius,
                  ),
                ),
              ),
              child: centerText != null
                  ? Text(
                      centerText!,
                      style: Theme.of(context).textTheme.headlineMedium
                          ?.copyWith(
                            color: SelfxKioskTokens.onPrimary,
                            fontWeight: FontWeight.w900,
                          ),
                    )
                  : FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(icon, size: dimension * 0.34),
                            const SizedBox(width: 8),
                            Text(
                              label,
                              style: Theme.of(context).textTheme.labelLarge
                                  ?.copyWith(
                                    color: SelfxKioskTokens.onPrimary,
                                    fontWeight: FontWeight.w900,
                                  ),
                            ),
                          ],
                        ),
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CameraRailButton extends StatelessWidget {
  const _CameraRailButton({
    super.key,
    required this.label,
    required this.icon,
    required this.dimension,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final double dimension;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: label,
      child: SizedBox(
        height: dimension,
        child: OutlinedButton.icon(
          onPressed: onPressed,
          icon: Icon(icon, size: dimension * 0.34),
          label: Text(label),
          style: OutlinedButton.styleFrom(
            foregroundColor: SelfxKioskTokens.onSecondary,
            disabledForegroundColor: SelfxKioskTokens.onSecondary.withValues(
              alpha: 0.68,
            ),
            backgroundColor: SelfxKioskTokens.secondary,
            disabledBackgroundColor: SelfxKioskTokens.secondary.withValues(
              alpha: 0.42,
            ),
            side: const BorderSide(color: SelfxKioskTokens.secondary),
            shape: const StadiumBorder(),
            padding: EdgeInsets.symmetric(horizontal: dimension * 0.34),
            textStyle: Theme.of(
              context,
            ).textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w800),
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
                    backgroundColor: SelfxKioskTokens.primaryGradientStart,
                    foregroundColor: SelfxKioskTokens.onPrimary,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 34,
                      vertical: 16,
                    ),
                    textStyle: Theme.of(context).textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(
                        SelfxKioskTokens.buttonRadius,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
