import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../experience/customer_media.dart';
import '../l10n/customer_copy.dart';
import 'customer_theme.dart';

Future<PickedCustomerPhoto?> cropCustomerPhoto(
  BuildContext context,
  PickedCustomerPhoto photo, {
  required String title,
  double? aspectRatio,
  int maxOutputDimension = 2048,
}) => Navigator.of(context).push<PickedCustomerPhoto>(
  MaterialPageRoute(
    fullscreenDialog: true,
    builder: (_) => CustomerPhotoCropScreen(
      photo: photo,
      title: title,
      aspectRatio: aspectRatio,
      maxOutputDimension: maxOutputDimension,
    ),
  ),
);

class CustomerPhotoCropScreen extends StatefulWidget {
  final PickedCustomerPhoto photo;
  final String title;
  final double? aspectRatio;
  final int maxOutputDimension;

  const CustomerPhotoCropScreen({
    super.key,
    required this.photo,
    required this.title,
    this.aspectRatio,
    this.maxOutputDimension = 2048,
  });

  @override
  State<CustomerPhotoCropScreen> createState() =>
      _CustomerPhotoCropScreenState();
}

class _CustomerPhotoCropScreenState extends State<CustomerPhotoCropScreen> {
  ui.Image? _image;
  double _zoom = 1;
  double _gestureZoom = 1;
  Offset _offset = Offset.zero;
  Offset _gestureOffset = Offset.zero;
  Size _frameSize = Size.zero;
  double _baseScale = 1;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _decode();
  }

  Future<void> _decode() async {
    try {
      final codec = await ui.instantiateImageCodec(widget.photo.bytes);
      final frame = await codec.getNextFrame();
      codec.dispose();
      if (!mounted) {
        frame.image.dispose();
        return;
      }
      setState(() => _image = frame.image);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'This photo could not be opened. Choose another.',
        );
      }
    }
  }

  @override
  void dispose() {
    _image?.dispose();
    super.dispose();
  }

  void _onScaleStart(ScaleStartDetails details) {
    _gestureZoom = _zoom;
    _gestureOffset = _offset;
  }

  void _onScaleUpdate(ScaleUpdateDetails details) {
    final nextZoom = (_gestureZoom * details.scale).clamp(1.0, 5.0);
    final image = _image;
    if (image == null || _frameSize.isEmpty) return;
    final scale = _baseScale * nextZoom;
    final maxX = math.max(0.0, (image.width * scale - _frameSize.width) / 2);
    final maxY = math.max(0.0, (image.height * scale - _frameSize.height) / 2);
    final nextOffset = _gestureOffset + details.focalPointDelta;
    setState(() {
      _zoom = nextZoom;
      _offset = Offset(
        nextOffset.dx.clamp(-maxX, maxX),
        nextOffset.dy.clamp(-maxY, maxY),
      );
    });
  }

  void _setZoom(double value) {
    final image = _image;
    if (image == null || _frameSize.isEmpty) return;
    final nextZoom = value.clamp(1.0, 5.0);
    final scale = _baseScale * nextZoom;
    final maxX = math.max(0.0, (image.width * scale - _frameSize.width) / 2);
    final maxY = math.max(0.0, (image.height * scale - _frameSize.height) / 2);
    setState(() {
      _zoom = nextZoom;
      _offset = Offset(
        _offset.dx.clamp(-maxX, maxX),
        _offset.dy.clamp(-maxY, maxY),
      );
    });
  }

  void _reset() => setState(() {
    _zoom = 1;
    _offset = Offset.zero;
  });

  Future<void> _useCrop() async {
    final image = _image;
    if (image == null || _frameSize.isEmpty || _saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final scale = _baseScale * _zoom;
      final renderedLeft =
          (_frameSize.width - image.width * scale) / 2 + _offset.dx;
      final renderedTop =
          (_frameSize.height - image.height * scale) / 2 + _offset.dy;
      final left = (-renderedLeft / scale).clamp(0.0, image.width.toDouble());
      final top = (-renderedTop / scale).clamp(0.0, image.height.toDouble());
      final right = ((_frameSize.width - renderedLeft) / scale).clamp(
        left,
        image.width.toDouble(),
      );
      final bottom = ((_frameSize.height - renderedTop) / scale).clamp(
        top,
        image.height.toDouble(),
      );
      final source = ui.Rect.fromLTRB(left, top, right, bottom);
      final reduce = math.min(
        1.0,
        widget.maxOutputDimension / math.max(source.width, source.height),
      );
      final outputWidth = math.max(1, (source.width * reduce).round());
      final outputHeight = math.max(1, (source.height * reduce).round());
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);
      canvas.drawImageRect(
        image,
        source,
        ui.Rect.fromLTWH(0, 0, outputWidth.toDouble(), outputHeight.toDouble()),
        Paint()..filterQuality = FilterQuality.high,
      );
      final output = await recorder.endRecording().toImage(
        outputWidth,
        outputHeight,
      );
      final data = await output.toByteData(format: ui.ImageByteFormat.png);
      output.dispose();
      if (data == null) throw StateError('Could not encode cropped photo');
      if (mounted) {
        Navigator.pop(
          context,
          PickedCustomerPhoto(data.buffer.asUint8List(), 'image/png'),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = 'The photo could not be cropped. Please try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final image = _image;
    return Scaffold(
      appBar: AppBar(
        title: CustomerText(widget.title),
        actions: [
          TextButton(
            onPressed: image == null || _saving ? null : _reset,
            child: const CustomerText('Reset'),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              child: CustomerText(
                'Pinch to zoom and drag to adjust the photo.',
                textAlign: TextAlign.center,
                style: TextStyle(color: CustomerColors.muted),
              ),
            ),
            Expanded(
              child: Center(
                child: image == null
                    ? _error == null
                          ? const CircularProgressIndicator()
                          : CustomerText(_error!, textAlign: TextAlign.center)
                    : LayoutBuilder(
                        builder: (context, constraints) {
                          final ratio =
                              widget.aspectRatio ?? image.width / image.height;
                          final width = math.min(
                            constraints.maxWidth,
                            constraints.maxHeight * ratio,
                          );
                          final height = width / ratio;
                          _frameSize = Size(width, height);
                          _baseScale = math.max(
                            width / image.width,
                            height / image.height,
                          );
                          final scale = _baseScale * _zoom;
                          final left =
                              (width - image.width * scale) / 2 + _offset.dx;
                          final top =
                              (height - image.height * scale) / 2 + _offset.dy;
                          return ClipRRect(
                            borderRadius: BorderRadius.circular(18),
                            child: SizedBox(
                              width: width,
                              height: height,
                              child: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onScaleStart: _onScaleStart,
                                onScaleUpdate: _onScaleUpdate,
                                child: Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    const ColoredBox(color: Colors.black),
                                    Positioned(
                                      left: left,
                                      top: top,
                                      width: image.width * scale,
                                      height: image.height * scale,
                                      child: RawImage(
                                        image: image,
                                        fit: BoxFit.fill,
                                        filterQuality: FilterQuality.medium,
                                      ),
                                    ),
                                    IgnorePointer(
                                      child: CustomPaint(
                                        painter: _CropGridPainter(),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ),
            if (image != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 4),
                child: Row(
                  children: [
                    const Icon(Icons.zoom_out_rounded, size: 20),
                    Expanded(
                      child: Slider(
                        key: const ValueKey('photo-crop-zoom'),
                        min: 1,
                        max: 5,
                        divisions: 40,
                        label: '${_zoom.toStringAsFixed(1)}×',
                        value: _zoom,
                        onChanged: _saving ? null : _setZoom,
                      ),
                    ),
                    const Icon(Icons.zoom_in_rounded, size: 20),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 42,
                      child: Text(
                        '${_zoom.toStringAsFixed(1)}×',
                        textAlign: TextAlign.end,
                        style: const TextStyle(
                          color: CustomerColors.muted,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            if (_error != null && image != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: CustomerText(
                  _error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Color(0xFF9A3025)),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: image == null || _saving ? null : _useCrop,
                  child: CustomerText(
                    _saving ? 'Preparing photo…' : 'Use cropped photo',
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CropGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final line = Paint()
      ..color = Colors.white.withValues(alpha: .72)
      ..strokeWidth = 1;
    for (var part = 1; part < 3; part++) {
      final x = size.width * part / 3;
      final y = size.height * part / 3;
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), line);
      canvas.drawLine(Offset(0, y), Offset(size.width, y), line);
    }
    final border = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawRect(Offset.zero & size, border);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
