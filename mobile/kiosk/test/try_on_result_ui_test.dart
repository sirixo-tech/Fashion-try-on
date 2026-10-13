import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/ui/generated_try_on_image.dart';
import 'package:selfx_kiosk/src/ui/my_looks_screen.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_button.dart';
import 'package:selfx_kiosk/src/ui/selfx_logo.dart';
import 'package:selfx_kiosk/src/ui/try_on_result_screen.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;

const _result = KioskTryOnResult(
  run: KioskTryOnRun(id: 'result-ui', status: KioskTryOnStatus.succeeded),
  generatedImage:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
);

void main() {
  for (final size in [
    const Size(320, 568),
    const Size(630, 1365),
    const Size(900, 1600),
    const Size(1280, 720),
    const Size(800, 480),
  ]) {
    testWidgets(
      'result image fills card and named actions keep colors at $size',
      (tester) async {
        _viewport(tester, size);
        final capture = fixtures.testController();
        final session = KioskTryOnSessionController(
          gateway: fixtures.FakeKioskTryOnGateway(),
        )..result = _result;
        final uploads = fixtures.testUploadController(capture.captureStore);
        addTearDown(capture.dispose);
        addTearDown(session.dispose);
        addTearDown(uploads.dispose);
        await tester.pumpWidget(
          MaterialApp(
            theme: buildSelfxKioskTheme(),
            home: TryOnResultScreen(
              captureController: capture,
              tryOnController: session,
              uploadController: uploads,
              catalogGateway: fixtures.FakeKioskCatalogGateway(
                products: [
                  fixtures.testCatalogProduct(
                    id: 'layout-item',
                    name: 'Test garment',
                  ),
                ],
              ),
            ),
          ),
        );
        await _frames(tester);
        expect(find.byType(SelfxLogo), findsOneWidget);
        expect(find.text('Your Look'), findsNothing);
        expect(find.byKey(const Key('result-categories')), findsOneWidget);
        expect(find.byKey(const Key('result-garments')), findsOneWidget);
        expect(
          find.byKey(const Key('result-back')).hitTestable(),
          findsOneWidget,
        );
        final image = tester.widget<GeneratedTryOnImage>(
          find.byType(GeneratedTryOnImage),
        );
        expect(image.fit, BoxFit.cover);
        expect(
          tester.getRect(find.byType(GeneratedTryOnImage)),
          tester.getRect(find.byKey(const Key('result-image-card'))),
        );
        final looks = tester.widget<SelfxKioskButton>(
          find.byKey(const Key('get-my-looks')),
        );
        expect(looks.label, 'Get My Looks');
        expect(looks.backgroundColor, const Color(0xFFFFFCF8));
        expect(looks.foregroundColor, const Color(0xFFE86610));
        expect(find.byKey(const Key('result-continue')), findsNothing);
        expect(find.text('Back to Home'), findsOneWidget);
        for (final key in [
          'get-my-looks',
          'result-retake-photo',
          'finish-try-on',
          'result-show-all',
        ]) {
          await tester.ensureVisible(find.byKey(Key(key)));
          expect(find.byKey(Key(key)).hitTestable(), findsOneWidget);
        }
        final product = find.byKey(
          const ValueKey('result-product-layout-item'),
        );
        await tester.ensureVisible(product);
        await tester.tap(product);
        await tester.pump();
        final next = find.byKey(const Key('result-continue'));
        await tester.ensureVisible(next);
        expect(next.hitTestable(), findsOneWidget);
        expect(find.byKey(const Key('finish-try-on')), findsNothing);
        expect(find.byKey(const Key('get-my-looks')), findsNothing);
        expect(session.result, same(_result));
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets('Get My Looks retains gallery navigation, photo and session', (
    tester,
  ) async {
    _viewport(tester, const Size(630, 1365));
    final capture = fixtures.testController();
    final session = KioskTryOnSessionController(
      gateway: fixtures.FakeKioskTryOnGateway(),
    );
    final uploads = fixtures.testUploadController(capture.captureStore);
    addTearDown(capture.dispose);
    addTearDown(session.dispose);
    addTearDown(uploads.dispose);
    await capture.capturePhoto();
    await capture.usePhoto();
    await session.beginCustomerSession();
    session.result = _result;
    final accepted = capture.activeAcceptedPersonPhoto;
    final sessionId = session.activeSessionId;
    await tester.pumpWidget(
      MaterialApp(
        theme: buildSelfxKioskTheme(),
        home: TryOnResultScreen(
          captureController: capture,
          tryOnController: session,
          uploadController: uploads,
        ),
      ),
    );
    await tester.ensureVisible(find.byKey(const Key('get-my-looks')));
    await tester.tap(find.byKey(const Key('get-my-looks')));
    await _frames(tester);
    expect(find.byType(MyLooksScreen), findsOneWidget);
    expect(session.activeSessionId, sessionId);
    expect(capture.activeAcceptedPersonPhoto, same(accepted));
    expect(session.result, same(_result));
    await tester.pumpWidget(const SizedBox.shrink());
    expect(tester.takeException(), isNull);
  });

  testWidgets('Back to Home finishes and clears person, picks and result', (
    tester,
  ) async {
    _viewport(tester, const Size(630, 1365));
    final capture = fixtures.testController();
    final gateway = fixtures.FakeKioskTryOnGateway();
    final session = KioskTryOnSessionController(gateway: gateway);
    final uploads = fixtures.testUploadController(capture.captureStore);
    addTearDown(capture.dispose);
    addTearDown(session.dispose);
    addTearDown(uploads.dispose);
    await capture.capturePhoto();
    await capture.usePhoto();
    await session.beginCustomerSession();
    session.toggleCatalogProductPick(
      fixtures.testCatalogProduct(id: 'pick', name: 'Test pick'),
    );
    session.result = _result;
    final navigator = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: navigator,
        theme: buildSelfxKioskTheme(),
        home: const Scaffold(body: Text('Home fixture')),
      ),
    );
    navigator.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) => TryOnResultScreen(
          captureController: capture,
          tryOnController: session,
          uploadController: uploads,
        ),
      ),
    );
    await _frames(tester);
    await tester.ensureVisible(find.byKey(const Key('finish-try-on')));
    await tester.tap(find.byKey(const Key('finish-try-on')));
    await _frames(tester);
    expect(find.text('Home fixture'), findsOneWidget);
    expect(session.garmentPicks, isEmpty);
    expect(session.result, isNull);
    expect(session.customerSessionActive, isFalse);
    expect(capture.activeAcceptedPersonPhoto, isNull);
    expect(gateway.completedSessionIds, hasLength(1));
    await tester.pumpWidget(const SizedBox.shrink());
    expect(tester.takeException(), isNull);
  });

  testWidgets('disabled download and queued-pick behavior remain available', (
    tester,
  ) async {
    _viewport(tester, const Size(630, 1365));
    final capture = fixtures.testController();
    final session = KioskTryOnSessionController(
      gateway: fixtures.FakeKioskTryOnGateway(),
    );
    final uploads = fixtures.testUploadController(capture.captureStore);
    addTearDown(capture.dispose);
    addTearDown(session.dispose);
    addTearDown(uploads.dispose);
    session.applySaveMyLooksQrEnabled(false);
    session.toggleCatalogProductPick(
      fixtures.testCatalogProduct(id: 'one', name: 'First pick'),
    );
    session.toggleCatalogProductPick(
      fixtures.testCatalogProduct(id: 'two', name: 'Second pick'),
    );
    session.selectFirstGarmentPick();
    session.result = _result;
    await tester.pumpWidget(
      MaterialApp(
        theme: buildSelfxKioskTheme(),
        home: TryOnResultScreen(
          captureController: capture,
          tryOnController: session,
          uploadController: uploads,
        ),
      ),
    );
    final looks = tester.widget<SelfxKioskButton>(
      find.byKey(const Key('get-my-looks')),
    );
    expect(looks.onPressed, isNull);
    expect(find.text('Try Next Pick'), findsOneWidget);
    expect(find.text('Up next'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

void _viewport(WidgetTester tester, Size size) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> _frames(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}
