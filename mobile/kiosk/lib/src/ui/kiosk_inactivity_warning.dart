import 'package:flutter/material.dart';

import '../theme/selfx_kiosk_theme.dart';

/// Display-only notice; the app's idle guard owns timing and dismissal.
class KioskInactivityWarning extends StatelessWidget {
  const KioskInactivityWarning({super.key, required this.remainingSeconds});

  final int remainingSeconds;

  @override
  Widget build(BuildContext context) => SafeArea(
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
          padding: const EdgeInsets.all(26),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 68,
                height: 68,
                decoration: BoxDecoration(
                  color: SelfxKioskTokens.primary.withValues(alpha: 0.10),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.timer_outlined,
                  color: SelfxKioskTokens.primary,
                  size: 34,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'No activity detected',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: SelfxKioskTokens.homeNavy,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Returning to the home screen in',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: SelfxKioskTokens.textSecondary,
                  height: 1.3,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '$remainingSeconds ${remainingSeconds == 1 ? 'second' : 'seconds'}',
                key: const Key('kiosk-inactivity-countdown'),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                  color: SelfxKioskTokens.primary,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'Tap anywhere to continue.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: SelfxKioskTokens.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
