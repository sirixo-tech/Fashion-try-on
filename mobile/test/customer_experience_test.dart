import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/customer_app.dart';
import 'package:selfx_customer/src/experience/customer_experience.dart';
import 'package:selfx_customer/src/experience/customer_media.dart';
import 'package:selfx_customer/src/ui/customer_experience_screens.dart';
import 'fakes.dart';

final syntheticPhoto = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/fteaysAAAAASUVORK5CYII=',
);

class MediaApi extends FakeCustomerApi implements CustomerMediaApi {
  final uploads = <String>[];
  @override
  Future<Map<String, dynamic>> upload(
    String path,
    Uint8List bytes,
    String mime,
    String token,
  ) async {
    uploads.add(path);
    return {
      'id': path.endsWith('PERSON') ? 'person-photo' : 'outfit-photo',
      'url': 'https://private.invalid/photo',
      'expiresAt': DateTime.now()
          .add(const Duration(days: 7))
          .toIso8601String(),
    };
  }

  @override
  Future<Uint8List> download(String path, String token) async => syntheticPhoto;
}

class PhotoPicker implements CustomerPhotoPicker {
  int selections = 0;
  @override
  Future<void> discardLost() async {}
  @override
  Future<PickedCustomerPhoto?> pick(CustomerPhotoSource source) async {
    selections++;
    return PickedCustomerPhoto(syntheticPhoto, 'image/png');
  }
}

void main() {
  late MediaApi api;
  late CustomerController auth;
  late CustomerExperience exp;
  Map<String, dynamic> summary({int remaining = 10}) => {
    'generationAvailable': true,
    'consentVersion': '2026-10-26',
    'consentStatement':
        'SelfX may process my chosen photos. Originals expire within 7 days; results within 30 days.',
    'storeConsentStatement':
        'The Store pays, with no personal credit fallback.',
    'trial': {
      'granted': 10,
      'used': 10 - remaining,
      'reserved': 0,
      'remaining': remaining,
    },
  };
  Map<String, dynamic> response(
    String path,
    String method,
    Map<String, dynamic>? body, {
    int remaining = 10,
  }) {
    if (path == '/experience') return summary(remaining: remaining);
    if (path == '/me') return api.profile;
    if (path == '/try-on/sessions') {
      return {'id': 'photo-session', 'payer': 'PERSONAL'};
    }
    if (path == '/try-on/runs') {
      return {
        'id': 'run-one',
        'sessionId': 'photo-session',
        'status': 'QUEUED',
        'payer': 'PERSONAL',
        'result': null,
      };
    }
    if (path == '/store-visits' && method == 'POST') {
      return {
        'id': 'store-visit',
        'store': {'id': 'store-a', 'name': 'Test Store'},
        'payer': 'STORE',
        'dailyCustomerLimit': 5,
      };
    }
    if (path.contains('/products')) {
      return {
        'data': <Map<String, dynamic>>[],
        'pagination': {'hasMore': false},
      };
    }
    if (path.startsWith('/looks')) {
      return {
        'data': <Map<String, dynamic>>[],
        'pagination': {'hasMore': false},
      };
    }
    return {'message': 'Done'};
  }

  setUp(() async {
    api = MediaApi();
    auth = CustomerController(
      api: api,
      store: MemorySessionStore(),
      identity: FakeIdentity(),
    );
    await auth.initialize();
    await auth.signIn('synthetic@example.test', 'synthetic-passphrase');
    api.handler = (path, method, body) async => response(path, method, body);
    exp = CustomerExperience(auth);
    await exp.refresh();
  });
  tearDown(() {
    exp.dispose();
    auth.dispose();
  });
  Future<void> photos() async {
    await exp.begin();
    await exp.upload('PERSON', syntheticPhoto, 'image/png');
    await exp.upload('GARMENT', syntheticPhoto, 'image/png');
  }

  test(
    'consent records the chosen language and falls back for an untranslated policy',
    () async {
      auth.language = 'ta';
      await exp.begin();
      expect(
        api.calls
            .lastWhere((call) => call.path == '/try-on/sessions')
            .body!['consentLanguage'],
        'ta',
      );
      exp.summary!['consentVersion'] = 'future-policy';
      await exp.begin();
      expect(
        api.calls
            .lastWhere((call) => call.path == '/try-on/sessions')
            .body!['consentLanguage'],
        'en',
      );
    },
  );
  test(
    'uses the personal free trial and records consent before photo upload',
    () async {
      expect(exp.remaining, 10);
      await photos();
      expect(exp.canGenerate, isTrue);
      final consent = api.calls.firstWhere(
        (call) => call.path == '/try-on/sessions',
      );
      expect(consent.body, {
        'consentAccepted': true,
        'consentVersion': '2026-10-26',
        'consentLanguage': 'en',
      });
      await exp.generate();
      final request = api.calls
          .lastWhere((call) => call.path == '/try-on/runs')
          .body!;
      expect(request['personAssetId'], 'person-photo');
      expect(request['garmentAssetId'], 'outfit-photo');
      expect(request.containsKey('organizationId'), isFalse);
      expect(request.containsKey('payer'), isFalse);
      expect(exp.generating, isTrue);
    },
  );
  test('reuses its request ID after an uncertain network failure', () async {
    await photos();
    int attempts = 0;
    api.handler = (path, method, body) async {
      if (path == '/try-on/runs' && ++attempts == 1) {
        throw const CustomerApiException(
          'CONNECTION',
          'Connection interrupted',
        );
      }
      return response(path, method, body);
    };
    await expectLater(exp.generate(), throwsA(isA<CustomerApiException>()));
    expect(exp.hasUncertainRequest, isTrue);
    await exp.generate();
    final requests = api.calls
        .where((call) => call.path == '/try-on/runs')
        .toList();
    expect(requests, hasLength(2));
    expect(
      requests[0].body!['clientRequestId'],
      requests[1].body!['clientRequestId'],
    );
  });
  test(
    'a Store session works with no personal credits and never falls back to them',
    () async {
      api.handler = (path, method, body) async =>
          response(path, method, body, remaining: 0);
      await exp.refresh();
      await exp.joinStore('a' * 43);
      await exp.begin(storeProduct: {'id': 'store-product', 'name': 'Shirt'});
      await exp.upload('PERSON', syntheticPhoto, 'image/png');
      expect(exp.canGenerate, isTrue);
      api.handler = (path, method, body) async {
        if (path == '/try-on/runs') {
          throw const CustomerApiException(
            'STORE_CREDITS_EXHAUSTED',
            'Store allowance is used up.',
            402,
          );
        }
        return response(path, method, body, remaining: 0);
      };
      await expectLater(exp.generate(), throwsA(isA<CustomerApiException>()));
      final requests = api.calls
          .where((call) => call.path == '/try-on/runs')
          .toList();
      expect(requests, hasLength(1));
      expect(requests.single.body!['productId'], 'store-product');
      expect(requests.single.body!.containsKey('garmentAssetId'), isFalse);
      expect(exp.storeMode, isTrue);
      expect(exp.remaining, 0);
      expect(exp.hasUncertainRequest, isFalse);
    },
  );
  test('ignores a late customer response after sign-out', () async {
    final pending = Completer<Map<String, dynamic>>();
    api.handler = (path, method, body) async =>
        path == '/experience' ? pending.future : response(path, method, body);
    final request = exp.refresh();
    await auth.signOut();
    pending.complete(summary());
    await request;
    expect(exp.summary, isNull);
    expect(exp.personPreview, isNull);
    expect(exp.looks, isEmpty);
  });
  test(
    'keeps a retryable Store catalog error separate from an empty catalog',
    () async {
      api.handler = (path, method, body) async {
        if (path.contains('/products')) {
          throw const CustomerApiException(
            'CONNECTION',
            'Could not load Store products.',
          );
        }
        return response(path, method, body);
      };
      await expectLater(
        exp.joinStore('a' * 43),
        throwsA(isA<CustomerApiException>()),
      );
      expect(exp.storeMode, isTrue);
      expect(exp.productsLoading, isFalse);
      expect(exp.productsError, 'Could not load Store products.');
      api.handler = (path, method, body) async => response(path, method, body);
      await exp.loadProducts();
      expect(exp.productsError, isNull);
    },
  );
  test(
    'restores an in-progress generation from the server after app restart',
    () async {
      api.handler = (path, method, body) async {
        if (path == '/experience') {
          return {...summary(), 'pendingRunId': 'run-one'};
        }
        if (path == '/try-on/runs/run-one') {
          return {
            'id': 'run-one',
            'sessionId': 'photo-session',
            'status': 'PROCESSING',
            'payer': 'STORE',
          };
        }
        return response(path, method, body);
      };
      await exp.refresh();
      expect(exp.generating, isTrue);
      expect(exp.session!['id'], 'photo-session');
      expect(api.calls.where((call) => call.path == '/try-on/runs'), isEmpty);
    },
  );
  test(
    'does not generate personal looks with exhausted trial credits',
    () async {
      api.handler = (path, method, body) async =>
          response(path, method, body, remaining: 0);
      await exp.refresh();
      await photos();
      expect(exp.canGenerate, isFalse);
      await exp.generate();
      expect(api.calls.where((call) => call.path == '/try-on/runs'), isEmpty);
    },
  );
  testWidgets(
    'opens real plans, then requires consent before any camera or gallery selection',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final picker = PhotoPicker();
      await tester.pumpWidget(CustomerApp(controller: auth, picker: picker));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Plans'));
      await tester.pumpAndSettle();
      expect(find.text('Free trial'), findsOneWidget);
      expect(find.text('10 Try-Ons left'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Explore Try-On'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Explore Try-On'));
      await tester.pumpAndSettle();
      expect(find.text('Your photos. Your choice.'), findsOneWidget);
      expect(picker.selections, 0);
      expect(api.uploads, isEmpty);
      await tester.ensureVisible(find.text('Agree & continue'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Agree & continue'));
      await tester.pumpAndSettle();
      expect(find.byType(CustomerStudio), findsOneWidget);
      await tester.ensureVisible(find.text('Add Your photo'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add Your photo'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose from photos'));
      await tester.pumpAndSettle();
      expect(picker.selections, 1);
      expect(api.uploads.single, contains('/photo-session/photos/PERSON'));
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
