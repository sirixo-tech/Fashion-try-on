import 'dart:io';

import 'package:flutter/material.dart';

import '../session/capture_session_controller.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../tryon/model_garment_compatibility.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'garment_selection_screen.dart';
import 'kiosk_chrome.dart';
import 'model_compatibility_guidance_screen.dart';
import 'photo_source_choice_screen.dart';
import 'selfx_kiosk_button.dart';
import 'try_on_generation_screen.dart';

class GarmentReviewScreen extends StatefulWidget {
  const GarmentReviewScreen({
    super.key,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
    required this.garmentInput,
    this.pendingCameraCapture = false,
    this.extractionService = const UnavailableGarmentExtractionService(),
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskGarmentInput garmentInput;
  final bool pendingCameraCapture;
  final GarmentExtractionService extractionService;

  @override
  State<GarmentReviewScreen> createState() => _GarmentReviewScreenState();
}

class _GarmentReviewScreenState extends State<GarmentReviewScreen> {
  late KioskGarmentInput _displayInput;
  bool _extracting = false;
  String? _extractionMessage;

  @override
  void initState() {
    super.initState();
    _displayInput = widget.garmentInput;
    _extractPreview();
  }

  Future<void> _extractPreview() async {
    if (widget.garmentInput.extractedPreviewPath != null) {
      return;
    }
    setState(() {
      _extracting = true;
      _extractionMessage = null;
    });
    final result = await widget.extractionService.extractPreview(
      widget.garmentInput,
    );
    if (!mounted) {
      return;
    }
    if (result.hasPreview) {
      setState(() {
        _displayInput = widget.garmentInput.copyWith(
          extractedPreviewPath: result.previewPath,
        );
        _extracting = false;
        _extractionMessage = null;
      });
      return;
    }
    setState(() {
      _extracting = false;
      _extractionMessage =
          result.message ?? 'SelfX could not prepare the garment image.';
    });
  }

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'Review Garment',
      subtitle: _displayInput.intent.label,
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
          final imagePreview = _GarmentPreview(
            path: _displayInput.extractedPreviewPath,
            extracting: _extracting,
            message: _extractionMessage,
          );
          final actions = _GarmentReviewActions(
            compact: compact,
            onChooseAnother: () => _chooseAnother(context),
            canContinue:
                !_extracting &&
                (_displayInput.extractedPreviewPath?.trim().isNotEmpty ??
                    false),
            onContinue: () => _continue(context),
          );

          if (compact) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: imagePreview),
                const SizedBox(height: 12),
                actions,
              ],
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
    if (widget.pendingCameraCapture) {
      await widget.captureController.discardPendingCapture();
    }
    widget.tryOnController.tryAnotherGarment();
    if (!context.mounted) {
      return;
    }
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => GarmentSelectionScreen(
          captureController: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          extractionService: widget.extractionService,
        ),
      ),
      (route) => route.isFirst,
    );
  }

  Future<void> _continue(BuildContext context) async {
    widget.tryOnController.selectGarment(_displayInput);
    if (widget.pendingCameraCapture) {
      widget.captureController.preservePendingCaptureAsExternalInput();
    }
    if (!context.mounted) {
      return;
    }
    final coverage = widget.captureController.acceptedModelCoverage;
    if (widget.captureController.acceptedCapture != null && coverage != null) {
      final compatibility = const ModelGarmentCompatibilityService().check(
        coverage: coverage,
        intent: _displayInput.intent,
      );
      if (!compatibility.supported) {
        await Navigator.of(context).pushReplacement(
          MaterialPageRoute<void>(
            builder: (_) => ModelCompatibilityGuidanceScreen(
              intent: _displayInput.intent,
              captureController: widget.captureController,
              tryOnController: widget.tryOnController,
              uploadController: widget.uploadController,
              extractionService: widget.extractionService,
            ),
          ),
        );
        return;
      }
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => TryOnGenerationScreen(
            captureController: widget.captureController,
            tryOnController: widget.tryOnController,
            uploadController: widget.uploadController,
            extractionService: widget.extractionService,
          ),
        ),
      );
      return;
    }
    await Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => PhotoSourceChoiceScreen(
          captureController: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          extractionService: widget.extractionService,
        ),
      ),
    );
  }
}

class _GarmentPreview extends StatelessWidget {
  const _GarmentPreview({
    required this.path,
    required this.extracting,
    required this.message,
  });

  final String? path;
  final bool extracting;
  final String? message;

  @override
  Widget build(BuildContext context) {
    final previewPath = path;
    return Card(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (previewPath != null && previewPath.trim().isNotEmpty)
              Image.file(
                File(previewPath),
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) {
                  return const _GarmentPreviewState(
                    message: 'Garment image unavailable.',
                  );
                },
              )
            else
              _GarmentPreviewState(
                message: extracting
                    ? 'Preparing garment image...'
                    : message ?? 'Preparing garment image...',
              ),
            if (extracting)
              const Positioned(
                right: 14,
                top: 14,
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 3),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _GarmentPreviewState extends StatelessWidget {
  const _GarmentPreviewState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleMedium,
        ),
      ),
    );
  }
}

class _GarmentReviewActions extends StatelessWidget {
  const _GarmentReviewActions({
    required this.compact,
    required this.onChooseAnother,
    required this.canContinue,
    required this.onContinue,
  });

  final bool compact;
  final VoidCallback onChooseAnother;
  final bool canContinue;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: compact ? MainAxisSize.min : MainAxisSize.max,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) const Spacer(),
        Row(
          children: [
            Expanded(
              child: SelfxKioskButton(
                key: const Key('choose-another-garment'),
                label: 'Retake Photo',
                onPressed: onChooseAnother,
                icon: Icons.replay,
                variant: SelfxKioskButtonVariant.secondary,
                minHeight: 64,
                textAlign: TextAlign.center,
                mainAxisAlignment: MainAxisAlignment.center,
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 12,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: SelfxKioskButton(
                key: const Key('continue-from-garment-review'),
                label: 'Proceed',
                onPressed: canContinue ? onContinue : null,
                icon: Icons.arrow_forward,
                variant: SelfxKioskButtonVariant.primary,
                minHeight: 64,
                textAlign: TextAlign.center,
                mainAxisAlignment: MainAxisAlignment.center,
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 12,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
