import 'package:flutter/material.dart';

import '../session/capture_session_controller.dart';
import 'camera_settings_screen.dart';
import 'capture_scope_screen.dart';
import 'kiosk_chrome.dart';

class KioskHomeScreen extends StatelessWidget {
  const KioskHomeScreen({super.key, required this.controller});

  final CaptureSessionController controller;

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'SelfX Kiosk',
      subtitle: 'KIOSK-2A live capture foundation',
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 880),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Assisted customer capture station',
                style: Theme.of(context).textTheme.displaySmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              Text(
                'Local preview, capture-scope guidance, live readiness when supported, review, and quality calibration. No product flow or AI provider connection.',
                style: Theme.of(context).textTheme.bodyLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 44),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 20,
                runSpacing: 16,
                children: [
                  ElevatedButton.icon(
                    key: const Key('start-camera-test'),
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) =>
                              CaptureScopeScreen(controller: controller),
                        ),
                      );
                    },
                    icon: const Icon(Icons.photo_camera_outlined),
                    label: const Text('Start Camera Test'),
                  ),
                  OutlinedButton.icon(
                    key: const Key('camera-settings'),
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) =>
                              CameraSettingsScreen(controller: controller),
                        ),
                      );
                    },
                    icon: const Icon(Icons.settings_outlined),
                    label: const Text('Camera Settings'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
