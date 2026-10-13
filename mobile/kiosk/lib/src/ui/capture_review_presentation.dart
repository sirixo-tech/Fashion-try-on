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
    this.prioritizePhoto = false,
  });

  final String imagePath;
  final VoidCallback onBack;
  final Widget actions;
  final bool prioritizePhoto;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: const _ReviewBackdrop(),
      child: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            if (prioritizePhoto) {
              final height = constraints.maxHeight;
              final headerHeight = math.max(48.0, height * 0.1);
              // Short windows need a readable footer; tall kiosks use 10/70/20.
              final footerHeight = math.max(
                constraints.maxWidth < 420 ? 260.0 : 208.0,
                height * 0.2,
              );
              final photoHeight = math.max(
                210.0,
                height - headerHeight - footerHeight,
              );
              final page = Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: constraints.maxWidth < 560 ? 12 : 24,
                ),
                child: Column(
                  children: [
                    SizedBox(
                      key: const Key('accepted-photo-header'),
                      height: headerHeight,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 104,
                            ),
                            child: SelfxLogo(
                              height: (headerHeight - 12).clamp(32.0, 84.0),
                              maxWidth: 300,
                            ),
                          ),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: _ReviewBackButton(onPressed: onBack),
                          ),
                        ],
                      ),
                    ),
                    SizedBox(
                      key: const Key('accepted-photo-preview'),
                      height: photoHeight,
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 1400),
                          child: _ReviewPhoto(
                            imagePath: imagePath,
                            expanded: true,
                          ),
                        ),
                      ),
                    ),
                    SizedBox(
                      key: const Key('accepted-photo-footer'),
                      height: footerHeight,
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 1000),
                          child: SingleChildScrollView(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: actions,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              );
              if (headerHeight + photoHeight + footerHeight > height) {
                return SingleChildScrollView(child: page);
              }
              return page;
            }
            final portrait = constraints.maxHeight > constraints.maxWidth;
            final large = portrait && constraints.maxWidth >= 760;
            final padding = constraints.maxWidth < 560 ? 20.0 : 36.0;
            final header = SizedBox(
              height: large ? 112 : 82,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 116),
                    child: SelfxLogo(
                      height: large ? 84 : 64,
                      maxWidth: large ? 300 : 230,
                    ),
                  ),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: _ReviewBackButton(onPressed: onBack),
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
            if (portrait && constraints.maxHeight < 1050) {
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

class _ReviewBackButton extends StatelessWidget {
  const _ReviewBackButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => TextButton.icon(
    key: const Key('capture-review-back'),
    onPressed: onPressed,
    icon: const Icon(Icons.arrow_back),
    label: const Text('Back'),
    style: TextButton.styleFrom(
      backgroundColor: const Color(0xFFECECEC),
      foregroundColor: SelfxKioskTokens.textPrimary,
      minimumSize: const Size(76, 44),
      padding: const EdgeInsets.symmetric(horizontal: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  );
}

class _ReviewPhoto extends StatelessWidget {
  const _ReviewPhoto({required this.imagePath, this.expanded = false});
  final String imagePath;
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    final photo = Container(
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
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.file(
              File(imagePath),
              fit: expanded ? BoxFit.contain : BoxFit.cover,
              alignment: Alignment.center,
              errorBuilder: (_, _, _) => const ColoredBox(
                color: SelfxKioskTokens.background,
                child: Center(child: Text('Captured image unavailable')),
              ),
            ),
          ],
        ),
      ),
    );
    return expanded ? photo : AspectRatio(aspectRatio: 0.72, child: photo);
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
