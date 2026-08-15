import 'package:flutter/material.dart';

import '../session/capture_session_controller.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'camera_capture_screen.dart';
import 'kiosk_chrome.dart';
import 'mobile_upload_screen.dart';
import 'selfx_kiosk_button.dart';

class PhotoSourceChoiceScreen extends StatelessWidget {
  const PhotoSourceChoiceScreen({
    super.key,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'SelfX Kiosk',
      subtitle: '${captureController.captureScope.label} photo source',
      leading: IconButton(
        onPressed: () => Navigator.of(context).pop(),
        icon: const Icon(Icons.arrow_back),
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 920),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'How would you like to add your photo?',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.displaySmall,
              ),
              const SizedBox(height: 12),
              Text(
                'Use the kiosk camera or scan a QR code to send a photo from your phone.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 30),
              SelfxKioskButton(
                key: const Key('take-photo-source'),
                label: 'Take Photo',
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
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => CameraCaptureScreen(
                        controller: captureController,
                        tryOnController: tryOnController,
                        uploadController: uploadController,
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 18),
              SelfxKioskButton(
                key: const Key('use-phone-source'),
                label: 'Use My Phone',
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
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => MobileUploadScreen(
                        captureController: captureController,
                        tryOnController: tryOnController,
                        uploadController: uploadController,
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
