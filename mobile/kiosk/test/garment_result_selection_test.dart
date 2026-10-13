import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/catalog/kiosk_catalog_models.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/ui/browse_products_screen.dart';
import 'package:selfx_kiosk/src/ui/catalog_filter_icon.dart';
import 'package:selfx_kiosk/src/ui/garment_result_catalog.dart';
import 'package:selfx_kiosk/src/ui/kiosk_attention_animations.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_button.dart';
import 'package:selfx_kiosk/src/ui/try_on_generation_screen.dart';
import 'package:selfx_kiosk/src/ui/try_on_result_screen.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;
import 'kiosk_mobile_upload_test.dart' as phone;

const _result = KioskTryOnResult(
  run: KioskTryOnRun(id: 'completed', status: KioskTryOnStatus.succeeded),
  generatedImage:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
);

void main() {
  testWidgets(
    'equal-width categories use small gaps; thumbnails fill square image areas',
    (tester) async {
      _viewport(tester);
      await tester.pumpWidget(_catalogPage(_SpreadCatalog(), 1));
      await _frames(tester);
      final rail = tester.getRect(find.byKey(const Key('result-categories')));
      final tabs = [
        for (final slug in ['all', 'bottoms', 'full-outfit', 'tops'])
          tester.getRect(find.byKey(ValueKey('result-category-$slug'))),
      ];
      expect(tabs.first.left, closeTo(rail.left, 0.1));
      expect(tabs.last.right, closeTo(rail.right, 0.1));
      final gap = tabs[1].left - tabs[0].right;
      expect(gap, closeTo(8, 0.1));
      for (var i = 1; i < tabs.length - 1; i++) {
        expect(tabs[i + 1].left - tabs[i].right, closeTo(gap, 0.1));
      }
      for (final tab in tabs) {
        expect(tab.height, 60);
        expect(tab.width, closeTo(tabs.first.width, 0.1));
      }
      for (final icon in tester.widgetList<CatalogFilterIcon>(
        find.byType(CatalogFilterIcon),
      )) {
        expect(icon.size, 24);
      }
      final product = find.byKey(const ValueKey('result-product-first'));
      final card = tester.getRect(
        find.descendant(of: product, matching: find.byType(Material)),
      );
      final image = tester.getRect(
        find.descendant(of: product, matching: find.byType(Image)),
      );
      expect(image.left, card.left);
      expect(image.right, card.right);
      expect(image.top, card.top);
      expect(image.height, closeTo(image.width, 0.1));
      expect(
        tester
            .widget<Image>(
              find.descendant(of: product, matching: find.byType(Image)),
            )
            .fit,
        BoxFit.cover,
      );
      final footer = tester.getRect(find.byKey(const Key('result-footer')));
      expect(footer.bottom, closeTo(1365, 0.1));
      expect(footer.height, 72);
      expect(
        tester.getSize(find.byKey(const Key('result-preview-area'))).height,
        greaterThan(800),
      );
      tester.view.physicalSize = const Size(320, 700);
      await tester.pump();
      for (var i = 0; i < tabs.length; i++) {
        final slug = ['all', 'bottoms', 'full-outfit', 'tops'][i];
        expect(
          tester.getSize(find.byKey(ValueKey('result-category-$slug'))).width,
          104,
        );
      }
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'overflowing categories scroll and selected tick follows the garment',
    (tester) async {
      _viewport(tester);
      tester.view.physicalSize = const Size(320, 700);
      final catalog = _SpreadCatalog(categoryCount: 10);
      await tester.pumpWidget(_catalogPage(catalog, 1));
      await _frames(tester);
      final last = find.byKey(const ValueKey('result-category-category-9'));
      expect(last.hitTestable(), findsNothing);
      await tester.ensureVisible(last);
      expect(last.hitTestable(), findsOneWidget);
      await tester.tap(last);
      await _frames(tester);
      final first = find.byKey(const ValueKey('result-product-first'));
      final second = find.byKey(const ValueKey('result-product-second'));
      final tick = find.byKey(const Key('result-product-selected-tick'));
      expect(tick, findsNothing);
      await tester.ensureVisible(first);
      await tester.tap(first);
      await tester.pump();
      expect(find.descendant(of: first, matching: tick), findsOneWidget);
      final badge =
          tester.widget<DecoratedBox>(tick).decoration as BoxDecoration;
      expect(badge.color, SelfxKioskTokens.primary);
      expect(badge.shape, BoxShape.circle);
      expect(
        tester
            .widget<Icon>(
              find.descendant(of: tick, matching: find.byType(Icon)),
            )
            .color,
        Colors.white,
      );
      await tester.ensureVisible(second);
      await tester.tap(second);
      await tester.pump();
      expect(find.descendant(of: second, matching: tick), findsOneWidget);
      expect(find.descendant(of: first, matching: tick), findsNothing);
      await tester.tap(second);
      await tester.pump();
      expect(tick, findsNothing);
      expect(find.byKey(const Key('result-continue')), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'selection stays local; Continue generates once with original person',
    (tester) async {
      _viewport(tester);
      final capture = fixtures.testController();
      final gateway = _TryOnGateway();
      final session = KioskTryOnSessionController(
        gateway: gateway,
        targetPreparer: phone.FakeTargetPreparer(),
      );
      final uploads = fixtures.testUploadController(capture.captureStore);
      addTearDown(capture.dispose);
      addTearDown(session.dispose);
      addTearDown(uploads.dispose);
      await capture.capturePhoto();
      await capture.usePhoto();
      await session.beginCustomerSession();
      final product = fixtures.testCatalogProduct(
        id: 'new-product',
        name: 'New garment',
      );
      session.selectGarment(
        fixtures
            .testCatalogProduct(id: 'old', name: 'Old garment')
            .toGarmentInput(),
      );
      session.result = _result;
      final person = capture.activeAcceptedPersonPhoto;
      final sessionId = session.activeSessionId;
      await tester.pumpWidget(
        MaterialApp(
          theme: buildSelfxKioskTheme(),
          home: TryOnResultScreen(
            captureController: capture,
            tryOnController: session,
            uploadController: uploads,
            catalogGateway: fixtures.FakeKioskCatalogGateway(
              products: [product],
            ),
          ),
        ),
      );
      await _frames(tester);
      final tile = find.byKey(const ValueKey('result-product-new-product'));
      await tester.tap(tile);
      await tester.pump();
      expect(session.garmentInput?.productId, 'old');
      expect(session.result, same(_result));
      expect(gateway.requests, isEmpty);
      expect(find.byKey(const Key('finish-try-on')), findsNothing);
      expect(find.byKey(const Key('get-my-looks')), findsNothing);
      final action = find.byKey(const Key('result-continue'));
      final pulse = find.ancestor(
        of: action,
        matching: find.byType(SelfxActionPulse),
      );
      expect(tester.widget<SelfxActionPulse>(pulse).enabled, isTrue);
      await tester.tap(tile);
      await tester.pump();
      expect(find.byKey(const Key('result-continue')), findsNothing);
      expect(find.byKey(const Key('finish-try-on')), findsOneWidget);
      expect(find.byKey(const Key('get-my-looks')), findsOneWidget);
      await tester.tap(tile);
      await tester.pump();
      final continueAction = tester.widget<SelfxKioskButton>(action).onPressed!;
      continueAction();
      continueAction();
      await _frames(tester);
      for (var i = 0; i < 4; i++) {
        await tester.runAsync(phone.testerPumpEventQueue);
        await _frames(tester);
      }
      expect(find.byType(TryOnGenerationScreen), findsOneWidget);
      expect(gateway.requests, hasLength(1));
      expect(gateway.requests.single.garmentInput.productId, 'new-product');
      expect(capture.activeAcceptedPersonPhoto, same(person));
      expect(session.activeSessionId, sessionId);
      expect(session.targetMetadata?.originalPath, person!.image.originalPath);
      expect(
        session.targetMetadata?.originalPath,
        isNot(_result.generatedImage),
      );
      await tester.pumpWidget(const SizedBox.shrink());
      session.tryAnotherGarment();
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'category filtering and paging keep Show All and unique garments',
    (tester) async {
      _viewport(tester);
      final catalog = _PagedCatalog();
      await tester.pumpWidget(_catalogPage(catalog, 1));
      await _frames(tester);
      await tester.tap(find.byKey(const ValueKey('result-category-bottoms')));
      await _frames(tester);
      expect(catalog.slugs.last, 'bottoms');
      expect(
        catalog.audiences.every((a) => a == KioskCatalogAudience.all),
        isTrue,
      );
      final more = find.text('Load More');
      await tester.ensureVisible(more);
      await tester.tap(more);
      await _frames(tester);
      expect(
        find.byKey(const ValueKey('result-product-first')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('result-product-second')),
        findsOneWidget,
      );
      expect(catalog.pages, contains(2));
      expect(find.byKey(const Key('result-show-all')), findsOneWidget);
      final image = tester.widget<Image>(
        find.descendant(
          of: find.byKey(const ValueKey('result-product-second')),
          matching: find.byType(Image),
        ),
      );
      expect(image.fit, BoxFit.cover);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('late catalog response cannot replace the next session catalog', (
    tester,
  ) async {
    _viewport(tester);
    final stale = _DelayedCatalog();
    await tester.pumpWidget(_catalogPage(stale, 1));
    await _frames(tester);
    final live = fixtures.FakeKioskCatalogGateway(
      products: [fixtures.testCatalogProduct(id: 'live', name: 'Live garment')],
    );
    await tester.pumpWidget(_catalogPage(live, 2));
    await _frames(tester);
    stale.response.complete(
      _page([fixtures.testCatalogProduct(id: 'stale', name: 'Old garment')]),
    );
    await _frames(tester);
    expect(find.byKey(const ValueKey('result-product-live')), findsOneWidget);
    expect(find.byKey(const ValueKey('result-product-stale')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'Show All opens full catalog at ALL without replacing photo or result',
    (tester) async {
      _viewport(tester);
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
      final person = capture.activeAcceptedPersonPhoto;
      await tester.pumpWidget(
        MaterialApp(
          theme: buildSelfxKioskTheme(),
          home: TryOnResultScreen(
            captureController: capture,
            tryOnController: session,
            uploadController: uploads,
            catalogGateway: const fixtures.FakeKioskCatalogGateway(
              products: [],
            ),
          ),
        ),
      );
      await _frames(tester);
      final all = find.byKey(const Key('result-show-all'));
      await tester.ensureVisible(all);
      await tester.tap(all);
      await _frames(tester);
      expect(find.byType(BrowseProductsScreen), findsOneWidget);
      expect(
        tester
            .widget<SegmentedButton<KioskCatalogAudience>>(
              find.byType(SegmentedButton<KioskCatalogAudience>),
            )
            .selected,
        {KioskCatalogAudience.all},
      );
      expect(capture.activeAcceptedPersonPhoto, same(person));
      expect(session.result, same(_result));
      await tester.pumpWidget(const SizedBox.shrink());
      expect(tester.takeException(), isNull);
    },
  );
}

void _viewport(WidgetTester tester) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(630, 1365);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> _frames(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 40));
  }
}

Widget _catalogPage(fixtures.FakeKioskCatalogGateway catalog, int identity) =>
    MaterialApp(
      theme: buildSelfxKioskTheme(),
      home: Scaffold(
        body: GarmentResultCatalog(
          catalog: catalog,
          image: const ColoredBox(color: Colors.grey),
          isCurrent: () => true,
          sessionIdentity: identity,
          onContinue: (_) async {},
          onShowAll: () async {},
          onBack: () {},
          onRetake: () async {},
          onGetMyLooks: () async {},
          onFinish: () async {},
          downloadEnabled: true,
          onContinueNextPick: () async {},
        ),
      ),
    );

KioskCatalogPage _page(
  List<KioskCatalogProduct> products, {
  int page = 1,
  bool more = false,
}) => KioskCatalogPage(
  products: products,
  pagination: KioskCatalogPagination(
    page: page,
    pageSize: 12,
    total: 2,
    totalPages: 2,
    hasMore: more,
  ),
);

class _PagedCatalog extends fixtures.FakeKioskCatalogGateway {
  _PagedCatalog() : super(products: []);
  final slugs = <String?>[];
  final pages = <int>[];
  final audiences = <KioskCatalogAudience>[];
  @override
  Future<KioskCatalogPage> getCatalogProducts({
    required KioskCatalogAudience audience,
    KioskProductVertical productVertical = KioskProductVertical.garment,
    String? categorySlug,
    required int page,
    required int pageSize,
  }) async {
    slugs.add(categorySlug);
    pages.add(page);
    audiences.add(audience);
    final first = fixtures.testCatalogProduct(
      id: 'first',
      name: 'First garment',
    );
    return _page(
      page == 1
          ? [first]
          : [
              first,
              fixtures.testCatalogProduct(id: 'second', name: 'Second garment'),
            ],
      page: page,
      more: page == 1,
    );
  }
}

class _SpreadCatalog extends fixtures.FakeKioskCatalogGateway {
  _SpreadCatalog({this.categoryCount})
    : super(
        products: [
          fixtures.testCatalogProduct(id: 'first', name: 'First garment'),
          fixtures.testCatalogProduct(id: 'second', name: 'Second garment'),
        ],
      );
  final int? categoryCount;

  @override
  Future<List<KioskCatalogCategory>> getCatalogCategories({
    required KioskCatalogAudience audience,
    KioskProductVertical productVertical = KioskProductVertical.garment,
  }) async => [
    if (categoryCount == null)
      for (final (slug, name) in [
        ('bottoms', 'Bottoms'),
        ('full-outfit', 'Full outfit'),
        ('tops', 'Tops'),
      ])
        KioskCatalogCategory(id: slug, name: name, slug: slug, productCount: 2),
    if (categoryCount != null)
      for (var i = 0; i < categoryCount!; i++)
        KioskCatalogCategory(
          id: 'category-$i',
          name: 'Category $i',
          slug: 'category-$i',
          productCount: 2,
        ),
  ];
}

class _DelayedCatalog extends fixtures.FakeKioskCatalogGateway {
  _DelayedCatalog() : super(products: []);
  final response = Completer<KioskCatalogPage>();
  @override
  Future<KioskCatalogPage> getCatalogProducts({
    required KioskCatalogAudience audience,
    KioskProductVertical productVertical = KioskProductVertical.garment,
    String? categorySlug,
    required int page,
    required int pageSize,
  }) => response.future;
}

class _TryOnGateway extends fixtures.FakeKioskTryOnGateway {
  final requests = <KioskTryOnRequest>[];
  @override
  Future<KioskTryOnRun> createRun(KioskTryOnRequest request) {
    requests.add(request);
    return super.createRun(request);
  }
}
