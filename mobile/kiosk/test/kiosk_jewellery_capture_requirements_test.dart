import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/acquisition/photo_acquisition.dart';
import 'package:selfx_kiosk/src/catalog/kiosk_catalog_models.dart';
import 'package:selfx_kiosk/src/session/capture_scope.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_jewellery_capture_requirements.dart';
import 'package:selfx_kiosk/src/ui/camera_capture_screen.dart';

void main() {
  const productId = '11111111-1111-4111-8111-111111111111';

  test('parses the selected jewellery product capture contract', () {
    final requirements = KioskJewelleryCaptureRequirements.fromJson({
      'schemaVersion': 1,
      'tryOnVertical': 'JEWELLERY',
      'channel': 'KIOSK',
      'productId': productId,
      'jewelleryType': 'NECKLACE',
      'targetRegion': 'NECK_SHOULDERS_AND_UPPER_CHEST',
      'guide': 'NECK_AND_UPPER_CHEST',
      'title': 'Keep your neckline visible',
      'instruction':
          'Face the camera and keep your neck and shoulders visible.',
      'checklist': ['Face the camera'],
      'requiredChecks': ['PERSON_PRESENT'],
    });

    expect(requirements.productId, productId);
    expect(requirements.jewelleryType, KioskJewelleryType.necklace);
    expect(
      requirements.targetRegion,
      KioskJewelleryCaptureTargetRegion.neckShouldersAndUpperChest,
    );
    expect(requirements.guide, KioskJewelleryCaptureGuide.neckAndUpperChest);
  });

  test('rejects a capture contract from the wrong channel', () {
    expect(
      () => KioskJewelleryCaptureRequirements.fromJson({
        'schemaVersion': 1,
        'tryOnVertical': 'JEWELLERY',
        'channel': 'PUBLIC_API',
        'productId': productId,
        'jewelleryType': 'RING',
        'targetRegion': 'HAND',
        'guide': 'HAND_CLOSE_UP',
        'title': 'Hand guide',
        'instruction': 'Keep your hand visible.',
        'checklist': <String>[],
        'requiredChecks': <String>[],
      }),
      throwsA(isA<KioskCatalogException>()),
    );
  });

  testWidgets('camera overlay uses the backend jewellery guidance', (
    tester,
  ) async {
    const requirements = KioskJewelleryCaptureRequirements(
      schemaVersion: 1,
      jewelleryType: KioskJewelleryType.earring,
      productId: productId,
      targetRegion: KioskJewelleryCaptureTargetRegion.faceAndEars,
      guide: KioskJewelleryCaptureGuide.faceAndEars,
      title: 'Face and ears guide',
      instruction: 'Keep your face and both ears visible inside the guide.',
      checklist: [],
      requiredChecks: [],
    );

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: CaptureFramingGuideOverlay(
            purpose: PhotoAcquisitionPurpose.model,
            captureScope: CaptureScope.top,
            jewelleryRequirements: requirements,
          ),
        ),
      ),
    );

    expect(find.text('Face and ears guide'), findsOneWidget);
    expect(
      find.text('Keep your face and both ears visible inside the guide.'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('camera-framing-guide')), findsOneWidget);
  });

  test('jewellery guide geometry stays within the camera area', () {
    const size = Size(600, 900);
    final rects = KioskJewelleryCaptureGuide.values.map(
      (guide) => captureFramingGuideRectForTesting(
        size,
        purpose: PhotoAcquisitionPurpose.model,
        captureScope: CaptureScope.top,
        jewelleryGuide: guide,
      ),
    );

    for (final rect in rects) {
      expect(rect.left, greaterThanOrEqualTo(0));
      expect(rect.top, greaterThanOrEqualTo(0));
      expect(rect.right, lessThanOrEqualTo(size.width));
      expect(rect.bottom, lessThanOrEqualTo(size.height));
    }
  });
}
