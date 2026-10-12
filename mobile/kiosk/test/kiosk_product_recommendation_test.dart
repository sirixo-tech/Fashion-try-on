import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/catalog/kiosk_catalog_models.dart';
import 'package:selfx_kiosk/src/catalog/kiosk_product_recommendation_service.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;

void main() {
  test(
    'default and explicit ALL interleave audiences with at most seven unique products',
    () {
      final service = _service(_catalog())..beginSession();
      final mixed = service.getRecommendations(limit: 100);
      expect(mixed, hasLength(7));
      expect(mixed.map((p) => p.id).toSet(), hasLength(7));
      expect(
        mixed.map((p) => p.audience).toSet(),
        containsAll(['MEN', 'WOMEN', 'UNISEX', 'ALL']),
      );
      service.setAudiencePreference(KioskCatalogAudience.all);
      expect(
        service.getRecommendations().map((p) => p.id),
        mixed.map((p) => p.id),
      );
      expect(service.getRecommendations(limit: 2), hasLength(2));
      expect(service.getRecommendations(limit: 0), isEmpty);
    },
  );

  for (final audience in [
    KioskCatalogAudience.men,
    KioskCatalogAudience.women,
  ]) {
    test(
      'explicit ${audience.apiValue} includes shared products and excludes opposite audience',
      () {
        final service = _service(_catalog())..beginSession();
        service.setAudiencePreference(audience);
        final products = service.getRecommendations();
        expect(products, hasLength(7));
        expect(
          products.map((p) => p.audience).toSet(),
          containsAll([audience.apiValue, 'UNISEX', 'ALL']),
        );
        expect(
          products.every(
            (p) => [audience.apiValue, 'UNISEX', 'ALL'].contains(p.audience),
          ),
          isTrue,
        );
      },
    );
  }

  test(
    'deduplicates IDs, excludes unusable products and preserves cached image paths',
    () {
      final first = _product('one', ' men ');
      final service = _service([
        first,
        first,
        _product('two', 'UNISEX'),
        _product('bad', 'MEN', usable: false),
      ])..beginSession();
      service.setAudiencePreference(KioskCatalogAudience.men);
      final selected = service.getRecommendations();
      expect(selected, hasLength(2));
      expect(selected.map((p) => p.id).toSet(), {'one', 'two'});
      expect(selected.firstWhere((p) => p.id == 'one'), same(first));
      expect(selected.first.image.localPath, isNotNull);
      expect(() => selected.clear(), throwsUnsupportedError);
    },
  );

  test(
    'selection is stable within a customer session and rotates on the next one',
    () {
      final service = _service([
        for (var i = 0; i < 14; i++) _product('p$i', 'MEN'),
      ])..beginSession();
      final first = service.getRecommendations().map((p) => p.id).toList();
      service.beginSession();
      expect(service.getRecommendations().map((p) => p.id), first);
      service.endSession();
      expect(service.getRecommendations(), isEmpty);
      expect(service.audiencePreference, isNull);
      service.beginSession();
      final second = service.getRecommendations().map((p) => p.id).toList();
      expect(second, isNot(equals(first)));
      expect(second.toSet(), isNot(equals(first.toSet())));
    },
  );

  test('session preferences and resets are independent between owners', () {
    final first = _service(_catalog())..beginSession();
    final second = _service(_catalog())..beginSession();
    first.setAudiencePreference(KioskCatalogAudience.men);
    second.setAudiencePreference(KioskCatalogAudience.women);
    first.endSession();
    expect(first.getRecommendations(), isEmpty);
    expect(second.audiencePreference, KioskCatalogAudience.women);
    expect(second.getRecommendations(), isNotEmpty);
    first.beginSession();
    expect(first.audiencePreference, isNull);
    expect(
      first.getRecommendations().any((p) => p.audience == 'WOMEN'),
      isTrue,
    );
  });

  test(
    'missing cache and read failures return empty; later cache can supply results',
    () {
      var products = <KioskCatalogProduct>[];
      var unavailable = false;
      final service = KioskProductRecommendationService(
        cachedProducts: () {
          if (unavailable) throw StateError('Cache unavailable');
          return products;
        },
        initialRotation: 0,
      )..beginSession();
      expect(service.getRecommendations(), isEmpty);
      unavailable = true;
      expect(service.getRecommendations(), isEmpty);
      unavailable = false;
      products = [_product('one', 'MEN')];
      expect(service.getRecommendations().single.id, 'one');
      products = [_product('new', 'WOMEN')];
      expect(service.getRecommendations().single.id, 'one');
      service.endSession();
      service.beginSession();
      expect(service.getRecommendations().single.id, 'new');
    },
  );

  test(
    'product verticals stay separate without fetching an uncached vertical',
    () {
      final service = _service([
        _product('garment', 'ALL'),
        _product('jewel', 'UNISEX', vertical: KioskProductVertical.jewellery),
      ])..beginSession();
      expect(service.getRecommendations().single.id, 'garment');
      service.endSession();
      service.beginSession(productVertical: KioskProductVertical.jewellery);
      expect(service.getRecommendations().single.id, 'jewel');
    },
  );

  test(
    'finish clears recommendations immediately while backend completion is pending',
    () async {
      final service = _service(_catalog());
      final gateway = _PendingCompletionGateway();
      final session = KioskTryOnSessionController(
        gateway: gateway,
        recommendations: service,
      );
      final capture = fixtures.testController();
      addTearDown(session.dispose);
      addTearDown(capture.dispose);
      await session.beginCustomerSession();
      service.setAudiencePreference(KioskCatalogAudience.men);
      expect(service.getRecommendations(), isNotEmpty);
      final finishing = session.finish(capture);
      expect(service.sessionActive, isFalse);
      expect(service.audiencePreference, isNull);
      expect(service.getRecommendations(), isEmpty);
      gateway.completion.completeError(StateError('Network unavailable'));
      await finishing;
      await session.beginCustomerSession();
      expect(service.audiencePreference, isNull);
      expect(
        service.getRecommendations().any((p) => p.audience == 'WOMEN'),
        isTrue,
      );
    },
  );

  test(
    'early session exit and controller disposal reset recommendation state',
    () async {
      final service = _service(_catalog());
      final session = KioskTryOnSessionController(
        gateway: fixtures.FakeKioskTryOnGateway(),
        recommendations: service,
      );
      await session.beginCustomerSession();
      service.setAudiencePreference(KioskCatalogAudience.women);
      session.endCustomerSession();
      expect(service.getRecommendations(), isEmpty);
      expect(service.audiencePreference, isNull);
      await session.beginCustomerSession();
      expect(service.getRecommendations(), isNotEmpty);
      session.dispose();
      expect(service.sessionActive, isFalse);
      expect(service.getRecommendations(), isEmpty);
    },
  );
}

KioskProductRecommendationService _service(
  List<KioskCatalogProduct> products,
) => KioskProductRecommendationService(
  cachedProducts: () => products,
  initialRotation: 0,
);

List<KioskCatalogProduct> _catalog() => [
  for (final audience in ['MEN', 'WOMEN', 'UNISEX', 'ALL'])
    for (var i = 0; i < 8; i++) _product('$audience-$i', audience),
];

KioskCatalogProduct _product(
  String id,
  String audience, {
  bool usable = true,
  KioskProductVertical vertical = KioskProductVertical.garment,
}) => KioskCatalogProduct(
  id: id,
  name: id,
  audience: audience,
  productVertical: vertical,
  category: const KioskCatalogProductCategory(
    id: 'tops',
    name: 'Tops',
    slug: 'tops',
  ),
  garmentIntent: KioskGarmentIntent.top,
  garmentCategory: 'TOPS',
  garmentPhotoType: KioskGarmentPhotoType.auto,
  image: KioskCatalogProductImage(
    url: usable ? 'https://example.test/$id.jpg' : null,
    cacheKey: id,
    localPath: '/cache/$id.jpg',
  ),
  updatedAt: '2026-10-12T00:00:00Z',
);

class _PendingCompletionGateway extends fixtures.FakeKioskTryOnGateway {
  final completion = Completer<KioskTryOnSession>();
  @override
  Future<KioskTryOnSession> completeTryOnSession(
    String sessionId, {
    KioskTryOnSessionCompletionReason reason =
        KioskTryOnSessionCompletionReason.finished,
  }) => completion.future;
}
