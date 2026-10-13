import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../session/capture_scope.dart';
import '../theme/selfx_kiosk_theme.dart';
import 'responsive_kiosk_layout.dart';

/// A static positioning aid, independent of camera/readiness measurements.
class PersonCaptureGuideOverlay extends StatelessWidget {
  const PersonCaptureGuideOverlay({
    super.key,
    required this.captureScope,
    this.countdownActive = false,
    this.reserveUploadAction = false,
  });

  final CaptureScope captureScope;
  final bool countdownActive;
  final bool reserveUploadAction;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final layout = KioskLayoutMetrics.fromConstraints(constraints);
          final compact = constraints.maxHeight < 720;
          final bottom = layout.scaled(
            126,
            small: 104,
            large: 148,
            extraLarge: 174,
          );
          return SafeArea(
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                layout.scaled(20, small: 12, large: 28),
                compact ? 12 : 26,
                layout.scaled(20, small: 12, large: 28),
                bottom + (reserveUploadAction ? 80 : 0),
              ),
              child: Column(
                key: const Key('camera-framing-guide'),
                children: [
                  // Retain the header's space so the outline stays still when
                  // countdown starts, while the countdown owns the instructions.
                  Visibility(
                    key: const Key('person-positioning-heading'),
                    visible: !countdownActive,
                    maintainSize: true,
                    maintainState: true,
                    maintainAnimation: true,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.38),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Column(
                        children: [
                          Text(
                            'Stand in Position',
                            key: const Key('camera-framing-guide-label'),
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: compact
                                  ? 22
                                  : layout.scaled(28, small: 24, large: 34),
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            switch (captureScope) {
                              CaptureScope.top =>
                                'Face the camera. Keep your head, shoulders and torso visible.',
                              CaptureScope.bottom =>
                                'Keep your face visible and frame your waist, legs and feet.',
                              CaptureScope.fullBody =>
                                'Face the camera and stand straight.',
                            },
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.92),
                              fontSize: compact
                                  ? 12
                                  : layout.scaled(16, small: 14, large: 18),
                              height: 1.25,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        RepaintBoundary(
                          key: const Key('person-outline'),
                          child: CustomPaint(
                            painter: PersonCaptureOutlinePainter(
                              captureScope: captureScope,
                              countdownActive: countdownActive,
                              tipRailWidth: layout.scaled(
                                90,
                                small: 62,
                                large: 108,
                              ),
                            ),
                          ),
                        ),
                        if (!countdownActive)
                          Align(
                            alignment: Alignment.centerLeft,
                            child: SizedBox(
                              key: const Key('person-positioning-tips'),
                              width: layout.scaled(90, small: 62, large: 108),
                              child: Column(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceEvenly,
                                children: [
                                  _PositionTip(
                                    icon: Icons.accessibility_new_outlined,
                                    label: 'Stand\nstraight',
                                    compact: compact,
                                  ),
                                  _PositionTip(
                                    icon: Icons.camera_alt_outlined,
                                    label: 'Look at\ncamera',
                                    compact: compact,
                                  ),
                                  _PositionTip(
                                    icon: Icons.wb_sunny_outlined,
                                    label: 'Good\nlighting',
                                    compact: compact,
                                  ),
                                ],
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
        },
      ),
    );
  }
}

class _PositionTip extends StatelessWidget {
  const _PositionTip({
    required this.icon,
    required this.label,
    required this.compact,
  });

  final IconData icon;
  final String label;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Flexible(
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.42),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                color: SelfxKioskTokens.primary,
                size: compact ? 26 : 38,
              ),
              const SizedBox(height: 6),
              Text(
                label,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: compact ? 12 : 16,
                  fontWeight: FontWeight.w700,
                  height: 1.15,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Vector artwork only; it never reads camera frames or changes capture scope.
class PersonCaptureOutlinePainter extends CustomPainter {
  const PersonCaptureOutlinePainter({
    required this.captureScope,
    required this.countdownActive,
    this.tipRailWidth = 62,
  });

  final CaptureScope captureScope;
  final bool countdownActive;
  final double tipRailWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final aspect = captureScope == CaptureScope.top ? 0.68 : 0.48;
    final availableWidth = math.max(
      1.0,
      math.min(size.width * 0.82, size.width - 2 * (tipRailWidth + 6)),
    );
    final height = math.min(size.height * 0.94, availableWidth / aspect);
    final width = height * aspect;
    final rect = Rect.fromCenter(
      center: size.center(Offset.zero),
      width: width,
      height: height,
    );
    final path = captureScope == CaptureScope.top
        ? _upperBodyPath(rect)
        : _fullBodyPath(rect);
    final stroke = (size.shortestSide / 130).clamp(2.0, 4.0);
    final outlinePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke * 0.65 + 1
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..color = Colors.white.withValues(alpha: countdownActive ? 0.30 : 0.95);
    final contextPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke * 0.65
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withValues(alpha: countdownActive ? 0.12 : 0.38);

    final axes = Path()
      ..moveTo(rect.center.dx, rect.top)
      ..lineTo(rect.center.dx, rect.bottom)
      ..moveTo(rect.left + width * 0.2, rect.top + height * 0.43)
      ..lineTo(rect.right - width * 0.2, rect.top + height * 0.43);
    _dash(canvas, axes, contextPaint, stroke * 4);

    // Keep the original white guide's position, with no second body outline.
    canvas.save();
    canvas.translate(rect.center.dx, rect.center.dy);
    canvas.scale(1.06, 1.02);
    canvas.translate(-rect.center.dx, -rect.center.dy);
    if (captureScope == CaptureScope.bottom) {
      // Keep head/shoulder context visible for the existing readiness path.
      canvas.save();
      canvas.clipRect(
        Rect.fromLTRB(
          rect.left,
          rect.top,
          rect.right,
          rect.top + height * 0.43,
        ),
      );
      _dash(canvas, path, contextPaint, stroke * 3);
      canvas.restore();
      canvas.save();
      canvas.clipRect(
        Rect.fromLTRB(
          rect.left,
          rect.top + height * 0.43,
          rect.right,
          rect.bottom,
        ),
      );
    }
    _dash(canvas, path, outlinePaint, stroke * 3);
    if (captureScope == CaptureScope.bottom) canvas.restore();
    canvas.restore();

    if (captureScope != CaptureScope.top) {
      final ground = Rect.fromCenter(
        center: Offset(rect.center.dx, rect.bottom - height * 0.025),
        width: width * 1.1,
        height: height * 0.06,
      );
      _dash(canvas, Path()..addOval(ground), contextPaint, stroke * 4);
      for (final side in [-1, 1]) {
        final foot = Rect.fromCenter(
          center: Offset(
            rect.center.dx + side * width * 0.24,
            rect.bottom - height * 0.025,
          ),
          width: width * 0.18,
          height: height * 0.045,
        );
        canvas.drawOval(foot, outlinePaint);
        for (var toe = 0; toe < 4; toe++) {
          canvas.drawCircle(
            Offset(
              foot.left + foot.width * (0.18 + toe * 0.21),
              foot.top - stroke * 1.4,
            ),
            stroke * (0.8 + toe * 0.08),
            outlinePaint,
          );
        }
      }
    }
  }

  @override
  bool shouldRepaint(PersonCaptureOutlinePainter oldDelegate) =>
      oldDelegate.captureScope != captureScope ||
      oldDelegate.countdownActive != countdownActive ||
      oldDelegate.tipRailWidth != tipRailWidth;
}

void _dash(Canvas canvas, Path path, Paint paint, double length) {
  for (final metric in path.computeMetrics()) {
    for (
      var distance = 0.0;
      distance < metric.length;
      distance += length * 1.7
    ) {
      canvas.drawPath(
        metric.extractPath(
          distance,
          math.min(distance + length, metric.length),
        ),
        paint,
      );
    }
  }
}

Path _fullBodyPath(Rect rect) {
  // Normalized silhouette, with arms and legs separated for clear positioning.
  final path = Path()
    ..moveTo(0.31, 0.14)
    ..lineTo(0.31, 0.08)
    ..cubicTo(0.31, 0.01, 0.38, 0.01, 0.50, 0.01)
    ..cubicTo(0.62, 0.01, 0.69, 0.01, 0.69, 0.08)
    ..lineTo(0.69, 0.14)
    ..quadraticBezierTo(0.69, 0.17, 0.79, 0.19)
    ..quadraticBezierTo(0.90, 0.21, 0.90, 0.28)
    ..lineTo(0.88, 0.40)
    ..quadraticBezierTo(0.96, 0.50, 0.92, 0.56)
    ..quadraticBezierTo(0.92, 0.62, 0.82, 0.62)
    ..quadraticBezierTo(0.78, 0.62, 0.78, 0.59)
    ..lineTo(0.76, 0.46)
    ..quadraticBezierTo(0.77, 0.62, 0.80, 0.70)
    ..lineTo(0.82, 0.94)
    ..lineTo(0.68, 0.94)
    ..lineTo(0.58, 0.73)
    ..lineTo(0.50, 0.60)
    ..lineTo(0.42, 0.73)
    ..lineTo(0.32, 0.94)
    ..lineTo(0.18, 0.94)
    ..lineTo(0.20, 0.70)
    ..quadraticBezierTo(0.23, 0.62, 0.24, 0.46)
    ..lineTo(0.22, 0.59)
    ..quadraticBezierTo(0.22, 0.62, 0.18, 0.62)
    ..quadraticBezierTo(0.08, 0.62, 0.08, 0.56)
    ..quadraticBezierTo(0.04, 0.50, 0.12, 0.40)
    ..lineTo(0.10, 0.28)
    ..quadraticBezierTo(0.10, 0.21, 0.21, 0.19)
    ..quadraticBezierTo(0.31, 0.17, 0.31, 0.14);
  return _fit(path, rect);
}

Path _upperBodyPath(Rect rect) {
  final path = Path()
    ..moveTo(0.32, 0.27)
    ..lineTo(0.32, 0.15)
    ..cubicTo(0.32, 0.02, 0.40, 0.02, 0.50, 0.02)
    ..cubicTo(0.60, 0.02, 0.68, 0.02, 0.68, 0.15)
    ..lineTo(0.68, 0.27)
    ..quadraticBezierTo(0.68, 0.32, 0.80, 0.35)
    ..quadraticBezierTo(0.92, 0.40, 0.92, 0.50)
    ..lineTo(0.95, 0.89)
    ..quadraticBezierTo(0.95, 0.97, 0.82, 0.96)
    ..lineTo(0.76, 0.59)
    ..lineTo(0.78, 0.96)
    ..lineTo(0.22, 0.96)
    ..lineTo(0.24, 0.59)
    ..lineTo(0.18, 0.96)
    ..quadraticBezierTo(0.05, 0.97, 0.05, 0.89)
    ..lineTo(0.08, 0.50)
    ..quadraticBezierTo(0.08, 0.40, 0.20, 0.35)
    ..quadraticBezierTo(0.32, 0.32, 0.32, 0.27);
  return _fit(path, rect);
}

Path _fit(Path path, Rect rect) => path
    .transform(
      Matrix4.identity().scaledByDouble(rect.width, rect.height, 1, 1).storage,
    )
    .shift(rect.topLeft);
