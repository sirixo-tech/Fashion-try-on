import 'dart:async';

import 'package:flutter/material.dart';

import '../acquisition/photo_acquisition.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../catalog/kiosk_catalog_models.dart';
import '../session/capture_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'browse_products_screen.dart';
import 'accepted_person_photo_actions.dart';
import 'camera_capture_screen.dart';
import 'capture_review_presentation.dart';
import 'kiosk_attention_animations.dart';
import 'mobile_upload_screen.dart';
import 'selfx_kiosk_action_card.dart';
import 'selfx_kiosk_button.dart';
import 'try_on_experience_config.dart';
import 'try_on_generation_screen.dart';

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
    return Scaffold(
      backgroundColor: SelfxKioskTokens.reviewBackground,
      body: AnimatedBuilder(
        animation: Listenable.merge([controller, tryOnController]),
        builder: (context, _) {
          final acceptedPersonPhoto = controller.activeAcceptedPersonPhoto;
          final capture = controller.capture ?? acceptedPersonPhoto?.capture;
          if (capture == null) {
            return const Center(
              child: Text(
                'No capture available.',
                style: TextStyle(color: SelfxKioskTokens.textPrimary),
              ),
            );
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
          return _ReviewActions(
            imagePath: capture.originalPath,
            onBack: () async {
              await tryOnController.retakePhoto(controller);
              if (context.mounted) Navigator.of(context).pop();
            },
            controller: controller,
            tryOnController: tryOnController,
            uploadController: uploadController,
            catalogGateway: catalogGateway,
            extractionService: extractionService,
            usability: usability,
            usingAcceptedPersonPhoto: usingAcceptedPersonPhoto,
          );
        },
      ),
    );
  }
}

class _ReviewActions extends StatefulWidget {
  const _ReviewActions({
    required this.imagePath,
    required this.onBack,
    required this.controller,
    required this.tryOnController,
    required this.uploadController,
    required this.catalogGateway,
    required this.extractionService,
    required this.usability,
    required this.usingAcceptedPersonPhoto,
  });

  final String imagePath;
  final VoidCallback onBack;
  final CaptureSessionController controller;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final GarmentExtractionService extractionService;
  final ImageUsabilityResult? usability;
  final bool usingAcceptedPersonPhoto;

  @override
  State<_ReviewActions> createState() => _ReviewActionsState();
}

class _ReviewActionsState extends State<_ReviewActions> {
  bool _busy = false;
  String? _acceptanceScheduledFor;

  @override
  void initState() {
    super.initState();
    _scheduleAcceptance();
  }

  @override
  void didUpdateWidget(covariant _ReviewActions oldWidget) {
    super.didUpdateWidget(oldWidget);
    _scheduleAcceptance();
  }

  void _scheduleAcceptance() {
    final session = widget.tryOnController;
    final photo = widget.controller.capture;
    if (!session.customerSessionActive ||
        photo == null ||
        widget.controller.isAnalyzingQuality ||
        widget.usability?.isUsable != true ||
        _acceptanceScheduledFor == photo.originalPath ||
        widget.controller.activeAcceptedPersonPhoto?.image.originalPath ==
            photo.originalPath) {
      return;
    }
    _acceptanceScheduledFor = photo.originalPath;
    final revision = session.customerSessionRevision;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted &&
          session.isCustomerSessionCurrent(revision) &&
          widget.controller.capture == photo &&
          !widget.controller.isAnalyzingQuality &&
          widget.usability?.isUsable == true) {
        unawaited(widget.controller.usePhoto());
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final overlayDesign =
        widget.tryOnController.activeTryOnVertical ==
            KioskTryOnVertical.garment ||
        widget.tryOnController.activeTryOnVertical ==
            KioskTryOnVertical.jewellery;
    final hasSelectedCatalogProduct =
        widget.tryOnController.garmentInput?.isCatalogProduct == true;
    final usable =
        widget.usability?.isUsable == true &&
        !widget.controller.isAnalyzingQuality;
    return CaptureReviewPresentation(
      imagePath: widget.imagePath,
      onBack: _busy ? () {} : widget.onBack,
      prioritizePhoto: overlayDesign,
      actions: overlayDesign
          ? AcceptedPersonPhotoActions(
              status: PersonPhotoStatus(
                isLoading: widget.controller.isAnalyzingQuality,
                result: widget.usability,
                instruction: usable
                    ? hasSelectedCatalogProduct
                          ? widget.tryOnController.activeTryOnVertical ==
                                    KioskTryOnVertical.jewellery
                                ? jewelleryTryOnExperience.reviewInstruction
                                : 'Your photo is ready for this garment.'
                          : tryOnExperienceFor(
                              widget.tryOnController.activeTryOnVertical,
                            ).reviewInstruction
                    : null,
              ),
              busy: _busy,
              catalogProductSelected: hasSelectedCatalogProduct,
              onContinue: !usable || _busy || !hasSelectedCatalogProduct
                  ? null
                  : () => unawaited(
                      _runLocked(() => _continueSelectedProductTryOn(context)),
                    ),
              onTakeGarmentPhoto: !usable || _busy || hasSelectedCatalogProduct
                  ? null
                  : () => unawaited(
                      _runLocked(() => _openGarmentCamera(context)),
                    ),
              onRetake: _busy ? null : () => _retake(context),
              onUploadPhoto:
                  !usable &&
                      widget.usability != null &&
                      !_busy &&
                      !widget.controller.isAnalyzingQuality
                  ? () =>
                        unawaited(_runLocked(() => _uploadModelPhoto(context)))
                  : null,
            )
          : _buildLegacyActions(context),
    );
  }

  Widget _buildLegacyActions(BuildContext context) {
    final isChecking =
        widget.controller.isAnalyzingQuality || widget.usability == null;
    final isUsable = widget.usability?.isUsable == true;
    final experience = tryOnExperienceFor(
      widget.tryOnController.activeTryOnVertical,
    );
    final hasSelectedCatalogProduct =
        widget.tryOnController.garmentInput?.isCatalogProduct == true;
    final needsPhysicalProductCapture =
        experience.supportsPhysicalProductCapture && !hasSelectedCatalogProduct;
    final largePortrait =
        MediaQuery.orientationOf(context) == Orientation.portrait &&
        MediaQuery.sizeOf(context).width >= 760;
    final primaryHeight = largePortrait ? 94.0 : 64.0;
    final theme = Theme.of(context);
    return Theme(
      data: theme.copyWith(
        textTheme: theme.textTheme.copyWith(
          titleMedium: theme.textTheme.titleMedium?.copyWith(
            fontSize: largePortrait ? 26 : null,
          ),
          bodyMedium: theme.textTheme.bodyMedium?.copyWith(
            fontSize: largePortrait ? 18 : null,
          ),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth:
                    MediaQuery.orientationOf(context) == Orientation.portrait
                    ? MediaQuery.sizeOf(context).width * 0.76
                    : double.infinity,
              ),
              child: PersonPhotoStatus(
                isLoading: widget.controller.isAnalyzingQuality,
                result: widget.usability,
              ),
            ),
          ),
          const SizedBox(height: 18),
          if (isChecking) ...[
            SelfxKioskActionCard(
              key: const Key('retake-photo'),
              onPressed: null,
              icon: Icons.replay,
              iconColor: SelfxKioskTokens.homeGold,
              label: 'Retake',
              subtitle: 'Checking photo',
              minHeight: 64,
            ),
            const SizedBox(height: 16),
            SelfxKioskButton(
              key: const Key('take-garment-photo'),
              onPressed: null,
              icon: needsPhysicalProductCapture
                  ? Icons.camera_alt_outlined
                  : experience.icon,
              label: needsPhysicalProductCapture
                  ? experience.reviewWaitingActionLabel
                  : 'Continue',
              variant: SelfxKioskButtonVariant.primary,
              minHeight: primaryHeight,
              borderRadius: 999,
              textAlign: TextAlign.center,
              mainAxisAlignment: MainAxisAlignment.center,
            ),
          ] else if (isUsable) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  needsPhysicalProductCapture
                      ? Icons.camera_alt_outlined
                      : experience.icon,
                  color: SelfxKioskTokens.textSecondary,
                  size: largePortrait ? 32 : 24,
                ),
                const SizedBox(width: 12),
                Flexible(
                  child: Text(
                    hasSelectedCatalogProduct
                        ? 'Your photo is ready for this garment.'
                        : experience.reviewInstruction,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: SelfxKioskTokens.textSecondary,
                      fontWeight: FontWeight.w800,
                      fontSize: largePortrait ? 24 : null,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Align(
              alignment: Alignment.center,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 820),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (needsPhysicalProductCapture) ...[
                      SelfxActionPulse(
                        borderRadius: 999,
                        child: SelfxKioskButton(
                          key: const Key('take-garment-photo'),
                          onPressed: _busy
                              ? null
                              : () => unawaited(
                                  _runLocked(() => _openGarmentCamera(context)),
                                ),
                          icon: Icons.camera_alt_outlined,
                          iconSize: largePortrait ? 40 : 28,
                          label: _busy ? 'Preparing...' : 'Take Garment Photo',
                          variant: SelfxKioskButtonVariant.primary,
                          minHeight: primaryHeight,
                          borderRadius: 999,
                          trailing: const Icon(Icons.arrow_forward),
                          textAlign: TextAlign.center,
                          mainAxisAlignment: MainAxisAlignment.center,
                        ),
                      ),
                      const SizedBox(height: 14),
                    ] else ...[
                      SelfxActionPulse(
                        borderRadius: 999,
                        child: SelfxKioskButton(
                          key: const Key('continue-selected-product-try-on'),
                          onPressed: _busy
                              ? null
                              : () => unawaited(
                                  _runLocked(
                                    () =>
                                        _continueSelectedProductTryOn(context),
                                  ),
                                ),
                          icon: _busy
                              ? Icons.hourglass_top
                              : Icons.play_arrow_rounded,
                          iconSize: largePortrait ? 40 : 28,
                          label: _busy
                              ? 'Preparing...'
                              : hasSelectedCatalogProduct
                              ? 'Continue'
                              : experience.reviewWaitingActionLabel,
                          variant: SelfxKioskButtonVariant.primary,
                          minHeight: primaryHeight,
                          borderRadius: 999,
                          trailing: const Icon(Icons.arrow_forward),
                          textAlign: TextAlign.center,
                          mainAxisAlignment: MainAxisAlignment.center,
                        ),
                      ),
                      const SizedBox(height: 14),
                    ],
                    _ReviewSecondaryActions(
                      catalog: SelfxKioskActionCard(
                        key: const Key('browse-catalog'),
                        onPressed: _busy
                            ? null
                            : () => unawaited(
                                _runLocked(() => _openCatalog(context)),
                              ),
                        icon: experience.icon,
                        iconColor: SelfxKioskTokens.primary,
                        borderColor: SelfxKioskTokens.primary,
                        titleColor: SelfxKioskTokens.textPrimary,
                        trailing: const Icon(
                          Icons.arrow_forward,
                          color: SelfxKioskTokens.primary,
                        ),
                        label: experience.reviewCatalogActionLabel,
                        subtitle: 'Choose item',
                        minHeight: largePortrait ? 100 : 76,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                      ),
                      retake: SelfxKioskActionCard(
                        key: const Key('retake-photo'),
                        onPressed: _busy ? null : () => _retake(context),
                        icon: Icons.replay,
                        iconColor: SelfxKioskTokens.homeGold,
                        borderColor: SelfxKioskTokens.homeGold,
                        titleColor: SelfxKioskTokens.textPrimary,
                        trailing: const Icon(
                          Icons.arrow_forward,
                          color: SelfxKioskTokens.warning,
                        ),
                        label: 'Retake Photo',
                        subtitle: 'Capture again',
                        minHeight: largePortrait ? 100 : 76,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ] else ...[
            SelfxKioskActionCard(
              key: const Key('retake-photo'),
              onPressed: _busy ? null : () => _retake(context),
              icon: Icons.replay,
              iconColor: SelfxKioskTokens.homeGold,
              borderColor: SelfxKioskTokens.homeGold,
              titleColor: SelfxKioskTokens.textPrimary,
              label: 'Retake Photo',
              subtitle: 'Capture again',
              minHeight: 64,
              textAlign: TextAlign.center,
              crossAxisAlignment: CrossAxisAlignment.center,
            ),
            const SizedBox(height: 16),
            SelfxKioskButton(
              key: const Key('upload-model-photo'),
              onPressed: _busy
                  ? null
                  : () =>
                        unawaited(_runLocked(() => _uploadModelPhoto(context))),
              icon: _busy ? Icons.hourglass_top : Icons.file_upload_outlined,
              label: _busy ? 'Preparing...' : 'Upload Photo',
              variant: SelfxKioskButtonVariant.primary,
              textAlign: TextAlign.center,
              mainAxisAlignment: MainAxisAlignment.center,
              borderRadius: 26,
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _runLocked(Future<void> Function() action) async {
    if (_busy) {
      return;
    }
    setState(() => _busy = true);
    try {
      await action();
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<bool> _acceptModelPhoto(BuildContext context) async {
    if (widget.usingAcceptedPersonPhoto ||
        (widget.controller.activeAcceptedPersonPhoto != null &&
            widget.controller.activeAcceptedPersonPhoto?.image.originalPath ==
                widget.controller.capture?.originalPath)) {
      return true;
    }

    final result = await widget.controller.usePhoto();
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
    return true;
  }

  Future<void> _openGarmentCamera(BuildContext context) async {
    if (widget.tryOnController.garmentInput?.isCatalogProduct == true) {
      await _continueSelectedProductTryOn(context);
      return;
    }
    if (!await _acceptModelPhoto(context) || !context.mounted) {
      return;
    }
    await Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => CameraCaptureScreen(
          controller: widget.controller,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          extractionService: widget.extractionService,
          purpose: PhotoAcquisitionPurpose.garment,
        ),
      ),
    );
  }

  Future<void> _openCatalog(BuildContext context) async {
    if (widget.tryOnController.activeTryOnVertical ==
        KioskTryOnVertical.jewellery) {
      await widget.controller.retake();
      widget.tryOnController.tryAnotherGarment();
      if (!context.mounted) {
        return;
      }
      await _replaceWithCatalog(context);
      return;
    }
    if (!await _acceptModelPhoto(context) || !context.mounted) {
      return;
    }
    await _replaceWithCatalog(context);
  }

  Future<void> _replaceWithCatalog(
    BuildContext context, {
    KioskCatalogProduct? initialProduct,
  }) async {
    await Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => BrowseProductsScreen(
          captureController: widget.controller,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          extractionService: widget.extractionService,
          initialProduct: initialProduct,
          productVertical: tryOnExperienceFor(
            widget.tryOnController.activeTryOnVertical,
          ).productVertical,
        ),
      ),
    );
  }

  Future<void> _continueSelectedProductTryOn(BuildContext context) async {
    if (!await _acceptModelPhoto(context) || !context.mounted) {
      return;
    }
    await Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => TryOnGenerationScreen(
          captureController: widget.controller,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          extractionService: widget.extractionService,
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
            captureController: widget.controller,
            tryOnController: widget.tryOnController,
            uploadController: widget.uploadController,
            catalogGateway: widget.catalogGateway,
            extractionService: widget.extractionService,
            purpose: PhotoAcquisitionPurpose.model,
          ),
        ),
      ),
    );
    await Future<void>.delayed(Duration.zero);
    await widget.controller.discardPendingCapture();
  }

  void _retake(BuildContext context) {
    final navigator = Navigator.of(context);
    unawaited(widget.tryOnController.retakePhoto(widget.controller));
    navigator.pop();
  }
}

class _ReviewSecondaryActions extends StatelessWidget {
  const _ReviewSecondaryActions({required this.catalog, required this.retake});
  final Widget catalog;
  final Widget retake;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 500) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [catalog, const SizedBox(height: 12), retake],
          );
        }
        return Row(
          children: [
            Expanded(child: catalog),
            const SizedBox(width: 16),
            Expanded(child: retake),
          ],
        );
      },
    );
  }
}
