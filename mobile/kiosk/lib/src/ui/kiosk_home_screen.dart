import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

import '../config/kiosk_runtime_configuration_controller.dart';
import '../idle/kiosk_idle_presentation.dart';
import '../operator/operator_access.dart';
import '../acquisition/photo_acquisition.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../session/capture_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'browse_products_screen.dart';
import 'camera_capture_screen.dart';
import 'camera_settings_screen.dart';
import 'mobile_upload_screen.dart';
import 'responsive_kiosk_layout.dart';
import 'selfx_kiosk_button.dart';
import 'selfx_logo.dart';
import 'try_on_experience_config.dart';

class KioskHomeScreen extends StatefulWidget {
  const KioskHomeScreen({
    super.key,
    required this.controller,
    required this.tryOnController,
    required this.uploadController,
    required this.operatorAccessController,
    this.catalogGateway = const UnavailableKioskCatalogGateway(),
    this.extractionService = const UnavailableGarmentExtractionService(),
    this.configurationController,
    this.presentation = defaultIdlePresentation,
  });

  final CaptureSessionController controller;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final GarmentExtractionService extractionService;
  final OperatorAccessController operatorAccessController;
  final KioskRuntimeConfigurationController? configurationController;
  final KioskIdlePresentation presentation;

  @override
  State<KioskHomeScreen> createState() => _KioskHomeScreenState();
}

class _KioskHomeScreenState extends State<KioskHomeScreen> {
  bool _operatorHintVisible = false;
  bool _startingTryOn = false;
  bool _startingMobileUpload = false;
  int _slideIndex = 0;
  Timer? _operatorRevealTimer;
  Timer? _slideshowTimer;

  OperatorAccessConfig get _operatorConfig =>
      widget.operatorAccessController.config;

  @override
  void initState() {
    super.initState();
    widget.configurationController?.addListener(_configurationChanged);
    _startSlideshowIfNeeded();
  }

  @override
  void didUpdateWidget(covariant KioskHomeScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.configurationController != widget.configurationController) {
      oldWidget.configurationController?.removeListener(_configurationChanged);
      widget.configurationController?.addListener(_configurationChanged);
    }
    if (oldWidget.presentation != widget.presentation ||
        oldWidget.configurationController != widget.configurationController) {
      _slideIndex = 0;
      _startSlideshowIfNeeded();
    }
  }

  @override
  void dispose() {
    _operatorRevealTimer?.cancel();
    _slideshowTimer?.cancel();
    widget.configurationController?.removeListener(_configurationChanged);
    super.dispose();
  }

  KioskIdlePresentation get _presentation =>
      widget.configurationController?.configuration.toIdlePresentation() ??
      widget.presentation;

  bool get _garmentTryOnEnabled {
    final configuration = widget.configurationController?.configuration;
    if (configuration == null) {
      return true;
    }
    return configuration.garmentTryOnEnabled ||
        !configuration.jewelleryTryOnEnabled;
  }

  bool get _jewelleryTryOnEnabled =>
      widget.configurationController?.configuration.jewelleryTryOnEnabled ??
      false;

  bool get _multipleTryOnModesEnabled =>
      _garmentTryOnEnabled && _jewelleryTryOnEnabled;

  void _configurationChanged() {
    if (!mounted) {
      return;
    }
    setState(() {
      _slideIndex = 0;
      _startSlideshowIfNeeded();
    });
  }

  void _startSlideshowIfNeeded() {
    _slideshowTimer?.cancel();
    final presentation = _presentation;
    if (!presentation.isSlideshow) {
      return;
    }
    _slideshowTimer = Timer.periodic(presentation.slideDuration, (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _slideIndex = (_slideIndex + 1) % _presentation.assets.length;
      });
    });
  }

  void _revealOperatorAccess() {
    _operatorRevealTimer?.cancel();
    setState(() => _operatorHintVisible = true);
    _operatorRevealTimer = Timer(_operatorConfig.revealDuration, () {
      if (mounted) {
        setState(() => _operatorHintVisible = false);
      }
    });
  }

  Future<void> _openOperatorPinChallenge() async {
    final unlocked = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) =>
          OperatorPinDialog(controller: widget.operatorAccessController),
    );
    if (!mounted || unlocked != true) {
      return;
    }
    _operatorRevealTimer?.cancel();
    setState(() => _operatorHintVisible = false);
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CameraSettingsScreen(
          controller: widget.controller,
          tryOnController: widget.tryOnController,
          configurationController: widget.configurationController,
        ),
      ),
    );
    widget.operatorAccessController.relock();
  }

  Future<void> _startTryOn() async {
    if (_startingTryOn || _startingMobileUpload) {
      return;
    }
    setState(() => _startingTryOn = true);
    final consented = await _requestCustomerConsent();
    if (!mounted) {
      return;
    }
    if (!consented) {
      setState(() => _startingTryOn = false);
      return;
    }
    final started = await _prepareCustomerSession();
    if (!mounted) {
      return;
    }
    if (!started) {
      setState(() => _startingTryOn = false);
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CameraCaptureScreen(
          controller: widget.controller,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          extractionService: widget.extractionService,
          purpose: PhotoAcquisitionPurpose.model,
        ),
      ),
    );
    await _handleReturnedHome();
    if (mounted) {
      setState(() => _startingTryOn = false);
    }
  }

  Future<void> _startJewelleryTryOn() async {
    if (_startingTryOn || _startingMobileUpload) {
      return;
    }
    setState(() => _startingTryOn = true);
    final consented = await _requestCustomerConsent();
    if (!mounted) {
      return;
    }
    if (!consented) {
      setState(() => _startingTryOn = false);
      return;
    }
    final started = await _prepareCustomerSession(
      vertical: KioskTryOnVertical.jewellery,
    );
    if (!mounted) {
      return;
    }
    if (!started) {
      setState(() => _startingTryOn = false);
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => BrowseProductsScreen(
          captureController: widget.controller,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          extractionService: widget.extractionService,
          productVertical: jewelleryTryOnExperience.productVertical,
        ),
      ),
    );
    await _handleReturnedHome();
    if (mounted) {
      setState(() => _startingTryOn = false);
    }
  }

  Future<void> _uploadFromMobile() async {
    if (_startingTryOn || _startingMobileUpload) {
      return;
    }
    setState(() => _startingMobileUpload = true);
    final consented = await _requestCustomerConsent();
    if (!mounted) {
      return;
    }
    if (!consented) {
      setState(() => _startingMobileUpload = false);
      return;
    }
    final started = await _prepareCustomerSession();
    if (!mounted) {
      return;
    }
    if (!started) {
      setState(() => _startingMobileUpload = false);
      return;
    }
    await widget.uploadController.cancel();
    if (!mounted) {
      return;
    }
    await Navigator.of(context).push(
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
    );
    await _handleReturnedHome();
    if (mounted) {
      setState(() => _startingMobileUpload = false);
    }
  }

  Future<bool> _requestCustomerConsent() async {
    final accepted = await showGeneralDialog<bool>(
      context: context,
      barrierDismissible: false,
      barrierLabel: 'Customer consent',
      barrierColor: Colors.black.withValues(alpha: 0.36),
      transitionDuration: const Duration(milliseconds: 180),
      pageBuilder: (context, animation, secondaryAnimation) {
        return const _CustomerConsentDialog();
      },
      transitionBuilder: (context, animation, secondaryAnimation, child) {
        return FadeTransition(
          opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut),
          child: SlideTransition(
            position:
                Tween<Offset>(
                  begin: const Offset(0, -0.06),
                  end: Offset.zero,
                ).animate(
                  CurvedAnimation(parent: animation, curve: Curves.easeOut),
                ),
            child: child,
          ),
        );
      },
    );
    return accepted == true;
  }

  Future<bool> _prepareCustomerSession({
    KioskTryOnVertical vertical = KioskTryOnVertical.garment,
  }) async {
    await widget.tryOnController.finish(widget.controller);
    await _activatePendingConfigurationIfSafe();

    final enabledIntents =
        widget.configurationController?.configuration.enabledGarmentIntents;
    if (enabledIntents != null) {
      widget.tryOnController.applyEnabledGarmentIntents(enabledIntents);
    }
    widget.tryOnController.applyGarmentPreviewEnabled(
      widget.configurationController?.configuration.garmentPreviewEnabled ??
          false,
    );
    widget.tryOnController.applyMultiGarmentSelectionEnabled(
      widget
              .configurationController
              ?.configuration
              .multiGarmentSelectionEnabled ??
          true,
    );
    widget.tryOnController.applyMaxTryOnPicks(
      widget.configurationController?.configuration.maxTryOnPicks ?? 5,
    );
    await _applyLocalTryOnSettings();
    final captureUploadMaxImageBytes = widget
        .configurationController
        ?.configuration
        .captureUploadMaxImageBytes;
    if (captureUploadMaxImageBytes != null) {
      widget.tryOnController.applyCaptureUploadMaxImageBytes(
        captureUploadMaxImageBytes,
      );
    }
    await widget.controller.resetSession();
    final started = await widget.tryOnController.beginCustomerSession(
      vertical: vertical,
    );
    if (!mounted) {
      return false;
    }
    if (!started) {
      widget.tryOnController.endCustomerSession();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.tryOnController.sessionMessage ??
                'SelfX session could not be started right now.',
          ),
        ),
      );
      return false;
    }
    return true;
  }

  Future<void> _handleReturnedHome() async {
    if (!mounted) {
      return;
    }
    final homeIsCurrent = ModalRoute.of(context)?.isCurrent ?? false;
    if (homeIsCurrent) {
      await widget.tryOnController.finish(widget.controller);
      await _activatePendingConfigurationIfSafe();
    }
  }

  Future<void> _activatePendingConfigurationIfSafe() async {
    if (!widget.tryOnController.canActivateRuntimeConfiguration) {
      return;
    }
    final activated = widget.configurationController
        ?.activatePendingConfiguration();
    if (activated == null) {
      return;
    }
    await widget.controller.applyRuntimeConfiguration(activated);
    widget.tryOnController.applyEnabledGarmentIntents(
      activated.enabledGarmentIntents,
    );
    widget.tryOnController.applyGarmentPreviewEnabled(
      activated.garmentPreviewEnabled,
    );
    widget.tryOnController.applyMultiGarmentSelectionEnabled(
      activated.multiGarmentSelectionEnabled,
    );
    widget.tryOnController.applyMaxTryOnPicks(activated.maxTryOnPicks);
    widget.tryOnController.applyCaptureUploadMaxImageBytes(
      activated.captureUploadMaxImageBytes,
    );
    await _applyLocalTryOnSettings();
  }

  Future<void> _applyLocalTryOnSettings() async {
    final settings = widget.controller.settingsStore;
    widget.tryOnController.applyMultiGarmentSelectionEnabled(
      await settings.readMultiGarmentSelectionEnabled(),
    );
    widget.tryOnController.applyMaxTryOnPicks(
      await settings.readMaxTryOnPicks(),
    );
    widget.tryOnController.applyShowMyPicksCounter(
      await settings.readShowMyPicksCounter(),
    );
    widget.tryOnController.applySaveMyLooksQrEnabled(
      await settings.readSaveMyLooksQrEnabled(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final presentation = _presentation;
            final asset = presentation.assetAt(_slideIndex);
            final layout = KioskLayoutMetrics.fromConstraints(constraints);
            final compact = layout.isSmall || constraints.maxWidth < 720;
            final horizontalPadding = layout.scaled(
              42,
              small: 22,
              large: 64,
              extraLarge: 92,
            );
            final verticalPadding = layout.scaled(
              34,
              small: 20,
              large: 48,
              extraLarge: 64,
            );
            return Stack(
              fit: StackFit.expand,
              children: [
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 650),
                  child: _IdleWallpaper(asset: asset, key: ValueKey(asset.id)),
                ),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.08),
                        Colors.black.withValues(alpha: 0.5),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.symmetric(
                    horizontal: horizontalPadding,
                    vertical: verticalPadding,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const _HomeBrand(),
                      Expanded(
                        child: LayoutBuilder(
                          builder: (context, bodyConstraints) {
                            final maxContentWidth = layout.portrait
                                ? 840.0
                                : 780.0;
                            final titleSize = layout.scaled(
                              50,
                              small: 36,
                              large: 60,
                              extraLarge: 70,
                            );
                            final buttonHeight = layout.scaled(
                              74,
                              small: 62,
                              large: 84,
                              extraLarge: 94,
                            );
                            final buttonGap = layout.scaled(
                              16,
                              small: 12,
                              large: 20,
                            );
                            final useButtonRow =
                                bodyConstraints.maxWidth >= 560;
                            final buttonWidth = useButtonRow
                                ? ((bodyConstraints.maxWidth - buttonGap) / 2)
                                      .clamp(220.0, 320.0)
                                      .toDouble()
                                : (bodyConstraints.maxWidth *
                                          (compact ? 0.72 : 0.56))
                                      .clamp(
                                        240.0,
                                        layout.portrait ? 520.0 : 460.0,
                                      )
                                      .toDouble();
                            final bottomGap = layout.scaled(
                              30,
                              small: 18,
                              large: 46,
                              extraLarge: 64,
                            );
                            final garmentTryOnEnabled = _garmentTryOnEnabled;
                            final jewelleryTryOnEnabled =
                                _jewelleryTryOnEnabled;
                            final multipleTryOnModesEnabled =
                                _multipleTryOnModesEnabled;

                            Widget buildUploadButton() => SizedBox(
                              width: buttonWidth,
                              child: SelfxKioskButton(
                                key: const Key('upload-from-mobile-start'),
                                label: 'Upload From Mobile',
                                icon: Icons.file_upload_outlined,
                                variant: SelfxKioskButtonVariant.primary,
                                backgroundColor: const Color(0xFFFFA21C),
                                borderColor: const Color(0xFFFFA21C),
                                minHeight: buttonHeight,
                                borderRadius: 999,
                                textAlign: TextAlign.center,
                                onPressed: _uploadFromMobile,
                                padding: EdgeInsets.symmetric(
                                  horizontal: compact ? 22 : 34,
                                  vertical: compact ? 18 : 26,
                                ),
                              ),
                            );

                            Widget buildStartButton() => SizedBox(
                              width: buttonWidth,
                              child: SelfxKioskButton(
                                key: const Key('start-try-on'),
                                label: multipleTryOnModesEnabled
                                    ? garmentTryOnExperience.multiModeHomeLabel
                                    : presentation.ctaLabel,
                                icon: garmentTryOnExperience.icon,
                                variant: SelfxKioskButtonVariant.primary,
                                minHeight: buttonHeight,
                                borderRadius: 999,
                                textAlign: TextAlign.center,
                                onPressed: _startTryOn,
                                padding: EdgeInsets.symmetric(
                                  horizontal: compact ? 24 : 36,
                                  vertical: compact ? 18 : 28,
                                ),
                              ),
                            );

                            Widget buildJewelleryButton() => SizedBox(
                              width: buttonWidth,
                              child: SelfxKioskButton(
                                key: const Key('start-jewellery-try-on'),
                                label: multipleTryOnModesEnabled
                                    ? jewelleryTryOnExperience
                                          .multiModeHomeLabel
                                    : 'Start Try-On',
                                icon: jewelleryTryOnExperience.icon,
                                variant: SelfxKioskButtonVariant.primary,
                                minHeight: buttonHeight,
                                borderRadius: 999,
                                textAlign: TextAlign.center,
                                onPressed: _startJewelleryTryOn,
                                padding: EdgeInsets.symmetric(
                                  horizontal: compact ? 24 : 36,
                                  vertical: compact ? 18 : 28,
                                ),
                              ),
                            );

                            final actionButtons = <Widget>[
                              if (garmentTryOnEnabled) buildUploadButton(),
                              if (garmentTryOnEnabled) buildStartButton(),
                              if (jewelleryTryOnEnabled) buildJewelleryButton(),
                            ];

                            Widget buildActionButtons() {
                              if (useButtonRow) {
                                return Wrap(
                                  alignment: WrapAlignment.center,
                                  spacing: buttonGap,
                                  runSpacing: layout.scaled(
                                    14,
                                    small: 10,
                                    large: 18,
                                  ),
                                  children: actionButtons,
                                );
                              }
                              return Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  for (
                                    var index = 0;
                                    index < actionButtons.length;
                                    index++
                                  ) ...[
                                    if (index > 0)
                                      SizedBox(
                                        height: layout.scaled(
                                          14,
                                          small: 10,
                                          large: 18,
                                        ),
                                      ),
                                    actionButtons[index],
                                  ],
                                ],
                              );
                            }

                            return SingleChildScrollView(
                              physics: bodyConstraints.maxHeight < 360
                                  ? null
                                  : const NeverScrollableScrollPhysics(),
                              child: ConstrainedBox(
                                constraints: BoxConstraints(
                                  minHeight: bodyConstraints.maxHeight,
                                ),
                                child: Align(
                                  alignment: Alignment.bottomCenter,
                                  child: ConstrainedBox(
                                    constraints: BoxConstraints(
                                      maxWidth: maxContentWidth,
                                    ),
                                    child: Padding(
                                      padding: EdgeInsets.only(
                                        bottom: bottomGap,
                                      ),
                                      child: Column(
                                        mainAxisSize: MainAxisSize.min,
                                        crossAxisAlignment:
                                            CrossAxisAlignment.center,
                                        children: [
                                          FittedBox(
                                            fit: BoxFit.scaleDown,
                                            child: Text(
                                              presentation.title,
                                              textAlign: TextAlign.center,
                                              maxLines: 1,
                                              softWrap: false,
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .displayMedium
                                                  ?.copyWith(
                                                    color: Colors.white,
                                                    fontSize: titleSize,
                                                    fontWeight: FontWeight.w900,
                                                    height: 1.04,
                                                  ),
                                            ),
                                          ),
                                          SizedBox(
                                            height: layout.scaled(
                                              16,
                                              small: 10,
                                              large: 20,
                                            ),
                                          ),
                                          Text(
                                            presentation.subtitle,
                                            textAlign: TextAlign.center,
                                            style: Theme.of(context)
                                                .textTheme
                                                .titleLarge
                                                ?.copyWith(
                                                  color: Colors.white
                                                      .withValues(alpha: 0.9),
                                                  fontWeight: FontWeight.w600,
                                                ),
                                          ),
                                          SizedBox(
                                            height: layout.scaled(
                                              30,
                                              small: 20,
                                              large: 42,
                                            ),
                                          ),
                                          buildActionButtons(),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                      SizedBox(height: layout.scaled(14, small: 8, large: 22)),
                    ],
                  ),
                ),
                Positioned(
                  left: 0,
                  top: 0,
                  width: 120,
                  height: 120,
                  child: GestureDetector(
                    key: const Key('operator-hotspot'),
                    behavior: HitTestBehavior.opaque,
                    onDoubleTap: _revealOperatorAccess,
                    child: const SizedBox.expand(),
                  ),
                ),
                if (_operatorHintVisible)
                  Positioned(
                    left: 20,
                    top: 20,
                    child: SelfxKioskButton(
                      key: const Key('operator-menu-button'),
                      label: 'Operator',
                      icon: Icons.menu,
                      variant: SelfxKioskButtonVariant.secondary,
                      minHeight: 52,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      onPressed: _openOperatorPinChallenge,
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _CustomerConsentDialog extends StatelessWidget {
  const _CustomerConsentDialog();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Align(
        alignment: Alignment.topCenter,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 28, 24, 0),
          child: Material(
            color: SelfxKioskTokens.surfaceElevated,
            elevation: 12,
            shadowColor: const Color(0x26000000),
            clipBehavior: Clip.antiAlias,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(SelfxKioskTokens.cardRadius),
              side: const BorderSide(color: SelfxKioskTokens.border),
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 620),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          SelfxKioskTokens.primaryGradientStart,
                          SelfxKioskTokens.primaryGradientEnd,
                        ],
                      ),
                    ),
                    child: SizedBox(height: 6),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            DecoratedBox(
                              decoration: BoxDecoration(
                                color: SelfxKioskTokens.primary.withValues(
                                  alpha: 0.1,
                                ),
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: SelfxKioskTokens.primary.withValues(
                                    alpha: 0.22,
                                  ),
                                ),
                              ),
                              child: const Padding(
                                padding: EdgeInsets.all(10),
                                child: Icon(
                                  Icons.privacy_tip_outlined,
                                  color: SelfxKioskTokens.primary,
                                  size: 28,
                                ),
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    'Before we begin',
                                    style: Theme.of(context)
                                        .textTheme
                                        .labelMedium
                                        ?.copyWith(
                                          color: SelfxKioskTokens.primary,
                                          fontWeight: FontWeight.w900,
                                        ),
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    'Consent Required',
                                    style: Theme.of(context)
                                        .textTheme
                                        .headlineSmall
                                        ?.copyWith(fontWeight: FontWeight.w900),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    'SelfX will use your photo and garment image only for this try-on session. After the session ends, your images are deleted and are not kept for reuse.',
                                    style: Theme.of(context).textTheme.bodyLarge
                                        ?.copyWith(height: 1.28),
                                  ),
                                  const SizedBox(height: 12),
                                  const _ConsentBadge(),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 22),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                key: const Key('customer-consent-cancel'),
                                style: OutlinedButton.styleFrom(
                                  minimumSize: const Size(0, 52),
                                  backgroundColor: Colors.white,
                                  foregroundColor: SelfxKioskTokens.textPrimary,
                                  side: const BorderSide(
                                    color: SelfxKioskTokens.borderStrong,
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(
                                      SelfxKioskTokens.buttonRadius,
                                    ),
                                  ),
                                  textStyle: const TextStyle(
                                    fontFamily: SelfxKioskTokens.bodyFontFamily,
                                    fontSize: 17,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                                onPressed: () =>
                                    Navigator.of(context).pop(false),
                                child: const Text('Cancel'),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: SelfxKioskButton(
                                key: const Key('customer-consent-ok'),
                                label: 'OK',
                                icon: Icons.check,
                                variant: SelfxKioskButtonVariant.primary,
                                minHeight: 52,
                                expanded: true,
                                textAlign: TextAlign.center,
                                mainAxisAlignment: MainAxisAlignment.center,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 12,
                                ),
                                onPressed: () =>
                                    Navigator.of(context).pop(true),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ConsentBadge extends StatelessWidget {
  const _ConsentBadge();

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: SelfxKioskTokens.primary.withValues(alpha: 0.08),
          border: Border.all(
            color: SelfxKioskTokens.primary.withValues(alpha: 0.18),
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Padding(
          padding: EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.verified_user_outlined,
                color: SelfxKioskTokens.primary,
                size: 18,
              ),
              SizedBox(width: 7),
              Text(
                'Session-only use',
                style: TextStyle(
                  color: SelfxKioskTokens.primary,
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class OperatorPinDialog extends StatefulWidget {
  const OperatorPinDialog({super.key, required this.controller});

  final OperatorAccessController controller;

  @override
  State<OperatorPinDialog> createState() => _OperatorPinDialogState();
}

class _OperatorPinDialogState extends State<OperatorPinDialog> {
  final TextEditingController _pinController = TextEditingController();
  String? _error;
  bool _verifying = false;

  @override
  void dispose() {
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_verifying) {
      return;
    }
    final pin = _pinController.text;
    if (!RegExp(r'^\d{6}$').hasMatch(pin)) {
      setState(() => _error = 'Enter the 6-digit operator PIN.');
      return;
    }

    setState(() {
      _verifying = true;
      _error = null;
    });
    final result = await widget.controller.verifyPin(pin);
    if (!mounted) {
      return;
    }
    _pinController.clear();
    setState(() => _verifying = false);
    switch (result.status) {
      case OperatorAccessStatus.unlocked:
        Navigator.of(context).pop(true);
        return;
      case OperatorAccessStatus.locked:
        setState(() {
          _error =
              'Operator access is temporarily locked. Try again in ${_seconds(result.remainingLockout)} seconds.';
        });
        return;
      case OperatorAccessStatus.invalid:
        setState(() => _error = 'PIN not accepted. Try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: SelfxKioskTokens.surfaceElevated,
      surfaceTintColor: Colors.transparent,
      insetPadding: const EdgeInsets.all(24),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(SelfxKioskTokens.cardRadius),
        side: const BorderSide(color: SelfxKioskTokens.border),
      ),
      elevation: 10,
      shadowColor: const Color(0x1A0F172A),
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: SizedBox(
          width: 400,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Enter operator PIN',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: SelfxKioskTokens.textPrimary,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Unlock local kiosk settings for this visit.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 24),
              TextField(
                key: const Key('operator-pin-field'),
                controller: _pinController,
                autofocus: true,
                obscureText: true,
                maxLength: 6,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                decoration: InputDecoration(
                  labelText: '6-digit PIN',
                  errorText: _error,
                  counterText: '',
                ),
                onSubmitted: (_) => _submit(),
              ),
              const SizedBox(height: 22),
              Row(
                children: [
                  Expanded(
                    child: SelfxKioskButton(
                      label: 'Cancel',
                      variant: SelfxKioskButtonVariant.secondary,
                      minHeight: 48,
                      expanded: true,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                      onPressed: _verifying
                          ? null
                          : () => Navigator.of(context).pop(false),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SelfxKioskButton(
                      key: const Key('operator-pin-submit'),
                      label: _verifying ? 'Unlocking' : 'Unlock',
                      icon: _verifying ? null : Icons.lock_open_outlined,
                      variant: SelfxKioskButtonVariant.primary,
                      minHeight: 48,
                      expanded: true,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                      onPressed: _verifying ? null : _submit,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  int _seconds(Duration? duration) {
    return (duration ?? widget.controller.config.lockoutDuration).inSeconds;
  }
}

class _IdleWallpaper extends StatefulWidget {
  const _IdleWallpaper({super.key, required this.asset});

  final KioskIdleAsset asset;

  @override
  State<_IdleWallpaper> createState() => _IdleWallpaperState();
}

class _IdleWallpaperState extends State<_IdleWallpaper> {
  VideoPlayerController? _videoController;
  bool _videoReady = false;

  @override
  void initState() {
    super.initState();
    unawaited(_configureVideo());
  }

  @override
  void didUpdateWidget(covariant _IdleWallpaper oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.asset.assetVideoPath != widget.asset.assetVideoPath) {
      unawaited(_configureVideo());
    }
  }

  @override
  void dispose() {
    final controller = _videoController;
    _videoController = null;
    unawaited(controller?.dispose());
    super.dispose();
  }

  Future<void> _configureVideo() async {
    final oldController = _videoController;
    _videoController = null;
    _videoReady = false;
    if (mounted) {
      setState(() {});
    }
    unawaited(oldController?.dispose());

    final videoPath = widget.asset.assetVideoPath;
    if (videoPath == null || videoPath.isEmpty) {
      return;
    }

    final controller = VideoPlayerController.asset(
      videoPath,
      videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
    );
    _videoController = controller;
    try {
      await controller.setLooping(true);
      await controller.setVolume(0);
      await controller.initialize();
      await controller.play();
    } catch (_) {
      if (_videoController == controller) {
        _videoController = null;
      }
      await controller.dispose();
      if (mounted) {
        setState(() => _videoReady = false);
      }
      return;
    }

    if (!mounted || _videoController != controller) {
      await controller.dispose();
      return;
    }
    setState(() => _videoReady = true);
  }

  @override
  Widget build(BuildContext context) {
    final image = _imageFor(widget.asset);
    final video = _videoReady && _videoController != null
        ? _videoFor(_videoController!)
        : null;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: widget.asset.colors,
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (video != null)
            video
          else if (image != null)
            image
          else
            CustomPaint(painter: _WallpaperPainter()),
        ],
      ),
    );
  }

  Widget? _imageFor(KioskIdleAsset asset) {
    final localImagePath = asset.localImagePath;
    if (localImagePath != null && localImagePath.isNotEmpty) {
      return Image.file(
        File(localImagePath),
        fit: BoxFit.cover,
        alignment: Alignment.center,
        errorBuilder: (_, _, _) => CustomPaint(painter: _WallpaperPainter()),
      );
    }

    final assetImagePath = asset.assetImagePath;
    if (assetImagePath != null && assetImagePath.isNotEmpty) {
      return Image.asset(
        assetImagePath,
        fit: BoxFit.cover,
        alignment: Alignment.center,
        errorBuilder: (_, _, _) => CustomPaint(painter: _WallpaperPainter()),
      );
    }

    return null;
  }

  Widget _videoFor(VideoPlayerController controller) {
    final size = controller.value.size;
    if (size.width <= 0 || size.height <= 0) {
      return CustomPaint(painter: _WallpaperPainter());
    }
    return FittedBox(
      fit: BoxFit.cover,
      clipBehavior: Clip.hardEdge,
      child: SizedBox(
        width: size.width,
        height: size.height,
        child: VideoPlayer(controller),
      ),
    );
  }
}

class _WallpaperPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white.withValues(alpha: 0.08);
    canvas.drawCircle(
      Offset(size.width * 0.82, size.height * 0.18),
      180,
      paint,
    );
    canvas.drawCircle(
      Offset(size.width * 0.18, size.height * 0.78),
      260,
      paint,
    );
    final linePaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.12)
      ..strokeWidth = 2;
    for (var i = 0; i < 7; i++) {
      final y = size.height * (0.18 + i * 0.09);
      canvas.drawLine(
        Offset(size.width * 0.58, y),
        Offset(size.width * 0.96, y + 64),
        linePaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _HomeBrand extends StatelessWidget {
  const _HomeBrand();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final layout = KioskLayoutMetrics.fromConstraints(constraints);
        final compact = layout.isSmall || constraints.maxWidth < 720;
        final logoWidth = (constraints.maxWidth * (compact ? 0.58 : 0.48))
            .clamp(220.0, layout.isExtraLarge ? 620.0 : 500.0)
            .toDouble();

        return Padding(
          padding: EdgeInsets.only(
            top: layout.scaled(22, small: 12, large: 30),
          ),
          child: Align(
            alignment: Alignment.topCenter,
            child: Semantics(
              label: 'SelfX. Make your business standout.',
              image: true,
              child: ExcludeSemantics(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ClipRect(
                      child: Align(
                        alignment: Alignment.topCenter,
                        heightFactor: 0.78,
                        child: Image.asset(
                          selfxLogoAssetPath,
                          width: logoWidth,
                          fit: BoxFit.contain,
                          filterQuality: FilterQuality.high,
                          errorBuilder: (_, _, _) => Text(
                            'SELFX',
                            style: Theme.of(context).textTheme.displaySmall
                                ?.copyWith(
                                  color: const Color(0xFFFF7119),
                                  fontWeight: FontWeight.w900,
                                  height: 0.9,
                                ),
                          ),
                        ),
                      ),
                    ),
                    SizedBox(height: compact ? 4 : 6),
                    Text(
                      'MAKE YOUR BUSINESS STANDOUT',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: Colors.white,
                        fontSize: logoWidth * 0.048,
                        fontWeight: FontWeight.w900,
                        height: 1,
                        shadows: const [
                          Shadow(
                            color: Color(0x66000000),
                            blurRadius: 8,
                            offset: Offset(0, 2),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
