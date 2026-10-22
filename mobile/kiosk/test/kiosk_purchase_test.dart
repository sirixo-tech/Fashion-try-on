import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:selfx_kiosk/src/shopping/kiosk_purchase_screen.dart';
import 'package:selfx_kiosk/src/shopping/kiosk_shopping_gateway.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_button.dart';
import 'package:selfx_kiosk/src/catalog/kiosk_catalog_models.dart';
import 'kiosk_camera_foundation_test.dart' as fixtures;

class ShoppingFake implements KioskShoppingGateway {
  final calls = <({String method, String path, Map<String, dynamic>? body})>[];
  late Future<Map<String, dynamic>> Function(
    String,
    String,
    Map<String, dynamic>?,
  )
  respond;
  @override
  Future<Map<String, dynamic>> request(
    String method,
    String path, [
    Map<String, dynamic>? body,
  ]) {
    calls.add((method: method, path: path, body: body));
    return respond(method, path, body);
  }
}

class SessionFake extends fixtures.FakeKioskTryOnGateway
    implements KioskShoppingGatewayOwner {
  SessionFake(this.shopping);
  @override
  final KioskShoppingGateway shopping;
}

Map<String, dynamic> stock() => {
  'productId': 'shirt',
  'productName': 'Shirt',
  'storeName': 'Avinash stores',
  'configured': true,
  'optionMode': 'SIZE_COLOR',
  'priceCurrency': 'INR',
  'basePriceAmountCents': 10000,
  'totalAvailableStockQuantity': 3,
  'imageUrl': null,
  'colorImages': [],
  'variants': [
    {
      'id': 'blue-m',
      'size': 'M',
      'color': 'Blue',
      'availableStockQuantity': 3,
      'effectivePriceAmountCents': 12000,
    },
    {
      'id': 'blue-l',
      'size': 'L',
      'color': 'Blue',
      'availableStockQuantity': 0,
      'effectivePriceAmountCents': 13000,
    },
    {
      'id': 'red-m',
      'size': 'M',
      'color': 'Red',
      'availableStockQuantity': 0,
      'effectivePriceAmountCents': 10000,
    },
  ],
};
Map<String, dynamic> cart() => {
  'version': 2,
  'items': [],
  'issues': [],
  'canCheckout': false,
  'paymentAvailable': true,
  'currency': 'INR',
  'taxCents': 0,
  'totalCents': 0,
  'quoteFingerprint': 'quote',
  'serverTime': '2026-10-21T00:00:00Z',
};
Map<String, dynamic> order({bool expired = false}) => {
  'id': 'order',
  'reference': 'SX-001',
  'status': 'PAYMENT_PENDING',
  'totalCents': 12000,
  'currency': 'INR',
  'serverTime': '2026-10-21T00:00:00Z',
  'expiresAt': expired ? '2026-10-20T23:59:00Z' : '2026-10-21T00:05:00Z',
  'paymentAttempts': [
    {'id': 'old', 'createdAt': '2026-10-20T23:58:00Z'},
    {'id': 'new', 'createdAt': '2026-10-21T00:00:00Z'},
  ],
};

void main() {
  test('catalog preserves one product and variable pricing through cache serialization', () {
    final json = fixtures.testCatalogProduct(id: 'one-product', name: 'Shirt').toJson();
    json['priceAmountCents'] = 10000;
    json['minimumPriceAmountCents'] = 12000;
    json['priceCurrency'] = 'INR';
    json['hasVariablePrices'] = true;
    final product = KioskCatalogProduct.fromJson(json);
    expect(product.displayPrice, 'From ₹120');
    expect(KioskCatalogProduct.fromJson(product.copyWith().toJson()).displayPrice, 'From ₹120');
    expect(product.id, 'one-product');
  });
  Future<KioskTryOnSessionController> show(
    WidgetTester tester,
    ShoppingFake gateway, {
    Map<String, dynamic>? item,
    Map<String, dynamic>? initial,
  }) async {
    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final session = KioskTryOnSessionController(gateway: SessionFake(gateway))
      ..customerSessionActive = true
      ..activeSessionId = 'session';
    await tester.pumpWidget(
      MaterialApp(
        home: KioskPurchaseScreen(
          gateway: gateway,
          controller: session,
          revision: session.customerSessionRevision,
          sessionId: 'session',
          stock: item ?? stock(),
          initialCart: initial ?? cart(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      session.dispose();
    });
    return session;
  }

  testWidgets(
    'enables only in-stock combinations, changes price and sends selected identity',
    (tester) async {
      final gateway = ShoppingFake()
        ..respond = (method, path, body) async => {
          ...cart(),
          'items': [
            {
              'productName': 'Shirt',
              'variantId': 'blue-m',
              'quantity': 1,
              'totalCents': 12000,
            },
          ],
          'totalCents': 12000,
          'canCheckout': true,
        };
      await show(tester, gateway);
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Red'))
            .onSelected,
        isNull,
      );
      await tester.tap(find.text('Blue'));
      await tester.pump();
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'L'))
            .onSelected,
        isNull,
      );
      await tester.tap(find.text('M'));
      await tester.pump();
      expect(
        tester.widget<Text>(find.byKey(const Key('purchase-price'))).data,
        'INR 120.00',
      );
      await tester.ensureVisible(find.text('Add to order'));
      await tester.tap(find.text('Add to order'));
      await tester.pumpAndSettle();
      expect(gateway.calls.single.body, {
        'expectedVersion': 2,
        'items': [
          {'variantId': 'blue-m', 'quantity': 1},
        ],
      });
    },
  );
  testWidgets(
    'uses optional colour image and falls back to main image for other colours',
    (tester) async {
      final item = stock();
      item['imageUrl'] = 'https://example.test/main.jpg';
      item['colorImages'] = [
        {'color': 'Blue', 'url': 'https://example.test/blue.jpg'},
      ];
      final gateway = ShoppingFake()..respond = (_, _, _) async => cart();
      await show(tester, gateway, item: item);
      expect(
        tester.widget<Image>(find.byType(Image).first).image,
        isA<NetworkImage>().having(
          (image) => image.url,
          'url',
          'https://example.test/main.jpg',
        ),
      );
      await tester.tap(find.text('Blue'));
      await tester.pump();
      expect(
        tester.widget<Image>(find.byType(Image).first).image,
        isA<NetworkImage>().having(
          (image) => image.url,
          'url',
          'https://example.test/blue.jpg',
        ),
      );
    },
  );
  testWidgets(
    'resumes newest attempt, hides expired QR and never claims unknown payment succeeded',
    (tester) async {
      final gateway = ShoppingFake()
        ..respond = (method, path, body) async {
          if (path.endsWith('/orders/order')) return order(expired: true);
          return {
            'id': 'new',
            'status': 'UNKNOWN',
            'qrString': 'upi://do-not-display',
            'testOnly': false,
          };
        };
      await show(
        tester,
        gateway,
        initial: {...cart(), 'activeOrderId': 'order'},
      );
      expect(gateway.calls.last.path, endsWith('/payments/new'));
      expect(find.byType(QrImageView), findsNothing);
      expect(find.textContaining('Payment time has ended'), findsOneWidget);
      expect(find.byKey(const Key('purchase-paid')), findsNothing);
      expect(find.text('Continue to payment'), findsNothing);
    },
  );
  testWidgets(
    'reuses checkout key after interrupted request and shows verified paid state',
    (tester) async {
      var starts = 0;
      var paid = false;
      final gateway = ShoppingFake()
        ..respond = (method, path, body) async {
          if (path.endsWith('/checkout')) {
            if (++starts == 1) throw Exception('network interrupted');
            return order();
          }
          if (path.endsWith('/payments')) {
            return {
              'id': 'new',
              'status': 'PENDING',
              'qrString': 'upi://fixture',
              'testOnly': false,
            };
          }
          if (path.endsWith('/check')) {
            paid = true;
            return {'id': 'new', 'status': 'SUCCEEDED'};
          }
          if (path.endsWith('/orders/order')) {
            return {...order(), 'status': paid ? 'PAID' : 'PAYMENT_PENDING'};
          }
          return cart();
        };
      await show(
        tester,
        gateway,
        initial: {
          ...cart(),
          'canCheckout': true,
          'items': [
            {
              'productName': 'Shirt',
              'variantId': 'blue-m',
              'quantity': 1,
              'totalCents': 12000,
            },
          ],
        },
      );
      await tester.ensureVisible(find.text('Pay'));
      await tester.tap(find.text('Pay'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pay'));
      await tester.pumpAndSettle();
      final requests = gateway.calls
          .where((c) => c.path.endsWith('/checkout'))
          .toList();
      expect(requests[0].body, requests[1].body);
      expect(find.byType(QrImageView), findsOneWidget);
      expect(find.byKey(const Key('purchase-paid')), findsNothing);
      await tester.ensureVisible(find.text('Check payment status'));
      await tester.tap(find.text('Check payment status'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('purchase-paid')), findsOneWidget);
      expect(find.byType(QrImageView), findsNothing);
    },
  );
  testWidgets(
    'entirely sold-out product gives Store-named toast without opening purchase page',
    (tester) async {
      final gateway = ShoppingFake()
        ..respond = (_, path, _) async => path.endsWith('/stock')
            ? {...stock(), 'totalAvailableStockQuantity': 0}
            : cart();
      final session = KioskTryOnSessionController(gateway: SessionFake(gateway))
        ..customerSessionActive = true
        ..activeSessionId = 'session';
      addTearDown(session.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => openKioskPurchase(context, session, 'shirt'),
                child: const Text('Buy'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Buy'));
      await tester.pumpAndSettle();
      expect(
        find.text('Out of stock. Please contact Avinash stores.'),
        findsOneWidget,
      );
      expect(find.byType(KioskPurchaseScreen), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets('ended session clears payment controls', (tester) async {
    final gateway = ShoppingFake()..respond = (_, _, _) async => cart();
    final session = await show(tester, gateway);
    session.customerSessionActive = false;
    session.holdPurchaseDisplay(null);
    await tester.pump();
    expect(find.text('Back to Home'), findsOneWidget);
    expect(find.byType(SelfxKioskButton), findsOneWidget);
  });
}
