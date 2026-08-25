import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../acquisition/photo_acquisition.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../session/capture_session_controller.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'browse_products_screen.dart';
import 'camera_capture_screen.dart';
import 'garment_intent_picker.dart';
import 'kiosk_chrome.dart';
import 'selfx_kiosk_button.dart';

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
  KioskGarmentIntent? _selectedIntent;

  @override
  void initState() {
    super.initState();
    _selectedIntent = selectedGarmentIntentFor(widget.tryOnController);
  }

  @override
  Widget build(BuildContext context) {
    final selectedIntent = _selectedIntent;
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
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
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
                  style: Theme.of(context).textTheme.displaySmall?.copyWith(
                    color: Colors.white,
                    fontSize: 46,
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
              const SizedBox(height: 10),
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
              const SizedBox(height: 30),
              _GarmentIntentSelector(
                intents: widget.tryOnController.enabledGarmentIntents,
                selected: selectedIntent,
                onSelected: (intent) {
                  widget.tryOnController.selectPendingGarmentIntent(intent);
                  setState(() => _selectedIntent = intent);
                },
              ),
              const SizedBox(height: 20),
              SelfxKioskButton(
                key: const Key('browse-products-source'),
                label: 'Browse Products',
                subtitle: 'Explore available garments',
                icon: Icons.checkroom_outlined,
                trailing: const Icon(Icons.arrow_forward),
                variant: SelfxKioskButtonVariant.primary,
                minHeight: 92,
                expanded: true,
                textAlign: TextAlign.start,
                crossAxisAlignment: CrossAxisAlignment.start,
                padding: const EdgeInsets.symmetric(
                  horizontal: 22,
                  vertical: 18,
                ),
                onPressed: () => _openBrowseProducts(context),
              ),
              const SizedBox(height: 18),
              SelfxKioskButton(
                key: const Key('capture-garment-source'),
                label: 'Capture Garment',
                subtitle: selectedIntent == null
                    ? 'Choose garment type first'
                    : 'Take a quick snapshot',
                icon: Icons.camera_alt_outlined,
                trailing: const Icon(Icons.arrow_forward),
                variant: SelfxKioskButtonVariant.primary,
                minHeight: 92,
                expanded: true,
                textAlign: TextAlign.start,
                crossAxisAlignment: CrossAxisAlignment.start,
                padding: const EdgeInsets.symmetric(
                  horizontal: 22,
                  vertical: 18,
                ),
                onPressed: selectedIntent == null
                    ? null
                    : () => _openCaptureGarment(context, selectedIntent),
              ),
            ],
          ),
        ),
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

  void _openCaptureGarment(
    BuildContext context,
    KioskGarmentIntent garmentIntent,
  ) {
    widget.tryOnController.selectPendingGarmentIntent(garmentIntent);
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CameraCaptureScreen(
          controller: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          purpose: PhotoAcquisitionPurpose.garment,
          garmentIntent: garmentIntent,
          extractionService: widget.extractionService,
        ),
      ),
    );
  }
}

class _GarmentIntentSelector extends StatelessWidget {
  const _GarmentIntentSelector({
    required this.intents,
    required this.selected,
    required this.onSelected,
  });

  final List<KioskGarmentIntent> intents;
  final KioskGarmentIntent? selected;
  final ValueChanged<KioskGarmentIntent> onSelected;

  @override
  Widget build(BuildContext context) {
    final visible = intents
        .where((intent) => intent != KioskGarmentIntent.auto)
        .toList(growable: false);
    if (visible.isEmpty) {
      return const SizedBox.shrink();
    }

    return Wrap(
      spacing: 12,
      runSpacing: 12,
      alignment: WrapAlignment.center,
      children: [
        for (final intent in visible)
          ChoiceChip(
            key: Key('garment-intent-${intent.apiValue}'),
            label: Text(intent.customerLabel),
            selected: selected == intent,
            onSelected: (_) => onSelected(intent),
          ),
      ],
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
