import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/tryon/model_garment_compatibility.dart';
import 'package:selfx_kiosk/src/ui/camera_capture_screen.dart';
import 'package:selfx_kiosk/src/ui/capture_review_screen.dart';
import 'package:selfx_kiosk/src/ui/kiosk_attention_animations.dart';
import 'package:selfx_kiosk/src/ui/model_compatibility_guidance_screen.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_action_card.dart';
import 'package:selfx_kiosk/src/ui/selfx_logo.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;

void main() {
  for (final size in [
    const Size(320, 568),
    const Size(630, 1365),
    const Size(900, 1600),
    const Size(1280, 720),
    const Size(800, 480),
  ]) {
    testWidgets('photo-update guidance retains wording and fits at $size', (
      tester,
    ) async {
      _viewport(tester, size);
      final harness = await _open(tester);
      final guidance = guidanceFor(KioskGarmentIntent.fullOutfit);
      expect(find.byType(SelfxLogo), findsOneWidget);
      expect(find.text(guidance.title), findsOneWidget);
      expect(find.text(guidance.message), findsOneWidget);
      expect(
        find.byKey(const Key('try-on-failure-illustration')),
        findsOneWidget,
      );
      final update = find.byKey(const Key('compatibility-update-photo'));
      final secondary = find.byKey(const Key('compatibility-choose-garment'));
      final primaryCard = _card(tester, update);
      expect(primaryCard.label, 'Update My Photo');
      expect(primaryCard.subtitle, 'Capture again');
      expect(primaryCard.backgroundColor, SelfxKioskTokens.primary);
      expect(primaryCard.titleColor, Colors.white);
      expect(primaryCard.subtitleColor, Colors.white);
      expect(_card(tester, secondary).label, 'Try Another Garment');
      expect(_card(tester, secondary).backgroundColor, Colors.white);
      expect(
        _card(tester, secondary).borderColor,
        SelfxKioskTokens.borderStrong,
      );
      expect(
        find.descendant(of: secondary, matching: find.byType(SelfxActionPulse)),
        findsNothing,
      );
      final scale = find.descendant(
        of: update,
        matching: find.byType(Transform),
      );
      final initial = tester.widget<Transform>(scale).transform.entry(0, 0);
      await tester.pump(const Duration(milliseconds: 400));
      expect(
        tester.widget<Transform>(scale).transform.entry(0, 0),
        isNot(initial),
      );
      for (final action in [update, secondary]) {
        await tester.ensureVisible(action);
        expect(action.hitTestable(), findsOneWidget);
      }
      final back = find.byKey(const Key('generation-back'));
      await tester.ensureVisible(back);
      expect(
        find.descendant(of: back, matching: find.text('Back')),
        findsOneWidget,
      );
      await tester.tap(back);
      await _frames(tester);
      expect(find.text('Previous fixture'), findsOneWidget);
      expect(harness.retakes, 0);
      expect(harness.alternatives, 0);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets(
    'Update My Photo keeps the existing retake and camera navigation',
    (tester) async {
      _viewport(tester, const Size(630, 1365));
      final session = await _open(tester);
      final action = find.byKey(const Key('compatibility-update-photo'));
      await tester.ensureVisible(action);
      await tester.tap(action);
      await _frames(tester);
      expect(session.retakes, 1);
      expect(session.alternatives, 0);
      expect(find.byType(CameraCaptureScreen), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('Try Another Garment keeps its review navigation', (
    tester,
  ) async {
    _viewport(tester, const Size(630, 1365));
    final session = await _open(tester);
    final action = find.byKey(const Key('compatibility-choose-garment'));
    await tester.ensureVisible(action);
    await tester.tap(action);
    await _frames(tester);
    expect(session.alternatives, 1);
    expect(session.retakes, 0);
    expect(find.byType(CaptureReviewScreen), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

SelfxKioskActionCard _card(WidgetTester tester, Finder finder) =>
    tester.widget<SelfxKioskActionCard>(
      find.descendant(of: finder, matching: find.byType(SelfxKioskActionCard)),
    );

Future<_Session> _open(WidgetTester tester) async {
  final capture = fixtures.testController();
  final session = _Session();
  final upload = fixtures.testUploadController(capture.captureStore);
  addTearDown(capture.dispose);
  addTearDown(session.dispose);
  addTearDown(upload.dispose);
  await capture.capturePhoto();
  await capture.usePhoto();
  final navigator = GlobalKey<NavigatorState>();
  await tester.pumpWidget(
    MaterialApp(
      navigatorKey: navigator,
      theme: buildSelfxKioskTheme(),
      home: const Scaffold(body: Text('Previous fixture')),
    ),
  );
  navigator.currentState!.push(
    MaterialPageRoute<void>(
      builder: (_) => ModelCompatibilityGuidanceScreen(
        intent: KioskGarmentIntent.fullOutfit,
        captureController: capture,
        tryOnController: session,
        uploadController: upload,
      ),
    ),
  );
  await _frames(tester);
  return session;
}

void _viewport(WidgetTester tester, Size size) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> _frames(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

class _Session extends KioskTryOnSessionController {
  _Session() : super(gateway: fixtures.FakeKioskTryOnGateway());
  int retakes = 0;
  int alternatives = 0;
  @override
  Future<void> retakePhoto(CaptureSessionController capture) async {
    retakes++;
  }

  @override
  void tryAnotherGarment() {
    alternatives++;
  }
}
