import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/catalog/kiosk_catalog_models.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/ui/browse_products_screen.dart';
import 'package:selfx_kiosk/src/ui/catalog_filter_icon.dart';

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
      'catalog fits $size and preserves picks through filters and paging',
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
        final catalog = _PagedCatalog();
        addTearDown(() {
          uploads.dispose();
          tryOn.dispose();
          capture.dispose();
        });
        await tester.pumpWidget(
          MaterialApp(
            theme: buildSelfxKioskTheme(),
            home: BrowseProductsScreen(
              captureController: capture,
              tryOnController: tryOn,
              uploadController: uploads,
              catalogGateway: catalog,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        Color? audienceIconColor(CatalogFilterIconType type) {
          final icon = find.byWidgetPredicate(
            (widget) =>
                widget is CatalogFilterIcon &&
                widget.type == type &&
                widget.color == null,
          );
          return IconTheme.of(tester.element(icon)).color;
        }

        expect(audienceIconColor(CatalogFilterIconType.all), Colors.white);
        expect(
          audienceIconColor(CatalogFilterIconType.men),
          SelfxKioskTokens.textPrimary,
        );
        expect(
          audienceIconColor(CatalogFilterIconType.women),
          SelfxKioskTokens.textPrimary,
        );
        CatalogFilterIcon chipIcon(String slug) =>
            tester.widget<CatalogFilterIcon>(
              find.descendant(
                of: find.byKey(Key('catalog-category-$slug')),
                matching: find.byType(CatalogFilterIcon),
              ),
            );
        expect(chipIcon('all').type, CatalogFilterIconType.all);
        expect(chipIcon('all').color, SelfxKioskTokens.primary);
        expect(
          tester
              .widget<ChoiceChip>(find.byKey(const Key('catalog-category-all')))
              .showCheckmark,
          isFalse,
        );
        final grid = tester.widget<GridView>(find.byType(GridView));
        if (size.height > size.width) {
          expect(
            (grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount)
                .crossAxisCount,
            2,
          );
        }
        // Short windows show only part of the scrollable card. Tap its visible
        // image area rather than the center, which can be below the viewport.
        await tester.tapAt(
          tester.getTopLeft(find.byType(GridView)) + const Offset(24, 24),
        );
        await tester.pumpAndSettle();
        expect(tryOn.garmentPicks, hasLength(1));
        await tester.tap(find.text('Men'));
        await tester.pumpAndSettle();
        expect(catalog.lastAudience, KioskCatalogAudience.men);
        expect(
          audienceIconColor(CatalogFilterIconType.all),
          SelfxKioskTokens.textPrimary,
        );
        expect(audienceIconColor(CatalogFilterIconType.men), Colors.white);
        if (size.width < 400) {
          await tester.drag(find.byType(ListView).first, const Offset(-180, 0));
          await tester.pumpAndSettle();
        }
        expect(chipIcon('bottoms').type, CatalogFilterIconType.bottoms);
        expect(chipIcon('bottoms').color, SelfxKioskTokens.textPrimary);
        await tester.tap(find.byKey(const Key('catalog-category-bottoms')));
        await tester.pumpAndSettle();
        expect(catalog.lastCategory, 'bottoms');
        expect(chipIcon('bottoms').color, SelfxKioskTokens.primary);
        expect(
          ChipTheme.of(
            tester.element(find.byKey(const Key('catalog-category-bottoms'))),
          ).selectedColor,
          SelfxKioskTokens.catalogSelectedSurface,
        );
        if (size.width < 400) {
          await tester.drag(find.byType(ListView).first, const Offset(180, 0));
          await tester.pumpAndSettle();
        }
        expect(chipIcon('all').color, SelfxKioskTokens.textPrimary);
        expect(tryOn.garmentPicks, hasLength(1));
        await tester.tap(find.byKey(const Key('load-more-products')));
        await tester.pumpAndSettle();
        expect(catalog.lastPage, 2);
        expect(tryOn.garmentPicks.single.id, 'product-1');
        expect(find.byKey(const Key('load-more-products')), findsNothing);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  test(
    'category icon mapping handles existing garment slugs and custom fallback',
    () {
      expect(categoryFilterIconType('tops'), CatalogFilterIconType.tops);
      expect(categoryFilterIconType('bottoms'), CatalogFilterIconType.bottoms);
      expect(
        categoryFilterIconType('full-outfit'),
        CatalogFilterIconType.fullOutfit,
      );
      expect(
        categoryFilterIconType('FULL_OUTFIT'),
        CatalogFilterIconType.fullOutfit,
      );
      expect(
        categoryFilterIconType('custom-collection'),
        CatalogFilterIconType.all,
      );
    },
  );

  test(
    'finish clears My Picks before a pending backend completion, even on failure',
    () async {
      final gateway = _PendingCompletionGateway();
      final capture = fixtures.testController();
      final tryOn = KioskTryOnSessionController(gateway: gateway);
      addTearDown(() {
        tryOn.dispose();
        capture.dispose();
      });
      final product = fixtures.testCatalogProduct(
        id: 'pick-1',
        name: 'Selected garment',
      );
      tryOn.customerSessionActive = true;
      await tryOn.createBackendSession();
      tryOn.toggleGarmentPick(
        KioskTryOnPick(
          id: product.id,
          displayName: product.name,
          garmentInput: product.toGarmentInput(),
        ),
      );
      expect(tryOn.garmentPicks, hasLength(1));
      final finishing = tryOn.finish(capture);
      expect(tryOn.garmentPicks, isEmpty);
      expect(tryOn.activeGarmentPickId, isNull);
      gateway.completion.completeError(StateError('Network unavailable'));
      await finishing;
      expect(tryOn.customerSessionActive, isFalse);
      expect(tryOn.garmentInput, isNull);
      expect(tryOn.activeSessionId, isNull);
    },
  );
}

class _PendingCompletionGateway extends fixtures.FakeKioskTryOnGateway {
  final completion = Completer<KioskTryOnSession>();

  @override
  Future<KioskTryOnSession> completeTryOnSession(
    String sessionId, {
    KioskTryOnSessionCompletionReason reason =
        KioskTryOnSessionCompletionReason.finished,
  }) => completion.future;
}

class _PagedCatalog extends fixtures.FakeKioskCatalogGateway {
  _PagedCatalog()
    : super(
        products: [
          fixtures.testCatalogProduct(
            id: 'product-1',
            name: 'Black sweatshirt',
            priceAmountCents: 250000,
            priceCurrency: 'INR',
          ),
          fixtures.testCatalogProduct(
            id: 'product-2',
            name: 'Black trouser',
            priceAmountCents: 250000,
            priceCurrency: 'INR',
          ),
        ],
      );

  KioskCatalogAudience? lastAudience;
  String? lastCategory;
  int? lastPage;

  @override
  Future<KioskCatalogPage> getCatalogProducts({
    required KioskCatalogAudience audience,
    KioskProductVertical productVertical = KioskProductVertical.garment,
    String? categorySlug,
    required int page,
    required int pageSize,
  }) async {
    lastAudience = audience;
    lastCategory = categorySlug;
    lastPage = page;
    return KioskCatalogPage(
      products: [products[page - 1]],
      pagination: KioskCatalogPagination(
        page: page,
        pageSize: 1,
        total: 2,
        totalPages: 2,
        hasMore: page == 1,
      ),
    );
  }
}
