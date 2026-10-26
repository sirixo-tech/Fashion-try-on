import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:selfx_kiosk/src/shopping/kiosk_shopping_gateway.dart';
import 'kiosk_try_on_gateway_test.dart' as fixtures;

void main() {
  test(
    'uses only device identity, preserves payload and rejects redirects',
    () async {
      final device = fixtures.testDeviceController('device-only-token');
      addTearDown(device.dispose);
      var count = 0;
      final gateway = SelfxKioskShoppingGateway(
        baseUrl: 'https://api.selfx.test',
        deviceController: device,
        client: MockClient((request) async {
          count++;
          expect(request.headers['authorization'], 'Bearer device-only-token');
          expect(request.followRedirects, isFalse);
          expect(request.url.origin, 'https://api.selfx.test');
          expect(jsonDecode(request.body), {
            'expectedVersion': 4,
            'items': [
              {'variantId': 'variant', 'quantity': 2},
            ],
          });
          return http.Response(jsonEncode({'version': 5}), 200);
        }),
      );
      expect(
        await gateway.request(
          'PUT',
          '/api/v1/kiosk/try-on/sessions/session/shopping/cart',
          {
            'expectedVersion': 4,
            'items': [
              {'variantId': 'variant', 'quantity': 2},
            ],
          },
        ),
        {'version': 5},
      );
      expect(count, 1);
    },
  );
  for (final base in [
    'http://api.selfx.test',
    'https://user:pass@api.selfx.test',
    'https://api.selfx.test?other=1',
  ]) {
    test(
      'rejects unsafe API base $base before transmitting device identity',
      () async {
        final device = fixtures.testDeviceController('private-token');
        addTearDown(device.dispose);
        final gateway = SelfxKioskShoppingGateway(
          baseUrl: base,
          deviceController: device,
          client: MockClient((_) async => throw StateError('Must not send')),
        );
        expect(
          () => gateway.request(
            'GET',
            '/api/v1/kiosk/catalog/products/product/stock',
          ),
          throwsA(isA<KioskShoppingException>()),
        );
      },
    );
  }
  test('rejects non-kiosk paths and traversal before transmitting', () async {
    final device = fixtures.testDeviceController('private-token');
    addTearDown(device.dispose);
    final gateway = SelfxKioskShoppingGateway(
      baseUrl: 'https://api.selfx.test',
      deviceController: device,
      client: MockClient((_) async => throw StateError('Must not send')),
    );
    for (final path in [
      '/api/v1/admin/stores',
      '/api/v1/kiosk/../admin',
      'https://other.test/api/v1/kiosk/',
    ]) {
      expect(
        () => gateway.request('GET', path),
        throwsA(isA<KioskShoppingException>()),
      );
    }
  });
}
