import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/ui/capture_review_screen.dart';
import 'package:selfx_kiosk/src/ui/kiosk_attention_animations.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_action_card.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_button.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;

void main() {
  for (final size in [
    const Size(320, 568),
    const Size(630, 1365),
    const Size(900, 1600),
    const Size(1280, 720),
    const Size(800, 480),
  ]) {
    testWidgets(
      'capture review keeps dynamic states and pulsing icon at $size',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = size;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final capture = fixtures.testController();
        final tryOn = KioskTryOnSessionController(
          gateway: fixtures.FakeKioskTryOnGateway(),
        );
        final uploads = fixtures.testUploadController(capture.captureStore);
        addTearDown(() {
          uploads.dispose();
          tryOn.dispose();
          capture.dispose();
        });
        await capture.capturePhoto();
        Widget app() => MaterialApp(
          theme: buildSelfxKioskTheme(),
          home: CaptureReviewScreen(
            controller: capture,
            tryOnController: tryOn,
            uploadController: uploads,
          ),
        );
        capture.isAnalyzingQuality = true;
        capture.imageUsabilityResult = null;
        await tester.pumpWidget(app());
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.text('Checking image usability...'), findsOneWidget);
        expect(
          tester
              .widget<SelfxKioskButton>(
                find.byKey(const Key('take-garment-photo')),
              )
              .onPressed,
          isNull,
        );
        expect(find.byType(SelfxSuccessIconPulse), findsNothing);
        expect(tester.takeException(), isNull);

        capture.isAnalyzingQuality = false;
        capture.imageUsabilityResult = const ImageUsabilityResult.unusable(
          'Please retake with your body visible.',
        );
        await tester.pumpWidget(app());
        await tester.pump(const Duration(milliseconds: 100));
        expect(
          find.text('Please retake with your body visible.'),
          findsOneWidget,
        );
        expect(find.byKey(const Key('upload-model-photo')), findsOneWidget);
        expect(find.byKey(const Key('take-garment-photo')), findsNothing);
        expect(find.byKey(const Key('browse-catalog')), findsNothing);
        expect(find.byType(SelfxSuccessIconPulse), findsNothing);
        expect(tester.takeException(), isNull);

        capture.imageUsabilityResult = const ImageUsabilityResult.usable(
          'Photo accepted',
        );
        await tester.pumpWidget(app());
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.text('You’re Ready!'), findsOneWidget);
        expect(
          find.text('Now, show the garment to the camera.'),
          findsOneWidget,
        );
        expect(find.byType(SelfxSuccessIconPulse), findsOneWidget);
        expect(find.byType(SelfxActionPulse), findsOneWidget);
        final pulseFinder = find.descendant(
          of: find.byType(SelfxSuccessIconPulse),
          matching: find.byType(ScaleTransition),
        );
        final scale = tester.widget<ScaleTransition>(pulseFinder).scale.value;
        await tester.pump(const Duration(milliseconds: 200));
        expect(
          tester.widget<ScaleTransition>(pulseFinder).scale.value,
          isNot(scale),
        );
        final catalog = tester.widget<SelfxKioskActionCard>(
          find.byKey(const Key('browse-catalog')),
        );
        final retake = tester.widget<SelfxKioskActionCard>(
          find.byKey(const Key('retake-photo')),
        );
        expect(catalog.borderColor, SelfxKioskTokens.primary);
        expect(retake.borderColor, SelfxKioskTokens.homeGold);
        await tester.ensureVisible(find.byKey(const Key('retake-photo')));
        await tester.pump(const Duration(milliseconds: 100));
        expect(
          find.byKey(const Key('retake-photo')).hitTestable(),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets(
    'selected catalog garment keeps Continue and its next-step message',
    (tester) async {
      final capture = fixtures.testController();
      final tryOn = KioskTryOnSessionController(
        gateway: fixtures.FakeKioskTryOnGateway(),
      );
      final uploads = fixtures.testUploadController(capture.captureStore);
      addTearDown(() {
        uploads.dispose();
        tryOn.dispose();
        capture.dispose();
      });
      await capture.capturePhoto();
      tryOn.selectGarment(
        fixtures
            .testCatalogProduct(id: 'top-1', name: 'Blue top')
            .toGarmentInput(),
      );
      await tester.pumpWidget(
        MaterialApp(
          theme: buildSelfxKioskTheme(),
          home: CaptureReviewScreen(
            controller: capture,
            tryOnController: tryOn,
            uploadController: uploads,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 200));
      expect(
        find.text('Your photo is ready for this garment.'),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('continue-selected-product-try-on')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('take-garment-photo')), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
