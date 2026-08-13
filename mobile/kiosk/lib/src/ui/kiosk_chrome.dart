import 'package:flutter/material.dart';

import '../camera/camera_models.dart';

class KioskScaffold extends StatelessWidget {
  const KioskScaffold({
    super.key,
    required this.title,
    required this.subtitle,
    required this.child,
    this.leading,
  });

  final String title;
  final String subtitle;
  final Widget child;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final compact = constraints.maxWidth < 720;
            final padding = compact ? 16.0 : 28.0;
            return Padding(
              padding: EdgeInsets.all(padding),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (leading != null) ...[
                        leading!,
                        const SizedBox(width: 12),
                      ],
                      const _SelfxMark(),
                      const SizedBox(width: 18),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              title,
                              style: Theme.of(context).textTheme.headlineMedium,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(subtitle, overflow: TextOverflow.ellipsis),
                          ],
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: compact ? 18 : 28),
                  Expanded(child: child),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.label, required this.status});

  final String label;
  final CameraStatus status;

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      CameraStatus.ready => const Color(0xFF2F855A),
      CameraStatus.capturing ||
      CameraStatus.initializing ||
      CameraStatus.discovering => const Color(0xFF0D5C75),
      CameraStatus.failed ||
      CameraStatus.disconnected ||
      CameraStatus.noDevices => const Color(0xFFC53030),
      _ => const Color(0xFF627D98),
    };
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        border: Border.all(color: color.withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        child: Row(
          children: [
            Icon(Icons.circle, color: color, size: 14),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: color, fontWeight: FontWeight.w800),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SelfxMark extends StatelessWidget {
  const _SelfxMark();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 64,
      height: 64,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primary,
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Text(
        'SX',
        style: TextStyle(
          color: Colors.white,
          fontSize: 22,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

String captureGuidanceForCategory(String category) {
  return switch (category) {
    'TOP' => 'Upper body or full body framing is recommended.',
    'BOTTOM' => 'Lower body framing with face visible is recommended.',
    'ONE_PIECE' => 'Full body framing is recommended.',
    _ => 'Full body framing is recommended.',
  };
}
