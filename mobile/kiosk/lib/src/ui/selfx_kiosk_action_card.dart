import 'package:flutter/material.dart';

import '../theme/selfx_kiosk_theme.dart';

class SelfxKioskActionCard extends StatelessWidget {
  const SelfxKioskActionCard({
    super.key,
    required this.label,
    required this.icon,
    required this.iconColor,
    required this.onPressed,
    this.subtitle,
    this.minHeight = 82,
    this.borderRadius = 26,
    this.padding,
    this.backgroundColor = const Color(0xFFFFFCF8),
    this.disabledBackgroundColor = const Color(0xFFFFF7F0),
    this.titleColor = SelfxKioskTokens.primaryHover,
    this.subtitleColor,
    this.textAlign = TextAlign.start,
    this.crossAxisAlignment = CrossAxisAlignment.start,
    this.mainAxisAlignment = MainAxisAlignment.start,
  });

  final String label;
  final String? subtitle;
  final IconData icon;
  final Color iconColor;
  final VoidCallback? onPressed;
  final double minHeight;
  final double borderRadius;
  final EdgeInsetsGeometry? padding;
  final Color backgroundColor;
  final Color disabledBackgroundColor;
  final Color titleColor;
  final Color? subtitleColor;
  final TextAlign textAlign;
  final CrossAxisAlignment crossAxisAlignment;
  final MainAxisAlignment mainAxisAlignment;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    final effectiveTitleColor = enabled
        ? titleColor
        : SelfxKioskTokens.textMuted;
    final effectiveSubtitleColor =
        subtitleColor ??
        (enabled
            ? SelfxKioskTokens.textPrimary.withValues(alpha: 0.68)
            : SelfxKioskTokens.textMuted.withValues(alpha: 0.86));
    final effectiveIconColor = enabled ? iconColor : SelfxKioskTokens.textMuted;

    final content = DecoratedBox(
      decoration: BoxDecoration(
        color: enabled ? backgroundColor : disabledBackgroundColor,
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(
          color: enabled
              ? iconColor.withValues(alpha: 0.34)
              : SelfxKioskTokens.border,
        ),
        boxShadow: enabled ? _actionCardShadow : _disabledCardShadow,
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(minHeight: minHeight),
        child: Padding(
          padding:
              padding ??
              const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          child: Row(
            mainAxisAlignment: mainAxisAlignment,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              _SelfxActionIconBubble(
                icon: icon,
                color: effectiveIconColor,
                enabled: enabled,
                size: minHeight < 76 ? 46 : 54,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: crossAxisAlignment,
                  children: [
                    Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: textAlign,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: effectiveTitleColor,
                        fontWeight: FontWeight.w900,
                        height: 1.05,
                      ),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 7),
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: textAlign,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: effectiveSubtitleColor,
                          fontWeight: FontWeight.w700,
                          height: 1.05,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(borderRadius),
      clipBehavior: Clip.antiAlias,
      child: InkWell(onTap: onPressed, child: content),
    );
  }
}

class _SelfxActionIconBubble extends StatelessWidget {
  const _SelfxActionIconBubble({
    required this.icon,
    required this.color,
    required this.enabled,
    required this.size,
  });

  final IconData icon;
  final Color color;
  final bool enabled;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: enabled ? color : color.withValues(alpha: 0.14),
        boxShadow: enabled
            ? [
                BoxShadow(
                  color: color.withValues(alpha: 0.26),
                  blurRadius: 16,
                  offset: const Offset(0, 7),
                ),
              ]
            : null,
      ),
      child: Icon(
        icon,
        color: enabled ? Colors.white : color,
        size: size * 0.52,
      ),
    );
  }
}

const _actionCardShadow = [
  BoxShadow(color: Color(0x17102033), blurRadius: 18, offset: Offset(0, 8)),
];

const _disabledCardShadow = [
  BoxShadow(color: Color(0x0D0F172A), blurRadius: 14, offset: Offset(0, 6)),
];
