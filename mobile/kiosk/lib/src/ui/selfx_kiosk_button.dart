import 'package:flutter/material.dart';

import '../theme/selfx_kiosk_theme.dart';

enum SelfxKioskButtonVariant { primary, secondary, selected, ghost, danger }

class SelfxKioskButton extends StatefulWidget {
  const SelfxKioskButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = SelfxKioskButtonVariant.primary,
    this.icon,
    this.subtitle,
    this.trailing,
    this.padding,
    this.minHeight = 56,
    this.textAlign = TextAlign.center,
    this.crossAxisAlignment = CrossAxisAlignment.center,
    this.mainAxisAlignment = MainAxisAlignment.start,
    this.animateSurface = true,
    this.expanded = false,
    this.borderRadius,
    this.backgroundColor,
    this.foregroundColor,
    this.borderColor,
  });

  final String label;
  final VoidCallback? onPressed;
  final SelfxKioskButtonVariant variant;
  final IconData? icon;
  final String? subtitle;
  final Widget? trailing;
  final EdgeInsetsGeometry? padding;
  final double minHeight;
  final TextAlign textAlign;
  final CrossAxisAlignment crossAxisAlignment;
  final MainAxisAlignment mainAxisAlignment;
  final bool animateSurface;
  final bool expanded;
  final double? borderRadius;
  final Color? backgroundColor;
  final Color? foregroundColor;
  final Color? borderColor;

  @override
  State<SelfxKioskButton> createState() => _SelfxKioskButtonState();
}

class _SelfxKioskButtonState extends State<SelfxKioskButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final style = _SolidButtonStyle.forVariant(widget.variant);
    final enabled = widget.onPressed != null;
    final background = enabled
        ? widget.backgroundColor ?? style.background
        : const Color(0xFFE5E7EB);
    final foreground = enabled
        ? widget.foregroundColor ?? style.foreground
        : SelfxKioskTokens.textMuted;
    final border = enabled
        ? widget.borderColor ?? widget.backgroundColor ?? style.border
        : const Color(0xFFD1D5DB);
    final gradient = enabled && widget.backgroundColor == null
        ? style.gradient
        : null;

    return Semantics(
      button: true,
      enabled: enabled,
      child: AnimatedScale(
        scale: _pressed && enabled ? 0.985 : 1,
        duration: const Duration(milliseconds: 110),
        child: _ButtonMaterial(
          animate: widget.animateSurface,
          background: background,
          gradient: gradient,
          elevation: enabled ? style.elevation : 0,
          shadowColor: style.shadowColor,
          border: border,
          borderRadius: widget.borderRadius,
          child: InkWell(
            onTap: widget.onPressed,
            onHighlightChanged: (value) {
              if (mounted) {
                setState(() => _pressed = value);
              }
            },
            hoverColor: style.hoverColor,
            focusColor: style.focusColor,
            splashColor: style.splashColor,
            child: _ButtonContent(widget: widget, foreground: foreground),
          ),
        ),
      ),
    );
  }
}

class _ButtonMaterial extends StatelessWidget {
  const _ButtonMaterial({
    required this.animate,
    required this.background,
    required this.gradient,
    required this.elevation,
    required this.shadowColor,
    required this.border,
    required this.borderRadius,
    required this.child,
  });

  final bool animate;
  final Color background;
  final Gradient? gradient;
  final double elevation;
  final Color shadowColor;
  final Color border;
  final double? borderRadius;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(
        borderRadius ?? SelfxKioskTokens.buttonRadius,
      ),
      side: BorderSide(color: border, width: 1.2),
    );
    final content = gradient == null
        ? child
        : Ink(
            decoration: ShapeDecoration(gradient: gradient, shape: shape),
            child: child,
          );
    final material = Material(
      color: gradient == null ? background : Colors.transparent,
      elevation: elevation,
      shadowColor: shadowColor,
      shape: shape,
      clipBehavior: Clip.antiAlias,
      animationDuration: animate ? kThemeChangeDuration : Duration.zero,
      child: content,
    );
    if (animate) {
      return material;
    }
    return KeyedSubtree(
      key: ValueKey<int>(Object.hash(background, gradient, border, elevation)),
      child: material,
    );
  }
}

class _ButtonContent extends StatelessWidget {
  const _ButtonContent({required this.widget, required this.foreground});

  final SelfxKioskButton widget;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: BoxConstraints(minHeight: widget.minHeight),
      child: Padding(
        padding:
            widget.padding ??
            const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        child: Align(
          alignment: widget.textAlign == TextAlign.center
              ? Alignment.center
              : Alignment.centerLeft,
          child: Row(
            mainAxisSize: widget.expanded ? MainAxisSize.max : MainAxisSize.min,
            mainAxisAlignment: widget.mainAxisAlignment,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              if (widget.icon != null) ...[
                Icon(widget.icon, color: foreground, size: 24),
                const SizedBox(width: 12),
              ],
              Flexible(
                fit: widget.expanded ? FlexFit.tight : FlexFit.loose,
                child: Column(
                  crossAxisAlignment: widget.crossAxisAlignment,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        widget.label,
                        textAlign: widget.textAlign,
                        maxLines: 1,
                        softWrap: false,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(
                              color: foreground,
                              fontWeight: FontWeight.w800,
                            ),
                      ),
                    ),
                    if (widget.subtitle != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        widget.subtitle!,
                        textAlign: widget.textAlign,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: _subtitleColor(foreground, widget.variant),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (widget.trailing != null) ...[
                const SizedBox(width: 12),
                IconTheme(
                  data: IconThemeData(color: foreground),
                  child: widget.trailing!,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SolidButtonStyle {
  const _SolidButtonStyle({
    required this.background,
    required this.foreground,
    required this.border,
    this.gradient,
    required this.elevation,
    required this.shadowColor,
    required this.hoverColor,
    required this.focusColor,
    required this.splashColor,
  });

  final Color background;
  final Color foreground;
  final Color border;
  final Gradient? gradient;
  final double elevation;
  final Color shadowColor;
  final Color hoverColor;
  final Color focusColor;
  final Color splashColor;

  static _SolidButtonStyle forVariant(SelfxKioskButtonVariant variant) {
    return switch (variant) {
      SelfxKioskButtonVariant.primary => const _SolidButtonStyle(
        background: SelfxKioskTokens.buttonPrimary,
        foreground: SelfxKioskTokens.onPrimary,
        border: SelfxKioskTokens.primary,
        gradient: LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: [
            SelfxKioskTokens.primaryGradientStart,
            SelfxKioskTokens.primaryGradientEnd,
          ],
        ),
        elevation: 3,
        shadowColor: Color(0x30FF7119),
        hoverColor: Color(0x1AFFFFFF),
        focusColor: Color(0x24FFFFFF),
        splashColor: Color(0x2EFFFFFF),
      ),
      SelfxKioskButtonVariant.selected => const _SolidButtonStyle(
        background: SelfxKioskTokens.buttonPrimary,
        foreground: SelfxKioskTokens.onPrimary,
        border: SelfxKioskTokens.primary,
        elevation: 2,
        shadowColor: Color(0x26FF7119),
        hoverColor: Color(0x1AFFFFFF),
        focusColor: Color(0x24FFFFFF),
        splashColor: Color(0x2EFFFFFF),
      ),
      SelfxKioskButtonVariant.secondary => const _SolidButtonStyle(
        background: SelfxKioskTokens.buttonSecondary,
        foreground: SelfxKioskTokens.onSecondary,
        border: SelfxKioskTokens.secondary,
        elevation: 2,
        shadowColor: Color(0x26FFA21C),
        hoverColor: Color(0x1AFFFFFF),
        focusColor: Color(0x24FFFFFF),
        splashColor: Color(0x2EFFFFFF),
      ),
      SelfxKioskButtonVariant.ghost => const _SolidButtonStyle(
        background: SelfxKioskTokens.buttonGhost,
        foreground: SelfxKioskTokens.textPrimary,
        border: Color(0x00FFFFFF),
        elevation: 0,
        shadowColor: Color(0x00000000),
        hoverColor: Color(0x0F111827),
        focusColor: Color(0x14FF7119),
        splashColor: Color(0x1AFF7119),
      ),
      SelfxKioskButtonVariant.danger => const _SolidButtonStyle(
        background: Color(0xFFFFF1F0),
        foreground: SelfxKioskTokens.danger,
        border: Color(0xFFFFCDC7),
        elevation: 0,
        shadowColor: Color(0x00000000),
        hoverColor: Color(0xFFFFE4E0),
        focusColor: Color(0xFFFFD8D2),
        splashColor: Color(0x26D92D20),
      ),
    };
  }
}

Color _subtitleColor(Color foreground, SelfxKioskButtonVariant variant) {
  if (variant == SelfxKioskButtonVariant.primary ||
      variant == SelfxKioskButtonVariant.secondary ||
      variant == SelfxKioskButtonVariant.selected) {
    return foreground.withValues(alpha: 0.9);
  }
  if (variant == SelfxKioskButtonVariant.ghost) {
    return SelfxKioskTokens.textSecondary;
  }
  return SelfxKioskTokens.textSecondary;
}
