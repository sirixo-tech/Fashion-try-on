import 'dart:async';
import 'dart:io';
import '../shopping/kiosk_purchase_screen.dart';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../acquisition/photo_acquisition.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../catalog/kiosk_catalog_models.dart';
import '../session/capture_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_models.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'browse_products_screen.dart';
import 'camera_capture_screen.dart';
import 'mobile_upload_screen.dart';
import 'capture_review_screen.dart';
import 'generated_try_on_image.dart';
import 'garment_result_catalog.dart';
import 'jewellery_result_preview.dart';
import 'my_looks_screen.dart';
import 'responsive_kiosk_layout.dart';
import 'selfx_kiosk_action_card.dart';
import 'selfx_logo.dart';
import 'selfx_kiosk_button.dart';
import 'try_on_experience_config.dart';
import 'try_on_generation_screen.dart';

class TryOnResultScreen extends StatefulWidget {
  const TryOnResultScreen({
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
  State<TryOnResultScreen> createState() => _TryOnResultScreenState();
}

class _TryOnResultScreenState extends State<TryOnResultScreen> {
  CaptureSessionController get captureController => widget.captureController;
  KioskTryOnSessionController get tryOnController => widget.tryOnController;
  KioskCustomerUploadController get uploadController => widget.uploadController;
  KioskCatalogGateway get catalogGateway => widget.catalogGateway;
  GarmentExtractionService get extractionService => widget.extractionService;

  late int _revision;
  KioskTryOnResult? _preview;
  KioskTryOnVertical _previewVertical = KioskTryOnVertical.garment;
  KioskJewelleryType? _previewJewelleryType;
  bool _rebuildScheduled = false;
  String? get _purchaseProductId {
    for (final look in tryOnController.looks) {
      if (look.runId == _preview?.run.id) return look.productId;
    }
    return tryOnController.run?.id == _preview?.run.id
        ? tryOnController.garmentInput?.productId
        : null;
  }

  bool get _singleLook => tryOnController.looks.length == 1;
  bool get _purchaseAllowed {
    for (final look in tryOnController.looks) {
      if (look.runId == _preview?.run.id) return look.nativePurchasingAllowed;
    }
    return tryOnController.garmentInput?.nativePurchasingAllowed ?? false;
  }

  bool get _current =>
      mounted &&
      tryOnController.isCustomerSessionCurrent(_revision, requireActive: false);
  bool get _canAct => _current && ModalRoute.of(context)?.isCurrent == true;

  @override
  void initState() {
    super.initState();
    _revision = tryOnController.customerSessionRevision;
    _syncPreview();
    tryOnController.addListener(_onSessionChanged);
    unawaited(tryOnController.refreshLooks());
  }

  @override
  void didUpdateWidget(covariant TryOnResultScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.tryOnController != tryOnController) {
      oldWidget.tryOnController.removeListener(_onSessionChanged);
      _revision = tryOnController.customerSessionRevision;
      _preview = null;
      _syncPreview();
      tryOnController.addListener(_onSessionChanged);
      unawaited(tryOnController.refreshLooks());
    }
  }

  @override
  void dispose() {
    tryOnController.removeListener(_onSessionChanged);
    _preview = null;
    super.dispose();
  }

  void _syncPreview() {
    if (!_current) {
      _preview = null;
      return;
    }
    final result = tryOnController.result;
    if (result != null) {
      _preview = result;
      _previewVertical = tryOnController.activeTryOnVertical;
      _previewJewelleryType = tryOnController.garmentInput?.jewelleryType;
    }
  }

  void _onSessionChanged() {
    if (!mounted) return;
    _syncPreview();
    // Opening My Looks can notify listeners while its route is being built.
    if (SchedulerBinding.instance.schedulerPhase ==
        SchedulerPhase.persistentCallbacks) {
      if (_rebuildScheduled) return;
      _rebuildScheduled = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _rebuildScheduled = false;
        if (mounted) setState(_syncPreview);
      });
    } else {
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = _preview;
    final revision = _revision;
    return Scaffold(
      backgroundColor: _ResultTokens.background,
      body: SafeArea(
        child: result == null
            ? Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Try-On result unavailable.'),
                    TextButton.icon(
                      onPressed: () => Navigator.of(context).maybePop(),
                      icon: const Icon(Icons.arrow_back),
                      label: const Text('Back'),
                    ),
                    TextButton.icon(
                      onPressed: () => Navigator.of(
                        context,
                      ).popUntil((route) => route.isFirst),
                      icon: const Icon(Icons.home_outlined),
                      label: const Text('Back to Home'),
                    ),
                  ],
                ),
              )
            : _previewVertical == KioskTryOnVertical.garment
            ? CustomPaint(
                painter: const _ResultBackdrop(),
                child: GarmentResultCatalog(
                  sessionIdentity: (revision, result),
                  catalog: catalogGateway,
                  image: _ResultImageCard(
                    imageSrc: result.generatedImage,
                    isJewellery: false,
                    jewelleryType: null,
                  ),
                  isCurrent: () => _current,
                  downloadEnabled: tryOnController.saveMyLooksQrEnabled,
                  singleLook: _singleLook,
                  onBuy: _purchaseAllowed
                      ? () => unawaited(
                          openKioskPurchase(
                            context,
                            tryOnController,
                            _purchaseProductId,
                          ),
                        )
                      : null,
                  nextPick: tryOnController.upcomingGarmentPick,
                  onContinueNextPick: () async => _tryAnotherGarment(context),
                  onContinue: (product) =>
                      _continueCatalogGarment(context, product),
                  onShowAll: () async {
                    if (!_canAct) return;
                    await Navigator.of(context).push<void>(
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
                  },
                  onBack: () => Navigator.of(context).maybePop(),
                  onRetake: () => _retakePhoto(context),
                  onGetMyLooks: () => _singleLook
                      ? _downloadMyLooks(context)
                      : _getMyLooks(context),
                  onFinish: () => _finish(context),
                ),
              )
            : _ResultPage(
                imageSrc: result.generatedImage,
                hasNextPick: tryOnController.hasNextGarmentPick,
                upcomingPick: tryOnController.upcomingGarmentPick,
                upcomingPickPosition:
                    tryOnController.upcomingGarmentPickPosition,
                totalPickCount: tryOnController.garmentPicks.length,
                saveMyLooksQrEnabled: tryOnController.saveMyLooksQrEnabled,
                singleLook: _singleLook,
                activeTryOnVertical: _previewVertical,
                jewelleryType: _previewJewelleryType,
                retakeFromPhone:
                    captureController.activeAcceptedPersonPhoto?.image.source ==
                    CustomerPersonImageSource.mobileUpload,
                onTryAnotherGarment: () => _tryAnotherGarment(context),
                onRetakePhoto: () => _retakePhoto(context),
                onBuy: _purchaseAllowed
                    ? () => unawaited(
                        openKioskPurchase(
                          context,
                          tryOnController,
                          _purchaseProductId,
                        ),
                      )
                    : null,
                onGetMyLooks: () => _singleLook
                    ? unawaited(_downloadMyLooks(context))
                    : unawaited(_getMyLooks(context)),
                onFinish: () => _finish(context),
                onBack: () => Navigator.of(context).maybePop(),
              ),
      ),
    );
  }

  Future<void> _continueCatalogGarment(
    BuildContext context,
    KioskCatalogProduct product,
  ) async {
    if (!_canAct) return;
    // Selection commits only here; generation reuses the original accepted photo.
    tryOnController.selectGarment(product.toGarmentInput());
    if (captureController.activeAcceptedPersonPhoto == null) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (_) => CameraCaptureScreen(
            controller: captureController,
            tryOnController: tryOnController,
            uploadController: uploadController,
            catalogGateway: catalogGateway,
            extractionService: extractionService,
            purpose: PhotoAcquisitionPurpose.model,
          ),
        ),
      );
      return;
    }
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => TryOnGenerationScreen(
          captureController: captureController,
          tryOnController: tryOnController,
          uploadController: uploadController,
          catalogGateway: catalogGateway,
          extractionService: extractionService,
        ),
      ),
    );
  }

  void _tryAnotherGarment(BuildContext context) {
    if (!_canAct) return;
    if (tryOnController.selectNextGarmentPick()) {
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => TryOnGenerationScreen(
            captureController: captureController,
            tryOnController: tryOnController,
            uploadController: uploadController,
            catalogGateway: catalogGateway,
            extractionService: extractionService,
          ),
        ),
      );
      return;
    }
    tryOnController.tryAnotherGarment();
    final experience = tryOnExperienceFor(tryOnController.activeTryOnVertical);
    if (!experience.supportsPhysicalProductCapture) {
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => BrowseProductsScreen(
            captureController: captureController,
            tryOnController: tryOnController,
            uploadController: uploadController,
            catalogGateway: catalogGateway,
            extractionService: extractionService,
            productVertical: experience.productVertical,
          ),
        ),
      );
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CaptureReviewScreen(
          controller: captureController,
          tryOnController: tryOnController,
          uploadController: uploadController,
          catalogGateway: catalogGateway,
          extractionService: extractionService,
        ),
      ),
    );
  }

  Future<void> _retakePhoto(BuildContext context) async {
    if (!_canAct) return;
    final jewelleryPhonePhoto =
        tryOnController.activeTryOnVertical == KioskTryOnVertical.jewellery &&
        captureController.activeAcceptedPersonPhoto?.image.source ==
            CustomerPersonImageSource.mobileUpload;
    await tryOnController.retakePhoto(captureController);
    if (!context.mounted || !_canAct) {
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => jewelleryPhonePhoto
            ? MobileUploadScreen(
                captureController: captureController,
                tryOnController: tryOnController,
                uploadController: uploadController,
                catalogGateway: catalogGateway,
                extractionService: extractionService,
              )
            : CameraCaptureScreen(
                controller: captureController,
                tryOnController: tryOnController,
                uploadController: uploadController,
                catalogGateway: catalogGateway,
                extractionService: extractionService,
                purpose: PhotoAcquisitionPurpose.model,
              ),
      ),
    );
  }

  Future<void> _getMyLooks(BuildContext context) async {
    if (!_canAct) return;
    await showMyLooksBottomSheet(
      context: context,
      captureController: captureController,
      tryOnController: tryOnController,
      uploadController: uploadController,
      catalogGateway: catalogGateway,
      extractionService: extractionService,
      previewImage: _preview?.generatedImage,
    );
  }

  Future<void> _downloadMyLooks(BuildContext context) async {
    if (!_canAct) return;
    await showMyLooksDownloadDialog(
      context: context,
      captureController: captureController,
      tryOnController: tryOnController,
    );
  }

  Future<void> _finish(BuildContext context) async {
    if (!_canAct) return;
    final revision = _revision;
    await tryOnController.finish(captureController);
    if (context.mounted &&
        !tryOnController.customerSessionActive &&
        tryOnController.customerSessionRevision == revision + 1) {
      Navigator.of(context).popUntil((route) => route.isFirst);
    }
  }
}

class _ResultPage extends StatelessWidget {
  const _ResultPage({
    required this.imageSrc,
    required this.hasNextPick,
    required this.upcomingPick,
    required this.upcomingPickPosition,
    required this.totalPickCount,
    required this.saveMyLooksQrEnabled,
    required this.singleLook,
    required this.activeTryOnVertical,
    required this.jewelleryType,
    this.retakeFromPhone = false,
    required this.onTryAnotherGarment,
    required this.onRetakePhoto,
    this.onBuy,
    required this.onGetMyLooks,
    required this.onFinish,
    required this.onBack,
  });

  final String imageSrc;
  final bool hasNextPick;
  final KioskTryOnPick? upcomingPick;
  final int? upcomingPickPosition;
  final int totalPickCount;
  final bool saveMyLooksQrEnabled;
  final bool singleLook;
  final KioskTryOnVertical activeTryOnVertical;
  final KioskJewelleryType? jewelleryType;
  final bool retakeFromPhone;
  final VoidCallback onTryAnotherGarment;
  final VoidCallback onRetakePhoto;
  final VoidCallback? onBuy;
  final VoidCallback onGetMyLooks;
  final VoidCallback onFinish;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final viewportHeight = constraints.maxHeight.isFinite
            ? constraints.maxHeight
            : 1200.0;
        final viewportWidth = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : 760.0;
        final layout = KioskLayoutMetrics.fromConstraints(constraints);
        final compact = layout.isSmall || viewportWidth < 560;
        final stackActions = viewportWidth < 440;
        final horizontalPadding = layout.scaled(
          30,
          small: 18,
          large: 42,
          extraLarge: 56,
        );
        final verticalPadding = layout.scaled(
          30,
          small: 20,
          large: 38,
          extraLarge: 48,
        );
        final maxContentWidth = (layout.portrait ? viewportWidth : 1040.0)
            .clamp(
              compact ? 520.0 : 760.0,
              layout.isExtraLarge ? 1180.0 : 960.0,
            )
            .toDouble();
        final headerGap = layout.scaled(22, small: 16, large: 26);
        final headerHeight = layout.scaled(
          156,
          small: 128,
          large: 180,
          extraLarge: 204,
        );
        final actionGap = layout.scaled(20, small: 14, large: 24);
        final actionTileHeight = layout.scaled(
          120,
          small: 100,
          large: 132,
          extraLarge: 144,
        );
        final minimumImageHeight = layout.scaled(
          360,
          small: 280,
          large: 620,
          extraLarge: 820,
        );
        final actionRows = stackActions ? 4 : 2;
        final actionHeight =
            (actionRows * actionTileHeight) + ((actionRows - 1) * actionGap);
        final hasUpcomingPick = upcomingPick != null;
        final experience = tryOnExperienceFor(activeTryOnVertical);
        final resultImage = _ResultImageCard(
          imageSrc: imageSrc,
          isJewellery: activeTryOnVertical == KioskTryOnVertical.jewellery,
          jewelleryType: jewelleryType,
        );
        final upcomingPreviewHeight = hasUpcomingPick
            ? layout.scaled(82, small: 74, large: 92, extraLarge: 104) +
                  actionGap
            : 0.0;
        final minimumContentHeight =
            verticalPadding * 2 +
            headerHeight +
            headerGap +
            minimumImageHeight +
            actionGap +
            upcomingPreviewHeight +
            actionHeight;
        final scroll = viewportHeight < minimumContentHeight;

        return CustomPaint(
          painter: const _ResultBackdrop(),
          child: SingleChildScrollView(
            physics: scroll ? null : const NeverScrollableScrollPhysics(),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: viewportHeight),
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  horizontalPadding,
                  verticalPadding,
                  horizontalPadding,
                  verticalPadding,
                ),
                child: Center(
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: maxContentWidth),
                    child: SizedBox(
                      height: scroll
                          ? null
                          : viewportHeight - verticalPadding * 2,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          SizedBox(
                            height: headerHeight,
                            key: const Key('result-header'),
                            child: _ResultHeader(
                              layout: layout,
                              onBack: onBack,
                            ),
                          ),
                          SizedBox(height: headerGap),
                          if (scroll)
                            SizedBox(
                              height: minimumImageHeight,
                              child: resultImage,
                            )
                          else
                            Expanded(child: resultImage),
                          SizedBox(height: actionGap),
                          if (hasUpcomingPick) ...[
                            _UpcomingPickPreview(
                              pick: upcomingPick!,
                              position: upcomingPickPosition,
                              totalCount: totalPickCount,
                              compact: compact,
                            ),
                            SizedBox(height: actionGap),
                          ],
                          Theme(
                            data: Theme.of(context).copyWith(
                              textTheme: Theme.of(context).textTheme.copyWith(
                                titleMedium: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(fontSize: compact ? 16 : 20),
                                bodyMedium: Theme.of(context)
                                    .textTheme
                                    .bodyMedium
                                    ?.copyWith(fontSize: compact ? 14 : 16),
                              ),
                            ),
                            child: _ActionGrid(
                              stackActions: stackActions,
                              compact: compact,
                              gap: actionGap,
                              topLeft: SelfxKioskActionCard(
                                key: const Key('try-another-garment'),
                                icon: experience.icon,
                                iconColor: SelfxKioskTokens.primary,
                                iconBackgroundColor: Colors.white,
                                iconForegroundColor: SelfxKioskTokens.primary,
                                backgroundColor: SelfxKioskTokens.primary,
                                borderColor: SelfxKioskTokens.primary,
                                titleColor: Colors.white,
                                subtitleColor: Colors.white,
                                trailing: const Icon(
                                  Icons.chevron_right,
                                  color: Colors.white,
                                ),
                                maxLabelLines: 2,
                                maxSubtitleLines: 2,
                                label: hasNextPick
                                    ? 'Try Next Pick'
                                    : activeTryOnVertical ==
                                          KioskTryOnVertical.jewellery
                                    ? 'Browse Jewellery'
                                    : 'Browse Garments',
                                subtitle: hasNextPick
                                    ? 'Next pick'
                                    : 'Explore our collection',
                                disabledBackgroundColor:
                                    _ResultTokens.primarySurface,
                                minHeight: actionTileHeight,
                                onPressed: onTryAnotherGarment,
                              ),
                              topRight: singleLook
                                  ? SelfxKioskButton(
                                      key: const Key('get-my-looks'),
                                      label: 'Download My Looks',
                                      icon: Icons.download_outlined,
                                      backgroundColor: SelfxKioskTokens.primary,
                                      foregroundColor: Colors.white,
                                      minHeight: actionTileHeight,
                                      onPressed: saveMyLooksQrEnabled
                                          ? onGetMyLooks
                                          : null,
                                    )
                                  : SelfxKioskActionCard(
                                      key: const Key('get-my-looks'),
                                      icon: Icons.checkroom_outlined,
                                      iconColor: _ResultTokens.orangeDeep,
                                      trailing: const Icon(
                                        Icons.chevron_right,
                                        color: _ResultTokens.orangeDeep,
                                      ),
                                      maxLabelLines: 2,
                                      maxSubtitleLines: 2,
                                      label: singleLook
                                          ? 'Download My Looks'
                                          : 'Get My Looks',
                                      subtitle: saveMyLooksQrEnabled
                                          ? 'Download your styles'
                                          : 'QR disabled',
                                      disabledBackgroundColor:
                                          _ResultTokens.looksSurface,
                                      minHeight: actionTileHeight,
                                      onPressed: saveMyLooksQrEnabled
                                          ? onGetMyLooks
                                          : null,
                                    ),
                              bottomLeft: SelfxKioskActionCard(
                                key: const Key('result-retake-photo'),
                                icon: retakeFromPhone
                                    ? Icons.file_upload_outlined
                                    : Icons.camera_alt_outlined,
                                iconColor: _ResultTokens.blue,
                                trailing: const Icon(
                                  Icons.chevron_right,
                                  color: _ResultTokens.blue,
                                ),
                                maxLabelLines: 2,
                                maxSubtitleLines: 2,
                                label: retakeFromPhone
                                    ? 'Upload Another Photo'
                                    : 'Retake Photo',
                                subtitle: retakeFromPhone
                                    ? 'Use your phone'
                                    : 'Capture a new photo',
                                disabledBackgroundColor:
                                    _ResultTokens.retakeSurface,
                                minHeight: actionTileHeight,
                                onPressed: onRetakePhoto,
                              ),
                              bottomRight: singleLook && onBuy != null
                                  ? SelfxKioskButton(
                                      key: const Key('buy-this-look'),
                                      label: 'Buy This Look',
                                      icon: Icons.shopping_bag_outlined,
                                      variant: SelfxKioskButtonVariant.ghost,
                                      minHeight: actionTileHeight,
                                      onPressed: onBuy,
                                    )
                                  : SelfxKioskActionCard(
                                      key: const Key('finish-try-on'),
                                      icon: Icons.home_outlined,
                                      iconColor: _ResultTokens.green,
                                      trailing: const Icon(
                                        Icons.chevron_right,
                                        color: _ResultTokens.green,
                                      ),
                                      maxLabelLines: 2,
                                      maxSubtitleLines: 2,
                                      label: 'Back to Home',
                                      subtitle: 'Start over',
                                      disabledBackgroundColor:
                                          _ResultTokens.finishSurface,
                                      minHeight: actionTileHeight,
                                      onPressed: onFinish,
                                    ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _ResultHeader extends StatelessWidget {
  const _ResultHeader({required this.layout, required this.onBack});
  final KioskLayoutMetrics layout;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final titleSize = layout.scaled(42, small: 32, large: 50, extraLarge: 58);
    return Column(
      children: [
        Expanded(
          flex: 3,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 80),
                child: SelfxLogo(
                  height: layout.scaled(70, small: 54, large: 84),
                  maxWidth: 310,
                ),
              ),
              Align(
                alignment: Alignment.topLeft,
                child: TextButton.icon(
                  key: const Key('result-back'),
                  onPressed: onBack,
                  icon: const Icon(Icons.arrow_back),
                  label: const Text('Back'),
                  style: TextButton.styleFrom(
                    backgroundColor: const Color(0xFFECECEC),
                    foregroundColor: _ResultTokens.ink,
                    minimumSize: const Size(76, 44),
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          flex: 2,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Text(
                'Your Look',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.displaySmall?.copyWith(
                  color: _ResultTokens.ink,
                  fontSize: titleSize,
                  fontWeight: FontWeight.w900,
                  height: 1,
                ),
              ),
              Positioned(
                top: 0,
                right: layout.isSmall ? 4 : 20,
                child: Icon(
                  Icons.auto_awesome,
                  color: _ResultTokens.orangeDeep,
                  size: layout.isSmall ? 22 : 34,
                ),
              ),
            ],
          ),
        ),
        Container(
          width: 62,
          height: 5,
          margin: const EdgeInsets.only(top: 8),
          decoration: BoxDecoration(
            color: SelfxKioskTokens.primary,
            borderRadius: BorderRadius.circular(999),
          ),
        ),
      ],
    );
  }
}

class _ResultImageCard extends StatelessWidget {
  const _ResultImageCard({
    required this.imageSrc,
    required this.isJewellery,
    required this.jewelleryType,
  });

  final String imageSrc;
  final bool isJewellery;
  final KioskJewelleryType? jewelleryType;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      key: const Key('result-image-card'),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(28),
        boxShadow: const [
          BoxShadow(
            color: Color(0x240F172A),
            blurRadius: 34,
            offset: Offset(0, 14),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: SizedBox.expand(
          child: isJewellery
              ? JewelleryResultPreview(
                  src: imageSrc,
                  jewelleryType: jewelleryType,
                  fit: BoxFit.cover,
                )
              : GeneratedTryOnImage(src: imageSrc, fit: BoxFit.cover),
        ),
      ),
    );
  }
}

class _UpcomingPickPreview extends StatelessWidget {
  const _UpcomingPickPreview({
    required this.pick,
    required this.position,
    required this.totalCount,
    required this.compact,
  });

  final KioskTryOnPick pick;
  final int? position;
  final int totalCount;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final indexLabel = position == null || totalCount <= 0
        ? null
        : '$position of $totalCount';
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        border: Border.all(color: _ResultTokens.tileBorder),
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [
          BoxShadow(
            color: Color(0x120F172A),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: EdgeInsets.all(compact ? 10 : 12),
        child: Row(
          children: [
            _UpcomingPickThumbnail(pick: pick, size: compact ? 54 : 62),
            SizedBox(width: compact ? 10 : 12),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.next_plan_outlined,
                        size: 15,
                        color: _ResultTokens.orangeDeep,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Up next',
                        style: TextStyle(
                          color: _ResultTokens.orangeDeep,
                          fontFamily: 'Inter',
                          fontSize: compact ? 12 : 13,
                          fontWeight: FontWeight.w900,
                          height: 1,
                        ),
                      ),
                      if (indexLabel != null) ...[
                        const SizedBox(width: 8),
                        Text(
                          indexLabel,
                          style: TextStyle(
                            color: _ResultTokens.muted,
                            fontFamily: 'Inter',
                            fontSize: compact ? 11 : 12,
                            fontWeight: FontWeight.w700,
                            height: 1,
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 7),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          pick.displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: _ResultTokens.ink,
                            fontFamily: 'Manrope',
                            fontSize: compact ? 16 : 18,
                            fontWeight: FontWeight.w900,
                            height: 1.05,
                          ),
                        ),
                      ),
                      if (pick.displayPrice != null) ...[
                        const SizedBox(width: 10),
                        Text(
                          pick.displayPrice!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: _ResultTokens.orangeDeep,
                            fontFamily: 'Inter',
                            fontSize: compact ? 13 : 14,
                            fontWeight: FontWeight.w900,
                            height: 1.05,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _UpcomingPickThumbnail extends StatelessWidget {
  const _UpcomingPickThumbnail({required this.pick, required this.size});

  final KioskTryOnPick pick;
  final double size;

  @override
  Widget build(BuildContext context) {
    final localPath = pick.localImagePath;
    final imageUrl = pick.imageUrl;
    Widget child;
    if (localPath != null && localPath.isNotEmpty) {
      child = Image.file(
        File(localPath),
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => const _UpcomingPickThumbnailFallback(),
      );
    } else if (imageUrl != null && imageUrl.isNotEmpty) {
      child = Image.network(
        imageUrl,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => const _UpcomingPickThumbnailFallback(),
      );
    } else {
      child = const _UpcomingPickThumbnailFallback();
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox.square(
        dimension: size,
        child: ColoredBox(color: _ResultTokens.finishSurface, child: child),
      ),
    );
  }
}

class _UpcomingPickThumbnailFallback extends StatelessWidget {
  const _UpcomingPickThumbnailFallback();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Icon(
        Icons.checkroom_outlined,
        color: _ResultTokens.orangeDeep,
        size: 28,
      ),
    );
  }
}

class _ActionGrid extends StatelessWidget {
  const _ActionGrid({
    required this.stackActions,
    required this.compact,
    required this.gap,
    required this.topLeft,
    required this.topRight,
    required this.bottomLeft,
    required this.bottomRight,
  });

  final bool stackActions;
  final bool compact;
  final double gap;
  final Widget topLeft;
  final Widget topRight;
  final Widget bottomLeft;
  final Widget bottomRight;

  @override
  Widget build(BuildContext context) {
    if (stackActions) {
      return Column(
        children: [
          topLeft,
          SizedBox(height: gap),
          topRight,
          SizedBox(height: gap),
          bottomLeft,
          SizedBox(height: gap),
          bottomRight,
        ],
      );
    }

    return Column(
      children: [
        Row(
          children: [
            Expanded(child: topLeft),
            SizedBox(width: gap),
            Expanded(child: topRight),
          ],
        ),
        SizedBox(height: gap),
        Row(
          children: [
            Expanded(child: bottomLeft),
            SizedBox(width: gap),
            Expanded(child: bottomRight),
          ],
        ),
      ],
    );
  }
}

class _ResultTokens {
  const _ResultTokens._();

  static const background = Color(0xFFFFFCF8);
  static const ink = Color(0xFF141A21);
  static const muted = Color(0xFF5D6169);
  static const orangeDeep = Color(0xFFE86610);
  static const blue = Color(0xFF2384D6);
  static const green = Color(0xFF2FAE75);
  static const primarySurface = Color(0xFFFFE7DA);
  static const retakeSurface = Color(0xFFFFEEE6);
  static const looksSurface = Color(0xFFFFF1D9);
  static const finishSurface = Color(0xFFFFF7F0);
  static const tileBorder = Color(0xFFF4DED0);
}

class _ResultBackdrop extends CustomPainter {
  const _ResultBackdrop();

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawColor(_ResultTokens.background, BlendMode.src);
    final peach = Paint()..color = const Color(0xFFFFEAD7);
    canvas.drawOval(
      Rect.fromLTWH(
        -size.width * .35,
        size.height * .05,
        size.width * .55,
        size.height * .55,
      ),
      peach,
    );
    canvas.drawOval(
      Rect.fromLTWH(
        size.width * .78,
        -size.height * .20,
        size.width * .5,
        size.height * .3,
      ),
      Paint()..color = const Color(0xFFFFD2A0),
    );
    final wave = Path()
      ..moveTo(size.width, size.height * .65)
      ..quadraticBezierTo(
        size.width * .75,
        size.height * .50,
        size.width,
        size.height * .45,
      )
      ..close();
    canvas.drawPath(wave, Paint()..color = const Color(0xFFFFB263));
  }

  @override
  bool shouldRepaint(covariant _ResultBackdrop oldDelegate) => false;
}
