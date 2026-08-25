import 'package:flutter/material.dart';

import '../camera/camera_models.dart';
import '../theme/selfx_kiosk_theme.dart';
import 'responsive_kiosk_layout.dart';
import 'selfx_logo.dart';

class KioskScaffold extends StatelessWidget {
  const KioskScaffold({
    super.key,
    required this.title,
    required this.subtitle,
    required this.child,
    this.leading,
    this.showBrandHeader = false,
    this.padding,
    this.background,
  });

  final String title;
  final String subtitle;
  final Widget child;
  final Widget? leading;
  final bool showBrandHeader;
  final EdgeInsetsGeometry? padding;
  final Widget? background;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          if (background != null) Positioned.fill(child: background!),
          SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final layout = KioskLayoutMetrics.fromConstraints(constraints);
                return Padding(
                  padding:
                      padding ??
                      EdgeInsets.all(
                        layout.tightHeight ? 14.0 : layout.pagePadding,
                      ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (showBrandHeader) ...[
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (leading != null) ...[
                              leading!,
                              const SizedBox(width: 12),
                            ],
                            const SelfxLogo(height: 48, maxWidth: 178),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    title,
                                    style: Theme.of(
                                      context,
                                    ).textTheme.headlineMedium,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  Text(
                                    subtitle,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        SizedBox(height: layout.panelGap),
                      ] else if (leading != null) ...[
                        Align(alignment: Alignment.centerLeft, child: leading!),
                        SizedBox(height: layout.isSmall ? 2 : 6),
                      ],
                      Expanded(child: child),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
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
        borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusMedium),
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

String captureGuidanceForCategory(String category) {
  return switch (category) {
    'TOP' => 'Upper body or full body framing is recommended.',
    'BOTTOM' => 'Lower body framing with face visible is recommended.',
    'ONE_PIECE' => 'Full body framing is recommended.',
    _ => 'Full body framing is recommended.',
  };
}
