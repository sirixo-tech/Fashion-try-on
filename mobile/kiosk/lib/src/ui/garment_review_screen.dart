import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../quality/image_quality.dart';
import '../session/capture_session_controller.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'garment_selection_screen.dart';
import 'kiosk_chrome.dart';
import 'photo_source_choice_screen.dart';

class GarmentReviewScreen extends StatelessWidget {
  const GarmentReviewScreen({
    super.key,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
    required this.garmentInput,
    this.pendingCameraCapture = false,
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskGarmentInput garmentInput;
  final bool pendingCameraCapture;

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'Review Garment',
      subtitle: garmentInput.intent.label,
      leading: IconButton(
        onPressed: () => _chooseAnother(context),
        icon: const Icon(Icons.arrow_back),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final portrait = constraints.maxHeight > constraints.maxWidth * 1.12;
          final compact =
              constraints.maxWidth < 940 ||
              constraints.maxHeight < 620 ||
              portrait;
          final imagePreview = Card(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.file(
                File(garmentInput.localPath),
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) {
                  return const Center(
                    child: Text('Garment photo unavailable'),
                  );
                },
              ),
            ),
          );
          final actions = _GarmentReviewActions(
            quality: pendingCameraCapture
                ? captureController.qualityResult
                : null,
            showQuality: pendingCameraCapture,
            compact: compact,
            onChooseAnother: () => _chooseAnother(context),
            onContinue: () => _continue(context),
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
      ),
    );
  }

  Future<void> _chooseAnother(BuildContext context) async {
    if (pendingCameraCapture) {
      await captureController.discardPendingCapture();
    }
    tryOnController.tryAnotherGarment();
    if (!context.mounted) {
      return;
    }
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => GarmentSelectionScreen(
          captureController: captureController,
          tryOnController: tryOnController,
          uploadController: uploadController,
        ),
      ),
      (route) => route.isFirst,
    );
  }

  Future<void> _continue(BuildContext context) async {
    tryOnController.selectGarment(garmentInput);
    if (pendingCameraCapture) {
      captureController.preservePendingCaptureAsExternalInput();
    }
    if (!context.mounted) {
      return;
    }
    await Navigator.of(context).pushReplacement(
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

class _GarmentReviewActions extends StatelessWidget {
  const _GarmentReviewActions({
    required this.quality,
    required this.showQuality,
    required this.compact,
    required this.onChooseAnother,
    required this.onContinue,
  });

  final ImageQualityResult? quality;
  final bool showQuality;
  final bool compact;
  final VoidCallback onChooseAnother;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    final blocked = showQuality && (quality?.isBlocked ?? true);
    return Column(
      mainAxisSize: compact ? MainAxisSize.min : MainAxisSize.max,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Garment photo',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                Text(
                  'Use this outfit reference or choose another image.',
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                if (showQuality) ...[
                  const SizedBox(height: 18),
                  Text(
                    quality == null
                        ? 'Checking garment photo'
                        : qualityStatusLabel(quality!.status),
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                ],
              ],
            ),
          ),
        ),
        if (compact) const SizedBox(height: 20) else const Spacer(),
        OutlinedButton.icon(
          key: const Key('choose-another-garment'),
          onPressed: onChooseAnother,
          icon: const Icon(Icons.replay),
          label: const Text('Choose Another'),
        ),
        const SizedBox(height: 16),
        ElevatedButton.icon(
          key: const Key('continue-from-garment-review'),
          onPressed: blocked ? null : onContinue,
          icon: const Icon(Icons.arrow_forward),
          label: const Text('Continue'),
        ),
      ],
    );
  }
}
