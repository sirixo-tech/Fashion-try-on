import 'package:flutter/material.dart';

import '../session/capture_scope.dart';
import '../session/capture_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import 'camera_capture_screen.dart';
import 'kiosk_chrome.dart';
import 'selfx_glass_button.dart';

class CaptureScopeScreen extends StatelessWidget {
  const CaptureScopeScreen({super.key, required this.controller});

  final CaptureSessionController controller;

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'SelfX Kiosk',
      subtitle: 'Select capture framing',
      leading: IconButton(
        onPressed: () => Navigator.of(context).pop(),
        icon: const Icon(Icons.arrow_back),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          return SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 980),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'What are you trying on?',
                        style: Theme.of(context).textTheme.displaySmall,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Choose the closest clothing area so SelfX can guide the camera framing.',
                        style: Theme.of(context).textTheme.bodyLarge,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 28),
                      for (final scope in CaptureScope.values) ...[
                        _CaptureScopeButton(
                          scope: scope,
                          onPressed: () {
                            controller.selectCaptureScope(scope);
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) =>
                                    CameraCaptureScreen(controller: controller),
                              ),
                            );
                          },
                        ),
                        const SizedBox(height: 18),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _CaptureScopeButton extends StatelessWidget {
  const _CaptureScopeButton({required this.scope, required this.onPressed});

  final CaptureScope scope;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusLarge),
        boxShadow: SelfxKioskTokens.softShadow,
      ),
      child: SelfxGlassButton(
        label: scope.label.toUpperCase(),
        subtitle: scope.description,
        icon: _iconFor(scope),
        trailing: const Icon(Icons.arrow_forward),
        variant: SelfxGlassButtonVariant.secondary,
        minHeight: 112,
        expanded: true,
        textAlign: TextAlign.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 24),
        onPressed: onPressed,
      ),
    );
  }

  IconData _iconFor(CaptureScope scope) {
    return switch (scope) {
      CaptureScope.top => Icons.checkroom_outlined,
      CaptureScope.bottom => Icons.accessibility_new_outlined,
      CaptureScope.fullBody => Icons.person_outline,
    };
  }
}
