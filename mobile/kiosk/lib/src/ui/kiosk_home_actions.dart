import 'package:flutter/material.dart';

import '../theme/selfx_kiosk_theme.dart';
import '../tryon/kiosk_garment_input.dart';

/// The two-stage customer menu. Selecting a vertical does not start a session.
class KioskHomeActions extends StatelessWidget {
  const KioskHomeActions({
    super.key,
    required this.selectedVertical,
    required this.garmentEnabled,
    required this.jewelleryEnabled,
    required this.onSelectVertical,
    required this.onBack,
    required this.onBrowseGarments,
    required this.onVirtualTryOn,
    required this.onUploadGarmentPhoto,
    required this.onBrowseJewellery,
    required this.onUploadJewelleryPhoto,
    this.busy = false,
  });

  final KioskTryOnVertical? selectedVertical;
  final bool garmentEnabled;
  final bool jewelleryEnabled;
  final ValueChanged<KioskTryOnVertical> onSelectVertical;
  final VoidCallback onBack;
  final VoidCallback onBrowseGarments;
  final VoidCallback onVirtualTryOn;
  final VoidCallback onUploadGarmentPhoto;
  final VoidCallback onBrowseJewellery;
  final VoidCallback onUploadJewelleryPhoto;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return AnimatedSize(
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeInOutCubic,
      alignment: Alignment.bottomCenter,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 280),
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        transitionBuilder: (child, animation) => AnimatedBuilder(
          animation: animation,
          builder: (context, _) => IgnorePointer(
            ignoring: animation.status == AnimationStatus.reverse,
            child: FadeTransition(
              opacity: animation,
              child: SlideTransition(
                position: Tween<Offset>(
                  begin: const Offset(0.06, 0.03),
                  end: Offset.zero,
                ).animate(animation),
                child: child,
              ),
            ),
          ),
        ),
        child: selectedVertical == null ? _categories() : _menu(context),
      ),
    );
  }

  Widget _categories() => LayoutBuilder(
    key: const ValueKey('home-categories'),
    builder: (context, constraints) {
      final cards = [
        if (garmentEnabled)
          _CategoryCard(
            key: const Key('home-garments-category'),
            jewellery: false,
            onPressed: busy
                ? null
                : () => onSelectVertical(KioskTryOnVertical.garment),
          ),
        if (jewelleryEnabled)
          _CategoryCard(
            key: const Key('home-jewellery-category'),
            jewellery: true,
            onPressed: busy
                ? null
                : () => onSelectVertical(KioskTryOnVertical.jewellery),
          ),
      ];
      if (constraints.maxWidth < 360 || cards.length < 2) {
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var index = 0; index < cards.length; index++) ...[
              if (index > 0) const SizedBox(height: 16),
              cards[index],
            ],
          ],
        );
      }
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: cards.first),
          const SizedBox(width: 16),
          Expanded(child: cards.last),
        ],
      );
    },
  );

  Widget _menu(BuildContext context) {
    final jewellery = selectedVertical == KioskTryOnVertical.jewellery;
    return Column(
      key: ValueKey(selectedVertical),
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            key: const Key('home-menu-back'),
            onPressed: busy ? null : onBack,
            style: TextButton.styleFrom(
              foregroundColor: Colors.white,
              minimumSize: const Size(80, 48),
            ),
            icon: const Icon(Icons.arrow_back, size: 22),
            label: Text(jewellery ? 'Jewellery' : 'Garments'),
          ),
        ),
        const SizedBox(height: 8),
        KioskHomeMenuButton(
          key: Key(
            jewellery ? 'start-jewellery-try-on' : 'garment-catalog-start',
          ),
          label: jewellery ? 'Browse Jewellery' : 'Browse Garments',
          style: KioskHomeMenuButtonStyle.browse,
          jewellery: jewellery,
          onPressed: busy
              ? null
              : jewellery
              ? onBrowseJewellery
              : onBrowseGarments,
        ),
        if (!jewellery) ...[
          const SizedBox(height: 16),
          KioskHomeMenuButton(
            key: const Key('start-try-on'),
            label: 'Virtual Try-On',
            style: KioskHomeMenuButtonStyle.virtualTryOn,
            onPressed: busy ? null : onVirtualTryOn,
          ),
        ],
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Row(
            children: [
              Expanded(child: Divider(color: Colors.white38)),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 18),
                child: Text('OR', style: TextStyle(color: Colors.white70)),
              ),
              Expanded(child: Divider(color: Colors.white38)),
            ],
          ),
        ),
        KioskHomeMenuButton(
          key: Key(
            jewellery
                ? 'upload-jewellery-from-mobile-start'
                : 'upload-from-mobile-start',
          ),
          label: 'Upload From Mobile',
          style: KioskHomeMenuButtonStyle.mobile,
          onPressed: busy
              ? null
              : jewellery
              ? onUploadJewelleryPhoto
              : onUploadGarmentPhoto,
        ),
      ],
    );
  }
}

enum KioskHomeMenuButtonStyle { browse, virtualTryOn, mobile }

class KioskHomeMenuButton extends StatelessWidget {
  const KioskHomeMenuButton({
    super.key,
    required this.label,
    required this.style,
    required this.onPressed,
    this.jewellery = false,
  });

  final String label;
  final KioskHomeMenuButtonStyle style;
  final VoidCallback? onPressed;
  final bool jewellery;

  @override
  Widget build(BuildContext context) {
    final mobile = style == KioskHomeMenuButtonStyle.mobile;
    final browse = style == KioskHomeMenuButtonStyle.browse;
    final foreground = mobile ? SelfxKioskTokens.homeNavy : Colors.white;
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact =
            constraints.maxWidth < 440 ||
            MediaQuery.sizeOf(context).height < 720;
        return _HomeTapSurface(
          onPressed: onPressed,
          radius: compact ? 24 : 32,
          color: mobile
              ? Colors.white
              : SelfxKioskTokens.homeDark.withValues(alpha: 0.82),
          gradient: browse
              ? const LinearGradient(
                  begin: Alignment.bottomLeft,
                  end: Alignment.topRight,
                  colors: [
                    SelfxKioskTokens.homeOrangeStart,
                    SelfxKioskTokens.homeOrangeEnd,
                  ],
                )
              : null,
          borderColor: mobile ? Colors.white : SelfxKioskTokens.homeOrange,
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: compact ? 60 : 92),
            child: Padding(
              padding: EdgeInsets.symmetric(
                horizontal: compact ? 18 : 30,
                vertical: compact ? 12 : 16,
              ),
              child: Row(
                children: [
                  if (mobile)
                    Icon(
                      Icons.file_upload_outlined,
                      size: compact ? 30 : 40,
                      color: foreground,
                    )
                  else if (jewellery)
                    Icon(
                      Icons.diamond_outlined,
                      size: compact ? 32 : 44,
                      color: foreground,
                    )
                  else
                    _HangerIcon(
                      color: foreground,
                      size: compact ? 34 : 46,
                      sparkle: !browse,
                    ),
                  SizedBox(width: compact ? 14 : 22),
                  Expanded(
                    child: Text(
                      label,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontFamily: SelfxKioskTokens.bodyFontFamily,
                        fontSize: compact ? 19 : 28,
                        fontWeight: FontWeight.w700,
                        color: foreground,
                      ),
                    ),
                  ),
                  SizedBox(width: compact ? 10 : 20),
                  Icon(
                    Icons.arrow_forward,
                    size: compact ? 24 : 34,
                    color: foreground,
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({
    super.key,
    required this.jewellery,
    required this.onPressed,
  });

  final bool jewellery;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final accent = jewellery
        ? SelfxKioskTokens.homeGold
        : SelfxKioskTokens.homeOrange;
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 250;
        return _HomeTapSurface(
          onPressed: onPressed,
          radius: 28,
          color: SelfxKioskTokens.homeDark.withValues(alpha: 0.88),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              accent.withValues(alpha: jewellery ? 0.06 : 0.16),
              SelfxKioskTokens.homeDark.withValues(alpha: 0.88),
            ],
          ),
          borderColor: accent,
          glow: true,
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: compact ? 205 : 250),
            child: Padding(
              padding: EdgeInsets.all(compact ? 18 : 28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (jewellery)
                    Icon(
                      Icons.diamond_outlined,
                      color: accent,
                      size: compact ? 48 : 64,
                    )
                  else
                    _HangerIcon(color: accent, size: compact ? 48 : 64),
                  const SizedBox(height: 16),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(
                        child: Text(
                          jewellery ? 'Try On\nJewellery' : 'Browse\nGarments',
                          style: TextStyle(
                            color: Colors.white,
                            fontFamily: SelfxKioskTokens.headingFontFamily,
                            fontSize: compact ? 24 : 32,
                            fontWeight: FontWeight.w700,
                            height: 1.12,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      DecoratedBox(
                        decoration: BoxDecoration(
                          color: accent,
                          shape: BoxShape.circle,
                        ),
                        child: Padding(
                          padding: EdgeInsets.all(compact ? 10 : 14),
                          child: Icon(
                            Icons.arrow_forward,
                            color: jewellery
                                ? SelfxKioskTokens.homeNavy
                                : Colors.white,
                            size: compact ? 24 : 30,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    jewellery ? 'Explore styles' : 'Explore our collection',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.9),
                      fontSize: compact ? 15 : 19,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _HomeTapSurface extends StatelessWidget {
  const _HomeTapSurface({
    required this.onPressed,
    required this.radius,
    required this.color,
    required this.borderColor,
    required this.child,
    this.gradient,
    this.glow = false,
  });

  final VoidCallback? onPressed;
  final double radius;
  final Color color;
  final Color borderColor;
  final Gradient? gradient;
  final Widget child;
  final bool glow;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    enabled: onPressed != null,
    child: AnimatedOpacity(
      opacity: onPressed == null ? 0.55 : 1,
      duration: const Duration(milliseconds: 120),
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          boxShadow: glow
              ? [
                  BoxShadow(
                    color: borderColor.withValues(alpha: 0.22),
                    blurRadius: 18,
                    spreadRadius: 1,
                  ),
                ]
              : null,
        ),
        child: Material(
          color: color,
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radius),
            side: BorderSide(color: borderColor, width: 2),
          ),
          child: Ink(
            decoration: BoxDecoration(gradient: gradient),
            child: InkWell(
              onTap: onPressed,
              splashColor: borderColor.withValues(alpha: 0.25),
              child: child,
            ),
          ),
        ),
      ),
    ),
  );
}

class _HangerIcon extends StatelessWidget {
  const _HangerIcon({
    required this.color,
    required this.size,
    this.sparkle = false,
  });
  final Color color;
  final double size;
  final bool sparkle;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: size,
    height: size,
    child: CustomPaint(painter: _HangerPainter(color, sparkle)),
  );
}

class _HangerPainter extends CustomPainter {
  const _HangerPainter(this.color, this.sparkle);
  final Color color;
  final bool sparkle;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width, size.height);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.055
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final path = Path()
      ..moveTo(0.42, 0.22)
      ..cubicTo(0.42, 0.04, 0.67, 0.08, 0.6, 0.25)
      ..lineTo(0.5, 0.4)
      ..lineTo(0.5, 0.49)
      ..lineTo(0.08, 0.78)
      ..quadraticBezierTo(0.02, 0.85, 0.12, 0.85)
      ..lineTo(0.88, 0.85)
      ..quadraticBezierTo(0.98, 0.85, 0.92, 0.78)
      ..lineTo(0.5, 0.49);
    canvas.drawPath(path, paint);
    if (sparkle) {
      canvas.drawLine(const Offset(0.82, 0.08), const Offset(0.82, 0.3), paint);
      canvas.drawLine(
        const Offset(0.72, 0.19),
        const Offset(0.92, 0.19),
        paint,
      );
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_HangerPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.sparkle != sparkle;
}
