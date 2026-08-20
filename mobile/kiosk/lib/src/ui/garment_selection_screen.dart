import 'package:flutter/material.dart';

import '../acquisition/photo_acquisition.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../session/capture_scope.dart';
import '../session/capture_session_controller.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../tryon/model_garment_compatibility.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'browse_products_screen.dart';
import 'camera_capture_screen.dart';
import 'kiosk_chrome.dart';
import 'model_compatibility_guidance_screen.dart';
import 'selfx_kiosk_button.dart';

class GarmentSelectionScreen extends StatelessWidget {
  const GarmentSelectionScreen({
    super.key,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
    this.catalogGateway = const UnavailableKioskCatalogGateway(),
    this.enabledGarmentIntents,
    this.extractionService = const UnavailableGarmentExtractionService(),
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final List<KioskGarmentIntent>? enabledGarmentIntents;
  final GarmentExtractionService extractionService;

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'SelfX Kiosk',
      subtitle: 'Choose garment',
      showBrandHeader: false,
      leading: IconButton(
        onPressed: () => Navigator.of(context).pop(),
        icon: const Icon(Icons.arrow_back),
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Choose Garment',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.displaySmall,
              ),
              const SizedBox(height: 10),
              Text(
                'How would you like to choose?',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 30),
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
                subtitle: 'Use the kiosk camera',
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
                onPressed: () => _openCaptureGarment(context),
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
          captureController: captureController,
          tryOnController: tryOnController,
          uploadController: uploadController,
          catalogGateway: catalogGateway,
          extractionService: extractionService,
        ),
      ),
    );
  }

  void _openCaptureGarment(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _CapturedGarmentOptionsScreen(
          captureController: captureController,
          tryOnController: tryOnController,
          uploadController: uploadController,
          catalogGateway: catalogGateway,
          enabledGarmentIntents: enabledGarmentIntents,
          extractionService: extractionService,
        ),
      ),
    );
  }
}

class _CapturedGarmentOptionsScreen extends StatefulWidget {
  const _CapturedGarmentOptionsScreen({
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
    required this.catalogGateway,
    this.enabledGarmentIntents,
    required this.extractionService,
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final List<KioskGarmentIntent>? enabledGarmentIntents;
  final GarmentExtractionService extractionService;

  @override
  State<_CapturedGarmentOptionsScreen> createState() =>
      _CapturedGarmentOptionsScreenState();
}

class _CapturedGarmentOptionsScreenState
    extends State<_CapturedGarmentOptionsScreen> {
  KioskGarmentIntent? _intent;

  @override
  void initState() {
    super.initState();
    final existing =
        widget.tryOnController.garmentInput?.intent ??
        widget.tryOnController.pendingGarmentIntent;
    if (existing != null &&
        existing != KioskGarmentIntent.auto &&
        _enabledIntents.contains(existing)) {
      _intent = existing;
      widget.captureController.selectCaptureScope(
        captureScopeForIntent(existing),
      );
    }
  }

  List<KioskGarmentIntent> get _enabledIntents =>
      widget.enabledGarmentIntents ??
      widget.tryOnController.enabledGarmentIntents;

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'SelfX Kiosk',
      subtitle: 'Capture garment',
      showBrandHeader: false,
      leading: IconButton(
        onPressed: () => Navigator.of(context).pop(),
        icon: const Icon(Icons.arrow_back),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final veryShort = constraints.maxHeight < 560;
          final short = constraints.maxHeight < 760;
          final narrow = constraints.maxWidth < 560;
          final titleStyle = Theme.of(context).textTheme.displaySmall?.copyWith(
            fontSize: veryShort ? 30 : (short ? 36 : 42),
            height: 1.08,
          );
          final bodyStyle = Theme.of(context).textTheme.bodyLarge?.copyWith(
            fontSize: veryShort ? 15 : (short ? 17 : 18),
          );
          final buttonMinHeight = veryShort ? 60.0 : 76.0;
          final horizontalPadding = narrow ? 14.0 : 20.0;
          final verticalPadding = veryShort ? 10.0 : (short ? 14.0 : 16.0);

          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 980),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Capture Garment',
                    textAlign: TextAlign.center,
                    style: titleStyle,
                  ),
                  SizedBox(height: veryShort ? 4 : (short ? 8 : 10)),
                  Text(
                    'Choose the closest option, then capture a clear garment photo.',
                    textAlign: TextAlign.center,
                    style: bodyStyle,
                  ),
                  SizedBox(height: veryShort ? 10 : (short ? 18 : 24)),
                  _IntentGrid(
                    intents: _enabledIntents,
                    selectedIntent: _intent,
                    narrow: narrow,
                    short: short,
                    veryShort: veryShort,
                    onSelected: _selectIntent,
                  ),
                  SizedBox(height: veryShort ? 18 : (short ? 26 : 34)),
                  SelfxKioskButton(
                    key: const Key('take-garment-photo-source'),
                    label: 'Capture Garment',
                    subtitle: veryShort ? null : 'Use the kiosk camera',
                    icon: Icons.camera_alt_outlined,
                    trailing: const Icon(Icons.arrow_forward),
                    variant: SelfxKioskButtonVariant.primary,
                    minHeight: buttonMinHeight,
                    expanded: true,
                    textAlign: TextAlign.start,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    padding: EdgeInsets.symmetric(
                      horizontal: horizontalPadding,
                      vertical: verticalPadding,
                    ),
                    onPressed: _intent == null ? null : _openCamera,
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  void _selectIntent(KioskGarmentIntent intent) {
    if (!_enabledIntents.contains(intent)) {
      return;
    }
    setState(() => _intent = intent);
    widget.tryOnController.selectPendingGarmentIntent(intent);
    widget.captureController.selectCaptureScope(captureScopeForIntent(intent));
    final coverage = widget.captureController.acceptedModelCoverage;
    if (widget.captureController.acceptedCapture == null || coverage == null) {
      return;
    }
    final compatibility = const ModelGarmentCompatibilityService().check(
      coverage: coverage,
      intent: intent,
    );
    if (!compatibility.supported) {
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ModelCompatibilityGuidanceScreen(
            intent: intent,
            captureController: widget.captureController,
            tryOnController: widget.tryOnController,
            uploadController: widget.uploadController,
            catalogGateway: widget.catalogGateway,
            extractionService: widget.extractionService,
          ),
        ),
      );
    }
  }

  void _openCamera() {
    final intent = _intent;
    if (intent == null) {
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CameraCaptureScreen(
          controller: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          purpose: PhotoAcquisitionPurpose.garment,
          garmentIntent: intent,
          extractionService: widget.extractionService,
        ),
      ),
    );
  }
}

class _IntentGrid extends StatelessWidget {
  const _IntentGrid({
    required this.intents,
    required this.selectedIntent,
    required this.narrow,
    required this.short,
    required this.veryShort,
    required this.onSelected,
  });

  final List<KioskGarmentIntent> intents;
  final KioskGarmentIntent? selectedIntent;
  final bool narrow;
  final bool short;
  final bool veryShort;
  final ValueChanged<KioskGarmentIntent> onSelected;

  @override
  Widget build(BuildContext context) {
    if (narrow) {
      return Column(
        children: intents
            .map(
              (intent) => Padding(
                padding: EdgeInsets.only(
                  bottom: intent == intents.last ? 0 : 10,
                ),
                child: _IntentChip(
                  intent: intent,
                  selected: selectedIntent == intent,
                  short: short,
                  veryShort: veryShort,
                  onPressed: () => onSelected(intent),
                ),
              ),
            )
            .toList(),
      );
    }

    return Row(
      children: [
        for (final intent in intents) ...[
          Expanded(
            child: _IntentChip(
              intent: intent,
              selected: selectedIntent == intent,
              short: short,
              veryShort: veryShort,
              onPressed: () => onSelected(intent),
            ),
          ),
          if (intent != intents.last) const SizedBox(width: 12),
        ],
      ],
    );
  }
}

class _IntentChip extends StatelessWidget {
  const _IntentChip({
    required this.intent,
    required this.selected,
    required this.short,
    required this.veryShort,
    required this.onPressed,
  });

  final KioskGarmentIntent intent;
  final bool selected;
  final bool short;
  final bool veryShort;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final label = intent == KioskGarmentIntent.fullOutfit
        ? 'Full Outfit'
        : intent.label;
    final icon = switch (intent) {
      KioskGarmentIntent.top => Icons.checkroom_outlined,
      KioskGarmentIntent.bottom => Icons.accessibility_new_outlined,
      KioskGarmentIntent.fullOutfit => Icons.person_outline,
      _ => Icons.checkroom_outlined,
    };

    return SelfxKioskButton(
      key: Key(
        'garment-intent-${intent.apiValue.toLowerCase().replaceAll('_', '-')}',
      ),
      label: label,
      icon: icon,
      variant: selected
          ? SelfxKioskButtonVariant.selected
          : SelfxKioskButtonVariant.secondary,
      minHeight: veryShort ? 56 : 64,
      textAlign: TextAlign.center,
      mainAxisAlignment: MainAxisAlignment.center,
      animateSurface: false,
      onPressed: onPressed,
      padding: EdgeInsets.symmetric(
        horizontal: veryShort ? 8 : (short ? 10 : 14),
        vertical: veryShort ? 8 : (short ? 12 : 14),
      ),
    );
  }
}

CaptureScope captureScopeForIntent(KioskGarmentIntent intent) {
  return switch (intent) {
    KioskGarmentIntent.top => CaptureScope.top,
    KioskGarmentIntent.bottom => CaptureScope.bottom,
    KioskGarmentIntent.onePiece ||
    KioskGarmentIntent.fullOutfit ||
    KioskGarmentIntent.auto => CaptureScope.fullBody,
  };
}
