import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../acquisition/photo_acquisition.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../session/capture_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_try_on_models.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'camera_capture_screen.dart';
import 'capture_review_screen.dart';
import 'browse_products_screen.dart';
import 'kiosk_chrome.dart';
import 'try_on_result_screen.dart';

class TryOnGenerationScreen extends StatefulWidget {
  const TryOnGenerationScreen({
    super.key,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
    this.catalogGateway = const UnavailableKioskCatalogGateway(),
    this.extractionService = const UnavailableGarmentExtractionService(),
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final GarmentExtractionService extractionService;

  @override
  State<TryOnGenerationScreen> createState() => _TryOnGenerationScreenState();
}

class _TryOnGenerationScreenState extends State<TryOnGenerationScreen>
    with SingleTickerProviderStateMixin {
  bool _submitted = false;
  bool _navigatedToResult = false;
  late final AnimationController _motionController;

  @override
  void initState() {
    super.initState();
    _motionController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2600),
    )..repeat();
    widget.tryOnController.addListener(_handleTryOnChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_submitted) {
        _submitted = true;
        widget.tryOnController.submitFromCapture(widget.captureController);
      }
    });
  }

  @override
  void dispose() {
    _motionController.dispose();
    widget.tryOnController.removeListener(_handleTryOnChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'Creating Try-On',
      subtitle: 'Generating securely through SelfX',
      leading: IconButton(
        onPressed: () => Navigator.of(context).maybePop(),
        icon: const Icon(Icons.arrow_back),
      ),
      child: AnimatedBuilder(
        animation: widget.tryOnController,
        builder: (context, _) {
          final status = widget.tryOnController.status;
          final failed =
              status == KioskTryOnStatus.failed ||
              status == KioskTryOnStatus.timedOut;
          final compatibilityFailure =
              widget.tryOnController.failureCode ==
              KioskTryOnFailureCode.modelImageIncompatibleWithGarment;
          final garmentResolutionFailure =
              widget.tryOnController.failureCode ==
              KioskTryOnFailureCode.garmentIntentUnresolved;
          final progress = _progressFor(status);
          final personImagePath = _personImagePath(widget.captureController);
          final garmentInput = widget.tryOnController.garmentInput;
          final garmentImagePath = _garmentImagePath(garmentInput);
          return LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 980),
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.all(28),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (failed)
                                Icon(
                                  Icons.error_outline,
                                  size: 78,
                                  color: Theme.of(context).colorScheme.error,
                                )
                              else if (_canShowInputPreview(
                                personImagePath,
                                garmentImagePath,
                              ))
                                _GenerationInputPreview(
                                  personImagePath: personImagePath!,
                                  garmentImagePath: garmentImagePath!,
                                  garmentName:
                                      garmentInput?.displayName ?? 'Garment',
                                  animation: _motionController,
                                )
                              else
                                _TryOnMotionGraphic(
                                  animation: _motionController,
                                ),
                              const SizedBox(height: 22),
                              Text(
                                failed
                                    ? widget.tryOnController.customerTitle ??
                                          'Try-On needs attention'
                                    : _titleFor(status),
                                style: Theme.of(context).textTheme.displaySmall,
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 14),
                              Text(
                                widget.tryOnController.customerMessage ??
                                    'Preparing your look',
                                style: Theme.of(context).textTheme.bodyLarge,
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 28),
                              if (!failed) ...[
                                _GenerationProgressBar(progress: progress),
                                const SizedBox(height: 18),
                                AnimatedSwitcher(
                                  duration: const Duration(milliseconds: 220),
                                  child: Text(
                                    _stageFor(status),
                                    key: ValueKey<double>(progress),
                                    textAlign: TextAlign.center,
                                    style: Theme.of(context)
                                        .textTheme
                                        .headlineSmall
                                        ?.copyWith(
                                          color: Theme.of(
                                            context,
                                          ).colorScheme.primary,
                                          fontWeight: FontWeight.w900,
                                        ),
                                  ),
                                ),
                              ] else if (garmentResolutionFailure) ...[
                                ElevatedButton.icon(
                                  key: const Key('try-on-retake-garment-photo'),
                                  onPressed: () =>
                                      _chooseAnotherGarment(context),
                                  icon: const Icon(Icons.camera_alt_outlined),
                                  label: const Text('Retake Garment Photo'),
                                ),
                                const SizedBox(height: 14),
                                ElevatedButton.icon(
                                  key: const Key('try-on-browse-catalog'),
                                  onPressed: () => _browseCatalog(context),
                                  icon: const Icon(Icons.shopping_bag_outlined),
                                  label: const Text('Browse Catalog'),
                                ),
                              ] else if (compatibilityFailure) ...[
                                ElevatedButton.icon(
                                  key: const Key('try-on-update-photo'),
                                  onPressed: () => _retakePhoto(context),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: SelfxKioskTokens.secondary,
                                    foregroundColor:
                                        SelfxKioskTokens.onSecondary,
                                    side: const BorderSide(
                                      color: SelfxKioskTokens.secondary,
                                    ),
                                  ),
                                  icon: const Icon(Icons.photo_camera_outlined),
                                  label: const Text('Update My Photo'),
                                ),
                                const SizedBox(height: 14),
                                ElevatedButton.icon(
                                  key: const Key('try-on-choose-category'),
                                  onPressed: () =>
                                      _chooseAnotherGarment(context),
                                  icon: const Icon(Icons.checkroom_outlined),
                                  label: const Text('Choose Another Category'),
                                ),
                              ] else ...[
                                ElevatedButton.icon(
                                  key: const Key('try-on-retry-polling'),
                                  onPressed: widget.tryOnController.run != null
                                      ? widget.tryOnController.retryPolling
                                      : () => widget.tryOnController
                                            .submitFromCapture(
                                              widget.captureController,
                                            ),
                                  icon: const Icon(Icons.refresh),
                                  label: const Text('Try Again'),
                                ),
                                const SizedBox(height: 14),
                                ElevatedButton.icon(
                                  key: const Key('try-on-retake-photo'),
                                  onPressed: () => _retakePhoto(context),
                                  icon: const Icon(Icons.replay),
                                  label: const Text('Retake Photo'),
                                ),
                                const SizedBox(height: 14),
                                ElevatedButton.icon(
                                  key: const Key('try-on-choose-garment'),
                                  onPressed: () =>
                                      _chooseAnotherGarment(context),
                                  icon: const Icon(Icons.checkroom_outlined),
                                  label: const Text('Try Another Garment'),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  void _handleTryOnChanged() {
    final result = widget.tryOnController.result;
    if (result == null || _navigatedToResult || !mounted) {
      return;
    }
    _navigatedToResult = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => TryOnResultScreen(
            captureController: widget.captureController,
            tryOnController: widget.tryOnController,
            uploadController: widget.uploadController,
            catalogGateway: widget.catalogGateway,
            extractionService: widget.extractionService,
          ),
        ),
      );
    });
  }

  Future<void> _retakePhoto(BuildContext context) async {
    await widget.tryOnController.retakePhoto(widget.captureController);
    if (!context.mounted) {
      return;
    }
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => CameraCaptureScreen(
          controller: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          extractionService: widget.extractionService,
          purpose: PhotoAcquisitionPurpose.model,
        ),
      ),
      (route) => route.isFirst,
    );
  }

  Future<void> _chooseAnotherGarment(BuildContext context) async {
    widget.tryOnController.tryAnotherGarment();
    if (!context.mounted) {
      return;
    }
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => CaptureReviewScreen(
          controller: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          extractionService: widget.extractionService,
        ),
      ),
      (route) => route.isFirst,
    );
  }

  Future<void> _browseCatalog(BuildContext context) async {
    widget.tryOnController.tryAnotherGarment();
    if (!context.mounted) {
      return;
    }
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => BrowseProductsScreen(
          captureController: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          extractionService: widget.extractionService,
        ),
      ),
      (route) => route.isFirst,
    );
  }
}

String _titleFor(KioskTryOnStatus status) {
  return switch (status) {
    KioskTryOnStatus.preparing => 'Preparing your look',
    KioskTryOnStatus.uploading => 'Uploading securely',
    KioskTryOnStatus.queued => 'Creating your Try-On',
    KioskTryOnStatus.processing => 'Generating your look',
    KioskTryOnStatus.succeeded => 'Finishing',
    _ => 'Preparing your look',
  };
}

double _progressFor(KioskTryOnStatus status) {
  return switch (status) {
    KioskTryOnStatus.idle => 0.06,
    KioskTryOnStatus.preparing => 0.18,
    KioskTryOnStatus.uploading => 0.34,
    KioskTryOnStatus.queued => 0.52,
    KioskTryOnStatus.processing => 0.78,
    KioskTryOnStatus.succeeded => 1,
    _ => 0.06,
  };
}

String _stageFor(KioskTryOnStatus status) {
  return switch (status) {
    KioskTryOnStatus.preparing => 'Preparing your photo',
    KioskTryOnStatus.uploading => 'Analyzing garment',
    KioskTryOnStatus.queued => 'Generating your look',
    KioskTryOnStatus.processing => 'Finalizing details',
    KioskTryOnStatus.succeeded => 'Almost ready',
    _ => 'Preparing your photo',
  };
}

String? _personImagePath(CaptureSessionController controller) {
  return controller.acceptedPersonPhoto?.capture.originalPath ??
      controller.acceptedCapture?.originalPath ??
      controller.capture?.originalPath;
}

String? _garmentImagePath(KioskGarmentInput? input) {
  if (input == null) {
    return null;
  }
  final previewPath = input.previewPath.trim();
  if (previewPath.isNotEmpty) {
    return previewPath;
  }
  final remote = input.remoteImageUrl?.trim();
  return remote == null || remote.isEmpty ? null : remote;
}

bool _canShowInputPreview(String? personImagePath, String? garmentImagePath) {
  return personImagePath != null &&
      personImagePath.trim().isNotEmpty &&
      garmentImagePath != null &&
      garmentImagePath.trim().isNotEmpty;
}

class _GenerationInputPreview extends StatelessWidget {
  const _GenerationInputPreview({
    required this.personImagePath,
    required this.garmentImagePath,
    required this.garmentName,
    required this.animation,
  });

  final String personImagePath;
  final String garmentImagePath;
  final String garmentName;
  final Animation<double> animation;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final stacked = constraints.maxWidth < 660;
        final preview = stacked
            ? Column(
                children: [
                  _InputImageCard(
                    label: 'Your photo',
                    imagePath: personImagePath,
                    tilt: -0.015,
                  ),
                  const SizedBox(height: 14),
                  _CombiningPulse(animation: animation, compact: true),
                  const SizedBox(height: 14),
                  _InputImageCard(
                    label: garmentName,
                    imagePath: garmentImagePath,
                    tilt: 0.015,
                  ),
                ],
              )
            : Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: _InputImageCard(
                      label: 'Your photo',
                      imagePath: personImagePath,
                      tilt: -0.025,
                    ),
                  ),
                  SizedBox(
                    width: 112,
                    child: _CombiningPulse(animation: animation),
                  ),
                  Expanded(
                    child: _InputImageCard(
                      label: garmentName,
                      imagePath: garmentImagePath,
                      tilt: 0.025,
                    ),
                  ),
                ],
              );
        return ConstrainedBox(
          constraints: BoxConstraints(maxHeight: stacked ? 520 : 330),
          child: preview,
        );
      },
    );
  }
}

class _InputImageCard extends StatelessWidget {
  const _InputImageCard({
    required this.label,
    required this.imagePath,
    required this.tilt,
  });

  final String label;
  final String imagePath;
  final double tilt;

  @override
  Widget build(BuildContext context) {
    return Transform.rotate(
      angle: tilt,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFFE7EEF8)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x1A102033),
              blurRadius: 22,
              offset: Offset(0, 12),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: AspectRatio(
                  aspectRatio: 0.78,
                  child: ColoredBox(
                    color: SelfxKioskTokens.background,
                    child: _GenerationPreviewImage(imagePath: imagePath),
                  ),
                ),
              ),
              const SizedBox(height: 9),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: SelfxKioskTokens.textMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GenerationPreviewImage extends StatelessWidget {
  const _GenerationPreviewImage({required this.imagePath});

  final String imagePath;

  @override
  Widget build(BuildContext context) {
    final uri = Uri.tryParse(imagePath);
    if (uri != null && (uri.scheme == 'http' || uri.scheme == 'https')) {
      return Image.network(
        imagePath,
        fit: BoxFit.contain,
        errorBuilder: (_, _, _) => _placeholder(),
      );
    }
    final file = File(imagePath);
    if (file.existsSync()) {
      return Image.file(
        file,
        fit: BoxFit.contain,
        errorBuilder: (_, _, _) => _placeholder(),
      );
    }
    return _placeholder();
  }

  Widget _placeholder() {
    return const Center(child: Icon(Icons.image_not_supported_outlined));
  }
}

class _CombiningPulse extends StatelessWidget {
  const _CombiningPulse({required this.animation, this.compact = false});

  final Animation<double> animation;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: compact ? 54 : 150,
      child: AnimatedBuilder(
        animation: animation,
        builder: (context, _) {
          return CustomPaint(
            painter: _CombiningPulsePainter(
              progress: animation.value,
              color: Theme.of(context).colorScheme.primary,
              compact: compact,
            ),
          );
        },
      ),
    );
  }
}

class _CombiningPulsePainter extends CustomPainter {
  const _CombiningPulsePainter({
    required this.progress,
    required this.color,
    required this.compact,
  });

  final double progress;
  final Color color;
  final bool compact;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final pulse = 0.5 + 0.5 * math.sin(progress * math.pi * 2);
    final glow = Paint()
      ..color = color.withValues(alpha: 0.08 + pulse * 0.08)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(center, compact ? 24 + pulse * 5 : 34 + pulse * 8, glow);

    final linePaint = Paint()
      ..color = color.withValues(alpha: 0.34)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    if (compact) {
      canvas.drawLine(
        Offset(size.width * 0.24, center.dy),
        Offset(size.width * 0.76, center.dy),
        linePaint,
      );
    } else {
      final path = Path()
        ..moveTo(size.width * 0.08, center.dy)
        ..cubicTo(
          size.width * 0.28,
          center.dy - 28,
          size.width * 0.72,
          center.dy + 28,
          size.width * 0.92,
          center.dy,
        );
      canvas.drawPath(path, linePaint);
    }

    final sparklePaint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    _drawSparkle(
      canvas,
      center,
      compact ? 12 + pulse * 3 : 16 + pulse * 5,
      sparklePaint,
    );
    _drawSparkle(
      canvas,
      Offset(center.dx + (compact ? 42 : 28), center.dy - (compact ? 6 : 34)),
      compact ? 7 : 9,
      sparklePaint..color = color.withValues(alpha: 0.72),
    );
  }

  void _drawSparkle(Canvas canvas, Offset center, double size, Paint paint) {
    final path = Path()
      ..moveTo(center.dx, center.dy - size)
      ..lineTo(center.dx + size * 0.28, center.dy - size * 0.28)
      ..lineTo(center.dx + size, center.dy)
      ..lineTo(center.dx + size * 0.28, center.dy + size * 0.28)
      ..lineTo(center.dx, center.dy + size)
      ..lineTo(center.dx - size * 0.28, center.dy + size * 0.28)
      ..lineTo(center.dx - size, center.dy)
      ..lineTo(center.dx - size * 0.28, center.dy - size * 0.28)
      ..close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _CombiningPulsePainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.color != color ||
        oldDelegate.compact != compact;
  }
}

class _GenerationProgressBar extends StatelessWidget {
  const _GenerationProgressBar({required this.progress});

  final double progress;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(end: progress.clamp(0, 1)),
      duration: const Duration(milliseconds: 520),
      curve: Curves.easeOutCubic,
      builder: (context, value, _) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: SizedBox(
            height: 10,
            child: LinearProgressIndicator(
              value: value,
              minHeight: 10,
              backgroundColor: const Color(0xFFFFD9C7),
              color: Theme.of(context).colorScheme.primary,
            ),
          ),
        );
      },
    );
  }
}

class _TryOnMotionGraphic extends StatelessWidget {
  const _TryOnMotionGraphic({required this.animation});

  final Animation<double> animation;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 132,
      child: AnimatedBuilder(
        animation: animation,
        builder: (context, _) {
          return CustomPaint(
            painter: _TryOnMotionPainter(
              progress: animation.value,
              color: Theme.of(context).colorScheme.primary,
            ),
          );
        },
      ),
    );
  }
}

class _TryOnMotionPainter extends CustomPainter {
  const _TryOnMotionPainter({required this.progress, required this.color});

  final double progress;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final pulse = 0.5 + 0.5 * math.sin(progress * math.pi * 2);
    final sweep = progress * math.pi * 2;

    final glowPaint = Paint()
      ..color = color.withValues(alpha: 0.08 + pulse * 0.06)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(center, 46 + pulse * 10, glowPaint);

    final ringPaint = Paint()
      ..color = color.withValues(alpha: 0.18)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: 52),
      sweep,
      math.pi * 1.25,
      false,
      ringPaint,
    );

    final ribbonPaint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..strokeCap = StrokeCap.round;
    final ribbon = Path();
    for (var i = 0; i <= 64; i++) {
      final t = i / 64;
      final x = center.dx - 78 + t * 156;
      final y =
          center.dy +
          math.sin((t * math.pi * 2) + sweep) * 18 -
          math.cos((t * math.pi * 4) + sweep) * 5;
      if (i == 0) {
        ribbon.moveTo(x, y);
      } else {
        ribbon.lineTo(x, y);
      }
    }
    canvas.drawPath(ribbon, ribbonPaint);

    final ghostPaint = Paint()
      ..color = color.withValues(alpha: 0.22)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    final ghost = Path();
    for (var i = 0; i <= 64; i++) {
      final t = i / 64;
      final x = center.dx - 64 + t * 128;
      final y = center.dy + 26 + math.sin((t * math.pi * 2) - sweep) * 9;
      if (i == 0) {
        ghost.moveTo(x, y);
      } else {
        ghost.lineTo(x, y);
      }
    }
    canvas.drawPath(ghost, ghostPaint);

    _drawSparkle(
      canvas,
      Offset(center.dx - 86, center.dy - 34 + pulse * 8),
      18 + pulse * 5,
      color,
      0.9,
    );
    _drawSparkle(
      canvas,
      Offset(center.dx + 84, center.dy - 38 - pulse * 6),
      14 + (1 - pulse) * 5,
      color,
      0.75,
    );
    _drawSparkle(
      canvas,
      Offset(center.dx + 44, center.dy + 36 + pulse * 4),
      12 + pulse * 4,
      color,
      0.65,
    );
  }

  void _drawSparkle(
    Canvas canvas,
    Offset center,
    double size,
    Color color,
    double alpha,
  ) {
    final paint = Paint()
      ..color = color.withValues(alpha: alpha)
      ..style = PaintingStyle.fill;
    final path = Path()
      ..moveTo(center.dx, center.dy - size)
      ..lineTo(center.dx + size * 0.28, center.dy - size * 0.28)
      ..lineTo(center.dx + size, center.dy)
      ..lineTo(center.dx + size * 0.28, center.dy + size * 0.28)
      ..lineTo(center.dx, center.dy + size)
      ..lineTo(center.dx - size * 0.28, center.dy + size * 0.28)
      ..lineTo(center.dx - size, center.dy)
      ..lineTo(center.dx - size * 0.28, center.dy - size * 0.28)
      ..close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _TryOnMotionPainter oldDelegate) {
    return oldDelegate.progress != progress || oldDelegate.color != color;
  }
}
