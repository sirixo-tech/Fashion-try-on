import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/selfx_kiosk_theme.dart';

enum SelfxGlassButtonVariant { primary, secondary, selected, ghost, danger }

class SelfxGlassButton extends StatefulWidget {
  const SelfxGlassButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = SelfxGlassButtonVariant.primary,
    this.icon,
    this.subtitle,
    this.trailing,
    this.padding,
    this.minHeight = 56,
    this.textAlign = TextAlign.center,
    this.crossAxisAlignment = CrossAxisAlignment.center,
    this.expanded = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final SelfxGlassButtonVariant variant;
  final IconData? icon;
  final String? subtitle;
  final Widget? trailing;
  final EdgeInsetsGeometry? padding;
  final double minHeight;
  final TextAlign textAlign;
  final CrossAxisAlignment crossAxisAlignment;
  final bool expanded;

  @override
  State<SelfxGlassButton> createState() => _SelfxGlassButtonState();
}

class _SelfxGlassButtonState extends State<SelfxGlassButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final style = _GlassButtonStyle.forVariant(widget.variant);
    final enabled = widget.onPressed != null;
    final contentColor = enabled
        ? style.foreground
        : SelfxKioskTokens.textMuted;

    return Semantics(
      button: true,
      enabled: enabled,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusLarge),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: style.blur, sigmaY: style.blur),
          child: AnimatedScale(
            scale: _pressed && enabled ? 0.985 : 1,
            duration: const Duration(milliseconds: 110),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: enabled ? style.background : const Color(0xFFE5E7EB),
                borderRadius: BorderRadius.circular(
                  SelfxKioskTokens.radiusLarge,
                ),
                border: Border.all(color: style.border, width: 1.2),
                boxShadow: enabled ? style.shadow : null,
                gradient: enabled ? style.highlight : null,
              ),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: widget.onPressed,
                  onHighlightChanged: (value) {
                    if (mounted) {
                      setState(() => _pressed = value);
                    }
                  },
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minHeight: widget.minHeight),
                    child: Padding(
                      padding:
                          widget.padding ??
                          const EdgeInsets.symmetric(
                            horizontal: 24,
                            vertical: 16,
                          ),
                      child: Row(
                        mainAxisSize: widget.expanded
                            ? MainAxisSize.max
                            : MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          if (widget.icon != null) ...[
                            Icon(widget.icon, color: contentColor, size: 24),
                            const SizedBox(width: 12),
                          ],
                          Flexible(
                            fit: widget.expanded
                                ? FlexFit.tight
                                : FlexFit.loose,
                            child: Column(
                              crossAxisAlignment: widget.crossAxisAlignment,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  widget.label,
                                  textAlign: widget.textAlign,
                                  style: Theme.of(context).textTheme.titleMedium
                                      ?.copyWith(
                                        color: contentColor,
                                        fontWeight: FontWeight.w800,
                                      ),
                                ),
                                if (widget.subtitle != null) ...[
                                  const SizedBox(height: 6),
                                  Text(
                                    widget.subtitle!,
                                    textAlign: widget.textAlign,
                                    style: Theme.of(context).textTheme.bodyMedium
                                        ?.copyWith(
                                          color: contentColor.withValues(
                                            alpha: widget.variant ==
                                                    SelfxGlassButtonVariant
                                                        .primary ||
                                                widget.variant ==
                                                    SelfxGlassButtonVariant
                                                        .selected
                                                ? 0.86
                                                : 0.78,
                                          ),
                                        ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          if (widget.trailing != null) ...[
                            const SizedBox(width: 12),
                            IconTheme(
                              data: IconThemeData(color: contentColor),
                              child: widget.trailing!,
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _GlassButtonStyle {
  const _GlassButtonStyle({
    required this.background,
    required this.foreground,
    required this.border,
    required this.blur,
    required this.shadow,
    required this.highlight,
  });

  final Color background;
  final Color foreground;
  final Color border;
  final double blur;
  final List<BoxShadow> shadow;
  final Gradient? highlight;

  static _GlassButtonStyle forVariant(SelfxGlassButtonVariant variant) {
    return switch (variant) {
      SelfxGlassButtonVariant.primary => _GlassButtonStyle(
        background: SelfxKioskTokens.primary.withValues(alpha: 0.99),
        foreground: SelfxKioskTokens.onPrimary,
        border: SelfxKioskTokens.primaryHover.withValues(alpha: 0.9),
        blur: 8,
        shadow: SelfxKioskTokens.primaryGlassShadow,
        highlight: SelfxKioskTokens.primaryGlassHighlight,
      ),
      SelfxGlassButtonVariant.selected => _GlassButtonStyle(
        background: SelfxKioskTokens.primary.withValues(alpha: 0.97),
        foreground: SelfxKioskTokens.onPrimary,
        border: SelfxKioskTokens.primary,
        blur: 8,
        shadow: SelfxKioskTokens.primaryGlassShadow,
        highlight: SelfxKioskTokens.primaryGlassHighlight,
      ),
      SelfxGlassButtonVariant.secondary => _GlassButtonStyle(
        background: SelfxKioskTokens.glassSurface,
        foreground: SelfxKioskTokens.textPrimary,
        border: Colors.white.withValues(alpha: 0.64),
        blur: 10,
        shadow: SelfxKioskTokens.softShadow,
        highlight: SelfxKioskTokens.neutralGlassHighlight,
      ),
      SelfxGlassButtonVariant.ghost => _GlassButtonStyle(
        background: Colors.white.withValues(alpha: 0.18),
        foreground: SelfxKioskTokens.textPrimary,
        border: Colors.white.withValues(alpha: 0.34),
        blur: 8,
        shadow: const [],
        highlight: SelfxKioskTokens.neutralGlassHighlight,
      ),
      SelfxGlassButtonVariant.danger => _GlassButtonStyle(
        background: SelfxKioskTokens.danger.withValues(alpha: 0.12),
        foreground: SelfxKioskTokens.danger,
        border: SelfxKioskTokens.danger.withValues(alpha: 0.35),
        blur: 8,
        shadow: const [],
        highlight: null,
      ),
    };
  }
}
