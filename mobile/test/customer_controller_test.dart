import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'fakes.dart';

void main() {
  test(
    'restores customer sessions using only securely persisted refresh tokens',
    () async {
      final api = FakeCustomerApi(),
          store = MemorySessionStore(token: 'old-refresh');
      final controller = CustomerController(
        api: api,
        store: store,
        identity: FakeIdentity(),
      );
      addTearDown(controller.dispose);
      await controller.initialize();
      expect(api.refreshes, 1);
      expect(store.token, 'synthetic-refresh');
      expect(controller.stage, CustomerStage.ready);
      expect(controller.profile?.id, 'customer-a');
    },
  );
  test(
    'drops revoked credentials instead of displaying a cached profile',
    () async {
      final api = FakeCustomerApi(),
          store = MemorySessionStore(token: 'revoked-refresh');
      api.handler = (path, method, body) async {
        if (path == '/auth/capabilities') {
          return {
            'enabled': true,
            'providers': {},
            'termsVersion': '2026-10-25',
          };
        }
        throw const CustomerApiException(
          'CUSTOMER_UNAUTHORIZED',
          'Please sign in again.',
          401,
        );
      };
      final controller = CustomerController(
        api: api,
        store: store,
        identity: FakeIdentity(),
      );
      addTearDown(controller.dispose);
      await controller.initialize();
      expect(store.token, isNull);
      expect(controller.profile, isNull);
      expect(controller.stage, CustomerStage.authentication);
    },
  );
  test(
    'keeps refresh credentials on a network failure so retry can recover',
    () async {
      final api = FakeCustomerApi(),
          store = MemorySessionStore(token: 'retry-refresh');
      api.handler = (path, method, body) async =>
          throw const CustomerApiException(
            'CONNECTION_UNAVAILABLE',
            'Check your connection.',
          );
      final controller = CustomerController(
        api: api,
        store: store,
        identity: FakeIdentity(),
      );
      addTearDown(controller.dispose);
      await controller.initialize();
      expect(store.token, 'retry-refresh');
      expect(controller.stage, CustomerStage.recovery);
      api.handler = null;
      await controller.initialize();
      expect(controller.stage, CustomerStage.ready);
    },
  );
  test('discards an in-flight sign in after logout', () async {
    final api = FakeCustomerApi(), store = MemorySessionStore();
    final controller = CustomerController(
      api: api,
      store: store,
      identity: FakeIdentity(),
    );
    addTearDown(controller.dispose);
    await controller.initialize();
    final completion = Completer<Map<String, dynamic>>();
    api.handler = (path, method, body) async {
      if (path == '/auth/login') return completion.future;
      if (path == '/auth/logout') return {};
      if (path == '/auth/refresh') {
        throw const CustomerApiException(
          'CUSTOMER_UNAUTHORIZED',
          'Sign in.',
          401,
        );
      }
      return api.profile;
    };
    final pending = controller.signIn(
      'customer@example.test',
      'a-secure-password',
    );
    try {
      await controller.signOut();
    } catch (_) {
      /* There is no prior session. */
    }
    completion.complete(api.bundle());
    await pending;
    expect(controller.profile, isNull);
    expect(store.token, isNull);
    expect(controller.stage, CustomerStage.authentication);
  });
  test('rejects insecure and credential-bearing API endpoints by default', () {
    for (final address in [
      'http://api.example.test',
      'https://name:secret@api.example.test',
      'https://api.example.test/path',
      '',
    ]) {
      expect(
        () => HttpCustomerApi(address),
        throwsA(isA<CustomerApiException>()),
      );
    }
  });
}
