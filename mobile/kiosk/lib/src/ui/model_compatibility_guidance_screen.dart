import 'package:flutter/material.dart';

import '../acquisition/photo_acquisition.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../session/capture_session_controller.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../tryon/model_garment_compatibility.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'camera_capture_screen.dart';
import 'capture_review_screen.dart';
import 'try_on_failure_presentation.dart';

class ModelCompatibilityGuidanceScreen extends StatelessWidget {
  const ModelCompatibilityGuidanceScreen({
    super.key,
    required this.intent,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
    this.catalogGateway = const UnavailableKioskCatalogGateway(),
    this.extractionService = const UnavailableGarmentExtractionService(),
  });

  final KioskGarmentIntent intent;
  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final GarmentExtractionService extractionService;

  @override
  Widget build(BuildContext context) {
    final guidance = guidanceFor(intent);
    return TryOnFailurePresentation(
      title: guidance.title,
      message: guidance.message,
      onBack: () => Navigator.of(context).pop(),
      actions: [
        TryOnFailureAction(
          key: const Key('compatibility-update-photo'),
          primary: true,
          pulse: true,
          onPressed: () => _updatePhoto(context),
          icon: Icons.photo_camera_outlined,
          accentColor: const Color(0xFFE86610),
          label: 'Update My Photo',
          subtitle: 'Capture again',
        ),
        const SizedBox(height: 14),
        TryOnFailureAction(
          key: const Key('compatibility-choose-garment'),
          secondary: true,
          onPressed: () => _chooseAnotherGarment(context),
          icon: Icons.checkroom_outlined,
          accentColor: const Color(0xFFE86610),
          label: 'Try Another Garment',
          subtitle: 'Choose item',
        ),
      ],
    );
  }

  Future<void> _updatePhoto(BuildContext context) async {
    await tryOnController.retakePhoto(captureController);
    if (!context.mounted) {
      return;
    }
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => CameraCaptureScreen(
          controller: captureController,
          tryOnController: tryOnController,
          uploadController: uploadController,
          catalogGateway: catalogGateway,
          extractionService: extractionService,
          purpose: PhotoAcquisitionPurpose.model,
        ),
      ),
    );
  }

  void _chooseAnotherGarment(BuildContext context) {
    tryOnController.tryAnotherGarment();
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => CaptureReviewScreen(
          controller: captureController,
          tryOnController: tryOnController,
          uploadController: uploadController,
          catalogGateway: catalogGateway,
          extractionService: extractionService,
        ),
      ),
    );
  }
}
