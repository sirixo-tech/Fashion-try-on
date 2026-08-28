import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

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
import 'kiosk_chrome.dart';
import 'responsive_kiosk_layout.dart';
import 'selfx_kiosk_action_card.dart';

const _garmentSelectionBackgroundVideo =
    'assets/videos/garment-selection-background.mp4';

class GarmentSelectionScreen extends StatefulWidget {
  const GarmentSelectionScreen({
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
  State<GarmentSelectionScreen> createState() => _GarmentSelectionScreenState();
}

class _GarmentSelectionScreenState extends State<GarmentSelectionScreen> {
  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'SelfX Kiosk',
      subtitle: 'Choose garment',
      showBrandHeader: false,
      background: const _GarmentSelectionVideoBackground(),
      leading: IconButton(
        onPressed: () => Navigator.of(context).pop(),
        color: Colors.white,
        icon: const Icon(Icons.arrow_back),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final layout = KioskLayoutMetrics.fromConstraints(constraints);
          final buttonHeight = layout.scaled(
            92,
            small: 76,
            large: 108,
            extraLarge: 122,
          );
          final titleSize = layout.scaled(46, small: 34, large: 54);
          return SingleChildScrollView(
            physics: constraints.maxHeight < 520
                ? null
                : const NeverScrollableScrollPhysics(),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: layout.portrait ? 820 : 760,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          'Choose Your Look',
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          style: Theme.of(context).textTheme.displaySmall
                              ?.copyWith(
                                color: Colors.white,
                                fontSize: titleSize,
                                fontWeight: FontWeight.w800,
                                shadows: const [
                                  Shadow(
                                    color: Color(0x99000000),
                                    blurRadius: 24,
                                    offset: Offset(0, 4),
                                  ),
                                ],
                              ),
                        ),
                      ),
                      SizedBox(height: layout.scaled(10, small: 8)),
                      Text(
                        'How would you like to start?',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: Colors.white.withValues(alpha: 0.92),
                          shadows: const [
                            Shadow(
                              color: Color(0x99000000),
                              blurRadius: 18,
                              offset: Offset(0, 3),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(height: layout.scaled(30, small: 20, large: 40)),
                      SelfxKioskActionCard(
                        key: const Key('browse-products-source'),
                        label: 'Browse Products',
                        subtitle: 'Explore available garments',
                        icon: Icons.checkroom_outlined,
                        iconColor: SelfxKioskTokens.primaryHover,
                        minHeight: buttonHeight,
                        padding: EdgeInsets.symmetric(
                          horizontal: layout.scaled(22, small: 18),
                          vertical: layout.scaled(18, small: 14),
                        ),
                        onPressed: () => _openBrowseProducts(context),
                      ),
                      SizedBox(height: layout.panelGap),
                      SelfxKioskActionCard(
                        key: const Key('capture-garment-source'),
                        label: 'Capture Garment',
                        subtitle: 'SelfX identifies the garment automatically',
                        icon: Icons.camera_alt_outlined,
                        iconColor: const Color(0xFF2384D6),
                        minHeight: buttonHeight,
                        padding: EdgeInsets.symmetric(
                          horizontal: layout.scaled(22, small: 18),
                          vertical: layout.scaled(18, small: 14),
                        ),
                        onPressed: () => _openCaptureGarment(context),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  void _openBrowseProducts(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => BrowseProductsScreen(
          captureController: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          extractionService: widget.extractionService,
        ),
      ),
    );
  }

  void _openCaptureGarment(BuildContext context) {
    widget.tryOnController.selectPendingGarmentIntent(KioskGarmentIntent.auto);
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CameraCaptureScreen(
          controller: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          purpose: PhotoAcquisitionPurpose.garment,
          extractionService: widget.extractionService,
        ),
      ),
    );
  }
}

class _GarmentSelectionVideoBackground extends StatefulWidget {
  const _GarmentSelectionVideoBackground();

  @override
  State<_GarmentSelectionVideoBackground> createState() =>
      _GarmentSelectionVideoBackgroundState();
}

class _GarmentSelectionVideoBackgroundState
    extends State<_GarmentSelectionVideoBackground> {
  late final VideoPlayerController _controller;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.asset(
      _garmentSelectionBackgroundVideo,
      videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
    );
    _initialize();
  }

  Future<void> _initialize() async {
    try {
      await _controller.initialize();
      await _controller.setLooping(true);
      await _controller.setVolume(0);
      await _controller.play();
      if (mounted) {
        setState(() => _ready = true);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _ready = false);
      }
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF111827), Color(0xFF030712)],
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (_ready)
            FittedBox(
              fit: BoxFit.cover,
              child: SizedBox(
                width: _controller.value.size.width,
                height: _controller.value.size.height,
                child: VideoPlayer(_controller),
              ),
            ),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0x66000000), Color(0x99000000)],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
