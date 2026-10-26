import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../tryon/jewellery_result_region_detector.dart';
import '../tryon/kiosk_garment_input.dart';

class JewelleryResultPreview extends StatefulWidget {
  const JewelleryResultPreview({
    super.key,
    required this.src,
    required this.jewelleryType,
    this.regionDetector = const LocalJewelleryResultRegionDetector(),
    this.fit = BoxFit.contain,
  });

  final String src;
  final KioskJewelleryType? jewelleryType;
  final JewelleryResultRegionDetector regionDetector;
  final BoxFit fit;

  @override
  State<JewelleryResultPreview> createState() => _JewelleryResultPreviewState();
}

class _JewelleryResultPreviewState extends State<JewelleryResultPreview> {
  ImageStream? _stream;
  ImageStreamListener? _listener;
  ImageInfo? _imageInfo;
  Rect? _region;
  bool _failed = false;
  int _generation = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_stream == null && !_failed) _load();
  }

  @override
  void didUpdateWidget(JewelleryResultPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.src != widget.src ||
        oldWidget.jewelleryType != widget.jewelleryType ||
        oldWidget.regionDetector != widget.regionDetector) {
      _detach();
      _load();
    }
  }

  void _load() {
    final generation = ++_generation;
    _region = null;
    _failed = false;
    try {
      final src = widget.src;
      final ImageProvider provider =
          src.startsWith('https://') || src.startsWith('http://')
          ? NetworkImage(src)
          : MemoryImage(
              src.startsWith('data:image/')
                  ? UriData.parse(src).contentAsBytes()
                  : base64Decode(src),
            );
      _stream = provider.resolve(createLocalImageConfiguration(context));
      _listener = ImageStreamListener(
        (info, _) {
          if (!mounted || generation != _generation) {
            info.dispose();
            return;
          }
          setState(() {
            _imageInfo?.dispose();
            _imageInfo = info;
            _region = null;
          });
          _detect(info, generation);
        },
        onError: (_, _) {
          if (mounted && generation == _generation) {
            setState(() => _failed = true);
          }
        },
      );
      _stream!.addListener(_listener!);
    } catch (_) {
      _failed = true;
    }
  }

  Future<void> _detect(ImageInfo info, int generation) async {
    final type = widget.jewelleryType;
    if (type == null) return;
    final image = info.image.clone();
    try {
      final region = await widget.regionDetector.detect(image, type);
      if (mounted && generation == _generation && identical(info, _imageInfo)) {
        setState(() => _region = region);
      }
    } catch (_) {
      // Detection is optional presentation assistance; keep the full result.
    } finally {
      image.dispose();
    }
  }

  void _detach() {
    _generation++;
    if (_listener != null) _stream?.removeListener(_listener!);
    _stream = null;
    _listener = null;
    _imageInfo?.dispose();
    _imageInfo = null;
  }

  @override
  void dispose() {
    _detach();
    super.dispose();
  }

  Future<void> _openFullImage() async {
    final info = _imageInfo;
    if (info == null) return;
    final image = info.image.clone();
    try {
      await showDialog<void>(
        context: context,
        useSafeArea: false,
        builder: (_) => _FullJewelleryResult(image: image),
      );
    } catch (_) {
      image.dispose();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) {
      return const Center(child: Text('Generated image unavailable'));
    }
    final image = _imageInfo?.image;
    if (image == null) return const Center(child: CircularProgressIndicator());
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = Size(image.width.toDouble(), image.height.toDouble());
        final ratio = (constraints.maxWidth / constraints.maxHeight).clamp(
          0.55,
          0.8,
        );
        final crop = calculateJewelleryPortraitCrop(
          imageSize: size,
          normalizedRegion: _region,
          aspectRatio: ratio,
        );
        return Stack(
          fit: StackFit.expand,
          children: [
            Semantics(
              button: true,
              label: 'View full jewellery result',
              child: GestureDetector(
                key: const Key('jewellery-result-preview'),
                onTap: _openFullImage,
                child: CustomPaint(
                  painter: JewelleryResultImagePainter(
                    image: image,
                    sourceRect: crop ?? Offset.zero & size,
                    fit: widget.fit,
                  ),
                ),
              ),
            ),
            Positioned(
              top: 12,
              right: 12,
              child: IconButton.filledTonal(
                key: const Key('expand-jewellery-result'),
                tooltip: 'View full image',
                icon: const Icon(Icons.fullscreen),
                onPressed: _openFullImage,
              ),
            ),
          ],
        );
      },
    );
  }
}

class JewelleryResultImagePainter extends CustomPainter {
  const JewelleryResultImagePainter({
    required this.image,
    required this.sourceRect,
    this.fit = BoxFit.contain,
  });

  final ui.Image image;
  final Rect sourceRect;
  final BoxFit fit;

  @override
  void paint(Canvas canvas, Size size) {
    final fitted = applyBoxFit(fit, sourceRect.size, size);
    final source = Alignment.center.inscribe(fitted.source, sourceRect);
    final destination = Alignment.center.inscribe(
      fitted.destination,
      Offset.zero & size,
    );
    canvas.drawImageRect(
      image,
      source,
      destination,
      Paint()..filterQuality = FilterQuality.high,
    );
  }

  @override
  bool shouldRepaint(JewelleryResultImagePainter oldDelegate) =>
      oldDelegate.image != image ||
      oldDelegate.sourceRect != sourceRect ||
      oldDelegate.fit != fit;
}

class _FullJewelleryResult extends StatefulWidget {
  const _FullJewelleryResult({required this.image});
  final ui.Image image;

  @override
  State<_FullJewelleryResult> createState() => _FullJewelleryResultState();
}

class _FullJewelleryResultState extends State<_FullJewelleryResult> {
  final _transformation = TransformationController();
  Size _viewport = Size.zero;

  void _zoom(double factor) {
    final current = _transformation.value.getMaxScaleOnAxis();
    final next = (current * factor).clamp(1.0, 5.0);
    final center = _viewport.center(Offset.zero);
    _transformation.value = Matrix4.translationValues(center.dx, center.dy, 0)
      ..multiply(Matrix4.diagonal3Values(next / current, next / current, 1))
      ..multiply(Matrix4.translationValues(-center.dx, -center.dy, 0))
      ..multiply(_transformation.value);
  }

  @override
  void dispose() {
    _transformation.dispose();
    widget.image.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Dialog.fullscreen(
    backgroundColor: Colors.black,
    child: SafeArea(
      child: Column(
        children: [
          Align(
            alignment: Alignment.centerRight,
            child: IconButton(
              key: const Key('close-jewellery-result'),
              tooltip: 'Close',
              color: Colors.white,
              icon: const Icon(Icons.close),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                _viewport = constraints.biggest;
                return InteractiveViewer(
                  key: const Key('full-jewellery-result'),
                  transformationController: _transformation,
                  minScale: 1,
                  maxScale: 5,
                  child: SizedBox.expand(
                    child: RawImage(image: widget.image, fit: BoxFit.contain),
                  ),
                );
              },
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                tooltip: 'Zoom out',
                color: Colors.white,
                icon: const Icon(Icons.zoom_out),
                onPressed: () => _zoom(1 / 1.25),
              ),
              IconButton(
                tooltip: 'Reset zoom',
                color: Colors.white,
                icon: const Icon(Icons.refresh),
                onPressed: () => _transformation.value = Matrix4.identity(),
              ),
              IconButton(
                tooltip: 'Zoom in',
                color: Colors.white,
                icon: const Icon(Icons.zoom_in),
                onPressed: () => _zoom(1.25),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}
