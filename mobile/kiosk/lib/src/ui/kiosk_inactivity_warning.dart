import 'package:flutter/material.dart';

import '../theme/selfx_kiosk_theme.dart';
import 'selfx_kiosk_button.dart';

/// Display-only notice; the app's idle guard owns timing and dismissal.
class KioskInactivityWarning extends StatelessWidget {
  const KioskInactivityWarning({
    super.key,
    required this.remainingSeconds,
    this.onKeepBrowsing,
  });

  final int remainingSeconds;
  final VoidCallback? onKeepBrowsing;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final compact = size.width < 420 || size.height < 640;
    final short = size.height < 600;
    final seconds = remainingSeconds.clamp(0, 30);
    return SafeArea(
      child: Dialog(
        key: const Key('kiosk-inactivity-warning'),
        insetPadding: const EdgeInsets.all(20),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 12,
        shadowColor: const Color(0x26000000),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        clipBehavior: Clip.antiAlias,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 620),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(
                  key: Key('kiosk-inactivity-top-accent'),
                  height: 5,
                  child: ColoredBox(color: SelfxKioskTokens.primary),
                ),
                Padding(
                  padding: EdgeInsets.all(
                    short
                        ? 16
                        : compact
                        ? 22
                        : 26,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      DecoratedBox(
                        decoration: BoxDecoration(
                          color: SelfxKioskTokens.primary.withValues(
                            alpha: 0.10,
                          ),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: const Padding(
                          padding: EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 8,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.timer_outlined,
                                color: SelfxKioskTokens.primary,
                                size: 18,
                              ),
                              SizedBox(width: 7),
                              Text(
                                'ENDING SOON',
                                style: TextStyle(
                                  color: SelfxKioskTokens.primary,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      SizedBox(
                        height: short
                            ? 8
                            : compact
                            ? 16
                            : 24,
                      ),
                      Semantics(
                        label:
                            '$seconds ${seconds == 1 ? 'second' : 'seconds'} remaining',
                        child: SizedBox.square(
                          dimension: compact ? 132 : 188,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              Positioned.fill(
                                child: ExcludeSemantics(
                                  child: TweenAnimationBuilder<double>(
                                    tween: Tween(
                                      begin: seconds / 30,
                                      end: seconds / 30,
                                    ),
                                    duration: const Duration(milliseconds: 500),
                                    curve: Curves.easeInOut,
                                    builder: (_, value, _) =>
                                        CircularProgressIndicator(
                                          key: const Key(
                                            'kiosk-inactivity-progress-ring',
                                          ),
                                          value: value,
                                          strokeWidth: compact ? 7 : 9,
                                          strokeCap: StrokeCap.round,
                                          backgroundColor:
                                              SelfxKioskTokens.border,
                                          color: SelfxKioskTokens.primary,
                                        ),
                                  ),
                                ),
                              ),
                              ExcludeSemantics(
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      '$seconds',
                                      key: const Key(
                                        'kiosk-inactivity-countdown',
                                      ),
                                      style: TextStyle(
                                        color: SelfxKioskTokens.primary,
                                        fontSize: compact ? 52 : 70,
                                        height: 1,
                                        fontWeight: FontWeight.w900,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    const Text(
                                      'SEC',
                                      style: TextStyle(
                                        color: SelfxKioskTokens.primary,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: 1,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      SizedBox(
                        height: short
                            ? 12
                            : compact
                            ? 20
                            : 26,
                      ),
                      Text(
                        'No activity detected',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineMedium
                            ?.copyWith(
                              color: SelfxKioskTokens.homeNavy,
                              fontWeight: FontWeight.w900,
                              fontSize: compact ? 24 : 32,
                            ),
                      ),
                      SizedBox(height: short ? 8 : 12),
                      Text(
                        'You will be redirected to the home screen when the timer runs out.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: SelfxKioskTokens.textSecondary,
                          height: 1.3,
                          fontSize: compact ? 16 : 18,
                        ),
                      ),
                      SizedBox(
                        height: short
                            ? 12
                            : compact
                            ? 18
                            : 24,
                      ),
                      SizedBox(
                        width: double.infinity,
                        child: SelfxKioskButton(
                          key: const Key('kiosk-inactivity-keep-browsing'),
                          label: 'Keep Browsing',
                          icon: Icons.touch_app_outlined,
                          onPressed: onKeepBrowsing,
                          backgroundColor: SelfxKioskTokens.primary,
                          foregroundColor: Colors.white,
                          borderRadius: 14,
                          minHeight: compact ? 52 : 60,
                          mainAxisAlignment: MainAxisAlignment.center,
                        ),
                      ),
                      SizedBox(height: short ? 10 : 14),
                      Text(
                        'Tap anywhere to continue.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: SelfxKioskTokens.textSecondary,
                          fontSize: compact ? 12 : 14,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
