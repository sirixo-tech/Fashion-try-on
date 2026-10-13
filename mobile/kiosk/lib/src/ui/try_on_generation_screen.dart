import 'package:flutter/material.dart';

import '../acquisition/photo_acquisition.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../session/capture_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_try_on_models.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'camera_capture_screen.dart';
import 'mobile_upload_screen.dart';
import 'capture_review_screen.dart';
import 'browse_products_screen.dart';
import 'kiosk_chrome.dart';
import 'try_on_result_screen.dart';
import 'selfx_kiosk_action_card.dart';
import 'try_on_experience_config.dart';
import 'try_on_generation_presentation.dart';

export 'try_on_generation_presentation.dart'
    show generationInputPreviewImageFitForTesting;

class TryOnGenerationScreen extends StatefulWidget {
  const TryOnGenerationScreen({
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
  State<TryOnGenerationScreen> createState() => _TryOnGenerationScreenState();
}

class _TryOnGenerationScreenState extends State<TryOnGenerationScreen>
    with SingleTickerProviderStateMixin {
  bool _submitted = false;
  bool _navigatedToResult = false;
  late final AnimationController _motionController;

  @override
  void initState() {
    super.initState();
    _motionController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 4200),
    )..repeat();
    widget.tryOnController.addListener(_handleTryOnChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !_submitted) {
        _submitted = true;
        widget.tryOnController.submitFromCapture(widget.captureController);
      }
    });
  }

  @override
  void dispose() {
    _motionController.dispose();
    widget.tryOnController.removeListener(_handleTryOnChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.tryOnController,
      builder: (context, _) {
        final status = widget.tryOnController.status;
        final failed =
            status == KioskTryOnStatus.failed ||
            status == KioskTryOnStatus.timedOut;
        final experience = tryOnExperienceFor(
          widget.tryOnController.activeTryOnVertical,
        );
        if (!failed) {
          final input = widget.tryOnController.garmentInput;
          return Scaffold(
            backgroundColor: SelfxKioskTokens.background,
            body: TryOnGenerationPresentation(
              status: status,
              motion: _motionController,
              onBack: () => Navigator.of(context).maybePop(),
              experience: experience,
              processingMessage: widget.tryOnController.customerMessage,
              personImagePath: _personImagePath(widget.captureController),
              garmentImagePath: _garmentImagePath(input),
              garmentName: input?.displayName,
              garmentPrice:
                  _currentGarmentPick(widget.tryOnController)?.displayPrice ??
                  input?.displayPrice,
            ),
          );
        }
        return _buildFailure(context, experience);
      },
    );
  }

  Widget _buildFailure(BuildContext context, TryOnExperienceConfig experience) {
    final jewelleryPhonePhoto =
        experience.vertical == KioskTryOnVertical.jewellery &&
        widget.captureController.activeAcceptedPersonPhoto?.image.source ==
            CustomerPersonImageSource.mobileUpload;
    final compatibilityFailure =
        widget.tryOnController.failureCode ==
        KioskTryOnFailureCode.modelImageIncompatibleWithGarment;
    final garmentResolutionFailure =
        widget.tryOnController.failureCode ==
        KioskTryOnFailureCode.garmentIntentUnresolved;
    return KioskScaffold(
      title: 'Creating Try-On',
      subtitle: 'Generating securely through SelfX',
      leading: IconButton(
        key: const Key('generation-back'),
        onPressed: () => Navigator.of(context).maybePop(),
        icon: const Icon(Icons.arrow_back),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          return SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 980),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(28),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Icon(
                            Icons.error_outline,
                            size: 78,
                            color: Theme.of(context).colorScheme.error,
                          ),
                          const SizedBox(height: 22),
                          Text(
                            widget.tryOnController.customerTitle ??
                                'Try-On needs attention',
                            style: Theme.of(context).textTheme.displaySmall,
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 14),
                          Text(
                            widget.tryOnController.customerMessage ??
                                'Please try again.',
                            style: Theme.of(context).textTheme.bodyLarge,
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 28),
                          if (garmentResolutionFailure) ...[
                            SelfxKioskActionCard(
                              key: const Key('try-on-retake-garment-photo'),
                              onPressed: () => _chooseAnotherGarment(context),
                              icon: Icons.camera_alt_outlined,
                              iconColor: const Color(0xFF2384D6),
                              label: 'Retake Garment Photo',
                              subtitle: 'Capture item again',
                              minHeight: 76,
                            ),
                            const SizedBox(height: 14),
                            SelfxKioskActionCard(
                              key: const Key('try-on-browse-catalog'),
                              onPressed: () => _browseCatalog(context),
                              icon: Icons.shopping_bag_outlined,
                              iconColor: const Color(0xFFE86610),
                              label: 'Browse Catalog',
                              subtitle: 'Choose item',
                              minHeight: 76,
                            ),
                          ] else if (compatibilityFailure) ...[
                            SelfxKioskActionCard(
                              key: const Key('try-on-update-photo'),
                              onPressed: () => _retakePhoto(context),
                              icon: Icons.photo_camera_outlined,
                              iconColor: const Color(0xFF2384D6),
                              label: 'Update My Photo',
                              subtitle: 'Retake model photo',
                              minHeight: 76,
                            ),
                            if (widget.tryOnController.hasNextGarmentPick) ...[
                              const SizedBox(height: 14),
                              SelfxKioskActionCard(
                                key: const Key('try-on-skip-current-pick'),
                                onPressed: () => _skipCurrentPick(context),
                                icon: Icons.skip_next_outlined,
                                iconColor: const Color(0xFFC88913),
                                label: 'Skip This Item',
                                subtitle: 'Try next pick',
                                minHeight: 76,
                              ),
                            ],
                            const SizedBox(height: 14),
                            SelfxKioskActionCard(
                              key: const Key('try-on-choose-garment'),
                              onPressed: () => _chooseAnotherGarment(context),
                              icon: experience.icon,
                              iconColor: const Color(0xFFE86610),
                              label: experience.tryAnotherLabel,
                              subtitle: 'Choose item',
                              minHeight: 76,
                            ),
                          ] else ...[
                            SelfxKioskActionCard(
                              key: const Key('try-on-retry-polling'),
                              onPressed: widget.tryOnController.run != null
                                  ? widget.tryOnController.retryPolling
                                  : () => widget.tryOnController
                                        .submitFromCapture(
                                          widget.captureController,
                                        ),
                              icon: Icons.refresh,
                              iconColor: const Color(0xFFE86610),
                              label: 'Try Again',
                              subtitle: 'Restart generation',
                              minHeight: 76,
                            ),
                            const SizedBox(height: 14),
                            SelfxKioskActionCard(
                              key: const Key('try-on-retake-photo'),
                              onPressed: () => _retakePhoto(context),
                              icon: Icons.replay,
                              iconColor: const Color(0xFF2384D6),
                              label: jewelleryPhonePhoto
                                  ? 'Upload Another Photo'
                                  : 'Retake Photo',
                              subtitle: jewelleryPhonePhoto
                                  ? 'Use your phone'
                                  : 'Capture again',
                              minHeight: 76,
                            ),
                            const SizedBox(height: 14),
                            SelfxKioskActionCard(
                              key: const Key('try-on-choose-garment'),
                              onPressed: () => _chooseAnotherGarment(context),
                              icon: experience.icon,
                              iconColor: const Color(0xFFE86610),
                              label: experience.tryAnotherLabel,
                              subtitle: 'Choose item',
                              minHeight: 76,
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  void _handleTryOnChanged() {
    final result = widget.tryOnController.result;
    if (result == null || _navigatedToResult || !mounted) {
      return;
    }
    _navigatedToResult = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => TryOnResultScreen(
            captureController: widget.captureController,
            tryOnController: widget.tryOnController,
            uploadController: widget.uploadController,
            catalogGateway: widget.catalogGateway,
            extractionService: widget.extractionService,
          ),
        ),
      );
    });
  }

  Future<void> _retakePhoto(BuildContext context) async {
    final jewelleryPhonePhoto =
        widget.tryOnController.activeTryOnVertical ==
            KioskTryOnVertical.jewellery &&
        widget.captureController.activeAcceptedPersonPhoto?.image.source ==
            CustomerPersonImageSource.mobileUpload;
    await widget.tryOnController.retakePhoto(widget.captureController);
    if (!context.mounted) {
      return;
    }
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => jewelleryPhonePhoto
            ? MobileUploadScreen(
                captureController: widget.captureController,
                tryOnController: widget.tryOnController,
                uploadController: widget.uploadController,
                catalogGateway: widget.catalogGateway,
                extractionService: widget.extractionService,
              )
            : CameraCaptureScreen(
                controller: widget.captureController,
                tryOnController: widget.tryOnController,
                uploadController: widget.uploadController,
                catalogGateway: widget.catalogGateway,
                extractionService: widget.extractionService,
                purpose: PhotoAcquisitionPurpose.model,
              ),
      ),
      (route) => route.isFirst,
    );
  }

  Future<void> _chooseAnotherGarment(BuildContext context) async {
    widget.tryOnController.tryAnotherGarment();
    if (!context.mounted) {
      return;
    }
    final experience = tryOnExperienceFor(
      widget.tryOnController.activeTryOnVertical,
    );
    if (!experience.supportsPhysicalProductCapture) {
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute<void>(
          builder: (_) => BrowseProductsScreen(
            captureController: widget.captureController,
            tryOnController: widget.tryOnController,
            uploadController: widget.uploadController,
            catalogGateway: widget.catalogGateway,
            extractionService: widget.extractionService,
            productVertical: experience.productVertical,
          ),
        ),
        (route) => route.isFirst,
      );
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

  void _skipCurrentPick(BuildContext context) {
    if (!widget.tryOnController.selectNextGarmentPick()) {
      return;
    }
    Navigator.of(context).pushReplacement(
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
  }

  Future<void> _browseCatalog(BuildContext context) async {
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

String? _personImagePath(CaptureSessionController controller) {
  return controller.acceptedPersonPhoto?.capture.originalPath ??
      controller.acceptedCapture?.originalPath ??
      controller.capture?.originalPath;
}

String? _garmentImagePath(KioskGarmentInput? input) {
  if (input == null) {
    return null;
  }
  final previewPath = input.previewPath.trim();
  if (previewPath.isNotEmpty) {
    return previewPath;
  }
  final remote = input.remoteImageUrl?.trim();
  return remote == null || remote.isEmpty ? null : remote;
}

KioskTryOnPick? _currentGarmentPick(KioskTryOnSessionController controller) {
  final activeId = controller.activeGarmentPickId;
  if (activeId == null) {
    return null;
  }
  for (final pick in controller.garmentPicks) {
    if (pick.id == activeId) {
      return pick;
    }
  }
  return null;
}
