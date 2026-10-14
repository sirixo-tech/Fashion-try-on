import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/ui/generated_try_on_image.dart';
import 'package:selfx_kiosk/src/ui/garment_result_catalog.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_button.dart';
import 'package:selfx_kiosk/src/ui/try_on_result_screen.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;

const _oldResult = KioskTryOnResult(
  run: KioskTryOnRun(id: 'old-run', status: KioskTryOnStatus.succeeded),
  generatedImage: 'old-successful-preview',
);
const _newResult = KioskTryOnResult(
  run: KioskTryOnRun(id: 'new-run', status: KioskTryOnStatus.succeeded),
  generatedImage: 'new-successful-preview',
);

void main() {
  test('late Home completion cannot clear a newer customer session', () async {
    final capture = fixtures.testController();
    final gateway = _DelayedCompletionGateway();
    final session = KioskTryOnSessionController(gateway: gateway);
    addTearDown(capture.dispose);
    addTearDown(session.dispose);
    await capture.capturePhoto();
    await capture.usePhoto();
    await session.beginCustomerSession();
    session.result = _oldResult;
    final finishing = session.finish(capture);
    await session.beginCustomerSession();
    final newRevision = session.customerSessionRevision;
    session.result = _newResult;
    session.currentPersonAssetId = 'new-person';
    final accepted = capture.activeAcceptedPersonPhoto;
    gateway.pending.complete();
    await finishing;
    expect(session.customerSessionRevision, newRevision);
    expect(session.customerSessionActive, isTrue);
    expect(session.activeSessionId, isNotNull);
    expect(session.currentPersonAssetId, 'new-person');
    expect(session.result, same(_newResult));
    expect(capture.activeAcceptedPersonPhoto, same(accepted));
  });
  testWidgets(
    'catalog return preserves preview and all actions across attempts',
    (tester) async {
      final harness = await _open(tester);
      final accepted = harness.capture.activeAcceptedPersonPhoto;
      for (final status in [
        KioskTryOnStatus.failed,
        KioskTryOnStatus.cancelled,
        KioskTryOnStatus.timedOut,
      ]) {
        harness.session.attemptStatus = status;
        harness.session.clearGarmentPicks();
        await _tap(tester, 'result-show-all');
        await _tap(tester, 'catalog-product-new');
        await _tap(tester, 'continue-selected-product');
        expect(harness.session.result, isNull);
        await _tap(tester, 'generation-back');
        await _tap(tester, 'catalog-back');
        _expectPreview(tester, _oldResult);
        _expectActions(tester);
        expect(harness.capture.activeAcceptedPersonPhoto, same(accepted));
        await _tap(tester, 'get-my-looks');
        final fallback = tester.widget<GeneratedTryOnImage>(
          find.byKey(const Key('my-looks-selected-preview')),
        );
        expect(fallback.src, _oldResult.generatedImage);
        await _tap(tester, 'close-my-looks');
        _expectActions(tester);
      }
      expect(harness.session.submissions, 3);
      await _tap(tester, 'finish-try-on');
      expect(find.text('Home fixture'), findsOneWidget);
      expect(harness.capture.activeAcceptedPersonPhoto, isNull);
      expect(harness.session.result, isNull);
    },
  );

  testWidgets(
    'direct Continue returns to the successful preview after failure',
    (tester) async {
      final harness = await _open(tester);
      for (var i = 0; i < 2; i++) {
        await _tap(tester, 'result-product-new');
        final continueButton = tester.widget<SelfxKioskButton>(
          find.byKey(const Key('result-continue')),
        );
        continueButton.onPressed!();
        continueButton.onPressed!();
        await _frames(tester);
        expect(harness.session.submissions, i + 1);
        await _tap(tester, 'generation-back');
        _expectPreview(tester, _oldResult);
        expect(
          tester
              .widget<TextButton>(find.byKey(const Key('result-back')))
              .onPressed,
          isNotNull,
        );
        final restored = tester.widget<SelfxKioskButton>(
          find.byKey(const Key('result-continue')),
        );
        expect(restored.onPressed, isNotNull);
        // Deselect restores download and home actions.
        await _tap(tester, 'result-product-new');
        _expectActions(tester);
      }
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('a new success replaces the preserved result on return', (
    tester,
  ) async {
    final harness = await _open(tester);
    await _tap(tester, 'result-show-all');
    harness.session.selectGarment(
      fixtures.testCatalogProduct(id: 'new', name: 'New').toGarmentInput(),
    );
    harness.session.result = _newResult;
    harness.session.status = KioskTryOnStatus.succeeded;
    harness.session.notifyListeners();
    await _tap(tester, 'catalog-back');
    _expectPreview(tester, _newResult);
    _expectActions(tester);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'ending or replacing a session removes preview and rejects old actions',
    (tester) async {
      final harness = await _open(tester);
      final download = tester
          .widget<SelfxKioskButton>(find.byKey(const Key('get-my-looks')))
          .onPressed!;
      harness.session.endCustomerSession();
      await _frames(tester);
      expect(find.byType(GeneratedTryOnImage), findsNothing);
      expect(find.text('Try-On result unavailable.'), findsOneWidget);
      await harness.session.beginCustomerSession();
      harness.session.result = _newResult;
      harness.session.notifyListeners();
      await _frames(tester);
      expect(find.byType(GeneratedTryOnImage), findsNothing);
      download();
      await _frames(tester);
      expect(find.byKey(const Key('my-looks-bottom-sheet')), findsNothing);
      expect(harness.session.result, same(_newResult));
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('ending a session clears the bottom-sheet fallback immediately', (
    tester,
  ) async {
    final harness = await _open(tester);
    harness.session.selectGarment(
      fixtures.testCatalogProduct(id: 'new', name: 'New').toGarmentInput(),
    );
    await _frames(tester);
    await _tap(tester, 'get-my-looks');
    expect(find.byType(GeneratedTryOnImage), findsWidgets);
    harness.session.endCustomerSession();
    await _frames(tester);
    expect(find.byType(GeneratedTryOnImage), findsNothing);
    expect(
      tester
          .widget<SelfxKioskButton>(find.byKey(const Key('download-my-looks')))
          .onPressed,
      isNull,
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Back and Home remain usable during a pending action', (
    tester,
  ) async {
    _viewport(tester);
    final pending = Completer<void>();
    var backs = 0;
    var homes = 0;
    await tester.pumpWidget(
      MaterialApp(
        theme: buildSelfxKioskTheme(),
        home: Scaffold(
          body: GarmentResultCatalog(
            catalog: const fixtures.FakeKioskCatalogGateway(products: []),
            image: const SizedBox(),
            isCurrent: () => true,
            sessionIdentity: 1,
            onContinue: (_) async {},
            onContinueNextPick: () async {},
            onShowAll: () => pending.future,
            onGetMyLooks: () async {},
            onBack: () => backs++,
            onRetake: () async {},
            onFinish: () async {
              homes++;
            },
            downloadEnabled: true,
          ),
        ),
      ),
    );
    await _frames(tester);
    await _tap(tester, 'result-show-all');
    await _tap(tester, 'result-back');
    await _tap(tester, 'finish-try-on');
    expect(backs, 1);
    expect(homes, 1);
    pending.completeError(StateError('Action failed'));
    await _frames(tester);
    expect(
      tester
          .widget<SelfxKioskButton>(find.byKey(const Key('get-my-looks')))
          .onPressed,
      isNotNull,
    );
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

void _expectPreview(WidgetTester tester, KioskTryOnResult result) {
  expect(
    tester.widget<GeneratedTryOnImage>(find.byType(GeneratedTryOnImage)).src,
    result.generatedImage,
  );
  expect(tester.takeException(), isNull);
}

void _expectActions(WidgetTester tester) {
  expect(
    tester.widget<TextButton>(find.byKey(const Key('result-back'))).onPressed,
    isNotNull,
  );
  for (final key in ['get-my-looks', 'finish-try-on']) {
    expect(
      tester.widget<SelfxKioskButton>(find.byKey(Key(key))).onPressed,
      isNotNull,
    );
  }
  expect(
    tester
        .widget<TextButton>(find.byKey(const Key('result-show-all')))
        .onPressed,
    isNotNull,
  );
}

Future<void> _tap(WidgetTester tester, String key) async {
  final finder = find.byKey(Key(key));
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await _frames(tester);
}

Future<void> _frames(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

void _viewport(WidgetTester tester) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(630, 1365);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<_Harness> _open(WidgetTester tester) async {
  _viewport(tester);
  final capture = fixtures.testController();
  final session = _AttemptSession();
  final uploads = fixtures.testUploadController(capture.captureStore);
  addTearDown(capture.dispose);
  addTearDown(session.dispose);
  addTearDown(uploads.dispose);
  await capture.capturePhoto();
  await capture.usePhoto();
  await session.beginCustomerSession();
  session.result = _oldResult;
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
        catalogGateway: fixtures.FakeKioskCatalogGateway(
          products: [
            fixtures.testCatalogProduct(id: 'new', name: 'New garment'),
          ],
        ),
      ),
    ),
  );
  await _frames(tester);
  return _Harness(capture, session);
}

class _Harness {
  _Harness(this.capture, this.session);
  final CaptureSessionController capture;
  final _AttemptSession session;
}

class _AttemptSession extends KioskTryOnSessionController {
  _AttemptSession() : super(gateway: fixtures.FakeKioskTryOnGateway());
  int submissions = 0;
  KioskTryOnStatus attemptStatus = KioskTryOnStatus.failed;
  @override
  Future<void> submitFromCapture(CaptureSessionController capture) async {
    submissions++;
    status = attemptStatus;
    customerMessage = 'This attempt did not complete.';
    notifyListeners();
  }
}

class _DelayedCompletionGateway extends fixtures.FakeKioskTryOnGateway {
  final pending = Completer<void>();
  @override
  Future<KioskTryOnSession> completeTryOnSession(
    String sessionId, {
    KioskTryOnSessionCompletionReason reason =
        KioskTryOnSessionCompletionReason.finished,
  }) async {
    await pending.future;
    return super.completeTryOnSession(sessionId, reason: reason);
  }
}
