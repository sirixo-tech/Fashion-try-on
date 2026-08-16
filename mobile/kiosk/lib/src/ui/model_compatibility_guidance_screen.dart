import 'package:flutter/material.dart';

import '../session/capture_session_controller.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../tryon/model_garment_compatibility.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'kiosk_chrome.dart';
import 'photo_source_choice_screen.dart';

class ModelCompatibilityGuidanceScreen extends StatelessWidget {
  const ModelCompatibilityGuidanceScreen({
    super.key,
    required this.intent,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
  });

  final KioskGarmentIntent intent;
  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;

  @override
  Widget build(BuildContext context) {
    final guidance = guidanceFor(intent);
    return KioskScaffold(
      title: 'SelfX Kiosk',
      subtitle: 'Update photo',
      leading: IconButton(
        onPressed: () => Navigator.of(context).pop(),
        icon: const Icon(Icons.arrow_back),
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Icon(
                    Icons.photo_camera_outlined,
                    color: Theme.of(context).colorScheme.primary,
                    size: 72,
                  ),
                  const SizedBox(height: 22),
                  Text(
                    guidance.title,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.displaySmall,
                  ),
                  const SizedBox(height: 14),
                  Text(
                    guidance.message,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 28),
                  ElevatedButton.icon(
                    key: const Key('compatibility-update-photo'),
                    onPressed: () => _updatePhoto(context),
                    icon: const Icon(Icons.photo_camera_outlined),
                    label: const Text('Update My Photo'),
                  ),
                  const SizedBox(height: 14),
                  OutlinedButton.icon(
                    key: const Key('compatibility-choose-category'),
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.checkroom_outlined),
                    label: const Text('Choose Another Category'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _updatePhoto(BuildContext context) async {
    await tryOnController.retakePhoto(captureController);
    if (!context.mounted) {
      return;
    }
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => PhotoSourceChoiceScreen(
          captureController: captureController,
          tryOnController: tryOnController,
          uploadController: uploadController,
        ),
      ),
    );
  }
}
