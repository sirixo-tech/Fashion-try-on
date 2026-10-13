import 'package:flutter/material.dart';

enum CatalogFilterIconType { all, men, women, tops, bottoms, fullOutfit }

/// Display-only mapping; catalog slugs and request filtering are unchanged.
CatalogFilterIconType categoryFilterIconType(String slug) =>
    switch (slug.trim().toLowerCase().replaceAll('_', '-')) {
      'top' || 'tops' || 'shirt' || 'shirts' => CatalogFilterIconType.tops,
      'bottom' ||
      'bottoms' ||
      'trousers' ||
      'pants' => CatalogFilterIconType.bottoms,
      'full-outfit' ||
      'full-outfits' ||
      'one-piece' ||
      'dresses' => CatalogFilterIconType.fullOutfit,
      _ => CatalogFilterIconType.all,
    };

class CatalogFilterIcon extends StatelessWidget {
  const CatalogFilterIcon({
    super.key,
    required this.type,
    this.color,
    this.size = 20,
  });

  final CatalogFilterIconType type;
  final Color? color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final symbol = switch (type) {
      CatalogFilterIconType.all => Icons.grid_view_rounded,
      CatalogFilterIconType.men => Icons.person_2,
      CatalogFilterIconType.women => Icons.person_3,
      _ => null,
    };
    if (symbol != null) return Icon(symbol, color: color, size: size);
    return ExcludeSemantics(
      child: SizedBox.square(
        dimension: size,
        child: CustomPaint(
          painter: _GarmentFilterPainter(
            type,
            color ?? IconTheme.of(context).color ?? Colors.black,
          ),
        ),
      ),
    );
  }
}

class _GarmentFilterPainter extends CustomPainter {
  const _GarmentFilterPainter(this.type, this.color);
  final CatalogFilterIconType type;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width, size.height);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.07
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final path = Path();
    switch (type) {
      case CatalogFilterIconType.tops:
        path
          ..moveTo(0.32, 0.12)
          ..lineTo(0.07, 0.28)
          ..lineTo(0.20, 0.48)
          ..lineTo(0.32, 0.40)
          ..lineTo(0.32, 0.90)
          ..lineTo(0.68, 0.90)
          ..lineTo(0.68, 0.40)
          ..lineTo(0.80, 0.48)
          ..lineTo(0.93, 0.28)
          ..lineTo(0.68, 0.12)
          ..cubicTo(0.65, 0.34, 0.35, 0.34, 0.32, 0.12)
          ..close();
      case CatalogFilterIconType.bottoms:
        path
          ..moveTo(0.25, 0.10)
          ..lineTo(0.75, 0.10)
          ..lineTo(0.84, 0.90)
          ..lineTo(0.60, 0.90)
          ..lineTo(0.50, 0.40)
          ..lineTo(0.40, 0.90)
          ..lineTo(0.16, 0.90)
          ..close()
          ..moveTo(0.25, 0.23)
          ..lineTo(0.75, 0.23)
          ..moveTo(0.50, 0.10)
          ..lineTo(0.50, 0.30);
      case CatalogFilterIconType.fullOutfit:
        path
          ..moveTo(0.30, 0.10)
          ..lineTo(0.40, 0.10)
          ..quadraticBezierTo(0.50, 0.28, 0.60, 0.10)
          ..lineTo(0.70, 0.10)
          ..lineTo(0.62, 0.43)
          ..lineTo(0.86, 0.90)
          ..quadraticBezierTo(0.50, 0.98, 0.14, 0.90)
          ..lineTo(0.38, 0.43)
          ..close()
          ..moveTo(0.38, 0.43)
          ..lineTo(0.62, 0.43);
      default:
        break;
    }
    canvas.drawPath(path, paint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(_GarmentFilterPainter oldDelegate) =>
      oldDelegate.type != type || oldDelegate.color != color;
}
