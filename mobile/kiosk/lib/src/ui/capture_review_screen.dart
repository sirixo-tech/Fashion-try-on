import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../acquisition/photo_acquisition.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../session/capture_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'browse_products_screen.dart';
import 'camera_capture_screen.dart';
import 'kiosk_attention_animations.dart';
import 'mobile_upload_screen.dart';
import 'selfx_kiosk_action_card.dart';
import 'selfx_kiosk_button.dart';

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
      backgroundColor: Colors.black,
      body: AnimatedBuilder(
        animation: controller,
        builder: (context, _) {
          final acceptedPersonPhoto = controller.activeAcceptedPersonPhoto;
          final capture = controller.capture ?? acceptedPersonPhoto?.capture;
          if (capture == null) {
            return const Center(
              child: Text(
                'No capture available.',
                style: TextStyle(color: Colors.white),
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
          return LayoutBuilder(
            builder: (context, constraints) {
              final narrow = constraints.maxWidth < 560;
              final horizontalPadding = narrow ? 20.0 : 36.0;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        ColoredBox(
                          color: Colors.black,
                          child: Image.file(
                            File(capture.originalPath),
                            fit: BoxFit.cover,
                            alignment: Alignment.center,
                            errorBuilder: (_, _, _) {
                              return const Center(
                                child: Text(
                                  'Captured image unavailable',
                                  style: TextStyle(color: Colors.white),
                                ),
                              );
                            },
                          ),
                        ),
                        SafeArea(
                          bottom: false,
                          child: Align(
                            alignment: Alignment.topLeft,
                            child: Padding(
                              padding: EdgeInsets.only(
                                left: horizontalPadding,
                                top: 12,
                              ),
                              child: IconButton.filled(
                                onPressed: () async {
                                  await controller.retake();
                                  if (context.mounted) {
                                    Navigator.of(context).pop();
                                  }
                                },
                                icon: const Icon(Icons.arrow_back),
                                color: SelfxKioskTokens.textPrimary,
                                style: IconButton.styleFrom(
                                  backgroundColor: Colors.white.withValues(
                                    alpha: 0.92,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  ColoredBox(
                    color: Colors.black,
                    child: SafeArea(
                      top: false,
                      child: Padding(
                        padding: EdgeInsets.fromLTRB(
                          horizontalPadding,
                          narrow ? 16 : 22,
                          horizontalPadding,
                          narrow ? 18 : 30,
                        ),
                        child: Align(
                          alignment: Alignment.topCenter,
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 680),
                            child: _ReviewActions(
                              controller: controller,
                              tryOnController: tryOnController,
                              uploadController: uploadController,
                              catalogGateway: catalogGateway,
                              extractionService: extractionService,
                              usability: usability,
                              usingAcceptedPersonPhoto:
                                  usingAcceptedPersonPhoto,
                            ),
                          ),
                        ),
                      ),
                    ),
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
  });

  final CaptureSessionController controller;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final GarmentExtractionService extractionService;
  final ImageUsabilityResult? usability;
  final bool usingAcceptedPersonPhoto;

  @override
  Widget build(BuildContext context) {
    final isChecking = controller.isAnalyzingQuality || usability == null;
    final isUsable = usability?.isUsable == true;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ImageUsabilityStatement(
          isLoading: controller.isAnalyzingQuality,
          result: usability,
        ),
        const SizedBox(height: 18),
        if (isChecking) ...[
          SelfxKioskActionCard(
            key: const Key('retake-photo'),
            onPressed: null,
            icon: Icons.replay,
            iconColor: const Color(0xFF2384D6),
            label: 'Retake',
            subtitle: 'Checking photo',
            minHeight: 64,
          ),
          const SizedBox(height: 16),
          SelfxKioskButton(
            key: const Key('take-garment-photo'),
            onPressed: null,
            icon: Icons.camera_alt_outlined,
            label: 'Take Garment Photo',
            variant: SelfxKioskButtonVariant.primary,
            textAlign: TextAlign.center,
            mainAxisAlignment: MainAxisAlignment.center,
          ),
        ] else if (isUsable) ...[
          Text(
            'Now, show the garment to the camera.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              shadows: const [
                Shadow(
                  color: Color(0x99000000),
                  blurRadius: 8,
                  offset: Offset(0, 2),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Align(
            alignment: Alignment.center,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SelfxActionPulse(
                    child: SelfxKioskButton(
                      key: const Key('take-garment-photo'),
                      onPressed: () => unawaited(_openGarmentCamera(context)),
                      icon: Icons.camera_alt_outlined,
                      label: 'Take Garment Photo',
                      variant: SelfxKioskButtonVariant.primary,
                      textAlign: TextAlign.center,
                      mainAxisAlignment: MainAxisAlignment.center,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: SelfxKioskActionCard(
                          key: const Key('browse-catalog'),
                          onPressed: () => unawaited(_openCatalog(context)),
                          icon: Icons.checkroom_outlined,
                          iconColor: const Color(0xFFE86610),
                          label: 'Browse Catalog',
                          subtitle: 'Choose item',
                          minHeight: 70,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: SelfxKioskActionCard(
                          key: const Key('retake-photo'),
                          onPressed: () => _retake(context),
                          icon: Icons.replay,
                          iconColor: const Color(0xFF2384D6),
                          label: 'Retake Photo',
                          subtitle: 'Capture again',
                          minHeight: 70,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ] else ...[
          SelfxKioskActionCard(
            key: const Key('retake-photo'),
            onPressed: () => _retake(context),
            icon: Icons.replay,
            iconColor: const Color(0xFF2384D6),
            label: 'Retake Photo',
            subtitle: 'Capture again',
            minHeight: 64,
          ),
          const SizedBox(height: 16),
          SelfxKioskButton(
            key: const Key('upload-model-photo'),
            onPressed: () => unawaited(_uploadModelPhoto(context)),
            icon: Icons.file_upload_outlined,
            label: 'Upload Photo',
            variant: SelfxKioskButtonVariant.primary,
            textAlign: TextAlign.center,
            mainAxisAlignment: MainAxisAlignment.center,
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
    const successColor = Color(0xFF01A101);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: isSuccess
            ? successColor.withValues(alpha: 0.96)
            : Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isSuccess
              ? Colors.white.withValues(alpha: 0.26)
              : Colors.white.withValues(alpha: 0.44),
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
                icon: result.isUsable
                    ? Icons.check_rounded
                    : Icons.error_outline,
                animateIcon: result.isUsable,
                backgroundColor: result.isUsable
                    ? Colors.white
                    : const Color(0xFFC53030),
                iconColor: result.isUsable ? successColor : Colors.white,
                textColor: result.isUsable
                    ? Colors.white
                    : SelfxKioskTokens.textPrimary,
                text: result.isUsable
                    ? _successMessage?.text ?? result.message
                    : result.message,
              ),
          ],
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
  });

  final IconData icon;
  final bool animateIcon;
  final Color backgroundColor;
  final Color iconColor;
  final Color textColor;
  final String text;

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
            child: Text(
              text,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: textColor,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
