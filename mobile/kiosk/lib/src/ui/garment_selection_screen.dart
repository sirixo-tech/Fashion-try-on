import 'package:flutter/material.dart';

import '../acquisition/photo_acquisition.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../session/capture_session_controller.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'browse_products_screen.dart';
import 'camera_capture_screen.dart';
import 'kiosk_chrome.dart';
import 'selfx_kiosk_button.dart';

class GarmentSelectionScreen extends StatelessWidget {
  const GarmentSelectionScreen({
    super.key,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
    this.catalogGateway = const UnavailableKioskCatalogGateway(),
    this.extractionService = const UnavailableGarmentExtractionService(),
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final GarmentExtractionService extractionService;

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'SelfX Kiosk',
      subtitle: 'Choose garment',
      showBrandHeader: false,
      leading: IconButton(
        onPressed: () => Navigator.of(context).pop(),
        icon: const Icon(Icons.arrow_back),
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Choose Garment',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.displaySmall,
              ),
              const SizedBox(height: 10),
              Text(
                'How would you like to choose?',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 30),
              SelfxKioskButton(
                key: const Key('browse-products-source'),
                label: 'Browse Products',
                subtitle: 'Explore available garments',
                icon: Icons.checkroom_outlined,
                trailing: const Icon(Icons.arrow_forward),
                variant: SelfxKioskButtonVariant.primary,
                minHeight: 92,
                expanded: true,
                textAlign: TextAlign.start,
                crossAxisAlignment: CrossAxisAlignment.start,
                padding: const EdgeInsets.symmetric(
                  horizontal: 22,
                  vertical: 18,
                ),
                onPressed: () => _openBrowseProducts(context),
              ),
              const SizedBox(height: 18),
              SelfxKioskButton(
                key: const Key('capture-garment-source'),
                label: 'Capture Garment',
                subtitle: 'Use the kiosk camera',
                icon: Icons.camera_alt_outlined,
                trailing: const Icon(Icons.arrow_forward),
                variant: SelfxKioskButtonVariant.primary,
                minHeight: 92,
                expanded: true,
                textAlign: TextAlign.start,
                crossAxisAlignment: CrossAxisAlignment.start,
                padding: const EdgeInsets.symmetric(
                  horizontal: 22,
                  vertical: 18,
                ),
                onPressed: () => _openCaptureGarment(context),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _openBrowseProducts(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => BrowseProductsScreen(
          captureController: captureController,
          tryOnController: tryOnController,
          uploadController: uploadController,
          catalogGateway: catalogGateway,
          extractionService: extractionService,
        ),
      ),
    );
  }

  void _openCaptureGarment(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CameraCaptureScreen(
          controller: captureController,
          tryOnController: tryOnController,
          uploadController: uploadController,
          catalogGateway: catalogGateway,
          purpose: PhotoAcquisitionPurpose.garment,
          garmentIntent: KioskGarmentIntent.auto,
          extractionService: extractionService,
        ),
      ),
    );
  }
}
