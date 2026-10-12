import 'dart:async';
import 'dart:math' as math;

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
import 'camera_capture_screen.dart';
import 'capture_review_presentation.dart';
import 'kiosk_attention_animations.dart';
import 'mobile_upload_screen.dart';
import 'product_recommendation_carousel.dart';
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
          return CaptureReviewPresentation(
            imagePath: capture.originalPath,
            onBack: () async {
              await controller.retake();
              if (context.mounted) {
                Navigator.of(context).pop();
              }
            },
            actions: _ReviewActions(
              controller: controller,
              tryOnController: tryOnController,
              uploadController: uploadController,
              catalogGateway: catalogGateway,
              extractionService: extractionService,
              usability: usability,
              usingAcceptedPersonPhoto: usingAcceptedPersonPhoto,
            ),
          );
        },
      ),
    );
  }
}

class _ReviewActions extends StatefulWidget {
  const _ReviewActions({
    required this.controller,
    required this.tryOnController,
    required this.uploadController,
    required this.catalogGateway,
    required this.extractionService,
    required this.usability,
    required this.usingAcceptedPersonPhoto,
  });

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
    final service = widget.tryOnController.recommendations;
    final photo = widget.controller.capture;
    if (service?.sessionActive != true ||
        photo == null ||
        widget.controller.isAnalyzingQuality ||
        widget.usability?.isUsable != true ||
        _acceptanceScheduledFor == photo.originalPath ||
        widget.controller.activeAcceptedPersonPhoto?.image.originalPath ==
            photo.originalPath) {
      return;
    }
    _acceptanceScheduledFor = photo.originalPath;
    final revision = service!.sessionRevision;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted &&
          service.sessionActive &&
          service.sessionRevision == revision &&
          widget.controller.capture == photo &&
          !widget.controller.isAnalyzingQuality &&
          widget.usability?.isUsable == true) {
        unawaited(widget.controller.usePhoto());
      }
    });
  }

  @override
  Widget build(BuildContext context) {
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
              child: _ImageUsabilityStatement(
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
            if (widget.controller.activeAcceptedPersonPhoto != null &&
                widget.tryOnController.recommendations != null) ...[
              ProductRecommendationCarousel(
                captureController: widget.controller,
                tryOnController: widget.tryOnController,
                catalogGateway: widget.catalogGateway,
                busy: _busy,
                onShowAll: () =>
                    unawaited(_runLocked(() => _replaceWithCatalog(context))),
                onOpenPicks: () =>
                    showCatalogMyPicks(context, widget.tryOnController),
                onContinue: () => unawaited(
                  _runLocked(() => _continueSelectedProductTryOn(context)),
                ),
                onSingleProduct: (product) {
                  if (product.productVertical ==
                      KioskProductVertical.jewellery) {
                    unawaited(
                      _runLocked(
                        () => _replaceWithCatalog(
                          context,
                          initialProduct: product,
                        ),
                      ),
                    );
                  } else {
                    widget.tryOnController.selectGarment(
                      product.toGarmentInput(),
                    );
                  }
                },
              ),
              const SizedBox(height: 16),
            ],
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
                    if (hasSelectedCatalogProduct &&
                        experience.supportsPhysicalProductCapture &&
                        widget.tryOnController.recommendations != null) ...[
                      const SizedBox(height: 12),
                      SelfxKioskButton(
                        key: const Key('take-garment-photo'),
                        onPressed: _busy
                            ? null
                            : () => unawaited(
                                _runLocked(() => _openGarmentCamera(context)),
                              ),
                        icon: Icons.camera_alt_outlined,
                        label: 'Take Garment Photo',
                        variant: SelfxKioskButtonVariant.secondary,
                      ),
                    ],
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
    unawaited(widget.controller.retake());
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

class _ImageUsabilityStatement extends StatefulWidget {
  const _ImageUsabilityStatement({
    required this.isLoading,
    required this.result,
  });

  final bool isLoading;
  final ImageUsabilityResult? result;

  @override
  State<_ImageUsabilityStatement> createState() =>
      _ImageUsabilityStatementState();
}

class _ImageUsabilityStatementState extends State<_ImageUsabilityStatement> {
  static final math.Random _random = math.Random();

  _SuccessReviewMessage? _successMessage;

  @override
  void initState() {
    super.initState();
    _syncSuccessMessage();
  }

  @override
  void didUpdateWidget(covariant _ImageUsabilityStatement oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.result?.isUsable != oldWidget.result?.isUsable ||
        widget.result?.message != oldWidget.result?.message) {
      _syncSuccessMessage();
    }
  }

  void _syncSuccessMessage() {
    final result = widget.result;
    if (result?.isUsable != true) {
      _successMessage = null;
      return;
    }
    _successMessage =
        _successReviewMessages[_random.nextInt(_successReviewMessages.length)];
  }

  @override
  Widget build(BuildContext context) {
    final result = widget.result;
    final isSuccess = !widget.isLoading && result?.isUsable == true;
    const successColor = SelfxKioskTokens.reviewSuccess;
    return Semantics(
      liveRegion: true,
      child: DecoratedBox(
        key: const Key('capture-review-status'),
        decoration: BoxDecoration(
          color: isSuccess
              ? SelfxKioskTokens.reviewSuccessSurface
              : Colors.white,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(
            color: isSuccess
                ? SelfxKioskTokens.reviewSuccessBorder
                : SelfxKioskTokens.border,
            width: 1.5,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (widget.isLoading)
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
                  title: result.isUsable ? 'You’re Ready!' : null,
                  icon: result.isUsable
                      ? Icons.check_rounded
                      : Icons.error_outline,
                  animateIcon: result.isUsable,
                  backgroundColor: result.isUsable
                      ? successColor
                      : const Color(0xFFC53030),
                  iconColor: Colors.white,
                  textColor: SelfxKioskTokens.textPrimary,
                  text: result.isUsable
                      ? _successMessage?.text ?? result.message
                      : result.message,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SuccessReviewMessage {
  const _SuccessReviewMessage({required this.text});

  final String text;
}

const _successReviewMessages = [
  _SuccessReviewMessage(text: 'Perfect capture - you\'re looking great!'),
  _SuccessReviewMessage(text: 'Great photo - you\'re ready to shine!'),
  _SuccessReviewMessage(text: 'Photo confirmed - looking sharp!'),
  _SuccessReviewMessage(text: 'Excellent capture - you look amazing!'),
  _SuccessReviewMessage(text: 'Picture looks perfect - so do you!'),
  _SuccessReviewMessage(text: 'Great shot - you\'re all set!'),
  _SuccessReviewMessage(text: 'Capture approved - looking fantastic!'),
  _SuccessReviewMessage(text: 'Perfect shot - looking your best!'),
  _SuccessReviewMessage(text: 'Photo is spot on - you\'re looking great!'),
  _SuccessReviewMessage(text: 'Great capture - ready for your new look!'),
];

class _UsabilityLine extends StatelessWidget {
  const _UsabilityLine({
    required this.icon,
    this.animateIcon = false,
    required this.backgroundColor,
    required this.iconColor,
    required this.textColor,
    required this.text,
    this.title,
  });

  final IconData icon;
  final bool animateIcon;
  final Color backgroundColor;
  final Color iconColor;
  final Color textColor;
  final String text;
  final String? title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (animateIcon)
            SelfxSuccessIconPulse(
              icon: icon,
              backgroundColor: backgroundColor,
              iconColor: iconColor,
              iconSize: 32,
              padding: const EdgeInsets.all(12),
            )
          else
            DecoratedBox(
              decoration: BoxDecoration(
                color: backgroundColor,
                shape: BoxShape.circle,
              ),
              child: Padding(
                padding: const EdgeInsets.all(5),
                child: Icon(icon, size: 18, color: iconColor),
              ),
            ),
          const SizedBox(width: 12),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (title != null) ...[
                  Text(
                    title!,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: textColor,
                      fontWeight: FontWeight.w900,
                      fontSize:
                          MediaQuery.orientationOf(context) ==
                                  Orientation.portrait &&
                              MediaQuery.sizeOf(context).width >= 760
                          ? 34
                          : null,
                    ),
                  ),
                  const SizedBox(height: 4),
                ],
                Text(
                  text,
                  textAlign: TextAlign.start,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: title != null
                        ? SelfxKioskTokens.textSecondary
                        : textColor,
                    fontWeight: title != null
                        ? FontWeight.w600
                        : FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
