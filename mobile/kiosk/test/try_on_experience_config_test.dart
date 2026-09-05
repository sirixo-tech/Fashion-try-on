import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/catalog/kiosk_catalog_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/ui/try_on_experience_config.dart';

void main() {
  test('garment experience preserves the established kiosk presentation', () {
    final experience = tryOnExperienceFor(KioskTryOnVertical.garment);

    expect(experience, same(garmentTryOnExperience));
    expect(experience.productVertical, KioskProductVertical.garment);
    expect(experience.title, 'Garment');
    expect(experience.itemLabel, 'garment');
    expect(experience.itemPluralLabel, 'garments');
    expect(experience.icon, Icons.checkroom_outlined);
    expect(experience.multiModeHomeLabel, 'Try On Garments');
    expect(experience.reviewWaitingActionLabel, 'Take Garment Photo');
    expect(experience.reviewCatalogActionLabel, 'Browse Catalog');
    expect(experience.tryAnotherLabel, 'Try Another Garment');
    expect(experience.supportsPhysicalProductCapture, isTrue);
    expect(experience.supportsMultipleProductSelection, isTrue);
    expect(experience.captureGuideFamily, TryOnCaptureGuideFamily.garmentBody);
    expect(
      experience.generationVisualFamily,
      TryOnGenerationVisualFamily.outfitQueue,
    );
  });

  test('jewellery experience defines its distinct presentation policy', () {
    final experience = tryOnExperienceFor(KioskTryOnVertical.jewellery);

    expect(experience, same(jewelleryTryOnExperience));
    expect(experience.productVertical, KioskProductVertical.jewellery);
    expect(experience.title, 'Jewellery');
    expect(experience.itemLabel, 'jewellery item');
    expect(experience.itemPluralLabel, 'jewellery items');
    expect(experience.icon, Icons.diamond_outlined);
    expect(experience.multiModeHomeLabel, 'Try On Jewellery');
    expect(experience.reviewWaitingActionLabel, 'Continue');
    expect(experience.reviewCatalogActionLabel, 'Choose Another');
    expect(experience.tryAnotherLabel, 'Try Another Jewellery');
    expect(experience.supportsPhysicalProductCapture, isFalse);
    expect(experience.supportsMultipleProductSelection, isFalse);
    expect(
      experience.captureGuideFamily,
      TryOnCaptureGuideFamily.jewelleryTargetRegion,
    );
    expect(
      experience.generationVisualFamily,
      TryOnGenerationVisualFamily.jewelleryQueue,
    );
  });

  test(
    'catalog verticals resolve to the same shared experience definitions',
    () {
      expect(
        productExperienceFor(KioskProductVertical.garment),
        same(garmentTryOnExperience),
      );
      expect(
        productExperienceFor(KioskProductVertical.jewellery),
        same(jewelleryTryOnExperience),
      );
    },
  );
}
