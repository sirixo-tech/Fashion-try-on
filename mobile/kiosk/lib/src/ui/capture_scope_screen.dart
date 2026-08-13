import 'package:flutter/material.dart';

import '../session/capture_scope.dart';
import '../session/capture_session_controller.dart';
import 'camera_capture_screen.dart';
import 'kiosk_chrome.dart';

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
    );
  }
}

class _CaptureScopeButton extends StatelessWidget {
  const _CaptureScopeButton({required this.scope, required this.onPressed});

  final CaptureScope scope;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 26),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      child: Row(
        children: [
          Icon(_iconFor(scope), size: 40),
          const SizedBox(width: 24),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  scope.label.toUpperCase(),
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: Theme.of(context).colorScheme.onPrimary,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  scope.description,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Theme.of(
                      context,
                    ).colorScheme.onPrimary.withValues(alpha: 0.86),
                  ),
                ),
              ],
            ),
          ),
          const Icon(Icons.arrow_forward, size: 34),
        ],
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
