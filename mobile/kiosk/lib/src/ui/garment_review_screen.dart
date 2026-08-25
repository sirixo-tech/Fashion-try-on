import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import '../acquisition/photo_acquisition.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../session/capture_session_controller.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../tryon/model_garment_compatibility.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'browse_products_screen.dart';
import 'camera_capture_screen.dart';
import 'capture_review_screen.dart';
import 'kiosk_chrome.dart';
import 'model_compatibility_guidance_screen.dart';
import 'responsive_kiosk_layout.dart';
import 'selfx_kiosk_button.dart';
import 'try_on_generation_screen.dart';

enum GarmentPreviewState { preparing, success, failure }

class GarmentReviewScreen extends StatefulWidget {
  const GarmentReviewScreen({
    super.key,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
    required this.garmentInput,
    this.catalogGateway = const UnavailableKioskCatalogGateway(),
    this.pendingCameraCapture = false,
    this.extractionService = const UnavailableGarmentExtractionService(),
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskGarmentInput garmentInput;
  final KioskCatalogGateway catalogGateway;
  final bool pendingCameraCapture;
  final GarmentExtractionService extractionService;

  @override
  State<GarmentReviewScreen> createState() => _GarmentReviewScreenState();
}

class _GarmentReviewScreenState extends State<GarmentReviewScreen> {
  late KioskGarmentInput _displayInput;
  GarmentPreviewState _previewState = GarmentPreviewState.preparing;
  GarmentExtractionFailureKind _failureKind =
      GarmentExtractionFailureKind.temporary;
  String? _failureMessage;
  String? _activeExtractionPath;

  @override
  void initState() {
    super.initState();
    _displayInput = widget.garmentInput;
    _preparePreview();
  }

  @override
  void didUpdateWidget(covariant GarmentReviewScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.garmentInput.localPath != widget.garmentInput.localPath ||
        oldWidget.garmentInput.extractedPreviewPath !=
            widget.garmentInput.extractedPreviewPath) {
      _activeExtractionPath = null;
      _displayInput = widget.garmentInput;
      _previewState = GarmentPreviewState.preparing;
      _failureKind = GarmentExtractionFailureKind.temporary;
      _failureMessage = null;
      _preparePreview();
    }
  }

  Future<void> _preparePreview({bool force = false}) async {
    final originalPath = widget.garmentInput.localPath;
    if (_activeExtractionPath == originalPath) {
      return;
    }
    if (!force && await _hasValidPreview(widget.garmentInput)) {
      if (!mounted) {
        return;
      }
      setState(() {
        _displayInput = widget.garmentInput;
        _previewState = GarmentPreviewState.success;
      });
      return;
    }
    if (!widget.garmentInput.isCatalogProduct &&
        await widget.tryOnController.captureUploadExceedsLimit(
          widget.garmentInput.localPath,
        )) {
      setState(() {
        _previewState = GarmentPreviewState.failure;
        _failureKind = GarmentExtractionFailureKind.image;
        _failureMessage = widget.tryOnController.captureUploadTooLargeMessage;
        _activeExtractionPath = null;
      });
      return;
    }

    setState(() {
      _activeExtractionPath = originalPath;
      _previewState = GarmentPreviewState.preparing;
      _failureMessage = null;
    });
    final result = await widget.extractionService.extractPreview(
      widget.garmentInput,
    );
    if (!mounted) {
      return;
    }
    if (_activeExtractionPath != originalPath) {
      return;
    }
    if (result.hasPreview) {
      setState(() {
        _displayInput = widget.garmentInput.copyWith(
          intent: result.resolvedIntent ?? widget.garmentInput.intent,
          extractedPreviewPath: result.previewPath,
        );
        _previewState = GarmentPreviewState.success;
        _activeExtractionPath = null;
      });
      return;
    }
    debugPrint(
      'GARMENT_PREVIEW_FAILED code=${result.code ?? 'UNKNOWN'} status=${result.status.name}',
    );
    setState(() {
      _previewState = GarmentPreviewState.failure;
      _failureKind = result.failureKind;
      _failureMessage = result.message;
      _activeExtractionPath = null;
    });
  }

  Future<bool> _hasValidPreview(KioskGarmentInput input) async {
    final path = input.extractedPreviewPath;
    if (path == null || path.trim().isEmpty) {
      return false;
    }
    return File(path).exists();
  }

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'Garment Preview',
      subtitle: _displayInput.intent.label,
      leading: IconButton(
        onPressed: () => _chooseAnother(context),
        icon: const Icon(Icons.arrow_back),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final layout = KioskLayoutMetrics.fromConstraints(constraints);
          final compact = layout.stackPanels || layout.tightHeight;
          final imagePreview = _GarmentPreview(
            originalPath: _displayInput.localPath,
            path: _displayInput.extractedPreviewPath,
            state: _previewState,
            failureKind: _failureKind,
            failureMessage: _failureMessage,
          );
          final actions = _GarmentReviewActions(
            state: _previewState,
            failureKind: _failureKind,
            failureMessage: _failureMessage,
            sourceLabel: 'Retake',
            compact: compact,
            onChooseAnother: () => _retakeGarmentPhoto(context),
            onBrowseCatalog: () => _browseCatalog(context),
            onRetry: () => _preparePreview(force: true),
            onContinue: () => _continue(context),
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
      ),
    );
  }

  Future<void> _chooseAnother(BuildContext context) async {
    _activeExtractionPath = null;
    await _deleteGeneratedPreviewIfUnused();
    if (widget.pendingCameraCapture) {
      await widget.captureController.discardPendingCapture();
    }
    widget.tryOnController.tryAnotherGarment();
    if (!context.mounted) {
      return;
    }
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => CaptureReviewScreen(
          controller: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          extractionService: widget.extractionService,
        ),
      ),
      (route) => route.isFirst,
    );
  }

  Future<void> _retakeGarmentPhoto(BuildContext context) async {
    if (!widget.pendingCameraCapture) {
      await _chooseAnother(context);
      return;
    }
    _activeExtractionPath = null;
    final navigator = Navigator.of(context);
    unawaited(_deleteGeneratedPreviewIfUnused());
    unawaited(widget.captureController.discardPendingCapture());
    navigator.pop();
  }

  Future<void> _continue(BuildContext context) async {
    if (_previewState != GarmentPreviewState.success) {
      return;
    }
    widget.tryOnController.selectGarment(_displayInput);
    if (widget.pendingCameraCapture) {
      widget.captureController.preservePendingCaptureAsExternalInput();
    }
    if (!context.mounted) {
      return;
    }
    final personPhoto = widget.captureController.activeAcceptedPersonPhoto;
    if (personPhoto != null) {
      final compatibility = const ModelGarmentCompatibilityService().check(
        coverage: personPhoto.coverage,
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
              catalogGateway: widget.catalogGateway,
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
            catalogGateway: widget.catalogGateway,
            extractionService: widget.extractionService,
          ),
        ),
      );
      return;
    }
    await Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => CameraCaptureScreen(
          controller: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          extractionService: widget.extractionService,
          purpose: PhotoAcquisitionPurpose.model,
        ),
      ),
    );
  }

  Future<void> _deleteGeneratedPreviewIfUnused() async {
    final previewPath = _displayInput.extractedPreviewPath;
    if (previewPath == null || previewPath == _displayInput.localPath) {
      return;
    }
    await widget.captureController.captureStore.deleteCapture(previewPath);
  }

  Future<void> _browseCatalog(BuildContext context) async {
    _activeExtractionPath = null;
    await _deleteGeneratedPreviewIfUnused();
    if (widget.pendingCameraCapture) {
      await widget.captureController.discardPendingCapture();
    }
    widget.tryOnController.tryAnotherGarment();
    if (!context.mounted) {
      return;
    }
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => BrowseProductsScreen(
          captureController: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          extractionService: widget.extractionService,
        ),
      ),
      (route) => route.isFirst,
    );
  }
}

class _GarmentPreview extends StatelessWidget {
  const _GarmentPreview({
    required this.originalPath,
    required this.path,
    required this.state,
    required this.failureKind,
    this.failureMessage,
  });

  final String originalPath;
  final String? path;
  final GarmentPreviewState state;
  final GarmentExtractionFailureKind failureKind;
  final String? failureMessage;

  @override
  Widget build(BuildContext context) {
    final previewPath = path;
    return Card(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (state == GarmentPreviewState.success &&
                previewPath != null &&
                previewPath.trim().isNotEmpty)
              Image.file(
                File(previewPath),
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) {
                  return const _GarmentPreviewMessage(
                    message: 'Garment image unavailable.',
                  );
                },
              )
            else if (state == GarmentPreviewState.preparing)
              _PreparingPreview(originalPath: originalPath)
            else
              _FailurePreview(
                failureKind: failureKind,
                failureMessage: failureMessage,
              ),
            if (state == GarmentPreviewState.preparing) const _PreviewSpinner(),
          ],
        ),
      ),
    );
  }
}

class _PreparingPreview extends StatelessWidget {
  const _PreparingPreview({required this.originalPath});

  final String originalPath;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.file(
          File(originalPath),
          fit: BoxFit.contain,
          opacity: const AlwaysStoppedAnimation(0.28),
          errorBuilder: (_, _, _) => const SizedBox.shrink(),
        ),
        const _GarmentPreviewMessage(message: 'Preparing garment preview...'),
      ],
    );
  }
}

class _FailurePreview extends StatelessWidget {
  const _FailurePreview({required this.failureKind, this.failureMessage});

  final GarmentExtractionFailureKind failureKind;
  final String? failureMessage;

  @override
  Widget build(BuildContext context) {
    final imageIssue = failureKind == GarmentExtractionFailureKind.image;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                imageIssue
                    ? Icons.image_search_outlined
                    : Icons.cloud_off_outlined,
                color: Theme.of(context).colorScheme.primary,
                size: 58,
              ),
              const SizedBox(height: 18),
              Text(
                imageIssue
                    ? "We couldn't find a clear garment in this photo."
                    : "We couldn't prepare the garment preview right now.",
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              Text(
                failureMessage ??
                    (imageIssue
                        ? 'Please retake the garment photo with the item clearly visible.'
                        : 'Please try again in a moment.'),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              if (imageIssue && failureMessage == null) ...[
                const SizedBox(height: 18),
                const _GuidanceLines(),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _GuidanceLines extends StatelessWidget {
  const _GuidanceLines();

  @override
  Widget build(BuildContext context) {
    const lines = [
      'Keep the full garment visible',
      'Use good lighting',
      'Avoid blur',
      'Avoid hands covering the garment',
      'Keep one garment clearly in frame',
    ];
    return Column(
      children: [
        for (final line in lines)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.check, size: 18),
                const SizedBox(width: 8),
                Flexible(child: Text(line, textAlign: TextAlign.center)),
              ],
            ),
          ),
      ],
    );
  }
}

class _PreviewSpinner extends StatelessWidget {
  const _PreviewSpinner();

  @override
  Widget build(BuildContext context) {
    return const Positioned(
      right: 14,
      top: 14,
      child: SizedBox(
        width: 24,
        height: 24,
        child: CircularProgressIndicator(strokeWidth: 3),
      ),
    );
  }
}

class _GarmentPreviewMessage extends StatelessWidget {
  const _GarmentPreviewMessage({required this.message});

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
    required this.state,
    required this.failureKind,
    this.failureMessage,
    required this.sourceLabel,
    required this.compact,
    required this.onChooseAnother,
    required this.onBrowseCatalog,
    required this.onRetry,
    required this.onContinue,
  });

  final GarmentPreviewState state;
  final GarmentExtractionFailureKind failureKind;
  final String? failureMessage;
  final String sourceLabel;
  final bool compact;
  final VoidCallback onChooseAnother;
  final VoidCallback onBrowseCatalog;
  final VoidCallback onRetry;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: compact ? MainAxisSize.min : MainAxisSize.max,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (state == GarmentPreviewState.success) ...[
          _ActionCopy(
            title: 'Garment looks ready',
            message: 'Make sure this is the garment you want to try on.',
          ),
          const SizedBox(height: 12),
        ],
        if (state == GarmentPreviewState.failure) ...[
          _ActionCopy(
            title: failureKind == GarmentExtractionFailureKind.image
                ? 'Retake garment photo'
                : 'Preview service needs another try',
            message:
                failureMessage ??
                (failureKind == GarmentExtractionFailureKind.image
                    ? "We couldn't identify the garment clearly. Retake the garment photo or choose from catalog."
                    : 'Your photo is still here. Retry the preview when ready.'),
          ),
          const SizedBox(height: 12),
        ],
        if (!compact) const Spacer(),
        if (state == GarmentPreviewState.failure) ...[
          SelfxKioskButton(
            key: const Key('retry-garment-preview'),
            label: 'Retry Preview',
            onPressed: onRetry,
            icon: Icons.refresh,
            variant: SelfxKioskButtonVariant.primary,
            minHeight: 64,
            textAlign: TextAlign.center,
            mainAxisAlignment: MainAxisAlignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          ),
          const SizedBox(height: 10),
        ],
        Row(
          children: [
            Expanded(
              child: SelfxKioskButton(
                key: const Key('choose-another-garment'),
                label: sourceLabel,
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
              child:
                  state == GarmentPreviewState.failure &&
                      failureKind == GarmentExtractionFailureKind.image
                  ? SelfxKioskButton(
                      key: const Key('browse-catalog-from-garment-review'),
                      label: 'Browse Catalog',
                      onPressed: onBrowseCatalog,
                      icon: Icons.shopping_bag_outlined,
                      variant: SelfxKioskButtonVariant.primary,
                      minHeight: 64,
                      textAlign: TextAlign.center,
                      mainAxisAlignment: MainAxisAlignment.center,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 12,
                      ),
                    )
                  : SelfxKioskButton(
                      key: const Key('continue-from-garment-review'),
                      label: 'Proceed',
                      onPressed: state == GarmentPreviewState.success
                          ? onContinue
                          : null,
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

class _ActionCopy extends StatelessWidget {
  const _ActionCopy({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          title,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 4),
        Text(
          message,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
      ],
    );
  }
}
