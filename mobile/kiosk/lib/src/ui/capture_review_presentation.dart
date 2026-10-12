import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/selfx_kiosk_theme.dart';
import 'selfx_logo.dart';

/// Presentation only; photo acceptance, analysis and navigation stay in Review.
class CaptureReviewPresentation extends StatelessWidget {
  const CaptureReviewPresentation({
    super.key,
    required this.imagePath,
    required this.onBack,
    required this.actions,
  });

  final String imagePath;
  final VoidCallback onBack;
  final Widget actions;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: const _ReviewBackdrop(),
      child: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final portrait = constraints.maxHeight > constraints.maxWidth;
            final large = portrait && constraints.maxWidth >= 760;
            final padding = constraints.maxWidth < 560 ? 20.0 : 36.0;
            final header = SizedBox(
              height: large ? 112 : 82,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 58),
                    child: SelfxLogo(
                      height: large ? 84 : 64,
                      maxWidth: large ? 300 : 230,
                    ),
                  ),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: IconButton.filled(
                      key: const Key('capture-review-back'),
                      tooltip: 'Back',
                      onPressed: onBack,
                      icon: const Icon(Icons.arrow_back),
                      color: SelfxKioskTokens.textPrimary,
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.white,
                        minimumSize: const Size.square(52),
                        elevation: 2,
                        shadowColor: const Color(0x16000000),
                      ),
                    ),
                  ),
                ],
              ),
            );
            final photo = _ReviewPhoto(imagePath: imagePath);
            final actionPanel = Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 820),
                child: actions,
              ),
            );
            if (portrait && constraints.maxHeight < 720) {
              return SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(padding, 0, padding, 24),
                child: Column(
                  children: [
                    header,
                    SizedBox(
                      height: math.max(260, constraints.maxHeight * 0.5),
                      child: photo,
                    ),
                    const SizedBox(height: 22),
                    actionPanel,
                  ],
                ),
              );
            }
            return Padding(
              padding: EdgeInsets.fromLTRB(
                padding,
                0,
                padding,
                large ? 40 : 24,
              ),
              child: Column(
                children: [
                  header,
                  const SizedBox(height: 14),
                  if (portrait) ...[
                    Expanded(
                      child: Center(
                        child: ConstrainedBox(
                          constraints: BoxConstraints(
                            maxWidth: constraints.maxWidth * 0.76,
                          ),
                          child: photo,
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    actionPanel,
                  ] else
                    Expanded(
                      child: Row(
                        children: [
                          Expanded(child: photo),
                          const SizedBox(width: 32),
                          Expanded(
                            child: SingleChildScrollView(child: actionPanel),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _ReviewPhoto extends StatelessWidget {
  const _ReviewPhoto({required this.imagePath});
  final String imagePath;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 0.72,
      child: Container(
        key: const Key('capture-review-photo-frame'),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(32),
          boxShadow: const [
            BoxShadow(
              color: Color(0x180F172A),
              blurRadius: 28,
              offset: Offset(0, 12),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(22),
          child: Image.file(
            File(imagePath),
            fit: BoxFit.cover,
            alignment: Alignment.center,
            errorBuilder: (_, _, _) => const ColoredBox(
              color: SelfxKioskTokens.background,
              child: Center(child: Text('Captured image unavailable')),
            ),
          ),
        ),
      ),
    );
  }
}

class _ReviewBackdrop extends CustomPainter {
  const _ReviewBackdrop();

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawColor(SelfxKioskTokens.reviewBackground, BlendMode.src);
    final pale = Paint()..color = const Color(0xFFFFEBC6);
    canvas.drawOval(
      Rect.fromLTWH(
        -size.width * 0.28,
        -size.height * 0.19,
        size.width * 0.6,
        size.height * 0.32,
      ),
      pale,
    );
    canvas.drawOval(
      Rect.fromLTWH(
        size.width * 0.91,
        size.height * 0.55,
        size.width * 0.38,
        size.height * 0.29,
      ),
      pale,
    );
    final wave = Path()
      ..moveTo(0, size.height * 0.95)
      ..cubicTo(
        size.width * 0.35,
        size.height * 0.97,
        size.width * 0.52,
        size.height * 1.06,
        size.width,
        size.height * 0.92,
      )
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(wave, Paint()..color = const Color(0xFFFFD986));
    final corner = Path()
      ..moveTo(size.width * 0.72, size.height)
      ..lineTo(size.width, size.height * 0.94)
      ..lineTo(size.width, size.height)
      ..close();
    canvas.drawPath(corner, Paint()..color = const Color(0xFFFFB655));
  }

  @override
  bool shouldRepaint(covariant _ReviewBackdrop oldDelegate) => false;
}
