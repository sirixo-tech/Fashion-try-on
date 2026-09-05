import 'package:flutter/material.dart';

import '../catalog/kiosk_catalog_models.dart';
import '../tryon/kiosk_garment_input.dart';

enum TryOnCaptureGuideFamily { garmentBody, jewelleryTargetRegion }

enum TryOnGenerationVisualFamily { outfitQueue, jewelleryQueue }

@immutable
class TryOnExperienceConfig {
  const TryOnExperienceConfig({
    required this.vertical,
    required this.productVertical,
    required this.title,
    required this.itemLabel,
    required this.itemPluralLabel,
    required this.icon,
    required this.multiModeHomeLabel,
    required this.reviewInstruction,
    required this.reviewWaitingActionLabel,
    required this.reviewCatalogActionLabel,
    required this.tryAnotherLabel,
    required this.resultSelectionSubtitle,
    required this.supportsPhysicalProductCapture,
    required this.supportsMultipleProductSelection,
    required this.captureGuideFamily,
    required this.generationVisualFamily,
  });

  final KioskTryOnVertical vertical;
  final KioskProductVertical productVertical;
  final String title;
  final String itemLabel;
  final String itemPluralLabel;
  final IconData icon;
  final String multiModeHomeLabel;
  final String reviewInstruction;
  final String reviewWaitingActionLabel;
  final String reviewCatalogActionLabel;
  final String tryAnotherLabel;
  final String resultSelectionSubtitle;
  final bool supportsPhysicalProductCapture;
  final bool supportsMultipleProductSelection;
  final TryOnCaptureGuideFamily captureGuideFamily;
  final TryOnGenerationVisualFamily generationVisualFamily;
}

const garmentTryOnExperience = TryOnExperienceConfig(
  vertical: KioskTryOnVertical.garment,
  productVertical: KioskProductVertical.garment,
  title: 'Garment',
  itemLabel: 'garment',
  itemPluralLabel: 'garments',
  icon: Icons.checkroom_outlined,
  multiModeHomeLabel: 'Try On Garments',
  reviewInstruction: 'Now, show the garment to the camera.',
  reviewWaitingActionLabel: 'Take Garment Photo',
  reviewCatalogActionLabel: 'Browse Catalog',
  tryAnotherLabel: 'Try Another Garment',
  resultSelectionSubtitle: 'Choose fabric',
  supportsPhysicalProductCapture: true,
  supportsMultipleProductSelection: true,
  captureGuideFamily: TryOnCaptureGuideFamily.garmentBody,
  generationVisualFamily: TryOnGenerationVisualFamily.outfitQueue,
);

const jewelleryTryOnExperience = TryOnExperienceConfig(
  vertical: KioskTryOnVertical.jewellery,
  productVertical: KioskProductVertical.jewellery,
  title: 'Jewellery',
  itemLabel: 'jewellery item',
  itemPluralLabel: 'jewellery items',
  icon: Icons.diamond_outlined,
  multiModeHomeLabel: 'Try On Jewellery',
  reviewInstruction: 'Your photo is ready for this jewellery item.',
  reviewWaitingActionLabel: 'Continue',
  reviewCatalogActionLabel: 'Choose Another',
  tryAnotherLabel: 'Try Another Jewellery',
  resultSelectionSubtitle: 'Choose jewellery',
  supportsPhysicalProductCapture: false,
  supportsMultipleProductSelection: false,
  captureGuideFamily: TryOnCaptureGuideFamily.jewelleryTargetRegion,
  generationVisualFamily: TryOnGenerationVisualFamily.jewelleryQueue,
);

TryOnExperienceConfig tryOnExperienceFor(KioskTryOnVertical vertical) {
  return switch (vertical) {
    KioskTryOnVertical.garment => garmentTryOnExperience,
    KioskTryOnVertical.jewellery => jewelleryTryOnExperience,
  };
}

TryOnExperienceConfig productExperienceFor(KioskProductVertical vertical) {
  return switch (vertical) {
    KioskProductVertical.garment => garmentTryOnExperience,
    KioskProductVertical.jewellery => jewelleryTryOnExperience,
  };
}
