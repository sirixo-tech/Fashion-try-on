import 'dart:async';
import 'dart:io';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../idle/kiosk_idle_presentation.dart';
import '../operator/operator_access.dart';
import '../session/capture_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import 'camera_settings_screen.dart';
import 'garment_selection_screen.dart';
import 'selfx_glass_button.dart';

class KioskHomeScreen extends StatefulWidget {
  const KioskHomeScreen({
    super.key,
    required this.controller,
    required this.tryOnController,
    required this.operatorAccessController,
    this.presentation = defaultIdlePresentation,
  });

  final CaptureSessionController controller;
  final KioskTryOnSessionController tryOnController;
  final OperatorAccessController operatorAccessController;
  final KioskIdlePresentation presentation;

  @override
  State<KioskHomeScreen> createState() => _KioskHomeScreenState();
}

class _KioskHomeScreenState extends State<KioskHomeScreen> {
  bool _operatorHintVisible = false;
  int _slideIndex = 0;
  Timer? _operatorRevealTimer;
  Timer? _slideshowTimer;

  OperatorAccessConfig get _operatorConfig =>
      widget.operatorAccessController.config;

  @override
  void initState() {
    super.initState();
    _startSlideshowIfNeeded();
  }

  @override
  void didUpdateWidget(covariant KioskHomeScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.presentation != widget.presentation) {
      _slideIndex = 0;
      _startSlideshowIfNeeded();
    }
  }

  @override
  void dispose() {
    _operatorRevealTimer?.cancel();
    _slideshowTimer?.cancel();
    super.dispose();
  }

  void _startSlideshowIfNeeded() {
    _slideshowTimer?.cancel();
    if (!widget.presentation.isSlideshow) {
      return;
    }
    _slideshowTimer = Timer.periodic(widget.presentation.slideDuration, (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _slideIndex = (_slideIndex + 1) % widget.presentation.assets.length;
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
      builder: (context) => OperatorPinDialog(
        controller: widget.operatorAccessController,
      ),
    );
    if (!mounted || unlocked != true) {
      return;
    }
    _operatorRevealTimer?.cancel();
    setState(() => _operatorHintVisible = false);
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CameraSettingsScreen(controller: widget.controller),
      ),
    );
    widget.operatorAccessController.relock();
  }

  void _startTryOn() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => GarmentSelectionScreen(
          captureController: widget.controller,
          tryOnController: widget.tryOnController,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final asset = widget.presentation.assetAt(_slideIndex);
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
                      _HomeBrand(label: widget.presentation.brandLabel),
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
                                Text(
                                  widget.presentation.title,
                                  textAlign: TextAlign.center,
                                  style: Theme.of(context)
                                      .textTheme
                                      .displayMedium
                                      ?.copyWith(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w900,
                                        height: 1.04,
                                      ),
                                ),
                                const SizedBox(height: 18),
                                Text(
                                  widget.presentation.subtitle,
                                  textAlign: TextAlign.center,
                                  style: Theme.of(context).textTheme.titleLarge
                                      ?.copyWith(
                                        color: Colors.white.withValues(
                                          alpha: 0.9,
                                        ),
                                        fontWeight: FontWeight.w600,
                                      ),
                                ),
                                const SizedBox(height: 36),
                                SelfxGlassButton(
                                  key: const Key('start-try-on'),
                                  label: widget.presentation.ctaLabel,
                                  icon: Icons.auto_awesome_outlined,
                                  variant: SelfxGlassButtonVariant.primary,
                                  minHeight: compact ? 70 : 78,
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
                    child: SelfxGlassButton(
                      key: const Key('operator-menu-button'),
                      label: 'Operator',
                      icon: Icons.menu,
                      variant: SelfxGlassButtonVariant.secondary,
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
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.all(24),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusLarge),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: SelfxKioskTokens.strongGlassSurface,
              borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusLarge),
              border: Border.all(color: Colors.white.withValues(alpha: 0.68)),
              boxShadow: SelfxKioskTokens.softShadow,
              gradient: SelfxKioskTokens.neutralGlassHighlight,
            ),
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
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(
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
                          child: SelfxGlassButton(
                            label: 'Cancel',
                            variant: SelfxGlassButtonVariant.secondary,
                            minHeight: 54,
                            expanded: true,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 18,
                              vertical: 13,
                            ),
                            onPressed: _verifying
                                ? null
                                : () => Navigator.of(context).pop(false),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: SelfxGlassButton(
                            key: const Key('operator-pin-submit'),
                            label: _verifying ? 'Unlocking' : 'Unlock',
                            icon: _verifying ? null : Icons.lock_open_outlined,
                            variant: SelfxGlassButtonVariant.primary,
                            minHeight: 54,
                            expanded: true,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 18,
                              vertical: 13,
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
          ),
        ),
      ),
    );
  }

  int _seconds(Duration? duration) {
    return (duration ?? widget.controller.config.lockoutDuration).inSeconds;
  }
}

class _IdleWallpaper extends StatelessWidget {
  const _IdleWallpaper({super.key, required this.asset});

  final KioskIdleAsset asset;

  @override
  Widget build(BuildContext context) {
    final image = _imageFor(asset);
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: asset.colors,
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (image != null) image else CustomPaint(painter: _WallpaperPainter()),
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
}

class _WallpaperPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white.withValues(alpha: 0.08);
    canvas.drawCircle(Offset(size.width * 0.82, size.height * 0.18), 180, paint);
    canvas.drawCircle(Offset(size.width * 0.18, size.height * 0.78), 260, paint);
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
  const _HomeBrand({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 62,
          height: 62,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusMedium),
          ),
          child: const Text(
            'SX',
            style: TextStyle(
              color: SelfxKioskTokens.primary,
              fontSize: 22,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        const SizedBox(width: 16),
        Text(
          label,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}
