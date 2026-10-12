import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/catalog/kiosk_catalog_models.dart';
import 'package:selfx_kiosk/src/catalog/kiosk_product_recommendation_service.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/tryon/model_coverage_analyzer.dart';
import 'package:selfx_kiosk/src/tryon/model_garment_compatibility.dart';
import 'package:selfx_kiosk/src/ui/browse_products_screen.dart';
import 'package:selfx_kiosk/src/ui/capture_review_screen.dart';
import 'package:selfx_kiosk/src/ui/mobile_upload_screen.dart';
import 'package:selfx_kiosk/src/ui/product_recommendation_carousel.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_controller.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;
import 'kiosk_mobile_upload_test.dart' as phone;

void main() {
  for (final size in [
    const Size(320, 568),
    const Size(1280, 720),
    const Size(1920, 1080),
  ]) {
    testWidgets(
      'carousel is compact at $size, respects picks and appends Show All',
      (tester) async {
        _viewport(tester, size);
        final capture = fixtures.testController();
        final products = _products(9);
        final session = _session(products)..applyMaxTryOnPicks(1);
        addTearDown(capture.dispose);
        addTearDown(session.dispose);
        await capture.capturePhoto();
        await capture.usePhoto();
        await session.beginCustomerSession();
        var shown = 0;
        var continued = 0;
        await tester.pumpWidget(
          MaterialApp(
            theme: buildSelfxKioskTheme(),
            home: Scaffold(
              body: ProductRecommendationCarousel(
                captureController: capture,
                tryOnController: session,
                catalogGateway: _Catalog(products),
                onShowAll: () => shown++,
                onOpenPicks: () {},
                onContinue: () => continued++,
                onSingleProduct: (_) {},
              ),
            ),
          ),
        );
        await _pump(tester);
        final list = tester.widget<ListView>(
          find.byKey(const Key('recommendation-products')),
        );
        expect(
          (list.childrenDelegate as SliverChildBuilderDelegate).childCount,
          15,
        ); // 8 tiles + 7 separators
        expect(
          find.byKey(const Key('recommendations-show-all')),
          findsOneWidget,
        );
        expect(
          tester
              .widget<FilledButton>(
                find.byKey(const Key('recommendations-continue')),
              )
              .onPressed,
          isNull,
        );
        await tester.tap(find.byKey(const ValueKey('recommendation-p0')));
        await tester.pump();
        expect(session.garmentPicks.single.id, 'p0');
        await tester.drag(
          find.byKey(const Key('recommendation-products')),
          const Offset(-140, 0),
        );
        await tester.pump();
        final second = find.byKey(const ValueKey('recommendation-p1'));
        if (second.evaluate().isNotEmpty) {
          await tester.ensureVisible(second);
          await tester.tap(second);
          await tester.pump();
          expect(session.garmentPicks.single.id, 'p0');
          expect(find.text('You can add up to 1 picks.'), findsOneWidget);
        }
        await tester.tap(find.byKey(const Key('recommendations-continue')));
        expect(continued, 1);
        expect(session.garmentInput?.productId, 'p0');
        await tester.tap(find.byKey(const Key('recommendations-show-all')));
        expect(shown, 1);
        await tester.drag(
          find.byKey(const Key('recommendation-products')),
          const Offset(-2400, 0),
        );
        await tester.pump();
        expect(
          find.byKey(const Key('recommendations-show-all-tile')),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'empty recommendations keep Show All and old callbacks cannot select in a new session',
    (tester) async {
      _viewport(tester, const Size(1280, 720));
      final capture = fixtures.testController();
      final session = _session(_products(2));
      addTearDown(capture.dispose);
      addTearDown(session.dispose);
      await capture.capturePhoto();
      await capture.usePhoto();
      await session.beginCustomerSession();
      Widget carousel() => MaterialApp(
        home: Scaffold(
          body: ProductRecommendationCarousel(
            captureController: capture,
            tryOnController: session,
            catalogGateway: _Catalog(_products(2)),
            onShowAll: () {},
            onOpenPicks: () {},
            onContinue: () {},
            onSingleProduct: (_) {},
          ),
        ),
      );
      await tester.pumpWidget(carousel());
      final oldTap = tester
          .widget<InkWell>(find.byKey(const ValueKey('recommendation-p0')))
          .onTap!;
      session.endCustomerSession();
      await tester.pump();
      expect(
        find.byKey(const Key('recommendations-show-all-tile')),
        findsOneWidget,
      );
      await session.beginCustomerSession();
      await tester.pump();
      oldTap();
      expect(session.garmentPicks, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );

  for (final vertical in [
    KioskTryOnVertical.garment,
    KioskTryOnVertical.jewellery,
  ]) {
    testWidgets(
      'camera review Show All preserves accepted photo/session for $vertical',
      (tester) async {
        _viewport(tester, const Size(1280, 720));
        final capture = fixtures.testController();
        final products = vertical == KioskTryOnVertical.garment
            ? _products(3)
            : <KioskCatalogProduct>[];
        final session = _session(products);
        final uploads = fixtures.testUploadController(capture.captureStore);
        final catalog = _Catalog(products);
        addTearDown(capture.dispose);
        addTearDown(session.dispose);
        addTearDown(uploads.dispose);
        await capture.capturePhoto();
        await session.beginCustomerSession(vertical: vertical);
        final sessionId = session.activeSessionId;
        await tester.pumpWidget(
          MaterialApp(
            theme: buildSelfxKioskTheme(),
            home: CaptureReviewScreen(
              controller: capture,
              tryOnController: session,
              uploadController: uploads,
              catalogGateway: catalog,
            ),
          ),
        );
        await _pump(tester);
        expect(capture.activeAcceptedPersonPhoto, isNotNull);
        final accepted = capture.activeAcceptedPersonPhoto;
        expect(find.byType(ProductRecommendationCarousel), findsOneWidget);
        if (vertical == KioskTryOnVertical.garment) {
          expect(find.byKey(const Key('take-garment-photo')), findsOneWidget);
        }
        await tester.ensureVisible(
          find.byKey(const Key('recommendations-show-all')),
        );
        await tester.tap(find.byKey(const Key('recommendations-show-all')));
        await _pump(tester);
        expect(find.byType(BrowseProductsScreen), findsOneWidget);
        expect(capture.activeAcceptedPersonPhoto, same(accepted));
        expect(session.activeSessionId, sessionId);
        expect(catalog.lastAudience, KioskCatalogAudience.all);
        final tabs = tester.widget<SegmentedButton<KioskCatalogAudience>>(
          find.byType(SegmentedButton<KioskCatalogAudience>),
        );
        expect(tabs.selected, {KioskCatalogAudience.all});
        expect(
          tabs.segments.map((tab) => tab.value),
          containsAll([KioskCatalogAudience.men, KioskCatalogAudience.women]),
        );
        expect(tester.takeException(), isNull);
      },
    );
  }

  for (final size in [const Size(1280, 720), const Size(480, 800)]) {
    testWidgets(
      'phone photo is accepted once and carousel Show All preserves it at $size',
      (tester) async {
        _viewport(tester, size);
        final capture = fixtures.testController();
        final session = _session(_products(2));
        final device = phone.testDeviceController();
        final gateway = _UploadGateway()
          ..nextSession = phone.readyUploadSession('ready-phone');
        final uploads = KioskCustomerUploadController(
          deviceController: device,
          gateway: gateway,
          captureStore: capture.captureStore,
        );
        final catalog = _Catalog(_products(2));
        addTearDown(capture.dispose);
        addTearDown(session.dispose);
        addTearDown(uploads.dispose);
        addTearDown(device.dispose);
        await session.beginCustomerSession();
        await tester.pumpWidget(
          MaterialApp(
            theme: buildSelfxKioskTheme(),
            home: MobileUploadScreen(
              captureController: capture,
              tryOnController: session,
              uploadController: uploads,
              catalogGateway: catalog,
            ),
          ),
        );
        await _pump(tester);
        expect(capture.activeAcceptedPersonPhoto, isNotNull);
        expect(gateway.downloads, 1);
        expect(find.byType(ProductRecommendationCarousel), findsOneWidget);
        expect(find.byKey(const Key('take-garment-photo')), findsOneWidget);
        final accepted = capture.activeAcceptedPersonPhoto;
        await tester.ensureVisible(
          find.byKey(const Key('recommendations-show-all')),
        );
        await tester.tap(find.byKey(const Key('recommendations-show-all')));
        await _pump(tester);
        expect(find.byType(BrowseProductsScreen), findsOneWidget);
        expect(capture.activeAcceptedPersonPhoto, same(accepted));
        expect(catalog.lastAudience, KioskCatalogAudience.all);
        expect(gateway.downloads, 1);
        expect(tester.takeException(), isNull);
      },
    );
  }

  test(
    'late phone download cannot accept a photo after its session ended',
    () async {
      final capture = fixtures.testController();
      final device = phone.testDeviceController();
      final gateway = _DelayedUploadGateway();
      final uploads = KioskCustomerUploadController(
        deviceController: device,
        gateway: gateway,
        captureStore: capture.captureStore,
      )..session = phone.readyUploadSession('old-session');
      addTearDown(capture.dispose);
      addTearDown(device.dispose);
      addTearDown(uploads.dispose);
      var active = true;
      final accepting = uploads.useReadyPhoto(
        capture,
        canAcceptPhoto: () => active,
      );
      await gateway.started.future;
      active = false;
      gateway.download.complete();
      expect(await accepting, isFalse);
      expect(capture.activeAcceptedPersonPhoto, isNull);
      expect(gateway.consumedSessionId, isNull);
    },
  );

  for (final size in [const Size(630, 1365), const Size(800, 480)]) {
    testWidgets(
      'single-product carousel selection keeps explicit Continue at $size',
      (tester) async {
        _viewport(tester, size);
        final capture = fixtures.testController();
        final session = _session(_products(2))
          ..applyMultiGarmentSelectionEnabled(false);
        final uploads = fixtures.testUploadController(capture.captureStore);
        addTearDown(capture.dispose);
        addTearDown(session.dispose);
        addTearDown(uploads.dispose);
        await capture.capturePhoto();
        await session.beginCustomerSession();
        await tester.pumpWidget(
          MaterialApp(
            theme: buildSelfxKioskTheme(),
            home: CaptureReviewScreen(
              controller: capture,
              tryOnController: session,
              uploadController: uploads,
              catalogGateway: _Catalog(_products(2)),
            ),
          ),
        );
        await _pump(tester);
        final product = find.byKey(const ValueKey('recommendation-p0'));
        await tester.ensureVisible(product);
        await tester.tap(product);
        await _pump(tester);
        expect(session.garmentInput?.productId, 'p0');
        expect(session.run, isNull);
        expect(
          find.byKey(const Key('continue-selected-product-try-on')),
          findsOneWidget,
        );
        expect(find.byKey(const Key('recommendations-my-picks')), findsNothing);
        expect(find.byKey(const Key('take-garment-photo')), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }

  test(
    'ending a session during phone validation prevents committing its photo',
    () async {
      final coverage = _DelayedCoverage();
      final capture = fixtures.testController(modelCoverageAnalyzer: coverage);
      final device = phone.testDeviceController();
      final gateway = _UploadGateway();
      final uploads = KioskCustomerUploadController(
        deviceController: device,
        gateway: gateway,
        captureStore: capture.captureStore,
      )..session = phone.readyUploadSession('validating-old-photo');
      addTearDown(capture.dispose);
      addTearDown(device.dispose);
      addTearDown(uploads.dispose);
      var active = true;
      final preparing = uploads.useReadyPhoto(
        capture,
        canAcceptPhoto: () => active,
      );
      await coverage.started.future;
      active = false;
      coverage.result.complete(
        const ModelCoverageAnalysis.resolved(
          coverage: ModelCoverage.fullBody,
          confidence: 0.9,
          reasonCode: 'TEST',
        ),
      );
      expect(await preparing, isFalse);
      expect(capture.activeAcceptedPersonPhoto, isNull);
      expect(gateway.consumedSessionId, isNull);
    },
  );
}

void _viewport(WidgetTester tester, Size size) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> _pump(WidgetTester tester) async {
  for (var i = 0; i < 16; i++) {
    await tester.pump(const Duration(milliseconds: 30));
  }
}

List<KioskCatalogProduct> _products(int count) => [
  for (var i = 0; i < count; i++)
    fixtures.testCatalogProduct(id: 'p$i', name: 'Garment $i'),
];
KioskTryOnSessionController _session(List<KioskCatalogProduct> products) =>
    KioskTryOnSessionController(
      gateway: fixtures.FakeKioskTryOnGateway(),
      recommendations: KioskProductRecommendationService(
        cachedProducts: () => products,
        initialRotation: 0,
      ),
    );

class _Catalog extends fixtures.FakeKioskCatalogGateway {
  _Catalog(List<KioskCatalogProduct> products) : super(products: products);
  KioskCatalogAudience? lastAudience;
  @override
  Future<List<KioskCatalogCategory>> getCatalogCategories({
    required KioskCatalogAudience audience,
    KioskProductVertical productVertical = KioskProductVertical.garment,
  }) {
    lastAudience = audience;
    return super.getCatalogCategories(
      audience: audience,
      productVertical: productVertical,
    );
  }
}

class _UploadGateway extends phone.FakeUploadGateway {
  int downloads = 0;
  @override
  Future<void> downloadReadyPhoto({
    required String readUrl,
    required String targetPath,
  }) async {
    downloads++;
  }
}

class _DelayedUploadGateway extends phone.FakeUploadGateway {
  final started = Completer<void>();
  final download = Completer<void>();
  @override
  Future<void> downloadReadyPhoto({
    required String readUrl,
    required String targetPath,
  }) async {
    started.complete();
    await download.future;
  }
}

class _DelayedCoverage extends ModelCoverageAnalyzer {
  final started = Completer<void>();
  final result = Completer<ModelCoverageAnalysis>();
  @override
  Future<ModelCoverageAnalysis> analyze(File image) {
    started.complete();
    return result.future;
  }

  @override
  Future<void> dispose() async {}
}
