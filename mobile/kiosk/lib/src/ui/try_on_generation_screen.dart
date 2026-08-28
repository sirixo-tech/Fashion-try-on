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
      duration: const Duration(milliseconds: 4200),
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
              final canShowInputPreview = _canShowInputPreview(
                personImagePath,
                garmentImagePath,
              );
              final narrow = constraints.maxWidth < 560;
              final tightHeight = constraints.maxHeight < 720;
              final pagePadding = narrow ? 14.0 : 22.0;
              final sectionGap = tightHeight ? 12.0 : 18.0;
              final motionHeight = tightHeight ? 138.0 : 174.0;
              if (!failed) {
                return Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1080),
                    child: SizedBox(
                      height: constraints.maxHeight,
                      child: Card(
                        margin: EdgeInsets.zero,
                        child: Padding(
                          padding: EdgeInsets.all(pagePadding),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              _TryOnMotionGraphic(
                                animation: _motionController,
                                height: motionHeight,
                              ),
                              if (canShowInputPreview) ...[
                                SizedBox(height: sectionGap),
                                Expanded(
                                  child: _GenerationInputPreview(
                                    personImagePath: personImagePath!,
                                    garmentImagePath: garmentImagePath!,
                                    garmentName:
                                        garmentInput?.displayName ?? 'Garment',
                                  ),
                                ),
                              ] else
                                const Expanded(child: SizedBox.shrink()),
                              SizedBox(height: sectionGap),
                              Text(
                                _titleFor(status),
                                style: Theme.of(context).textTheme.displaySmall,
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 8),
                              Text(
                                _supportMessageFor(status),
                                style: Theme.of(context).textTheme.bodyLarge,
                                textAlign: TextAlign.center,
                              ),
                              SizedBox(height: sectionGap),
                              _GenerationProgressBar(progress: progress),
                              const SizedBox(height: 12),
                              AnimatedSwitcher(
                                duration: const Duration(milliseconds: 220),
                                child: Text(
                                  _stageFor(status),
                                  key: ValueKey<KioskTryOnStatus>(status),
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
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              }

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
                              else ...[
                                _TryOnMotionGraphic(
                                  animation: _motionController,
                                  height: 132,
                                ),
                                if (canShowInputPreview) ...[
                                  const SizedBox(height: 18),
                                  SizedBox(
                                    height: 300,
                                    child: _GenerationInputPreview(
                                      personImagePath: personImagePath!,
                                      garmentImagePath: garmentImagePath!,
                                      garmentName:
                                          garmentInput?.displayName ??
                                          'Garment',
                                    ),
                                  ),
                                ],
                              ],
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
                                failed
                                    ? widget.tryOnController.customerMessage ??
                                          'Please try again.'
                                    : _supportMessageFor(status),
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
                                    key: ValueKey<KioskTryOnStatus>(status),
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
                                if (widget
                                    .tryOnController
                                    .hasNextGarmentPick) ...[
                                  const SizedBox(height: 14),
                                  ElevatedButton.icon(
                                    key: const Key('try-on-skip-current-pick'),
                                    onPressed: () => _skipCurrentPick(context),
                                    icon: const Icon(Icons.skip_next_outlined),
                                    label: const Text('Skip This Item'),
                                  ),
                                ],
                                const SizedBox(height: 14),
                                ElevatedButton.icon(
                                  key: const Key('try-on-choose-garment'),
                                  onPressed: () =>
                                      _chooseAnotherGarment(context),
                                  icon: const Icon(Icons.checkroom_outlined),
                                  label: const Text('Try Another Garment'),
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

  void _skipCurrentPick(BuildContext context) {
    if (!widget.tryOnController.selectNextGarmentPick()) {
      return;
    }
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => TryOnGenerationScreen(
          captureController: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          extractionService: widget.extractionService,
        ),
      ),
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
    KioskTryOnStatus.preparing => 'Preparing your images',
    KioskTryOnStatus.uploading => 'Sending to SelfX',
    KioskTryOnStatus.queued => 'Almost your turn',
    KioskTryOnStatus.processing => 'Creating your look',
    KioskTryOnStatus.succeeded => 'Try-On ready',
    _ => 'Starting your Try-On',
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

String _supportMessageFor(KioskTryOnStatus status) {
  return switch (status) {
    KioskTryOnStatus.preparing =>
      'Checking your photo and garment before generation starts.',
    KioskTryOnStatus.uploading =>
      'Uploading both images securely. Please keep this screen open.',
    KioskTryOnStatus.queued =>
      'Your request is in line. We will start the fit as soon as the AI is ready.',
    KioskTryOnStatus.processing =>
      'Fitting the garment to your photo and refining the final image.',
    KioskTryOnStatus.succeeded => 'Your result is ready. Opening it now.',
    _ => 'Getting everything ready for your virtual try-on.',
  };
}

String _stageFor(KioskTryOnStatus status) {
  return switch (status) {
    KioskTryOnStatus.preparing => '18% - Setting your look in motion',
    KioskTryOnStatus.uploading => '34% - Tailoring your look',
    KioskTryOnStatus.queued => '52% - Bringing your style to life',
    KioskTryOnStatus.processing => '78% - Adding the final touch',
    KioskTryOnStatus.succeeded => '100% - Your look awaits',
    _ => '6% - Creating the first touch',
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
  });

  final String personImagePath;
  final String garmentImagePath;
  final String garmentName;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final stacked = constraints.maxWidth < 320;
        final preview = stacked
            ? Column(
                children: [
                  Expanded(
                    child: _InputImageCard(
                      label: 'Your photo',
                      imagePath: personImagePath,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: _InputImageCard(
                      label: garmentName,
                      imagePath: garmentImagePath,
                    ),
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
                    ),
                  ),
                  const SizedBox(width: 18),
                  Expanded(
                    child: _InputImageCard(
                      label: garmentName,
                      imagePath: garmentImagePath,
                    ),
                  ),
                ],
              );
        return preview;
      },
    );
  }
}

class _InputImageCard extends StatelessWidget {
  const _InputImageCard({required this.label, required this.imagePath});

  final String label;
  final String imagePath;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFE7EEF8)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A102033),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(6),
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
  const _TryOnMotionGraphic({required this.animation, required this.height});

  final Animation<double> animation;
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
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

  static const _outfits = [
    _MotionOutfit(
      fill: Color(0xFFFF6A1A),
      accent: Color(0xFFFFC400),
      style: _MotionGarmentStyle.shirt,
    ),
    _MotionOutfit(
      fill: Color(0xFF243B53),
      accent: Color(0xFFFF6A1A),
      style: _MotionGarmentStyle.jacket,
    ),
    _MotionOutfit(
      fill: Color(0xFF01A101),
      accent: Color(0xFFFFC400),
      style: _MotionGarmentStyle.top,
    ),
    _MotionOutfit(
      fill: Color(0xFF5B677A),
      accent: Color(0xFFFF6A1A),
      style: _MotionGarmentStyle.pants,
    ),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height * 0.57);
    final scale = (size.height / 174).clamp(0.72, 1.14).toDouble();
    final pulse = 0.5 + 0.5 * math.sin(progress * math.pi * 2);

    _drawQueuePath(canvas, size, scale);

    var activeApply = 0.0;
    _MotionOutfit activeOutfit = _outfits.first;
    for (var i = 0; i < _outfits.length; i++) {
      final t = (progress + i / _outfits.length) % 1;
      final apply = _proximity(t, 0.5, 0.18);
      if (apply > activeApply) {
        activeApply = apply;
        activeOutfit = _outfits[i];
      }
    }

    _drawPerson(canvas, center, scale, activeOutfit, activeApply, pulse);

    for (var i = 0; i < _outfits.length; i++) {
      final t = (progress + i / _outfits.length) % 1;
      final outfit = _outfits[i];
      final apply = _proximity(t, 0.5, 0.18);
      final x = _lerp(-70 * scale, size.width + 70 * scale, _easeInOut(t));
      final y =
          center.dy -
          (math.sin(t * math.pi) * 42 * scale) -
          8 * scale +
          math.sin((t + progress) * math.pi * 2) * 4 * scale;
      final cardScale = 0.78 + apply * 0.2;
      final alpha = 0.3 + math.sin(t * math.pi) * 0.58;
      _drawOutfitCard(
        canvas,
        Offset(x, y),
        outfit,
        scale * cardScale,
        alpha.clamp(0.24, 0.94).toDouble(),
      );
    }

    if (activeApply > 0.58) {
      _drawSparkle(
        canvas,
        Offset(center.dx + 38 * scale, center.dy - 56 * scale),
        13 * scale + pulse * 4 * scale,
        color,
        activeApply * 0.86,
      );
      _drawSparkle(
        canvas,
        Offset(center.dx - 44 * scale, center.dy - 14 * scale),
        10 * scale + (1 - pulse) * 4 * scale,
        activeOutfit.accent,
        activeApply * 0.72,
      );
    }
  }

  void _drawQueuePath(Canvas canvas, Size size, double scale) {
    final center = Offset(size.width / 2, size.height * 0.57);
    final pathPaint = Paint()
      ..color = color.withValues(alpha: 0.13)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.6 * scale
      ..strokeCap = StrokeCap.round;
    final path = Path()
      ..moveTo(28 * scale, center.dy - 6 * scale)
      ..quadraticBezierTo(
        size.width * 0.28,
        center.dy - 58 * scale,
        center.dx - 38 * scale,
        center.dy - 34 * scale,
      )
      ..quadraticBezierTo(
        center.dx,
        center.dy - 10 * scale,
        center.dx + 38 * scale,
        center.dy - 34 * scale,
      )
      ..quadraticBezierTo(
        size.width * 0.72,
        center.dy - 58 * scale,
        size.width - 28 * scale,
        center.dy - 6 * scale,
      );
    canvas.drawPath(path, pathPaint);

    final dotPaint = Paint()
      ..color = color.withValues(alpha: 0.26)
      ..style = PaintingStyle.fill;
    for (final point in [
      Offset(size.width * 0.18, center.dy - 30 * scale),
      Offset(size.width * 0.36, center.dy - 44 * scale),
      Offset(size.width * 0.64, center.dy - 44 * scale),
      Offset(size.width * 0.82, center.dy - 30 * scale),
    ]) {
      canvas.drawCircle(point, 3.2 * scale, dotPaint);
    }
  }

  void _drawPerson(
    Canvas canvas,
    Offset center,
    double scale,
    _MotionOutfit activeOutfit,
    double apply,
    double pulse,
  ) {
    final shadowPaint = Paint()
      ..color = const Color(0xFF0F172A).withValues(alpha: 0.1)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10);
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(center.dx, center.dy + 68 * scale),
        width: 74 * scale,
        height: 14 * scale,
      ),
      shadowPaint,
    );

    final guidePaint = Paint()
      ..color = color.withValues(alpha: 0.1 + pulse * 0.05)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(center, 54 * scale + pulse * 8 * scale, guidePaint);

    final linePaint = Paint()
      ..color = const Color(0xFF334155).withValues(alpha: 0.86)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.2 * scale
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final head = Offset(center.dx, center.dy - 52 * scale);
    canvas.drawCircle(head, 14 * scale, linePaint);
    canvas.drawLine(
      Offset(center.dx, center.dy - 37 * scale),
      Offset(center.dx, center.dy - 27 * scale),
      linePaint,
    );

    final body = Path()
      ..moveTo(center.dx - 24 * scale, center.dy - 24 * scale)
      ..quadraticBezierTo(
        center.dx,
        center.dy - 34 * scale,
        center.dx + 24 * scale,
        center.dy - 24 * scale,
      )
      ..lineTo(center.dx + 19 * scale, center.dy + 28 * scale)
      ..quadraticBezierTo(
        center.dx,
        center.dy + 38 * scale,
        center.dx - 19 * scale,
        center.dy + 28 * scale,
      )
      ..close();
    canvas.drawPath(body, linePaint);

    canvas.drawLine(
      Offset(center.dx - 25 * scale, center.dy - 14 * scale),
      Offset(center.dx - 42 * scale, center.dy + 34 * scale),
      linePaint,
    );
    canvas.drawLine(
      Offset(center.dx + 25 * scale, center.dy - 14 * scale),
      Offset(center.dx + 42 * scale, center.dy + 34 * scale),
      linePaint,
    );
    canvas.drawLine(
      Offset(center.dx - 11 * scale, center.dy + 36 * scale),
      Offset(center.dx - 19 * scale, center.dy + 72 * scale),
      linePaint,
    );
    canvas.drawLine(
      Offset(center.dx + 11 * scale, center.dy + 36 * scale),
      Offset(center.dx + 19 * scale, center.dy + 72 * scale),
      linePaint,
    );

    if (apply <= 0) {
      return;
    }

    final outfitPaint = Paint()
      ..color = activeOutfit.fill.withValues(alpha: 0.18 + apply * 0.78)
      ..style = PaintingStyle.fill;
    final accentPaint = Paint()
      ..color = activeOutfit.accent.withValues(alpha: apply)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.6 * scale
      ..strokeCap = StrokeCap.round;
    final overlay = Path()
      ..moveTo(center.dx - 23 * scale, center.dy - 23 * scale)
      ..quadraticBezierTo(
        center.dx,
        center.dy - 31 * scale,
        center.dx + 23 * scale,
        center.dy - 23 * scale,
      )
      ..lineTo(center.dx + 18 * scale, center.dy + 24 * scale)
      ..quadraticBezierTo(
        center.dx,
        center.dy + 32 * scale,
        center.dx - 18 * scale,
        center.dy + 24 * scale,
      )
      ..close();
    canvas.drawPath(overlay, outfitPaint);
    canvas.drawLine(
      Offset(center.dx, center.dy - 22 * scale),
      Offset(center.dx, center.dy + 25 * scale),
      accentPaint,
    );
  }

  void _drawOutfitCard(
    Canvas canvas,
    Offset center,
    _MotionOutfit outfit,
    double scale,
    double alpha,
  ) {
    final rect = Rect.fromCenter(
      center: center,
      width: 52 * scale,
      height: 62 * scale,
    );
    final shadowPaint = Paint()
      ..color = const Color(0xFF0F172A).withValues(alpha: alpha * 0.12)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        rect.translate(0, 6 * scale),
        Radius.circular(14 * scale),
      ),
      shadowPaint,
    );

    final cardPaint = Paint()
      ..color = Colors.white.withValues(alpha: alpha)
      ..style = PaintingStyle.fill;
    canvas.drawRRect(
      RRect.fromRectAndRadius(rect, Radius.circular(14 * scale)),
      cardPaint,
    );

    final borderPaint = Paint()
      ..color = outfit.fill.withValues(alpha: alpha * 0.32)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.8 * scale;
    canvas.drawRRect(
      RRect.fromRectAndRadius(rect, Radius.circular(14 * scale)),
      borderPaint,
    );

    final iconRect = rect.deflate(12 * scale);
    _drawGarmentIcon(canvas, iconRect, outfit, alpha);
  }

  void _drawGarmentIcon(
    Canvas canvas,
    Rect rect,
    _MotionOutfit outfit,
    double alpha,
  ) {
    final fillPaint = Paint()
      ..color = outfit.fill.withValues(alpha: alpha * 0.92)
      ..style = PaintingStyle.fill;
    final accentPaint = Paint()
      ..color = outfit.accent.withValues(alpha: alpha)
      ..style = PaintingStyle.stroke
      ..strokeWidth = rect.width * 0.08
      ..strokeCap = StrokeCap.round;

    switch (outfit.style) {
      case _MotionGarmentStyle.pants:
        final pants = Path()
          ..moveTo(rect.left + rect.width * 0.28, rect.top)
          ..lineTo(rect.right - rect.width * 0.28, rect.top)
          ..lineTo(rect.right - rect.width * 0.18, rect.bottom)
          ..lineTo(rect.center.dx + rect.width * 0.04, rect.bottom)
          ..lineTo(rect.center.dx, rect.top + rect.height * 0.38)
          ..lineTo(rect.center.dx - rect.width * 0.04, rect.bottom)
          ..lineTo(rect.left + rect.width * 0.18, rect.bottom)
          ..close();
        canvas.drawPath(pants, fillPaint);
        canvas.drawLine(
          Offset(rect.center.dx, rect.top + rect.height * 0.2),
          Offset(rect.center.dx, rect.bottom - rect.height * 0.08),
          accentPaint,
        );
      case _MotionGarmentStyle.jacket:
      case _MotionGarmentStyle.shirt:
      case _MotionGarmentStyle.top:
        final shirt = Path()
          ..moveTo(rect.left + rect.width * 0.28, rect.top + rect.height * 0.1)
          ..lineTo(rect.left, rect.top + rect.height * 0.32)
          ..lineTo(rect.left + rect.width * 0.18, rect.top + rect.height * 0.5)
          ..lineTo(rect.left + rect.width * 0.3, rect.top + rect.height * 0.4)
          ..lineTo(rect.left + rect.width * 0.3, rect.bottom)
          ..lineTo(rect.right - rect.width * 0.3, rect.bottom)
          ..lineTo(rect.right - rect.width * 0.3, rect.top + rect.height * 0.4)
          ..lineTo(rect.right - rect.width * 0.18, rect.top + rect.height * 0.5)
          ..lineTo(rect.right, rect.top + rect.height * 0.32)
          ..lineTo(rect.right - rect.width * 0.28, rect.top + rect.height * 0.1)
          ..quadraticBezierTo(
            rect.center.dx,
            rect.top + rect.height * 0.24,
            rect.left + rect.width * 0.28,
            rect.top + rect.height * 0.1,
          )
          ..close();
        canvas.drawPath(shirt, fillPaint);
        if (outfit.style == _MotionGarmentStyle.jacket) {
          canvas.drawLine(
            Offset(rect.center.dx, rect.top + rect.height * 0.22),
            Offset(rect.center.dx, rect.bottom - rect.height * 0.08),
            accentPaint,
          );
        } else {
          canvas.drawArc(
            Rect.fromCenter(
              center: Offset(rect.center.dx, rect.top + rect.height * 0.16),
              width: rect.width * 0.28,
              height: rect.height * 0.18,
            ),
            0,
            math.pi,
            false,
            accentPaint,
          );
        }
    }
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

  double _easeInOut(double t) => 0.5 - math.cos(t * math.pi) / 2;

  double _lerp(double start, double end, double t) {
    return start + (end - start) * t;
  }

  double _proximity(double value, double target, double radius) {
    final distance = (value - target).abs();
    return (1 - distance / radius).clamp(0.0, 1.0).toDouble();
  }
}

enum _MotionGarmentStyle { shirt, jacket, top, pants }

class _MotionOutfit {
  const _MotionOutfit({
    required this.fill,
    required this.accent,
    required this.style,
  });

  final Color fill;
  final Color accent;
  final _MotionGarmentStyle style;
}
