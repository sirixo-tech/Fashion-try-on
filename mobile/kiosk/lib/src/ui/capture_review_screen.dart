import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import '../acquisition/photo_acquisition.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../session/capture_session_controller.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'browse_products_screen.dart';
import 'camera_capture_screen.dart';
import 'kiosk_chrome.dart';
import 'mobile_upload_screen.dart';
import 'responsive_kiosk_layout.dart';

class CaptureReviewScreen extends StatelessWidget {
  const CaptureReviewScreen({
    super.key,
    required this.controller,
    required this.tryOnController,
    required this.uploadController,
    this.catalogGateway = const UnavailableKioskCatalogGateway(),
    this.extractionService = const UnavailableGarmentExtractionService(),
  });

  final CaptureSessionController controller;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final GarmentExtractionService extractionService;

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'Review Capture',
      subtitle: 'Retake or use this local session photo',
      leading: IconButton(
        onPressed: () async {
          await controller.retake();
          if (context.mounted) {
            Navigator.of(context).pop();
          }
        },
        icon: const Icon(Icons.arrow_back),
      ),
      child: AnimatedBuilder(
        animation: controller,
        builder: (context, _) {
          final acceptedPersonPhoto = controller.activeAcceptedPersonPhoto;
          final capture = controller.capture ?? acceptedPersonPhoto?.capture;
          if (capture == null) {
            return const Center(child: Text('No capture available.'));
          }

          final usingAcceptedPersonPhoto =
              controller.capture == null && acceptedPersonPhoto != null;
          final usability =
              controller.imageUsabilityResult ??
              (usingAcceptedPersonPhoto
                  ? const ImageUsabilityResult.usable(
                      'Image is fine. Proceed tryon.',
                    )
                  : null);
          return LayoutBuilder(
            builder: (context, constraints) {
              final layout = KioskLayoutMetrics.fromConstraints(constraints);
              final compact = layout.stackPanels || layout.tightHeight;
              final imagePreview = Card(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.file(
                    File(capture.originalPath),
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) {
                      return const Center(
                        child: Text('Captured image unavailable'),
                      );
                    },
                  ),
                ),
              );
              final actions = _ReviewActions(
                controller: controller,
                tryOnController: tryOnController,
                uploadController: uploadController,
                catalogGateway: catalogGateway,
                extractionService: extractionService,
                usability: usability,
                usingAcceptedPersonPhoto: usingAcceptedPersonPhoto,
                compact: compact,
              );

              if (compact) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(child: imagePreview),
                    SizedBox(height: layout.panelGap),
                    Flexible(
                      fit: FlexFit.loose,
                      child: SingleChildScrollView(child: actions),
                    ),
                  ],
                );
              }

              return Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(child: imagePreview),
                  SizedBox(width: layout.panelGap),
                  SizedBox(
                    width: layout.sidePanelWidth,
                    child: SingleChildScrollView(child: actions),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }
}

class _ReviewActions extends StatelessWidget {
  const _ReviewActions({
    required this.controller,
    required this.tryOnController,
    required this.uploadController,
    required this.catalogGateway,
    required this.extractionService,
    required this.usability,
    required this.usingAcceptedPersonPhoto,
    required this.compact,
  });

  final CaptureSessionController controller;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final GarmentExtractionService extractionService;
  final ImageUsabilityResult? usability;
  final bool usingAcceptedPersonPhoto;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final isChecking = controller.isAnalyzingQuality || usability == null;
    final isUsable = usability?.isUsable == true;
    return Column(
      mainAxisSize: compact ? MainAxisSize.min : MainAxisSize.max,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ImageUsabilityStatement(
          isLoading: controller.isAnalyzingQuality,
          result: usability,
        ),
        if (compact) const SizedBox(height: 20) else const Spacer(),
        if (isChecking) ...[
          OutlinedButton.icon(
            key: const Key('retake-photo'),
            onPressed: null,
            icon: const Icon(Icons.replay),
            label: const Text('Retake'),
          ),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            key: const Key('take-garment-photo'),
            onPressed: null,
            icon: const Icon(Icons.camera_alt_outlined),
            label: const Text('Take Garment Photo'),
          ),
        ] else if (isUsable) ...[
          Text(
            'Now, show the garment to the camera.',
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 18),
          ElevatedButton.icon(
            key: const Key('take-garment-photo'),
            onPressed: () => unawaited(_openGarmentCamera(context)),
            icon: const Icon(Icons.camera_alt_outlined),
            label: const Text('Take Garment Photo'),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  key: const Key('browse-catalog'),
                  onPressed: () => unawaited(_openCatalog(context)),
                  icon: const Icon(Icons.inventory_2_outlined),
                  label: const FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text('Browse Catalog'),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  key: const Key('retake-photo'),
                  onPressed: () => _retake(context),
                  icon: const Icon(Icons.replay),
                  label: const FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text('Retake Model Photo'),
                  ),
                ),
              ),
            ],
          ),
        ] else ...[
          OutlinedButton.icon(
            key: const Key('retake-photo'),
            onPressed: () => _retake(context),
            icon: const Icon(Icons.replay),
            label: const Text('Retake Photo'),
          ),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            key: const Key('upload-model-photo'),
            onPressed: () => unawaited(_uploadModelPhoto(context)),
            icon: const Icon(Icons.file_upload_outlined),
            label: const Text('Upload Photo'),
          ),
        ],
      ],
    );
  }

  Future<bool> _acceptModelPhoto(BuildContext context) async {
    if (usingAcceptedPersonPhoto) {
      final attached = await tryOnController.attachAcceptedPerson(controller);
      if (!context.mounted) {
        return false;
      }
      if (!attached) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tryOnController.sessionMessage ??
                  'SelfX could not save this photo for reuse.',
            ),
          ),
        );
        return false;
      }
      return true;
    }

    final result = await controller.usePhoto();
    if (!context.mounted) {
      return false;
    }
    if (!result.accepted) {
      final message = result.message ?? 'Please retake your photo first.';
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
      return false;
    }
    final attached = await tryOnController.attachAcceptedPerson(controller);
    if (!context.mounted) {
      return false;
    }
    if (!attached) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            tryOnController.sessionMessage ??
                'SelfX could not save this photo for reuse.',
          ),
        ),
      );
      return false;
    }
    return true;
  }

  Future<void> _openGarmentCamera(BuildContext context) async {
    if (!await _acceptModelPhoto(context) || !context.mounted) {
      return;
    }
    await Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => CameraCaptureScreen(
          controller: controller,
          tryOnController: tryOnController,
          uploadController: uploadController,
          catalogGateway: catalogGateway,
          extractionService: extractionService,
          purpose: PhotoAcquisitionPurpose.garment,
        ),
      ),
    );
  }

  Future<void> _openCatalog(BuildContext context) async {
    if (!await _acceptModelPhoto(context) || !context.mounted) {
      return;
    }
    await Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => BrowseProductsScreen(
          captureController: controller,
          tryOnController: tryOnController,
          uploadController: uploadController,
          catalogGateway: catalogGateway,
          extractionService: extractionService,
        ),
      ),
    );
  }

  Future<void> _uploadModelPhoto(BuildContext context) async {
    final navigator = Navigator.of(context);
    unawaited(
      navigator.pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => MobileUploadScreen(
            captureController: controller,
            tryOnController: tryOnController,
            uploadController: uploadController,
            catalogGateway: catalogGateway,
            extractionService: extractionService,
            purpose: PhotoAcquisitionPurpose.model,
          ),
        ),
      ),
    );
    await Future<void>.delayed(Duration.zero);
    await controller.discardPendingCapture();
  }

  void _retake(BuildContext context) {
    final navigator = Navigator.of(context);
    unawaited(controller.retake());
    navigator.pop();
  }
}

class _ImageUsabilityStatement extends StatelessWidget {
  const _ImageUsabilityStatement({
    required this.isLoading,
    required this.result,
  });

  final bool isLoading;
  final ImageUsabilityResult? result;

  @override
  Widget build(BuildContext context) {
    final result = this.result;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (isLoading)
              const Row(
                children: [
                  SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 3),
                  ),
                  SizedBox(width: 12),
                  Expanded(child: Text('Checking image usability...')),
                ],
              )
            else if (result == null)
              const Text('Checking image usability...')
            else
              _UsabilityLine(
                icon: result.isUsable ? Icons.check : Icons.error_outline,
                color: result.isUsable
                    ? const Color(0xFF2F855A)
                    : const Color(0xFFC53030),
                text: result.message,
              ),
          ],
        ),
      ),
    );
  }
}

class _UsabilityLine extends StatelessWidget {
  const _UsabilityLine({
    required this.icon,
    required this.color,
    required this.text,
  });

  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 22, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: Theme.of(context).textTheme.titleMedium),
          ),
        ],
      ),
    );
  }
}
