import 'package:flutter/material.dart';

import '../theme/selfx_kiosk_theme.dart';
import 'responsive_kiosk_layout.dart';

/// Keeps navigation usable beside guidance, including during countdown.
class CaptureGuideHeader extends StatelessWidget {
  const CaptureGuideHeader({
    super.key,
    required this.guidance,
    this.leading,
    this.showGuidance = true,
  });

  final Widget guidance;
  final Widget? leading;
  final bool showGuidance;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      if (leading != null) ...[leading!, const SizedBox(width: 12)],
      Expanded(
        child: Visibility(
          visible: showGuidance,
          maintainSize: true,
          maintainState: true,
          maintainAnimation: true,
          child: guidance,
        ),
      ),
    ],
  );
}

/// Shared readable guidance for person, garment and jewellery camera overlays.
class CaptureGuidePanel extends StatelessWidget {
  const CaptureGuidePanel({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.decoration,
  });

  final IconData icon;
  final String title;
  final String message;
  final BoxDecoration? decoration;

  @override
  Widget build(BuildContext context) {
    final layout = KioskLayoutMetrics.fromSize(MediaQuery.sizeOf(context));
    final iconSize = layout.scaled(20, small: 17, large: 23, extraLarge: 27);
    return DecoratedBox(
      key: const Key('camera-framing-guidance-panel'),
      decoration:
          decoration ??
          BoxDecoration(
            color: Colors.black.withValues(alpha: 0.48),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.18),
                blurRadius: 18,
                offset: const Offset(0, 8),
              ),
            ],
          ),
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: layout.scaled(14, small: 11, large: 17, extraLarge: 20),
          vertical: layout.scaled(9, small: 7, large: 11, extraLarge: 13),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    icon,
                    key: const Key('camera-framing-guidance-icon'),
                    color: SelfxKioskTokens.secondary,
                    size: iconSize,
                  ),
                  const SizedBox(width: 9),
                  Flexible(
                    child: Text(
                      title,
                      key: const Key('camera-framing-guide-label'),
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.white,
                        fontFamily: SelfxKioskTokens.bodyFontFamily,
                        fontSize: layout.scaled(
                          22,
                          small: 18,
                          large: 26,
                          extraLarge: 30,
                        ),
                        fontWeight: FontWeight.w900,
                        height: 1.15,
                        letterSpacing: 0,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            Text(
              message,
              key: const Key('camera-framing-guidance-message'),
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.9),
                fontFamily: SelfxKioskTokens.bodyFontFamily,
                fontSize: layout.scaled(
                  16,
                  small: 14,
                  large: 18,
                  extraLarge: 20,
                ),
                fontWeight: FontWeight.w700,
                height: 1.25,
                letterSpacing: 0,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
