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
  Rect _normalizedCrop = Rect.zero;
  _CropHandle? _activeHandle;
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

  Rect _initialCrop(ui.Image image) {
    final imageRatio = image.width / image.height;
    final outputRatio = widget.aspectRatio ?? imageRatio;
    const margin = .06;
    final width = outputRatio <= imageRatio
        ? (1 - margin * 2) * outputRatio / imageRatio
        : 1 - margin * 2;
    final height = outputRatio <= imageRatio
        ? 1 - margin * 2
        : (1 - margin * 2) * imageRatio / outputRatio;
    return Rect.fromLTWH((1 - width) / 2, (1 - height) / 2, width, height);
  }

  Rect _cropInCanvas(Rect crop, Size size) => Rect.fromLTRB(
    crop.left * size.width,
    crop.top * size.height,
    crop.right * size.width,
    crop.bottom * size.height,
  );

  Rect _cropInImage(Rect crop, Size size, ui.Image image) => Rect.fromLTRB(
    crop.left / size.width * image.width,
    crop.top / size.height * image.height,
    crop.right / size.width * image.width,
    crop.bottom / size.height * image.height,
  );

  void _beginCropDrag(DragStartDetails details, Rect crop) {
    final point = details.localPosition;
    const hitRadius = 30.0;
    _CropHandle? hit;
    var nearest = hitRadius;
    for (final handle in _CropHandle.values) {
      if (handle == _CropHandle.move) continue;
      final distance = (point - handle.position(crop)).distance;
      if (distance < nearest) {
        nearest = distance;
        hit = handle;
      }
    }
    if (hit == null && crop.contains(point)) hit = _CropHandle.move;
    _activeHandle = hit;
  }

  void _updateCropDrag(DragUpdateDetails details, Rect crop, Size size) {
    final handle = _activeHandle;
    if (handle == null || size.isEmpty) return;
    Rect next;
    if (handle == _CropHandle.move) {
      final left = (crop.left + details.delta.dx)
          .clamp(0.0, size.width - crop.width)
          .toDouble();
      final top = (crop.top + details.delta.dy)
          .clamp(0.0, size.height - crop.height)
          .toDouble();
      next = Rect.fromLTWH(left, top, crop.width, crop.height);
    } else {
      next = _resizeCrop(crop, details.delta, size, handle);
    }
    setState(() {
      _normalizedCrop = Rect.fromLTRB(
        next.left / size.width,
        next.top / size.height,
        next.right / size.width,
        next.bottom / size.height,
      );
    });
  }

  Rect _resizeCrop(Rect crop, Offset delta, Size size, _CropHandle handle) {
    final aspect = widget.aspectRatio;
    if (aspect != null) {
      final dx = handle.movesLeft
          ? -delta.dx
          : handle.movesRight
          ? delta.dx
          : 0.0;
      final dy = handle.movesTop
          ? -delta.dy * aspect
          : handle.movesBottom
          ? delta.dy * aspect
          : 0.0;
      final changeWidth = dx == 0
          ? dy
          : dy == 0
          ? dx
          : dx.abs() >= dy.abs()
          ? dx
          : dy;
      final maxWidth = math.min(size.width, size.height * aspect);
      final minWidth = math.min(72.0, maxWidth);
      final width = (crop.width + changeWidth)
          .clamp(minWidth, maxWidth)
          .toDouble();
      final height = width / aspect;
      final left = handle.movesLeft
          ? crop.right - width
          : handle.movesRight
          ? crop.left
          : crop.center.dx - width / 2;
      final top = handle.movesTop
          ? crop.bottom - height
          : handle.movesBottom
          ? crop.top
          : crop.center.dy - height / 2;
      final clampedLeft = left.clamp(0.0, size.width - width).toDouble();
      final clampedTop = top.clamp(0.0, size.height - height).toDouble();
      return Rect.fromLTWH(clampedLeft, clampedTop, width, height);
    }

    var left = handle.movesLeft ? crop.left + delta.dx : crop.left;
    var right = handle.movesRight ? crop.right + delta.dx : crop.right;
    var top = handle.movesTop ? crop.top + delta.dy : crop.top;
    var bottom = handle.movesBottom ? crop.bottom + delta.dy : crop.bottom;
    const minSize = 72.0;
    if (right - left < minSize) {
      if (handle.movesLeft) {
        left = right - minSize;
      } else {
        right = left + minSize;
      }
    }
    if (bottom - top < minSize) {
      if (handle.movesTop) {
        top = bottom - minSize;
      } else {
        bottom = top + minSize;
      }
    }
    final width = math.min(right - left, size.width);
    final height = math.min(bottom - top, size.height);
    left = left.clamp(0.0, size.width - width).toDouble();
    top = top.clamp(0.0, size.height - height).toDouble();
    return Rect.fromLTWH(left, top, width, height);
  }

  void _reset() => setState(() => _normalizedCrop = Rect.zero);

  Future<void> _useCrop() async {
    final image = _image;
    if (image == null || _saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final canvasSize = _canvasSize;
      if (canvasSize.isEmpty) throw StateError('Crop area is not ready');
      final normalized = _normalizedCrop.isEmpty
          ? _initialCrop(image)
          : _normalizedCrop;
      final source = _cropInImage(
        _cropInCanvas(normalized, canvasSize),
        canvasSize,
        image,
      );
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

  Size _canvasSize = Size.zero;

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
                'Position the crop frame over the part of the photo to keep.',
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
                          final ratio = image.width / image.height;
                          final width = math.min(
                            constraints.maxWidth,
                            constraints.maxHeight * ratio,
                          );
                          final height = width / ratio;
                          final size = Size(width, height);
                          _canvasSize = size;
                          final normalizedCrop = _normalizedCrop.isEmpty
                              ? _initialCrop(image)
                              : _normalizedCrop;
                          final crop = _cropInCanvas(normalizedCrop, size);
                          return ClipRRect(
                            borderRadius: BorderRadius.circular(18),
                            child: SizedBox(
                              width: width,
                              height: height,
                              child: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onPanStart: _saving
                                    ? null
                                    : (details) =>
                                          _beginCropDrag(details, crop),
                                onPanUpdate: _saving
                                    ? null
                                    : (details) =>
                                          _updateCropDrag(details, crop, size),
                                onPanEnd: (_) => _activeHandle = null,
                                child: Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    RawImage(
                                      image: image,
                                      fit: BoxFit.fill,
                                      filterQuality: FilterQuality.medium,
                                    ),
                                    IgnorePointer(
                                      child: CustomPaint(
                                        painter: _CropGridPainter(crop),
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
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: CustomerText(
                  widget.aspectRatio == null
                      ? 'Drag inside to move · use any handle to resize'
                      : 'Crop shape stays fixed · drag inside to move and handles to resize',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: CustomerColors.muted,
                    fontSize: 12,
                  ),
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
  final Rect crop;

  const _CropGridPainter(this.crop);

  @override
  void paint(Canvas canvas, Size size) {
    final shade = Paint()..color = Colors.black.withValues(alpha: .46);
    final outside = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Offset.zero & size)
      ..addRect(crop);
    canvas.drawPath(outside, shade);

    final line = Paint()..color = Colors.white.withValues(alpha: .78);
    for (var part = 1; part < 3; part++) {
      final x = crop.left + crop.width * part / 3;
      final y = crop.top + crop.height * part / 3;
      canvas.drawLine(Offset(x, crop.top), Offset(x, crop.bottom), line);
      canvas.drawLine(Offset(crop.left, y), Offset(crop.right, y), line);
    }
    final border = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5;
    canvas.drawRect(crop, border);

    final handleFill = Paint()..color = Colors.white;
    final handleOutline = Paint()
      ..color = CustomerColors.orange
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    for (final handle in _CropHandle.values) {
      if (handle == _CropHandle.move) continue;
      final center = handle.position(crop);
      canvas.drawCircle(center, 6, handleFill);
      canvas.drawCircle(center, 6, handleOutline);
    }
  }

  @override
  bool shouldRepaint(covariant _CropGridPainter oldDelegate) =>
      oldDelegate.crop != crop;
}

enum _CropHandle {
  move,
  topLeft,
  top,
  topRight,
  right,
  bottomRight,
  bottom,
  bottomLeft,
  left;

  bool get movesLeft => this == topLeft || this == left || this == bottomLeft;
  bool get movesRight =>
      this == topRight || this == right || this == bottomRight;
  bool get movesTop => this == topLeft || this == top || this == topRight;
  bool get movesBottom =>
      this == bottomLeft || this == bottom || this == bottomRight;

  Offset position(Rect rect) => switch (this) {
    topLeft => rect.topLeft,
    top => Offset(rect.center.dx, rect.top),
    topRight => rect.topRight,
    right => Offset(rect.right, rect.center.dy),
    bottomRight => rect.bottomRight,
    bottom => Offset(rect.center.dx, rect.bottom),
    bottomLeft => rect.bottomLeft,
    left => Offset(rect.left, rect.center.dy),
    move => rect.center,
  };
}
