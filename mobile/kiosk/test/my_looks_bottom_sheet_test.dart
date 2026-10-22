import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/ui/generated_try_on_image.dart';
import 'package:selfx_kiosk/src/ui/my_looks_screen.dart';
import 'package:selfx_kiosk/src/ui/my_looks_download_sheet.dart';
import 'package:selfx_kiosk/src/ui/selfx_logo.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_button.dart';
import 'package:selfx_kiosk/src/ui/try_on_result_screen.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;

const _result = KioskTryOnResult(
  run: KioskTryOnRun(id: 'run-0', status: KioskTryOnStatus.succeeded),
  generatedImage: 'current-result',
);

void main() {
  for (final count in [2, 3, 4, 5, 6]) {
    testWidgets('$count looks use only the required balanced thumbnail rows', (
      tester,
    ) async {
      await _open(tester, gateway: _Gateway(count: count));
      final surface = tester.getRect(
        find.byKey(const Key('my-looks-modal-surface')),
      );
      final gridFinder = find.byKey(const Key('my-looks-thumbnails'));
      final grid = tester.widget<GridView>(gridFinder);
      final columns = count == 2 || count == 4 ? 2 : 3;
      expect(
        (grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount)
            .crossAxisCount,
        columns,
      );
      final cards = [
        for (var i = 0; i < count; i++)
          tester.getRect(find.byKey(ValueKey('my-looks-thumbnail-look-$i'))),
      ];
      final expectedWidth = (surface.width - 36 - 16) / 3;
      for (final card in cards) {
        expect(card.width, closeTo(expectedWidth, 1));
      }
      expect(cards[0].top, closeTo(cards[1].top, 1));
      if (count == 4) {
        expect(cards[2].top, closeTo(cards[3].top, 1));
        expect(cards[2].top - cards[0].bottom, closeTo(8, 1));
      }
      final gridRect = tester.getRect(gridFinder);
      expect(gridRect.center.dx, closeTo(surface.center.dx, 1));
      final countdown = tester.getRect(
        find
            .ancestor(
              of: find.byKey(const Key('download-my-looks-countdown')),
              matching: find.byType(DecoratedBox),
            )
            .first,
      );
      expect(countdown.top - gridRect.bottom, closeTo(12, 1));
      expect(surface.height, lessThan(1365 * 0.92));
      expect(
        find.byKey(const Key('download-my-looks')).hitTestable(),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('portrait preview rounds the actual image without stretching', (
    tester,
  ) async {
    const imageSrc =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAABQCAYAAABrjzfBAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABsSURBVGhD7c6hAQAgDMCw/f8Hdw6PrUFExFR19sz+bN7wG4OVwcpgZbAyWBmsDFYGK4OVwcpgZbAyWBmsDFYGK4OVwcpgZbAyWBmsDFYGK4OVwcpgZbAyWBmsDFYGK4OVwcpgZbAyWBmsDFYXrXz3YeSh7LYAAAAASUVORK5CYII=';
    await _open(tester, gateway: _Gateway(count: 2, imageSrc: imageSrc));
    final preview = find.byKey(const Key('my-looks-selected-preview'));
    final imageFinder = find.descendant(
      of: preview,
      matching: find.byType(Image),
    );
    final image = tester.widget<Image>(imageFinder);
    await tester.runAsync(() async {
      final stream = image.image.resolve(ImageConfiguration.empty);
      final loaded = Completer<void>();
      final listener = ImageStreamListener((_, _) => loaded.complete());
      stream.addListener(listener);
      await loaded.future;
      stream.removeListener(listener);
    });
    await tester.pump();
    final clip = find.descendant(of: preview, matching: find.byType(ClipRRect));
    expect(
      tester.widget<ClipRRect>(clip).borderRadius,
      BorderRadius.circular(18),
    );
    final imageRect = tester.getRect(imageFinder);
    expect(tester.getRect(clip), imageRect);
    expect(imageRect.width / imageRect.height, closeTo(0.5, 0.001));
    expect(imageRect.width, lessThan(tester.getRect(preview).width));
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
    testWidgets('QR handoff uses one centered stacked popup at $size', (
      tester,
    ) async {
      final h = await _open(tester, size: size);
      await tester.tap(find.byKey(const Key('download-my-looks')));
      await _frames(tester);
      expect(find.byKey(const Key('my-looks-bottom-sheet')), findsNothing);
      expect(find.byKey(const Key('my-looks-modal-surface')), findsOneWidget);
      expect(find.text('Result fixture'), findsOneWidget);
      expect(find.byType(SelfxLogo), findsOneWidget);
      final sheet = tester.getRect(
        find.byKey(const Key('my-looks-modal-surface')),
      );
      expect(sheet.center.dx, closeTo(size.width / 2, 1));
      expect(sheet.center.dy, closeTo(size.height / 2, 1));
      expect(sheet.top, greaterThan(0));
      final qrSheet = tester.widget<MyLooksDownloadSheet>(
        find.byType(MyLooksDownloadSheet),
      );
      expect(qrSheet.share.shareUrl, 'https://try.selfx.test/looks/capability');
      final qrRect = tester.getRect(
        find.byKey(const Key('download-my-looks-qr')),
      );
      expect(qrRect.width, closeTo(qrRect.height, 1));
      expect(qrRect.width, greaterThan(200));
      final instructions = tester.getRect(
        find.byKey(const Key('download-my-looks-instructions')),
      );
      expect(qrRect.bottom, lessThan(instructions.top));
      expect(qrRect.center.dx, closeTo(instructions.center.dx, 1));
      for (final key in ['select-more-looks', 'download-back-to-home']) {
        await tester.ensureVisible(find.byKey(Key(key)));
        expect(find.byKey(Key(key)).hitTestable(), findsOneWidget);
      }
      expect(h.gateway.shares, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });

    testWidgets('bottom sheet keeps gallery and footer accessible at $size', (
      tester,
    ) async {
      final h = await _open(tester, size: size);
      expect(find.byKey(const Key('my-looks-bottom-sheet')), findsOneWidget);
      expect(find.text('Result fixture'), findsOneWidget);
      expect(find.text('My Looks'), findsOneWidget);
      final sheet = tester.getRect(
        find.byKey(const Key('my-looks-modal-surface')),
      );
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
        isNotNull,
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
      await tester.ensureVisible(
        find.byKey(const ValueKey('my-looks-thumbnail-look-5')),
      );
      await tester.tap(find.byKey(const ValueKey('my-looks-thumbnail-look-5')));
      await tester.pump();
      final photo = h.capture.activeAcceptedPersonPhoto;
      await tester.tap(find.byKey(const Key('download-my-looks')));
      await _frames(tester);
      expect(find.byKey(const Key('download-my-looks-qr')), findsOneWidget);
      expect(h.gateway.shares, 1);
      expect(h.gateway.sharedSessionId, h.session.activeSessionId);
      await tester.pump(const Duration(seconds: 10));
      await tester.ensureVisible(find.byKey(const Key('select-more-looks')));
      await tester.tap(find.byKey(const Key('select-more-looks')));
      await _frames(tester);
      expect(find.byKey(const Key('my-looks-bottom-sheet')), findsOneWidget);
      expect(find.byKey(const Key('download-my-looks-qr')), findsNothing);
      expect(
        tester
            .widget<GeneratedTryOnImage>(
              find.byKey(const Key('my-looks-selected-preview')),
            )
            .src,
        h.session.looks[5].resultReadUrl,
      );
      expect(h.capture.activeAcceptedPersonPhoto, same(photo));
      expect(h.session.garmentPicks, hasLength(1));
      await tester.tap(find.byKey(const Key('download-my-looks')));
      await _frames(tester);
      expect(h.gateway.shares, 1);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  for (final home in [false, true]) {
    testWidgets(
      home ? 'QR Home ends the session' : 'QR X preserves the result',
      (tester) async {
        final h = await _open(tester);
        final photo = h.capture.activeAcceptedPersonPhoto;
        final sessionId = h.session.activeSessionId;
        await tester.tap(find.byKey(const Key('download-my-looks')));
        await _frames(tester);
        await tester.ensureVisible(
          find.byKey(
            Key(home ? 'download-back-to-home' : 'close-download-my-looks'),
          ),
        );
        await tester.tap(
          find.byKey(
            Key(home ? 'download-back-to-home' : 'close-download-my-looks'),
          ),
        );
        await _frames(tester);
        expect(find.byKey(const Key('my-looks-modal-surface')), findsNothing);
        expect(find.text('Result fixture'), findsOneWidget);
        if (home) {
          expect(h.session.customerSessionActive, isFalse);
          expect(h.capture.activeAcceptedPersonPhoto, isNull);
          expect(h.session.result, isNull);
          expect(h.session.garmentPicks, isEmpty);
          expect(h.gateway.completedSessionIds, [sessionId]);
        } else {
          expect(h.session.customerSessionActive, isTrue);
          expect(h.capture.activeAcceptedPersonPhoto, same(photo));
          expect(h.session.result, same(_result));
          expect(h.gateway.completedSessionIds, isEmpty);
        }
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets('QR expires at the existing share deadline', (tester) async {
    var now = DateTime.utc(2026, 10, 14);
    final share = KioskTryOnShare(
      shareUrl: 'https://try.selfx.test/looks/capability',
      expiresAt: now.add(const Duration(seconds: 30)),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: buildSelfxKioskTheme(),
        home: Scaffold(
          body: MyLooksDownloadSheet(
            share: share,
            sessionCurrent: true,
            now: () => now,
            onClose: () {},
            onSelectMore: () {},
            onHome: () {},
          ),
        ),
      ),
    );
    expect(find.text('Link expires in 00:30'), findsOneWidget);
    now = now.add(const Duration(seconds: 30));
    await tester.pump(const Duration(seconds: 1));
    expect(find.byKey(const Key('download-my-looks-qr')), findsNothing);
    expect(find.text('Download link expired'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final vertical in KioskTryOnVertical.values) {
    for (final count in [1, 3]) {
      testWidgets(
        '$vertical: $count generated looks use the correct result download path',
        (tester) async {
          final h = await _open(
            tester,
            gateway: _Gateway(count: count),
            gallery: false,
            vertical: vertical,
          );
          expect(
            find.descendant(
              of: find.byKey(const Key('get-my-looks')),
              matching: find.text(
                count == 1 ? 'Download My Looks' : 'Get My Looks',
              ),
            ),
            findsOneWidget,
          );
          if (count == 1) {
            expect(
              tester
                  .widget<SelfxKioskButton>(
                    find.byKey(const Key('buy-this-look')),
                  )
                  .onPressed,
              isNotNull,
            );
            expect(find.byKey(const Key('finish-try-on')), findsNothing);
          }
          await tester.ensureVisible(find.byKey(const Key('get-my-looks')));
          await tester.tap(find.byKey(const Key('get-my-looks')));
          await _frames(tester);
          if (count > 1) {
            expect(
              find.byKey(const Key('my-looks-thumbnails')),
              findsOneWidget,
            );
            await tester.tap(find.byKey(const Key('download-my-looks')));
            await _frames(tester);
          }
          expect(find.byKey(const Key('my-looks-bottom-sheet')), findsNothing);
          expect(find.byType(MyLooksDownloadSheet), findsOneWidget);
          expect(
            find.byKey(const Key('my-looks-modal-surface')),
            findsOneWidget,
          );
          expect(h.gateway.shares, 1);
          expect(h.gateway.sharedSessionId, h.session.activeSessionId);
          await tester.ensureVisible(
            find.byKey(const Key('select-more-looks')),
          );
          await tester.tap(find.byKey(const Key('select-more-looks')));
          await _frames(tester);
          expect(find.byType(MyLooksDownloadSheet), findsNothing);
          expect(
            find.byKey(const Key('my-looks-bottom-sheet')),
            count == 1 ? findsNothing : findsOneWidget,
          );
          expect(h.session.result, same(_result));
          expect(h.session.customerSessionActive, isTrue);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );
    }
  }

  for (final home in [false, true]) {
    testWidgets(
      home
          ? 'single-look QR Home clears the session'
          : 'single-look QR X keeps the preview',
      (tester) async {
        final h = await _open(
          tester,
          gateway: _Gateway(count: 1),
          gallery: false,
        );
        final sessionId = h.session.activeSessionId;
        await tester.tap(find.byKey(const Key('get-my-looks')));
        await _frames(tester);
        final button = find.byKey(
          Key(home ? 'download-back-to-home' : 'close-download-my-looks'),
        );
        await tester.ensureVisible(button);
        await tester.tap(button);
        await _frames(tester);
        expect(find.byKey(const Key('my-looks-modal-surface')), findsNothing);
        if (home) {
          expect(h.session.customerSessionActive, isFalse);
          expect(h.session.result, isNull);
          expect(h.capture.activeAcceptedPersonPhoto, isNull);
          expect(h.gateway.completedSessionIds, [sessionId]);
        } else {
          expect(h.session.result, same(_result));
          expect(h.session.customerSessionActive, isTrue);
        }
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets('single-look download retries without opening a gallery', (
    tester,
  ) async {
    final h = await _open(
      tester,
      gateway: _Gateway(count: 1)..failShare = true,
      gallery: false,
    );
    await tester.tap(find.byKey(const Key('get-my-looks')));
    await _frames(tester);
    await tester.tap(find.byKey(const Key('retry-download-my-looks')));
    await _frames(tester);
    expect(find.byType(MyLooksDownloadSheet), findsOneWidget);
    expect(find.byKey(const Key('my-looks-bottom-sheet')), findsNothing);
    expect(h.gateway.shares, 2);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  test('late share cannot be cached for a replacement customer', () async {
    final capture = fixtures.testController();
    final gateway = _Gateway()..pendingShare = Completer<KioskTryOnShare>();
    final session = KioskTryOnSessionController(gateway: gateway);
    addTearDown(capture.dispose);
    addTearDown(session.dispose);
    await session.beginCustomerSession();
    final pending = session.createSessionShare();
    final completion = gateway.pendingShare!;
    await session.finish(capture);
    await session.beginCustomerSession();
    gateway.pendingShare = null;
    completion.complete(
      KioskTryOnShare(
        shareUrl: 'https://try.selfx.test/looks/previous-customer',
        expiresAt: DateTime.now().add(const Duration(minutes: 5)),
      ),
    );
    expect(await pending, isNull);
    final share = await session.createSessionShare();
    expect(share!.shareUrl, 'https://try.selfx.test/looks/capability');
    expect(gateway.shares, 2);
  });

  test(
    'late gallery refresh cannot restore a previous customer look count',
    () async {
      final capture = fixtures.testController();
      final gateway = _Gateway()
        ..pendingLooks = Completer<List<KioskTryOnLook>>();
      final session = KioskTryOnSessionController(gateway: gateway);
      addTearDown(capture.dispose);
      addTearDown(session.dispose);
      await session.beginCustomerSession();
      final pending = session.refreshLooks();
      final completion = gateway.pendingLooks!;
      await session.finish(capture);
      await session.beginCustomerSession();
      gateway.pendingLooks = null;
      completion.complete([
        KioskTryOnLook(
          lookId: 'previous-customer',
          runId: 'old-run',
          personAssetId: 'old-person',
          resultAssetId: 'old-result',
          resultReadUrl: 'https://example.test/old-result.png',
          createdAt: DateTime.now(),
          expiresAt: DateTime.now().add(const Duration(days: 7)),
        ),
      ]);
      await pending;
      expect(session.looks, isEmpty);
      await session.refreshLooks();
      expect(session.looks, hasLength(6));
      expect(
        session.looks.any((look) => look.lookId == 'previous-customer'),
        isFalse,
      );
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
  bool gallery = true,
  KioskTryOnVertical vertical = KioskTryOnVertical.garment,
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
  session.activeTryOnVertical = vertical;
  await tester.pumpWidget(
    MaterialApp(
      theme: buildSelfxKioskTheme(),
      home: !gallery
          ? TryOnResultScreen(
              captureController: capture,
              tryOnController: session,
              uploadController: uploads,
            )
          : Scaffold(
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
  if (gallery) await tester.tap(find.text('Get My Looks'));
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
  _Gateway({this.count = 6, this.imageSrc});
  final int count;
  final String? imageSrc;
  int shares = 0;
  bool failShare = false;
  String? sharedSessionId;
  Completer<KioskTryOnShare>? pendingShare;
  Completer<List<KioskTryOnLook>>? pendingLooks;
  @override
  Future<List<KioskTryOnLook>> getSessionLooks(String sessionId) async {
    if (pendingLooks != null) return pendingLooks!.future;
    return [
      for (var i = 0; i < count; i++)
        KioskTryOnLook(
          lookId: 'look-$i',
          runId: 'run-$i',
          personAssetId: 'person',
          productId: 'product-$i',
          resultAssetId: 'result-$i',
          resultReadUrl: imageSrc ?? 'https://example.test/result-$i.png',
          createdAt: DateTime.now(),
          expiresAt: DateTime.now().add(const Duration(days: 7)),
        ),
    ];
  }

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
