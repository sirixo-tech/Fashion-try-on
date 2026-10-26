import 'package:flutter/material.dart';

import '../acquisition/photo_acquisition.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../session/capture_scope.dart';
import '../session/capture_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'camera_capture_screen.dart';
import 'kiosk_chrome.dart';
import 'responsive_kiosk_layout.dart';
import 'selfx_kiosk_action_card.dart';

class CaptureScopeScreen extends StatelessWidget {
  const CaptureScopeScreen({
    super.key,
    required this.controller,
    required this.tryOnController,
    required this.uploadController,
    this.catalogGateway = const UnavailableKioskCatalogGateway(),
  });

  final CaptureSessionController controller;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;

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
          final layout = KioskLayoutMetrics.fromConstraints(constraints);
          return SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: layout.portrait ? 1040 : 980,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'What are you trying on?',
                        style: Theme.of(context).textTheme.displaySmall,
                        textAlign: TextAlign.center,
                      ),
                      SizedBox(height: layout.scaled(10, small: 8)),
                      Text(
                        'Choose the closest clothing area so SelfX can guide the camera framing.',
                        style: Theme.of(context).textTheme.bodyLarge,
                        textAlign: TextAlign.center,
                      ),
                      SizedBox(height: layout.scaled(28, small: 20, large: 36)),
                      for (final scope in CaptureScope.values) ...[
                        _CaptureScopeButton(
                          scope: scope,
                          layout: layout,
                          selected: scope == controller.captureScope,
                          onPressed: () {
                            controller.selectCaptureScope(scope);
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => CameraCaptureScreen(
                                  controller: controller,
                                  tryOnController: tryOnController,
                                  uploadController: uploadController,
                                  catalogGateway: catalogGateway,
                                  purpose: PhotoAcquisitionPurpose.model,
                                ),
                              ),
                            );
                          },
                        ),
                        SizedBox(height: layout.panelGap),
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
    required this.layout,
    required this.selected,
    required this.onPressed,
  });

  final CaptureScope scope;
  final KioskLayoutMetrics layout;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SelfxKioskActionCard(
      label: scope.label.toUpperCase(),
      subtitle: scope.description,
      icon: _iconFor(scope),
      iconColor: _colorFor(scope),
      minHeight: layout.scaled(76, small: 66, large: 88, extraLarge: 100),
      backgroundColor: selected
          ? const Color(0xFFFFF3E9)
          : const Color(0xFFFFFCF8),
      padding: EdgeInsets.symmetric(
        horizontal: layout.scaled(20, small: 16, large: 24),
        vertical: layout.scaled(16, small: 12, large: 20),
      ),
      onPressed: onPressed,
    );
  }

  IconData _iconFor(CaptureScope scope) {
    return switch (scope) {
      CaptureScope.top => Icons.checkroom_outlined,
      CaptureScope.bottom => Icons.accessibility_new_outlined,
      CaptureScope.fullBody => Icons.person_outline,
    };
  }

  Color _colorFor(CaptureScope scope) {
    return switch (scope) {
      CaptureScope.top => SelfxKioskTokens.primaryHover,
      CaptureScope.bottom => const Color(0xFF2384D6),
      CaptureScope.fullBody => const Color(0xFF2FAE75),
    };
  }
}
