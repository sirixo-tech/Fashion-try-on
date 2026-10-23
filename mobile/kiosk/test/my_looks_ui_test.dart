import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/ui/my_looks_screen.dart';
import 'package:selfx_kiosk/src/ui/selfx_logo.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;

void main() {
  testWidgets('website-owned looks keep download and hide native buying', (
    tester,
  ) async {
    _viewport(tester, const Size(630, 1365));
    final capture = fixtures.testController();
    final session = KioskTryOnSessionController(
      gateway: _LooksGateway(count: 1, nativePurchasingAllowed: false),
    );
    final uploads = fixtures.testUploadController(capture.captureStore);
    addTearDown(capture.dispose);
    addTearDown(session.dispose);
    addTearDown(uploads.dispose);
    await session.beginCustomerSession();
    await tester.pumpWidget(
      MaterialApp(
        theme: buildSelfxKioskTheme(),
        home: MyLooksScreen(
          captureController: capture,
          tryOnController: session,
          uploadController: uploads,
        ),
      ),
    );
    await _frames(tester);
    expect(find.byKey(const Key('buy-this-look')), findsNothing);
    expect(find.byKey(const Key('download-my-looks')), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  for (final size in [
    const Size(320, 568),
    const Size(630, 1365),
    const Size(900, 1600),
    const Size(1280, 720),
    const Size(800, 480),
  ]) {
    testWidgets('gallery controls remain accessible at $size', (tester) async {
      _viewport(tester, size);
      final gateway = _LooksGateway(count: 1);
      final capture = fixtures.testController();
      final session = KioskTryOnSessionController(gateway: gateway);
      final uploads = fixtures.testUploadController(capture.captureStore);
      addTearDown(capture.dispose);
      addTearDown(session.dispose);
      addTearDown(uploads.dispose);
      await session.beginCustomerSession();
      await tester.pumpWidget(
        MaterialApp(
          theme: buildSelfxKioskTheme(),
          home: MyLooksScreen(
            captureController: capture,
            tryOnController: session,
            uploadController: uploads,
          ),
        ),
      );
      await _frames(tester);
      expect(find.byType(SelfxLogo), findsOneWidget);
      expect(find.byKey(const Key('my-looks-back')), findsOneWidget);
      expect(find.text('1 of 1'), findsOneWidget);
      for (final tooltip in ['Previous look', 'Next look']) {
        final button = tester.widget<IconButton>(
          find.descendant(
            of: find.byTooltip(tooltip),
            matching: find.byType(IconButton),
          ),
        );
        expect(button.onPressed, isNull);
      }
      for (final key in [
        'download-my-looks',
        'back-to-result',
        'finish-from-my-looks',
      ]) {
        await tester.ensureVisible(find.byKey(Key(key)));
        expect(find.byKey(Key(key)).hitTestable(), findsOneWidget);
      }
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('overlaid arrows change looks and download retains QR handoff', (
    tester,
  ) async {
    _viewport(tester, const Size(630, 1365));
    final gateway = _LooksGateway(count: 3);
    final capture = fixtures.testController();
    final session = KioskTryOnSessionController(gateway: gateway);
    final uploads = fixtures.testUploadController(capture.captureStore);
    addTearDown(capture.dispose);
    addTearDown(session.dispose);
    addTearDown(uploads.dispose);
    await session.beginCustomerSession();
    final sessionId = session.activeSessionId;
    await tester.pumpWidget(
      MaterialApp(
        theme: buildSelfxKioskTheme(),
        home: MyLooksScreen(
          captureController: capture,
          tryOnController: session,
          uploadController: uploads,
        ),
      ),
    );
    await _frames(tester);
    final card = tester.getRect(find.byKey(const Key('my-looks-image-card')));
    final next = tester.getRect(find.byTooltip('Next look'));
    expect(next.center.dy, closeTo(card.center.dy, 1));
    await tester.tap(find.byTooltip('Next look'));
    await _frames(tester);
    expect(find.text('2 of 3'), findsOneWidget);
    await tester.tap(find.byTooltip('Previous look'));
    await _frames(tester);
    expect(find.text('1 of 3'), findsOneWidget);
    await tester.tap(find.byKey(const Key('download-my-looks')));
    await _frames(tester);
    expect(find.byKey(const Key('download-my-looks-qr')), findsOneWidget);
    expect(gateway.shares, 1);
    expect(session.activeSessionId, sessionId);
    await tester.ensureVisible(find.byKey(const Key('select-more-looks')));
    await tester.tap(find.byKey(const Key('select-more-looks')));
    await _frames(tester);
    expect(find.byKey(const Key('download-my-looks-qr')), findsNothing);
    expect(gateway.loads, 1);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final finish in [false, true]) {
    testWidgets(
      finish ? 'Finish clears the session' : 'Back preserves the session',
      (tester) async {
        _viewport(tester, const Size(630, 1365));
        final gateway = _LooksGateway(count: 1);
        final capture = fixtures.testController();
        final session = KioskTryOnSessionController(gateway: gateway);
        final uploads = fixtures.testUploadController(capture.captureStore);
        addTearDown(capture.dispose);
        addTearDown(session.dispose);
        addTearDown(uploads.dispose);
        await capture.capturePhoto();
        await capture.usePhoto();
        await session.beginCustomerSession();
        session.toggleCatalogProductPick(
          fixtures.testCatalogProduct(id: 'pick', name: 'Selected product'),
        );
        final photo = capture.activeAcceptedPersonPhoto;
        final sessionId = session.activeSessionId;
        final navigator = GlobalKey<NavigatorState>();
        await tester.pumpWidget(
          MaterialApp(
            navigatorKey: navigator,
            theme: buildSelfxKioskTheme(),
            home: const Scaffold(body: Text('Result fixture')),
          ),
        );
        navigator.currentState!.push(
          MaterialPageRoute<void>(
            builder: (_) => MyLooksScreen(
              captureController: capture,
              tryOnController: session,
              uploadController: uploads,
            ),
          ),
        );
        await _frames(tester);
        await tester.tap(
          find.byKey(Key(finish ? 'finish-from-my-looks' : 'back-to-result')),
        );
        await _frames(tester);
        expect(find.text('Result fixture'), findsOneWidget);
        if (finish) {
          expect(session.garmentPicks, isEmpty);
          expect(capture.activeAcceptedPersonPhoto, isNull);
          expect(session.customerSessionActive, isFalse);
          expect(gateway.completedSessionIds, [sessionId]);
        } else {
          expect(capture.activeAcceptedPersonPhoto, same(photo));
          expect(session.activeSessionId, sessionId);
          expect(session.garmentPicks, hasLength(1));
          expect(gateway.completedSessionIds, isEmpty);
        }
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
}

class _LooksGateway extends fixtures.FakeKioskTryOnGateway {
  _LooksGateway({required this.count, this.nativePurchasingAllowed = true});
  final int count;
  final bool nativePurchasingAllowed;
  int loads = 0;
  int shares = 0;

  @override
  Future<List<KioskTryOnLook>> getSessionLooks(String sessionId) async {
    loads++;
    final now = DateTime.now();
    return [
      for (var i = 0; i < count; i++)
        KioskTryOnLook(
          nativePurchasingAllowed: nativePurchasingAllowed,
          lookId: 'look-$i',
          runId: 'run-$i',
          personAssetId: 'person',
          resultAssetId: 'result-$i',
          resultReadUrl:
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
          createdAt: now,
          expiresAt: now.add(const Duration(days: 7)),
        ),
    ];
  }

  @override
  Future<KioskTryOnShare> createSessionShare(String sessionId) {
    shares++;
    return super.createSessionShare(sessionId);
  }
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
