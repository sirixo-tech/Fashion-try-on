import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../camera/camera_models.dart';
import '../live/capture_readiness_engine.dart';
import '../session/capture_flow.dart';
import '../session/capture_scope.dart';
import '../session/capture_session_controller.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import 'capture_review_screen.dart';
import 'kiosk_chrome.dart';

class CameraCaptureScreen extends StatefulWidget {
  const CameraCaptureScreen({
    super.key,
    required this.controller,
    required this.tryOnController,
  });

  final CaptureSessionController controller;
  final KioskTryOnSessionController tryOnController;

  @override
  State<CameraCaptureScreen> createState() => _CameraCaptureScreenState();
}

class _CameraCaptureScreenState extends State<CameraCaptureScreen> {
  bool _starting = true;
  String? _reviewCapturePath;

  @override
  void initState() {
    super.initState();
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
      title: 'Camera Test',
      subtitle: '${widget.controller.captureScope.label} capture guidance',
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
                scope: widget.controller.captureScope,
                preview: widget.controller.cameraService.buildPreview(context),
                onRetry: _start,
              );
              final guidancePanel = CaptureGuidancePanel(
                state: cameraState,
                flowState: flowState,
                scope: widget.controller.captureScope,
                readinessResult: widget.controller.readinessResult,
                onCapture: _capture,
                onRetry: _start,
                onCancelCountdown: widget.controller.cancelCountdown,
                onCaptureAnyway: widget.controller.captureAnyway,
                compact: compact || portrait,
              );

              if (portrait) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(flex: 8, child: preview),
                    const SizedBox(height: 18),
                    guidancePanel,
                  ],
                );
              }

              if (compact) {
                final previewHeight = math.max(
                  260.0,
                  math.min(430.0, constraints.maxWidth * 0.56),
                );
                return SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SizedBox(height: previewHeight, child: preview),
                      const SizedBox(height: 16),
                      guidancePanel,
                    ],
                  ),
                );
              }

              return Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(flex: 3, child: preview),
                  const SizedBox(width: 24),
                  SizedBox(width: 380, child: guidancePanel),
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
        await Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => CaptureReviewScreen(
              controller: widget.controller,
              tryOnController: widget.tryOnController,
            ),
          ),
        );
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
    required this.scope,
    required this.preview,
    required this.onRetry,
  });

  final bool starting;
  final CameraState state;
  final CaptureScope scope;
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
              FittedBox(
                fit: BoxFit.cover,
                child: SizedBox(width: 1280, height: 720, child: preview),
              )
            else
              _CameraStateView(
                starting: starting,
                state: state,
                onRetry: onRetry,
              ),
            IgnorePointer(
              child: CustomPaint(painter: _FramingGuidePainter(scope: scope)),
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
    required this.scope,
    required this.readinessResult,
    required this.onCapture,
    required this.onRetry,
    required this.onCancelCountdown,
    required this.onCaptureAnyway,
    required this.compact,
  });

  final CameraState state;
  final CaptureFlowState flowState;
  final CaptureScope scope;
  final CaptureReadinessResult? readinessResult;
  final VoidCallback onCapture;
  final VoidCallback onRetry;
  final VoidCallback onCancelCountdown;
  final VoidCallback onCaptureAnyway;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final active = _showsActiveGuidance(flowState.stage);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        StatusPill(label: _statusLabel(state.status), status: state.status),
        const SizedBox(height: 20),
        if (active)
          _ActiveGuidanceCard(
            flowState: flowState,
            readinessResult: readinessResult,
            onCancel: onCancelCountdown,
            onCaptureAnyway: onCaptureAnyway,
            onRetry: onRetry,
          )
        else
          _PreviewGuidanceCard(
            state: state,
            flowState: flowState,
            scope: scope,
            onCapture: onCapture,
            onRetry: onRetry,
          ),
        if (compact) const SizedBox(height: 20) else const Spacer(),
      ],
    );
  }

  bool _showsActiveGuidance(CaptureFlowStage stage) {
    return stage == CaptureFlowStage.preparing ||
        stage == CaptureFlowStage.countdown ||
        stage == CaptureFlowStage.capturing ||
        stage == CaptureFlowStage.analyzing;
  }
}

class _PreviewGuidanceCard extends StatelessWidget {
  const _PreviewGuidanceCard({
    required this.state,
    required this.flowState,
    required this.scope,
    required this.onCapture,
    required this.onRetry,
  });

  final CameraState state;
  final CaptureFlowState flowState;
  final CaptureScope scope;
  final VoidCallback onCapture;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '${scope.label} framing',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            Text(scope.guidance, style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 16),
            Text(
              state.capabilities.supportsLiveFrames
                  ? 'Live readiness will guide you before the final countdown.'
                  : 'Live readiness is unavailable on this camera, so SelfX will use timed guidance.',
            ),
            if (flowState.errorMessage != null) ...[
              const SizedBox(height: 18),
              Text(
                flowState.errorMessage!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 24),
            ElevatedButton.icon(
              key: const Key('capture-photo'),
              onPressed: state.canCapture && flowState.canBeginCapture
                  ? onCapture
                  : null,
              icon: const Icon(Icons.camera_alt_outlined),
              label: const Text('Take Photo'),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry Camera'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActiveGuidanceCard extends StatelessWidget {
  const _ActiveGuidanceCard({
    required this.flowState,
    required this.readinessResult,
    required this.onCancel,
    required this.onCaptureAnyway,
    required this.onRetry,
  });

  final CaptureFlowState flowState;
  final CaptureReadinessResult? readinessResult;
  final VoidCallback onCancel;
  final VoidCallback onCaptureAnyway;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final seconds = flowState.secondsRemaining;
    final isCountdown = flowState.stage == CaptureFlowStage.countdown;
    final isFinalThree =
        isCountdown && seconds != null && seconds <= 3 && seconds > 0;
    final numberText = seconds?.toString() ?? '';
    final message = switch (flowState.stage) {
      CaptureFlowStage.preparing => flowState.guidance.message,
      CaptureFlowStage.capturing => 'Capturing...',
      CaptureFlowStage.analyzing => 'Checking your photo...',
      _ => flowState.guidance.message,
    };

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (isCountdown)
              _CountdownDial(
                progress: flowState.countdownProgress,
                number: numberText,
                emphasized: isFinalThree,
              )
            else
              _CaptureBusyIndicator(stage: flowState.stage),
            const SizedBox(height: 24),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              transitionBuilder: (child, animation) {
                return FadeTransition(
                  opacity: animation,
                  child: ScaleTransition(
                    scale: Tween<double>(begin: 0.97, end: 1).animate(
                      CurvedAnimation(
                        parent: animation,
                        curve: Curves.easeOutCubic,
                      ),
                    ),
                    child: child,
                  ),
                );
              },
              child: Text(
                message,
                key: ValueKey(message),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: colorScheme.onSurface,
                  fontSize: isFinalThree ? 32 : 28,
                  height: 1.15,
                ),
              ),
            ),
            if (isCountdown) ...[
              const SizedBox(height: 28),
              OutlinedButton.icon(
                key: const Key('cancel-countdown'),
                onPressed: onCancel,
                icon: const Icon(Icons.close),
                label: const Text('Cancel'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(220, 60),
                ),
              ),
            ],
            if (readinessResult?.canCaptureAnyway == true &&
                flowState.stage == CaptureFlowStage.preparing) ...[
              const SizedBox(height: 28),
              OutlinedButton.icon(
                key: const Key('try-readiness-again'),
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Try Again'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(220, 60),
                ),
              ),
              const SizedBox(height: 14),
              ElevatedButton.icon(
                key: const Key('capture-anyway'),
                onPressed: onCaptureAnyway,
                icon: const Icon(Icons.camera_alt_outlined),
                label: const Text('Capture Anyway'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CaptureBusyIndicator extends StatelessWidget {
  const _CaptureBusyIndicator({required this.stage});

  final CaptureFlowStage stage;

  @override
  Widget build(BuildContext context) {
    final icon = stage == CaptureFlowStage.capturing
        ? Icons.camera_alt_outlined
        : Icons.image_search_outlined;
    final colorScheme = Theme.of(context).colorScheme;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.92, end: 1),
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) {
        return Transform.scale(scale: value, child: child);
      },
      child: Container(
        width: 160,
        height: 160,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: colorScheme.primaryContainer,
          border: Border.all(color: colorScheme.primary, width: 3),
        ),
        child: Icon(icon, color: colorScheme.onPrimaryContainer, size: 68),
      ),
    );
  }
}

class _CountdownDial extends StatelessWidget {
  const _CountdownDial({
    required this.progress,
    required this.number,
    required this.emphasized,
  });

  final double progress;
  final String number;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final size = emphasized ? 210.0 : 190.0;
    final colorScheme = Theme.of(context).colorScheme;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: progress),
      duration: const Duration(milliseconds: 240),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) {
        return SizedBox(
          width: size,
          height: size,
          child: CustomPaint(
            painter: _CountdownProgressPainter(
              progress: value,
              foregroundColor: colorScheme.primary,
              backgroundColor: colorScheme.outlineVariant,
            ),
            child: Center(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 180),
                transitionBuilder: (child, animation) {
                  return FadeTransition(
                    opacity: animation,
                    child: ScaleTransition(scale: animation, child: child),
                  );
                },
                child: Text(
                  number,
                  key: ValueKey(number),
                  style: TextStyle(
                    color: colorScheme.onSurface,
                    fontSize: emphasized ? 108 : 92,
                    fontWeight: FontWeight.w900,
                    height: 1,
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _CountdownProgressPainter extends CustomPainter {
  const _CountdownProgressPainter({
    required this.progress,
    required this.foregroundColor,
    required this.backgroundColor,
  });

  final double progress;
  final Color foregroundColor;
  final Color backgroundColor;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final background = Paint()
      ..color = backgroundColor
      ..strokeWidth = 9
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final foreground = Paint()
      ..color = foregroundColor
      ..strokeWidth = 11
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    canvas.drawArc(
      rect.deflate(8),
      -math.pi / 2,
      math.pi * 2,
      false,
      background,
    );
    canvas.drawArc(
      rect.deflate(8),
      -math.pi / 2,
      math.pi * 2 * progress,
      false,
      foreground,
    );
  }

  @override
  bool shouldRepaint(covariant _CountdownProgressPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.foregroundColor != foregroundColor ||
        oldDelegate.backgroundColor != backgroundColor;
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

class _FramingGuidePainter extends CustomPainter {
  const _FramingGuidePainter({required this.scope});

  final CaptureScope scope;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.82)
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke;
    final guide = _guideRect(size);
    canvas.drawRRect(_guideShape(guide), paint);
    final linePaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.32)
      ..strokeWidth = 1.5;
    canvas.drawLine(
      Offset(size.width / 2, guide.top),
      Offset(size.width / 2, guide.bottom),
      linePaint,
    );
    canvas.drawLine(
      Offset(guide.left, guide.center.dy),
      Offset(guide.right, guide.center.dy),
      linePaint,
    );
  }

  @override
  bool shouldRepaint(covariant _FramingGuidePainter oldDelegate) {
    return oldDelegate.scope != scope;
  }

  Rect _guideRect(Size size) {
    return switch (scope) {
      CaptureScope.top => Rect.fromCenter(
        center: Offset(size.width / 2, size.height * 0.42),
        width: size.width * 0.48,
        height: size.height * 0.46,
      ),
      CaptureScope.bottom => Rect.fromCenter(
        center: Offset(size.width / 2, size.height * 0.58),
        width: size.width * 0.46,
        height: size.height * 0.62,
      ),
      CaptureScope.fullBody => Rect.fromCenter(
        center: Offset(size.width / 2, size.height / 2),
        width: size.width * 0.42,
        height: size.height * 0.78,
      ),
    };
  }

  RRect _guideShape(Rect guide) {
    return switch (scope) {
      CaptureScope.top => RRect.fromRectAndRadius(
        guide,
        const Radius.circular(90),
      ),
      CaptureScope.bottom => RRect.fromRectAndRadius(
        guide,
        const Radius.circular(110),
      ),
      CaptureScope.fullBody => RRect.fromRectAndRadius(
        guide,
        const Radius.circular(140),
      ),
    };
  }
}

String _statusLabel(CameraStatus status) {
  return switch (status) {
    CameraStatus.idle => 'Idle',
    CameraStatus.discovering => 'Finding cameras',
    CameraStatus.noDevices => 'No camera detected',
    CameraStatus.initializing => 'Starting camera',
    CameraStatus.ready => 'Camera ready',
    CameraStatus.capturing => 'Capturing',
    CameraStatus.disconnected => 'Disconnected',
    CameraStatus.failed => 'Camera error',
    CameraStatus.disposed => 'Closed',
  };
}
