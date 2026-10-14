import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_action_card.dart';
import 'package:selfx_kiosk/src/ui/selfx_logo.dart';
import 'package:selfx_kiosk/src/ui/try_on_failure_presentation.dart';
import 'package:selfx_kiosk/src/ui/try_on_generation_screen.dart';
import 'package:selfx_kiosk/src/ui/kiosk_attention_animations.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;

void main() {
  for (final size in [
    const Size(320, 568),
    const Size(630, 1365),
    const Size(900, 1600),
    const Size(1280, 720),
    const Size(800, 480),
  ]) {
    testWidgets('branded failure and recovery controls fit at $size', (
      tester,
    ) async {
      _viewport(tester, size);
      final session = _FailedSession();
      await _open(tester, session);
      expect(find.byType(SelfxLogo), findsOneWidget);
      expect(find.text('Try-On Unavailable'), findsOneWidget);
      expect(
        find.text('The connection is unavailable. Please try again.'),
        findsOneWidget,
      );
      expect(find.textContaining('clear photo'), findsNothing);
      final illustration = tester.widget<Image>(
        find.byKey(const Key('try-on-failure-illustration')),
      );
      expect(
        illustration.image,
        const AssetImage(tryOnFailureIllustrationAsset),
      );
      expect(illustration.fit, BoxFit.contain);
      final back = find.byKey(const Key('generation-back'));
      expect(
        find.descendant(of: back, matching: find.text('Back')),
        findsOneWidget,
      );
      expect(
        tester.getRect(back).right,
        lessThanOrEqualTo(tester.getRect(find.byType(SelfxLogo)).left),
      );
      final retry = _card(tester, 'try-on-retry-polling');
      expect(retry.backgroundColor, SelfxKioskTokens.primary);
      expect(retry.titleColor, Colors.white);
      expect(
        _card(tester, 'try-on-retake-photo').backgroundColor,
        const Color(0xFFF0F7FF),
      );
      expect(
        _card(tester, 'try-on-choose-garment').backgroundColor,
        const Color(0xFFFFF2E7),
      );
      for (final key in [
        'try-on-retry-polling',
        'try-on-retake-photo',
        'try-on-choose-garment',
      ]) {
        final action = find.byKey(Key(key));
        await tester.ensureVisible(action);
        expect(action.hitTestable(), findsOneWidget);
      }
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('retry polls an existing run without submitting another run', (
    tester,
  ) async {
    _viewport(tester, const Size(630, 1365));
    final session = _FailedSession()
      ..status = KioskTryOnStatus.timedOut
      ..run = const KioskTryOnRun(
        id: 'existing',
        status: KioskTryOnStatus.processing,
      );
    await _open(tester, session);
    await tester.ensureVisible(find.byKey(const Key('try-on-retry-polling')));
    await tester.tap(find.byKey(const Key('try-on-retry-polling')));
    expect(session.submissions, 1); // Existing screen initialization only.
    expect(session.pollRetries, 1);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('specific failure titles and resolution actions are preserved', (
    tester,
  ) async {
    _viewport(tester, const Size(630, 1365));
    final session = _FailedSession()
      ..failureCode = KioskTryOnFailureCode.garmentIntentUnresolved
      ..customerTitle = 'Retake garment photo'
      ..customerMessage = 'Retake the garment photo or choose from catalog.';
    await _open(tester, session);
    expect(find.text('Retake garment photo'), findsOneWidget);
    expect(
      find.byKey(const Key('try-on-retake-garment-photo')),
      findsOneWidget,
    );
    expect(find.byKey(const Key('try-on-browse-catalog')), findsOneWidget);
    expect(find.byKey(const Key('try-on-retry-polling')), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'compatibility and jewellery recovery keep the correct controls',
    (tester) async {
      _viewport(tester, const Size(630, 1365));
      final session = _FailedSession()
        ..activeTryOnVertical = KioskTryOnVertical.jewellery
        ..failureCode = KioskTryOnFailureCode.modelImageIncompatibleWithGarment
        ..customerTitle = 'Update your photo';
      await _open(tester, session);
      expect(find.byKey(const Key('try-on-update-photo')), findsOneWidget);
      final update = _card(tester, 'try-on-update-photo');
      expect(update.backgroundColor, SelfxKioskTokens.primary);
      expect(update.titleColor, Colors.white);
      expect(update.subtitleColor, Colors.white);
      expect(
        find.descendant(
          of: find.byKey(const Key('try-on-update-photo')),
          matching: find.byType(SelfxActionPulse),
        ),
        findsOneWidget,
      );
      final alternative = _card(tester, 'try-on-choose-garment');
      expect(alternative.backgroundColor, Colors.white);
      expect(alternative.borderColor, SelfxKioskTokens.borderStrong);
      expect(
        find.descendant(
          of: find.byKey(const Key('try-on-choose-garment')),
          matching: find.byType(SelfxActionPulse),
        ),
        findsNothing,
      );
      expect(find.text('Choose Another Jewellery Item'), findsOneWidget);
      expect(find.text('Choose Another Garment'), findsNothing);
      expect(find.byKey(const Key('try-on-retry-polling')), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'Back returns to the preceding screen without finishing session',
    (tester) async {
      _viewport(tester, const Size(630, 1365));
      final capture = fixtures.testController();
      final session = _FailedSession();
      final uploads = fixtures.testUploadController(capture.captureStore);
      addTearDown(capture.dispose);
      addTearDown(session.dispose);
      addTearDown(uploads.dispose);
      final navigator = GlobalKey<NavigatorState>();
      await tester.pumpWidget(
        MaterialApp(
          navigatorKey: navigator,
          theme: buildSelfxKioskTheme(),
          home: const Scaffold(body: Text('Previous screen')),
        ),
      );
      navigator.currentState!.push(
        MaterialPageRoute<void>(
          builder: (_) => TryOnGenerationScreen(
            captureController: capture,
            tryOnController: session,
            uploadController: uploads,
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.tap(find.byKey(const Key('generation-back')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.text('Previous screen'), findsOneWidget);
      expect(session.status, KioskTryOnStatus.failed);
      expect(tester.takeException(), isNull);
    },
  );
}

SelfxKioskActionCard _card(WidgetTester tester, String key) =>
    tester.widget<SelfxKioskActionCard>(
      find.descendant(
        of: find.byKey(Key(key)),
        matching: find.byType(SelfxKioskActionCard),
      ),
    );

Future<void> _open(WidgetTester tester, _FailedSession session) async {
  final capture = fixtures.testController();
  final uploads = fixtures.testUploadController(capture.captureStore);
  addTearDown(capture.dispose);
  addTearDown(session.dispose);
  addTearDown(uploads.dispose);
  await tester.pumpWidget(
    MaterialApp(
      theme: buildSelfxKioskTheme(),
      home: TryOnGenerationScreen(
        captureController: capture,
        tryOnController: session,
        uploadController: uploads,
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 700));
}

void _viewport(WidgetTester tester, Size size) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

class _FailedSession extends KioskTryOnSessionController {
  _FailedSession() : super(gateway: fixtures.FakeKioskTryOnGateway()) {
    status = KioskTryOnStatus.failed;
    customerMessage = 'The connection is unavailable. Please try again.';
  }

  int submissions = 0;
  int pollRetries = 0;

  @override
  Future<void> submitFromCapture(CaptureSessionController capture) async {
    submissions++;
  }

  @override
  Future<void> retryPolling() async {
    pollRetries++;
  }
}
