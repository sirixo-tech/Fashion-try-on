import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/catalog/kiosk_catalog_models.dart';

void main() {
  final reference = <String, dynamic>{
    'id': 'website-product',
    'name': 'Dress',
    'audience': 'WOMEN',
    'category': {'id': 'dresses', 'name': 'Dresses', 'slug': 'dresses'},
    'garmentIntent': 'ONE_PIECE',
    'garmentCategory': 'ONE_PIECE',
    'garmentPhotoType': 'FLAT_LAY',
    'updatedAt': '2026-10-23T00:00:00Z',
    'image': {'url': 'https://shop.example/dress.jpg', 'cacheKey': 'dress'},
    'priceAmountCents': 1000,
    'priceCurrency': 'INR',
  };
  test(
    'imported reference never regains buying or price through caching and selection',
    () {
      final product = KioskCatalogProduct.fromJson({
        ...reference,
        'nativePurchasingAllowed': false,
      });
      final cached = KioskCatalogProduct.fromJson(product.copyWith().toJson());
      expect(cached.displayPrice, isNull);
      expect(cached.nativePurchasingAllowed, isFalse);
      expect(cached.toGarmentInput().nativePurchasingAllowed, isFalse);
      expect(
        cached
            .toGarmentInput()
            .withoutExtractedPreview()
            .nativePurchasingAllowed,
        isFalse,
      );
    },
  );
  test('native SelfX products retain purchasing and price', () {
    final product = KioskCatalogProduct.fromJson(reference);
    expect(product.nativePurchasingAllowed, isTrue);
    expect(product.displayPrice, '₹10');
    expect(product.toGarmentInput().nativePurchasingAllowed, isTrue);
  });
}
