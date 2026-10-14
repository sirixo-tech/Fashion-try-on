import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/ui/generated_try_on_image.dart';
import 'package:selfx_kiosk/src/ui/my_looks_screen.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_button.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;

const _result = KioskTryOnResult(
  run: KioskTryOnRun(id: 'run-0', status: KioskTryOnStatus.succeeded),
  generatedImage: 'current-result',
);

void main() {
  for (final size in [
    const Size(320, 568),
    const Size(630, 1365),
    const Size(900, 1600),
    const Size(1280, 720),
    const Size(800, 480),
  ]) {
    testWidgets('bottom sheet keeps gallery and footer accessible at $size', (
      tester,
    ) async {
      final h = await _open(tester, size: size);
      expect(find.byKey(const Key('my-looks-bottom-sheet')), findsOneWidget);
      expect(find.text('Result fixture'), findsOneWidget);
      expect(find.text('My Looks'), findsOneWidget);
      final sheet = tester.getRect(find.byType(BottomSheet));
      expect(sheet.bottom, closeTo(size.height, 1));
      expect(sheet.top, greaterThan(0));
      for (final key in [
        'close-my-looks',
        'download-my-looks',
        'buy-this-look',
      ]) {
        expect(find.byKey(Key(key)).hitTestable(), findsOneWidget);
      }
      expect(
        tester
            .widget<SelfxKioskButton>(find.byKey(const Key('buy-this-look')))
            .onPressed,
        isNull,
      );
      final download = tester.widget<SelfxKioskButton>(
        find.byKey(const Key('download-my-looks')),
      );
      expect(download.backgroundColor, SelfxKioskTokens.primary);
      expect(download.onPressed, isNotNull);
      expect(
        find.byKey(const Key('download-my-looks-countdown')),
        findsOneWidget,
      );
      await tester.ensureVisible(
        find.byKey(const ValueKey('my-looks-thumbnail-look-5')),
      );
      await tester.tap(find.byKey(const ValueKey('my-looks-thumbnail-look-5')));
      await tester.pump();
      final preview = tester.widget<GeneratedTryOnImage>(
        find.byKey(const Key('my-looks-selected-preview')),
      );
      expect(preview.src, h.session.looks[5].resultReadUrl);
      expect(preview.fit, BoxFit.contain);
      final tile = tester.widget<Material>(
        find.byKey(const ValueKey('my-looks-thumbnail-look-5')),
      );
      expect(
        (tile.shape as RoundedRectangleBorder).side.color,
        SelfxKioskTokens.primary,
      );
      final photo = h.capture.activeAcceptedPersonPhoto;
      final id = h.session.activeSessionId;
      await tester.tap(find.byKey(const Key('close-my-looks')));
      await _frames(tester);
      expect(find.byKey(const Key('my-looks-bottom-sheet')), findsNothing);
      expect(h.session.result, same(_result));
      expect(h.capture.activeAcceptedPersonPhoto, same(photo));
      expect(h.session.activeSessionId, id);
      expect(h.session.garmentPicks, hasLength(1));
      expect(h.gateway.completedSessionIds, isEmpty);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets(
    'Download My Looks keeps session-wide QR and returns to the sheet',
    (tester) async {
      final h = await _open(tester);
      await tester.tap(find.byKey(const Key('download-my-looks')));
      await _frames(tester);
      expect(find.byKey(const Key('download-my-looks-qr')), findsOneWidget);
      expect(h.gateway.shares, 1);
      expect(h.gateway.sharedSessionId, h.session.activeSessionId);
      await tester.tap(find.byKey(const Key('done-download-my-looks')));
      await _frames(tester);
      expect(find.byKey(const Key('my-looks-bottom-sheet')), findsOneWidget);
      expect(find.byKey(const Key('download-my-looks-qr')), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('failed QR creation retries without closing the sheet', (
    tester,
  ) async {
    final gateway = _Gateway()..failShare = true;
    final h = await _open(tester, gateway: gateway);
    await tester.tap(find.byKey(const Key('download-my-looks')));
    await _frames(tester);
    expect(find.byKey(const Key('retry-download-my-looks')), findsOneWidget);
    await tester.tap(find.byKey(const Key('retry-download-my-looks')));
    await _frames(tester);
    expect(find.byKey(const Key('download-my-looks-qr')), findsOneWidget);
    expect(h.gateway.shares, 2);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('closing while share is being created prevents a late QR popup', (
    tester,
  ) async {
    final gateway = _Gateway()..pendingShare = Completer<KioskTryOnShare>();
    await _open(tester, gateway: gateway);
    await tester.tap(find.byKey(const Key('download-my-looks')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('close-my-looks')));
    await _frames(tester);
    gateway.pendingShare!.complete(
      KioskTryOnShare(
        shareUrl: 'https://try.selfx.test/looks/capability',
        expiresAt: DateTime.now().add(const Duration(minutes: 5)),
      ),
    );
    await _frames(tester);
    expect(find.byKey(const Key('my-looks-bottom-sheet')), findsNothing);
    expect(find.byKey(const Key('download-my-looks-qr')), findsNothing);
    expect(find.text('Result fixture'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final back in [true, false]) {
    testWidgets(
      '${back ? 'system Back' : 'dimming layer'} closes only the sheet',
      (tester) async {
        final h = await _open(tester);
        if (back) {
          await tester.binding.handlePopRoute();
        } else {
          await tester.tapAt(const Offset(5, 5));
        }
        await _frames(tester);
        expect(find.byKey(const Key('my-looks-bottom-sheet')), findsNothing);
        expect(h.session.customerSessionActive, isTrue);
        expect(h.session.result, same(_result));
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets('empty looks preserve current preview and disable download', (
    tester,
  ) async {
    await _open(tester, gateway: _Gateway(count: 0));
    expect(find.text('No downloadable looks yet.'), findsOneWidget);
    expect(
      tester
          .widget<SelfxKioskButton>(find.byKey(const Key('download-my-looks')))
          .onPressed,
      isNull,
    );
    expect(
      tester
          .widget<GeneratedTryOnImage>(
            find.byKey(const Key('my-looks-selected-preview')),
          )
          .src,
      _result.generatedImage,
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

Future<_Harness> _open(
  WidgetTester tester, {
  Size size = const Size(630, 1365),
  _Gateway? gateway,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final capture = fixtures.testController();
  final api = gateway ?? _Gateway();
  final session = KioskTryOnSessionController(gateway: api);
  final uploads = fixtures.testUploadController(capture.captureStore);
  addTearDown(capture.dispose);
  addTearDown(session.dispose);
  addTearDown(uploads.dispose);
  await capture.capturePhoto();
  await capture.usePhoto();
  await session.beginCustomerSession();
  session.toggleCatalogProductPick(
    fixtures.testCatalogProduct(id: 'product-0', name: 'Selected garment'),
  );
  session.result = _result;
  await tester.pumpWidget(
    MaterialApp(
      theme: buildSelfxKioskTheme(),
      home: Scaffold(
        body: Builder(
          builder: (context) => Column(
            children: [
              const Text('Result fixture'),
              TextButton(
                onPressed: () => showMyLooksBottomSheet(
                  context: context,
                  captureController: capture,
                  tryOnController: session,
                  uploadController: uploads,
                ),
                child: const Text('Get My Looks'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Get My Looks'));
  await _frames(tester);
  return _Harness(capture, session, api);
}

Future<void> _frames(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 150));
  }
}

class _Harness {
  _Harness(this.capture, this.session, this.gateway);
  final CaptureSessionController capture;
  final KioskTryOnSessionController session;
  final _Gateway gateway;
}

class _Gateway extends fixtures.FakeKioskTryOnGateway {
  _Gateway({this.count = 6});
  final int count;
  int shares = 0;
  bool failShare = false;
  String? sharedSessionId;
  Completer<KioskTryOnShare>? pendingShare;
  @override
  Future<List<KioskTryOnLook>> getSessionLooks(String sessionId) async => [
    for (var i = 0; i < count; i++)
      KioskTryOnLook(
        lookId: 'look-$i',
        runId: 'run-$i',
        personAssetId: 'person',
        productId: 'product-$i',
        resultAssetId: 'result-$i',
        resultReadUrl: 'https://example.test/result-$i.png',
        createdAt: DateTime.now(),
        expiresAt: DateTime.now().add(const Duration(days: 7)),
      ),
  ];
  @override
  Future<KioskTryOnShare> createSessionShare(String sessionId) async {
    shares++;
    sharedSessionId = sessionId;
    if (failShare) {
      failShare = false;
      throw StateError('Temporary share failure');
    }
    if (pendingShare != null) return pendingShare!.future;
    return super.createSessionShare(sessionId);
  }
}
