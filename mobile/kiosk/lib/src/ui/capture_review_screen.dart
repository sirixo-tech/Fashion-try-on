import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../catalog/kiosk_catalog_gateway.dart';
import '../session/capture_session_controller.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'garment_selection_screen.dart';
import 'kiosk_chrome.dart';

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
          final capture = controller.capture;
          if (capture == null) {
            return const Center(child: Text('No capture available.'));
          }

          final usability = controller.imageUsabilityResult;
          return LayoutBuilder(
            builder: (context, constraints) {
              final portrait =
                  constraints.maxHeight > constraints.maxWidth * 1.12;
              final compact =
                  constraints.maxWidth < 940 ||
                  constraints.maxHeight < 620 ||
                  portrait;
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
                compact: compact,
              );

              if (compact) {
                final previewHeight = math.max(
                  portrait ? 520.0 : 280.0,
                  math.min(
                    portrait ? constraints.maxHeight * 0.54 : 480.0,
                    portrait
                        ? constraints.maxHeight * 0.6
                        : constraints.maxWidth * 0.62,
                  ),
                );
                return SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SizedBox(height: previewHeight, child: imagePreview),
                      const SizedBox(height: 16),
                      actions,
                    ],
                  ),
                );
              }

              return Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(child: imagePreview),
                  const SizedBox(width: 24),
                  SizedBox(width: 420, child: actions),
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
    required this.compact,
  });

  final CaptureSessionController controller;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final GarmentExtractionService extractionService;
  final ImageUsabilityResult? usability;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: compact ? MainAxisSize.min : MainAxisSize.max,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ImageUsabilityStatement(
          isLoading: controller.isAnalyzingQuality,
          result: usability,
        ),
        if (compact) const SizedBox(height: 20) else const Spacer(),
        OutlinedButton.icon(
          key: const Key('retake-photo'),
          onPressed: () async {
            await controller.retake();
            if (context.mounted) {
              Navigator.of(context).pop();
            }
          },
          icon: const Icon(Icons.replay),
          label: const Text('Retake'),
        ),
        const SizedBox(height: 16),
        ElevatedButton.icon(
          key: const Key('use-photo'),
          onPressed: usability?.isUsable == true
              ? () async {
                  final result = await controller.usePhoto();
                  if (!context.mounted) {
                    return;
                  }
                  if (!result.accepted) {
                    final message =
                        result.message ??
                        'Please retake your photo before continuing.';
                    ScaffoldMessenger.of(
                      context,
                    ).showSnackBar(SnackBar(content: Text(message)));
                    return;
                  }
                  unawaited(tryOnController.attachAcceptedPerson(controller));
                  await Navigator.of(context).pushReplacement(
                    MaterialPageRoute<void>(
                      builder: (_) => GarmentSelectionScreen(
                        captureController: controller,
                        tryOnController: tryOnController,
                        uploadController: uploadController,
                        catalogGateway: catalogGateway,
                        extractionService: extractionService,
                      ),
                    ),
                  );
                }
              : null,
          icon: const Icon(Icons.check_circle_outline),
          label: const Text('Continue'),
        ),
      ],
    );
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
