import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../camera/camera_models.dart';
import '../session/capture_flow.dart';
import '../session/capture_session_controller.dart';
import 'capture_review_screen.dart';
import 'kiosk_chrome.dart';

class CameraCaptureScreen extends StatefulWidget {
  const CameraCaptureScreen({super.key, required this.controller});

  final CaptureSessionController controller;

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
      subtitle: 'Static framing guide. No live body detection.',
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
                onCapture: _capture,
                onRetry: _start,
                onCancelCountdown: widget.controller.cancelCountdown,
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
            builder: (_) => CaptureReviewScreen(controller: widget.controller),
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
            IgnorePointer(child: CustomPaint(painter: _FramingGuidePainter())),
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
    required this.onCapture,
    required this.onRetry,
    required this.onCancelCountdown,
    required this.compact,
  });

  final CameraState state;
  final CaptureFlowState flowState;
  final VoidCallback onCapture;
  final VoidCallback onRetry;
  final VoidCallback onCancelCountdown;
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
          _ActiveGuidanceCard(flowState: flowState, onCancel: onCancelCountdown)
        else
          _PreviewGuidanceCard(
            state: state,
            flowState: flowState,
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
    required this.onCapture,
    required this.onRetry,
  });

  final CameraState state;
  final CaptureFlowState flowState;
  final VoidCallback onCapture;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final guidance = captureGuidanceForCategory('AUTO');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Framing', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            Text(guidance, style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 16),
            const Text('Keep the subject centered inside the guide.'),
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
  const _ActiveGuidanceCard({required this.flowState, required this.onCancel});

  final CaptureFlowState flowState;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final seconds = flowState.secondsRemaining;
    final isCountdown = flowState.stage == CaptureFlowStage.countdown;
    final isFinalThree =
        isCountdown && seconds != null && seconds <= 3 && seconds > 0;
    final numberText = seconds?.toString() ?? '';
    final message = switch (flowState.stage) {
      CaptureFlowStage.preparing => 'Get ready',
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
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.82)
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke;
    final guide = Rect.fromCenter(
      center: Offset(size.width / 2, size.height / 2),
      width: size.width * 0.42,
      height: size.height * 0.78,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(guide, const Radius.circular(140)),
      paint,
    );
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
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
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
