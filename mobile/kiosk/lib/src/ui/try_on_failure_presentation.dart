import 'package:flutter/material.dart';

import '../theme/selfx_kiosk_theme.dart';
import 'selfx_kiosk_action_card.dart';
import 'selfx_logo.dart';
import 'kiosk_attention_animations.dart';

const tryOnFailureIllustrationAsset =
    'assets/illustrations/try-on-unavailable.png';

/// Customer-facing presentation only; recovery actions remain in the workflow.
class TryOnFailurePresentation extends StatelessWidget {
  const TryOnFailurePresentation({
    super.key,
    required this.title,
    required this.message,
    required this.onBack,
    required this.actions,
  });

  final String title;
  final String message;
  final VoidCallback onBack;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.white,
    body: Stack(
      children: [
        const Positioned.fill(
          child: IgnorePointer(child: CustomPaint(painter: _FailureBackdrop())),
        ),
        SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final narrow = constraints.maxWidth < 560;
              final padding = narrow ? 18.0 : 32.0;
              final illustrationHeight = (constraints.maxHeight * 0.34).clamp(
                160.0,
                480.0,
              );
              return SingleChildScrollView(
                key: const Key('try-on-failure-page'),
                padding: EdgeInsets.fromLTRB(padding, 16, padding, 28),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 980),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SizedBox(
                          height: narrow ? 68 : 96,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              Padding(
                                padding: EdgeInsets.symmetric(
                                  horizontal: narrow ? 86 : 110,
                                ),
                                child: SelfxLogo(
                                  height: narrow ? 48 : 80,
                                  maxWidth: 320,
                                ),
                              ),
                              Align(
                                alignment: Alignment.centerLeft,
                                child: TextButton.icon(
                                  key: const Key('generation-back'),
                                  onPressed: onBack,
                                  style: TextButton.styleFrom(
                                    backgroundColor: const Color(0xFFECECEC),
                                    foregroundColor:
                                        SelfxKioskTokens.textPrimary,
                                    minimumSize: const Size(76, 44),
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                    ),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                  ),
                                  icon: const Icon(Icons.arrow_back),
                                  label: const Text('Back'),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 24),
                        Image.asset(
                          tryOnFailureIllustrationAsset,
                          key: const Key('try-on-failure-illustration'),
                          height: illustrationHeight,
                          fit: BoxFit.contain,
                          excludeFromSemantics: true,
                        ),
                        const SizedBox(height: 24),
                        Text(
                          title,
                          key: const Key('try-on-failure-title'),
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.displaySmall
                              ?.copyWith(
                                color: SelfxKioskTokens.homeNavy,
                                fontWeight: FontWeight.w900,
                                fontSize: narrow ? 30 : 48,
                                height: 1.12,
                              ),
                        ),
                        const SizedBox(height: 18),
                        Center(
                          child: Container(
                            width: 76,
                            height: 5,
                            decoration: BoxDecoration(
                              color: SelfxKioskTokens.primary,
                              borderRadius: BorderRadius.circular(5),
                            ),
                          ),
                        ),
                        const SizedBox(height: 22),
                        Text(
                          message,
                          key: const Key('try-on-failure-message'),
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyLarge
                              ?.copyWith(
                                color: SelfxKioskTokens.textSecondary,
                                fontSize: narrow ? 18 : 24,
                                height: 1.4,
                              ),
                        ),
                        const SizedBox(height: 32),
                        ...actions,
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    ),
  );
}

/// Uses the shared action card's icon bubble, typography and touch behavior.
class TryOnFailureAction extends StatelessWidget {
  const TryOnFailureAction({
    super.key,
    required this.onPressed,
    required this.icon,
    required this.accentColor,
    required this.label,
    required this.subtitle,
    this.primary = false,
    this.secondary = false,
    this.pulse = false,
  });

  final VoidCallback? onPressed;
  final IconData icon;
  final Color accentColor;
  final String label;
  final String subtitle;
  final bool primary;
  final bool secondary;
  final bool pulse;

  @override
  Widget build(BuildContext context) {
    final blue = accentColor == const Color(0xFF2384D6);
    final action = SelfxKioskActionCard(
      onPressed: onPressed,
      icon: icon,
      iconColor: accentColor,
      iconBackgroundColor: primary ? Colors.white : accentColor,
      iconForegroundColor: primary ? SelfxKioskTokens.primary : Colors.white,
      backgroundColor: primary
          ? SelfxKioskTokens.primary
          : secondary
          ? Colors.white
          : blue
          ? const Color(0xFFF0F7FF)
          : const Color(0xFFFFF2E7),
      borderColor: primary
          ? SelfxKioskTokens.primary
          : secondary
          ? SelfxKioskTokens.borderStrong
          : blue
          ? const Color(0xFFDDEBFA)
          : const Color(0xFFFFE5D0),
      titleColor: primary ? Colors.white : SelfxKioskTokens.homeNavy,
      subtitleColor: primary ? Colors.white : SelfxKioskTokens.textSecondary,
      label: label,
      subtitle: subtitle,
      minHeight: 100,
      maxLabelLines: 2,
      maxSubtitleLines: 2,
      trailing: Icon(
        Icons.chevron_right,
        color: primary ? Colors.white : SelfxKioskTokens.textSecondary,
        size: 30,
      ),
    );
    return pulse
        ? SelfxActionPulse(
            enabled: onPressed != null,
            borderRadius: 26,
            child: action,
          )
        : action;
  }
}

class _FailureBackdrop extends CustomPainter {
  const _FailureBackdrop();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = const Color(0xFFFFECD6);
    final radius = size.width * 0.27;
    canvas.drawCircle(Offset(size.width, 0), radius, paint);
    canvas.drawCircle(Offset(0, size.height), radius, paint);
    paint.color = const Color(0xFFFFF5E9);
    canvas.drawCircle(Offset(size.width, size.height), radius * 0.8, paint);
  }

  @override
  bool shouldRepaint(covariant _FailureBackdrop oldDelegate) => false;
}
