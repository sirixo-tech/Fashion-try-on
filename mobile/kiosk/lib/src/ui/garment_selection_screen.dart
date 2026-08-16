import 'package:flutter/material.dart';

import '../acquisition/photo_acquisition.dart';
import '../session/capture_scope.dart';
import '../session/capture_session_controller.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../tryon/model_garment_compatibility.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'camera_capture_screen.dart';
import 'kiosk_chrome.dart';
import 'mobile_upload_screen.dart';
import 'model_compatibility_guidance_screen.dart';
import 'selfx_kiosk_button.dart';

class GarmentSelectionScreen extends StatefulWidget {
  const GarmentSelectionScreen({
    super.key,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
    this.enabledGarmentIntents,
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final List<KioskGarmentIntent>? enabledGarmentIntents;

  @override
  State<GarmentSelectionScreen> createState() => _GarmentSelectionScreenState();
}

class _GarmentSelectionScreenState extends State<GarmentSelectionScreen> {
  KioskGarmentIntent? _intent;

  @override
  void initState() {
    super.initState();
    final existing =
        widget.tryOnController.garmentInput?.intent ??
        widget.tryOnController.pendingGarmentIntent;
    if (existing != null &&
        existing != KioskGarmentIntent.auto &&
        _enabledIntents.contains(existing)) {
      _intent = existing;
      widget.captureController.selectCaptureScope(captureScopeForIntent(existing));
    }
  }

  List<KioskGarmentIntent> get _enabledIntents =>
      widget.enabledGarmentIntents ??
      widget.tryOnController.enabledGarmentIntents;

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'SelfX Kiosk',
      subtitle: 'Garment photo',
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
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.displaySmall,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Choose the closest option, then add a clear outfit photo.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                      const SizedBox(height: 28),
                      Wrap(
                        spacing: 14,
                        runSpacing: 14,
                        alignment: WrapAlignment.center,
                        children: _enabledIntents.map(_intentChip).toList(),
                      ),
                      const SizedBox(height: 34),
                      Text(
                        'Add garment photo',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'The outfit should be clearly visible on one person.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                      const SizedBox(height: 26),
                      SelfxKioskButton(
                        key: const Key('take-garment-photo-source'),
                        label: 'Take a Photo',
                        subtitle: 'Use the kiosk camera',
                        icon: Icons.camera_alt_outlined,
                        trailing: const Icon(Icons.arrow_forward),
                        variant: SelfxKioskButtonVariant.secondary,
                        minHeight: 112,
                        expanded: true,
                        textAlign: TextAlign.start,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 26,
                          vertical: 24,
                        ),
                        onPressed: _intent == null ? null : _openCamera,
                      ),
                      const SizedBox(height: 18),
                      SelfxKioskButton(
                        key: const Key('use-phone-garment-source'),
                        label: 'Use Your Phone',
                        subtitle: 'Scan a QR code from your phone browser',
                        icon: Icons.qr_code_2,
                        trailing: const Icon(Icons.arrow_forward),
                        variant: SelfxKioskButtonVariant.secondary,
                        minHeight: 112,
                        expanded: true,
                        textAlign: TextAlign.start,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 26,
                          vertical: 24,
                        ),
                        onPressed: _intent == null ? null : _openPhoneUpload,
                      ),
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

  void _selectIntent(KioskGarmentIntent intent) {
    if (!_enabledIntents.contains(intent)) {
      return;
    }
    setState(() => _intent = intent);
    widget.tryOnController.selectPendingGarmentIntent(intent);
    widget.captureController.selectCaptureScope(captureScopeForIntent(intent));
    final coverage = widget.captureController.acceptedModelCoverage;
    if (widget.captureController.acceptedCapture == null || coverage == null) {
      return;
    }
    final compatibility = const ModelGarmentCompatibilityService().check(
      coverage: coverage,
      intent: intent,
    );
    if (!compatibility.supported) {
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ModelCompatibilityGuidanceScreen(
            intent: intent,
            captureController: widget.captureController,
            tryOnController: widget.tryOnController,
            uploadController: widget.uploadController,
          ),
        ),
      );
    }
  }

  Widget _intentChip(KioskGarmentIntent intent) {
    return _IntentChip(
      key: Key('garment-intent-${intent.apiValue.toLowerCase().replaceAll('_', '-')}'),
      label: intent == KioskGarmentIntent.fullOutfit ? 'Full Outfit' : intent.label,
      icon: switch (intent) {
        KioskGarmentIntent.top => Icons.checkroom_outlined,
        KioskGarmentIntent.bottom => Icons.accessibility_new_outlined,
        KioskGarmentIntent.fullOutfit => Icons.person_outline,
        _ => Icons.checkroom_outlined,
      },
      selected: _intent == intent,
      onPressed: () => _selectIntent(intent),
    );
  }

  void _openCamera() {
    final intent = _intent;
    if (intent == null) {
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CameraCaptureScreen(
          controller: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          purpose: PhotoAcquisitionPurpose.garment,
          garmentIntent: intent,
        ),
      ),
    );
  }

  void _openPhoneUpload() {
    final intent = _intent;
    if (intent == null) {
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => MobileUploadScreen(
          captureController: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          purpose: PhotoAcquisitionPurpose.garment,
          garmentIntent: intent,
        ),
      ),
    );
  }
}

class _IntentChip extends StatelessWidget {
  const _IntentChip({
    super.key,
    required this.label,
    required this.icon,
    required this.selected,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 250,
      child: SelfxKioskButton(
        label: label,
        icon: icon,
        variant: selected
            ? SelfxKioskButtonVariant.selected
            : SelfxKioskButtonVariant.secondary,
        minHeight: 86,
        textAlign: TextAlign.center,
        mainAxisAlignment: MainAxisAlignment.center,
        animateSurface: false,
        onPressed: onPressed,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
      ),
    );
  }
}

CaptureScope captureScopeForIntent(KioskGarmentIntent intent) {
  return switch (intent) {
    KioskGarmentIntent.top => CaptureScope.top,
    KioskGarmentIntent.bottom => CaptureScope.bottom,
    KioskGarmentIntent.onePiece ||
    KioskGarmentIntent.fullOutfit ||
    KioskGarmentIntent.auto => CaptureScope.fullBody,
  };
}
