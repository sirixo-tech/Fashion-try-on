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

  for (final size in [
    const Size(320, 568),
    const Size(630, 1365),
    const Size(1280, 720),
  ]) {
    for (final jewellery in [false, true]) {
      testWidgets(
        '${jewellery ? 'jewellery' : 'garment'} guidance heading centers in its panel at $size',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = size;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          const requirements = KioskJewelleryCaptureRequirements(
            schemaVersion: 1,
            jewelleryType: KioskJewelleryType.necklace,
            productId: productId,
            targetRegion:
                KioskJewelleryCaptureTargetRegion.neckShouldersAndUpperChest,
            guide: KioskJewelleryCaptureGuide.neckAndUpperChest,
            title: 'Keep your neckline and shoulders visible',
            instruction:
                'Face the camera and keep your neck and shoulders visible.',
            checklist: [],
            requiredChecks: [],
          );
          await tester.pumpWidget(
            MaterialApp(
              home: Scaffold(
                body: CaptureFramingGuideOverlay(
                  purpose: jewellery
                      ? PhotoAcquisitionPurpose.model
                      : PhotoAcquisitionPurpose.garment,
                  captureScope: CaptureScope.top,
                  jewelleryRequirements: jewellery ? requirements : null,
                ),
              ),
            ),
          );
          final heading = find.byKey(const Key('camera-framing-guide-label'));
          final panel = find.byKey(const Key('camera-framing-guidance-panel'));
          expect(tester.widget<Text>(heading).textAlign, TextAlign.center);
          final message = find.byKey(
            const Key('camera-framing-guidance-message'),
          );
          final supportingText = tester.widget<Text>(message);
          expect(supportingText.textAlign, TextAlign.center);
          expect(supportingText.maxLines, isNull);
          expect(
            tester.getRect(message).center.dx,
            closeTo(tester.getRect(panel).center.dx, 0.1),
          );
          final decoration =
              tester.widget<DecoratedBox>(panel).decoration as BoxDecoration;
          expect(decoration.color, Colors.black.withValues(alpha: 0.48));
          expect(decoration.borderRadius, BorderRadius.circular(8));
          expect(
            decoration.border,
            Border.all(color: Colors.white.withValues(alpha: 0.2)),
          );
          expect(
            tester
                .widget<Icon>(
                  find.byKey(const Key('camera-framing-guidance-icon')),
                )
                .icon,
            jewellery ? Icons.diamond_outlined : Icons.checkroom_outlined,
          );
          if (size.width == 630) {
            expect(tester.widget<Text>(heading).style!.fontSize, 22);
            expect(supportingText.style!.fontSize, 16);
          }
          expect(
            tester.getRect(heading).center.dx,
            closeTo(tester.getRect(panel).center.dx, 0.1),
          );
          if (jewellery && size.width == 320) {
            final text = tester.widget<Text>(heading);
            expect(
              tester.getSize(heading).height,
              greaterThan(text.style!.fontSize! * 1.5),
            );
          }
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

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
      instruction: 'Keep your face and one ear visible inside the guide.',
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
      find.text('Keep your face and one ear visible inside the guide.'),
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

  test('ring and bracelet guides reserve room for full hand and wrist', () {
    const size = Size(600, 900);
    final ringRect = captureFramingGuideRectForTesting(
      size,
      purpose: PhotoAcquisitionPurpose.model,
      captureScope: CaptureScope.top,
      jewelleryGuide: KioskJewelleryCaptureGuide.handCloseUp,
    );
    final braceletRect = captureFramingGuideRectForTesting(
      size,
      purpose: PhotoAcquisitionPurpose.model,
      captureScope: CaptureScope.top,
      jewelleryGuide: KioskJewelleryCaptureGuide.wristCloseUp,
    );

    expect(ringRect.height / size.height, greaterThanOrEqualTo(0.68));
    expect(braceletRect.height / size.height, greaterThanOrEqualTo(0.72));
    expect(ringRect.width / size.width, greaterThanOrEqualTo(0.8));
    expect(braceletRect.width / size.width, greaterThanOrEqualTo(0.84));
  });

  test('necklace and earring guides reserve premium face framing space', () {
    const size = Size(600, 900);
    final necklaceRect = captureFramingGuideRectForTesting(
      size,
      purpose: PhotoAcquisitionPurpose.model,
      captureScope: CaptureScope.top,
      jewelleryGuide: KioskJewelleryCaptureGuide.neckAndUpperChest,
    );
    final earringRect = captureFramingGuideRectForTesting(
      size,
      purpose: PhotoAcquisitionPurpose.model,
      captureScope: CaptureScope.top,
      jewelleryGuide: KioskJewelleryCaptureGuide.faceAndEars,
    );

    expect(necklaceRect.height / size.height, greaterThanOrEqualTo(0.74));
    expect(necklaceRect.width / size.width, greaterThanOrEqualTo(0.88));
    expect(earringRect.height / size.height, greaterThanOrEqualTo(0.72));
    expect(earringRect.width / size.width, greaterThanOrEqualTo(0.78));
  });
}
