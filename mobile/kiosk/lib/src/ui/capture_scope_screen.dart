import 'package:flutter/material.dart';

import '../session/capture_scope.dart';
import '../session/capture_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'kiosk_chrome.dart';
import 'photo_source_choice_screen.dart';
import 'selfx_kiosk_button.dart';

class CaptureScopeScreen extends StatelessWidget {
  const CaptureScopeScreen({
    super.key,
    required this.controller,
    required this.tryOnController,
    required this.uploadController,
  });

  final CaptureSessionController controller;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;

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
                          selected: scope == controller.captureScope,
                          onPressed: () {
                            controller.selectCaptureScope(scope);
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => PhotoSourceChoiceScreen(
                                  captureController: controller,
                                  tryOnController: tryOnController,
                                  uploadController: uploadController,
                                ),
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
  const _CaptureScopeButton({
    required this.scope,
    required this.selected,
    required this.onPressed,
  });

  final CaptureScope scope;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusLarge),
        boxShadow: SelfxKioskTokens.softShadow,
      ),
      child: SelfxKioskButton(
        label: scope.label.toUpperCase(),
        subtitle: scope.description,
        icon: _iconFor(scope),
        trailing: const Icon(Icons.arrow_forward),
        variant: selected
            ? SelfxKioskButtonVariant.selected
            : SelfxKioskButtonVariant.secondary,
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
