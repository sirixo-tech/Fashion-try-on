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
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'camera_capture_screen.dart';
import 'camera_settings_screen.dart';
import 'mobile_upload_screen.dart';
import 'selfx_kiosk_button.dart';
import 'selfx_logo.dart';

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

  Future<void> _uploadFromMobile() async {
    if (_startingTryOn || _startingMobileUpload) {
      return;
    }
    setState(() => _startingMobileUpload = true);
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

  Future<bool> _prepareCustomerSession() async {
    final enabledIntents =
        widget.configurationController?.configuration.enabledGarmentIntents;
    if (enabledIntents != null) {
      widget.tryOnController.applyEnabledGarmentIntents(enabledIntents);
    }
    widget.tryOnController.applyGarmentPreviewEnabled(
      widget.configurationController?.configuration.garmentPreviewEnabled ??
          false,
    );
    await widget.controller.resetSession();
    final started = await widget.tryOnController.beginCustomerSession();
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
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final presentation = _presentation;
            final asset = presentation.assetAt(_slideIndex);
            final portrait = constraints.maxHeight >= constraints.maxWidth;
            final compact = constraints.maxWidth < 720;
            final horizontalPadding = compact ? 22.0 : 52.0;
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
                    vertical: compact ? 24 : 44,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const _HomeBrand(),
                      Expanded(
                        child: Center(
                          child: ConstrainedBox(
                            constraints: BoxConstraints(
                              maxWidth: portrait ? 820 : 760,
                            ),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.center,
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
                                          fontSize: compact ? 42 : 54,
                                          fontWeight: FontWeight.w900,
                                          height: 1.04,
                                        ),
                                  ),
                                ),
                                const SizedBox(height: 18),
                                Text(
                                  presentation.subtitle,
                                  textAlign: TextAlign.center,
                                  style: Theme.of(context).textTheme.titleLarge
                                      ?.copyWith(
                                        color: Colors.white.withValues(
                                          alpha: 0.9,
                                        ),
                                        fontWeight: FontWeight.w600,
                                      ),
                                ),
                                SizedBox(height: compact ? 28 : 36),
                                SelfxKioskButton(
                                  key: const Key('upload-from-mobile-start'),
                                  label: 'Upload From Mobile',
                                  icon: Icons.file_upload_outlined,
                                  variant: SelfxKioskButtonVariant.primary,
                                  backgroundColor: const Color(0xFFFFA21C),
                                  borderColor: const Color(0xFFFFA21C),
                                  minHeight: compact ? 66 : 74,
                                  borderRadius: 999,
                                  textAlign: TextAlign.center,
                                  onPressed: _uploadFromMobile,
                                  padding: EdgeInsets.symmetric(
                                    horizontal: compact ? 30 : 44,
                                    vertical: compact ? 20 : 26,
                                  ),
                                ),
                                const SizedBox(height: 16),
                                SelfxKioskButton(
                                  key: const Key('start-try-on'),
                                  label: presentation.ctaLabel,
                                  icon: Icons.auto_awesome_outlined,
                                  variant: SelfxKioskButtonVariant.primary,
                                  minHeight: compact ? 70 : 78,
                                  borderRadius: 999,
                                  textAlign: TextAlign.center,
                                  onPressed: _startTryOn,
                                  padding: EdgeInsets.symmetric(
                                    horizontal: compact ? 32 : 46,
                                    vertical: compact ? 22 : 28,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      SizedBox(height: compact ? 12 : 20),
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
        final compact = constraints.maxWidth < 720;
        final logoWidth = (constraints.maxWidth * (compact ? 0.64 : 0.54))
            .clamp(260.0, 520.0)
            .toDouble();

        return Padding(
          padding: EdgeInsets.only(top: compact ? 24 : 32),
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
                        heightFactor: 0.8,
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
                    const SizedBox(height: 6),
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
