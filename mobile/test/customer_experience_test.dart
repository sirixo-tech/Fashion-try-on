import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/customer_app.dart';
import 'package:selfx_customer/src/experience/customer_experience.dart';
import 'package:selfx_customer/src/experience/customer_media.dart';
import 'package:selfx_customer/src/ui/customer_demo_catalog.dart';
import 'package:selfx_customer/src/ui/customer_experience_screens.dart';
import 'package:selfx_customer/src/ui/customer_generating_look.dart';
import 'package:selfx_customer/src/ui/customer_quick_tryon.dart';
import 'package:selfx_customer/src/ui/customer_result_suggestions.dart';
import 'package:selfx_customer/src/ui/customer_theme.dart';
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
    if (path == '/demo-catalog') {
      return {
        'products': <Map<String, dynamic>>[
          {
            'id': 'terracotta-blazer',
            'name': 'Terracotta Blazer',
            'category': 'WOMEN',
            'type': 'TOP',
          },
        ],
        'models': <Map<String, dynamic>>[
          {'id': 'muse', 'name': 'Maya', 'category': 'WOMEN'},
        ],
      };
    }
    if (path.endsWith('/demo/PERSON')) {
      return {
        'id': 'demo-model-photo',
        'url': 'https://private.invalid/model',
        'expiresAt': DateTime.now()
            .add(const Duration(days: 7))
            .toIso8601String(),
      };
    }
    if (path.endsWith('/demo/GARMENT')) {
      return {
        'id': 'demo-garment-photo',
        'url': 'https://private.invalid/garment',
        'expiresAt': DateTime.now()
            .add(const Duration(days: 7))
            .toIso8601String(),
      };
    }
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
    'result suggestions stay in category and prefer complementary pieces',
    () {
      exp.demoProducts = [
        {'id': 'jacket', 'name': 'Jacket', 'category': 'WOMEN', 'type': 'TOP'},
        {'id': 'shirt', 'name': 'Shirt', 'category': 'WOMEN', 'type': 'TOP'},
        {
          'id': 'trousers',
          'name': 'Trousers',
          'category': 'WOMEN',
          'type': 'BOTTOM',
        },
        {
          'id': 'mens-shirt',
          'name': 'Men shirt',
          'category': 'MEN',
          'type': 'TOP',
        },
      ];
      exp.demoProduct = exp.demoProducts.first;
      expect(suggestedResultGarments(exp).map((item) => item['id']).toList(), [
        'trousers',
        'shirt',
      ]);
    },
  );
  test('explains when the saved-garments API route is unavailable', () async {
    api.handler = (path, method, body) async {
      if (path == '/saved-garments' && method == 'POST') {
        throw const CustomerApiException('REQUEST_FAILED', 'Not Found', 404);
      }
      return response(path, method, body);
    };
    await expectLater(
      exp.toggleSavedGarment('DEMO', 'terracotta-blazer'),
      throwsA(
        isA<CustomerApiException>().having(
          (error) => error.code,
          'code',
          'SAVED_GARMENTS_UNAVAILABLE',
        ),
      ),
    );
  });

  test(
    'updates the wishlist after a successful save without a second request',
    () async {
      exp.demoProducts = [
        {'id': 'terracotta-blazer', 'name': 'Terracotta Blazer'},
      ];
      await exp.toggleSavedGarment('DEMO', 'terracotta-blazer');
      expect(exp.isGarmentSaved('DEMO', 'terracotta-blazer'), isTrue);
      expect(
        api.calls.where((call) => call.path == '/saved-garments').length,
        1,
      );
      await exp.toggleSavedGarment('DEMO', 'terracotta-blazer');
      expect(exp.isGarmentSaved('DEMO', 'terracotta-blazer'), isFalse);
    },
  );
  testWidgets('saved garment card and button open Try-On; heart only removes', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    api.handler = (path, method, body) async {
      if (path == '/saved-garments' && method == 'GET') {
        return {
          'items': [
            {
              'source': 'DEMO',
              'id': 'terracotta-blazer',
              'product': {
                'id': 'terracotta-blazer',
                'name': 'Terracotta Blazer',
                'category': 'WOMEN',
                'type': 'TOP',
              },
            },
          ],
        };
      }
      return response(path, method, body);
    };
    final opened = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        theme: customerTheme(),
        home: Scaffold(
          body: CustomerSavedScreen(
            experience: exp,
            onHome: () {},
            onPlans: () {},
            onTryOnGarment: (item, store) async {
              expect(store, isFalse);
              opened.add(item['id'] as String);
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Wardrobe'));
    await tester.pumpAndSettle();
    expect(find.byType(FilledButton), findsOneWidget);
    await tester.tap(find.text('Terracotta Blazer'));
    await tester.pumpAndSettle();
    expect(opened, ['terracotta-blazer']);
    await tester.tap(find.text('Try on'));
    await tester.pumpAndSettle();
    expect(opened, ['terracotta-blazer', 'terracotta-blazer']);
    await tester.tap(find.byTooltip('Remove saved garment'));
    await tester.pumpAndSettle();
    expect(opened, hasLength(2));
    expect(exp.savedGarments, isEmpty);
  });

  testWidgets('generating look shows selected inputs without fake progress', (
    tester,
  ) async {
    exp.personPreview = syntheticPhoto;
    exp.outfitPreview = syntheticPhoto;
    exp.run = {'id': 'run', 'status': 'QUEUED'};
    await tester.pumpWidget(
      MaterialApp(
        theme: customerTheme(),
        home: Scaffold(body: CustomerGeneratingLook(experience: exp)),
      ),
    );
    expect(find.text('Your look is queued'), findsOneWidget);
    expect(find.textContaining('%'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('completed look keeps result actions in a compact viewport', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 620);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    exp.run = {
      'id': 'run-one',
      'status': 'COMPLETED',
      'result': {
        'id': 'result-one',
        'url': 'https://private.invalid/result',
        'expiresAt': DateTime.now()
            .add(const Duration(days: 7))
            .toIso8601String(),
      },
    };
    exp.demoProducts = [
      {
        'id': 'terracotta-blazer',
        'name': 'Terracotta Blazer',
        'category': 'WOMEN',
        'type': 'TOP',
      },
      {
        'id': 'burgundy-dress',
        'name': 'Burgundy Midi Dress',
        'category': 'WOMEN',
        'type': 'ONE_PIECE',
      },
    ];
    exp.demoProduct = exp.demoProducts.first;
    await tester.pumpWidget(
      MaterialApp(
        theme: customerTheme(),
        home: Scaffold(
          body: CustomerQuickTryOn(
            experience: exp,
            picker: PhotoPicker(),
            onChooseProduct: () {},
            onViewSaved: () {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Your look'), findsOneWidget);
    expect(find.text('Download'), findsOneWidget);
    expect(find.text('View in Saved'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

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
  test(
    'demo outfit and model use personal credits and temporary copied assets',
    () async {
      await exp.loadDemoCatalog();
      expect(exp.demoProducts.single['name'], 'Terracotta Blazer');
      await exp.begin(
        selectedDemoProduct: exp.demoProducts.single,
        selectedDemoModelId: 'muse',
      );
      expect(exp.demoModelId, 'muse');
      expect(exp.person?.id, 'demo-model-photo');
      expect(exp.outfit?.id, 'demo-garment-photo');
      expect(exp.canGenerate, isTrue);
      await exp.generate();
      final request = api.calls
          .lastWhere((call) => call.path == '/try-on/runs')
          .body!;
      expect(request['personAssetId'], 'demo-model-photo');
      expect(request['garmentAssetId'], 'demo-garment-photo');
      expect(request.containsKey('productId'), isFalse);
      expect(
        api.calls
            .where((call) => call.path.endsWith('/demo/GARMENT'))
            .single
            .body!['id'],
        'terracotta-blazer',
      );
    },
  );
  test(
    'a one-off photo replaces the model without changing the saved avatar',
    () async {
      await exp.begin(
        selectedDemoProduct: {
          'id': 'terracotta-blazer',
          'name': 'Terracotta Blazer',
        },
        selectedDemoModelId: 'muse',
      );
      await exp.upload('PERSON', syntheticPhoto, 'image/png');
      expect(exp.demoModelId, isNull);
      expect(exp.person?.id, 'person-photo');
      expect(exp.demoProduct?['id'], 'terracotta-blazer');
      await exp.upload('GARMENT', syntheticPhoto, 'image/png');
      expect(exp.demoProduct, isNull);
    },
  );
  test('a demo garment can replace the current session garment', () async {
    await exp.loadDemoCatalog();
    await exp.begin();
    await exp.upload('GARMENT', syntheticPhoto, 'image/png');
    expect(exp.demoProduct, isNull);
    await exp.chooseDemoProduct('terracotta-blazer');
    expect(exp.outfit?.id, 'demo-garment-photo');
    expect(exp.demoProduct?['id'], 'terracotta-blazer');
    expect(
      api.calls.lastWhere((call) => call.path.endsWith('/demo/GARMENT')).body,
      {'id': 'terracotta-blazer'},
    );
    exp.clearSelectedPhoto('GARMENT');
    expect(exp.outfit, isNull);
    expect(exp.demoProduct, isNull);
    expect(exp.canGenerate, isFalse);
  });
  testWidgets(
    'demo product opens a detail view with upload and relevant model choices',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final boundary = GlobalKey();
      Future<void> capture(String name) async {
        if (!const bool.fromEnvironment('SELFX_RENDER_DEMO')) return;
        await tester.runAsync(() async {
          final image =
              await (boundary.currentContext!.findRenderObject()!
                      as RenderRepaintBoundary)
                  .toImage(pixelRatio: 1.5);
          final data = await image.toByteData(format: ui.ImageByteFormat.png);
          final file = File('../tmp/customer-mobile-review/$name.png');
          await file.parent.create(recursive: true);
          await file.writeAsBytes(data!.buffer.asUint8List());
        });
      }

      await exp.loadDemoCatalog();
      String? chosenModel;
      await tester.pumpWidget(
        RepaintBoundary(
          key: boundary,
          child: MaterialApp(
            theme: customerTheme(),
            home: Scaffold(
              body: SingleChildScrollView(
                child: CustomerDemoCatalog(
                  experience: exp,
                  onTryOn: (product, modelId) async {
                    chosenModel = modelId;
                  },
                  onUploadPerson: (product, modelId) async {},
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await capture('demo-explore');
      expect(find.text('Terracotta Blazer'), findsOneWidget);
      expect(find.text('SELFX DEMO'), findsNothing);
      expect(find.text('Search outfits'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'navy');
      await tester.pumpAndSettle();
      expect(find.text('Terracotta Blazer'), findsNothing);
      await tester.enterText(find.byType(TextField), '');
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Terracotta Blazer'));
      await tester.tap(find.text('Terracotta Blazer'));
      await tester.pumpAndSettle();
      expect(find.byType(CustomerDemoProductScreen), findsOneWidget);
      await tester.drag(find.byType(ListView).first, const Offset(0, -400));
      await tester.pumpAndSettle();
      await capture('demo-product');
      expect(find.text('Upload my photo'), findsOneWidget);
      await tester.tap(find.text('Maya'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Try it on').last);
      await tester.pumpAndSettle();
      expect(chosenModel, 'muse');
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
      await tester.tap(find.byKey(const ValueKey('header-credits')));
      await tester.pumpAndSettle();
      expect(find.text('Free trial'), findsOneWidget);
      expect(find.text('10 Try-Ons left'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Try-On').first);
      await tester.pumpAndSettle();
      expect(find.text('Your photos. Your choice.'), findsOneWidget);
      expect(picker.selections, 0);
      expect(api.uploads, isEmpty);
      await tester.ensureVisible(find.text('Agree & continue'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Agree & continue'));
      await tester.pumpAndSettle();
      expect(find.text('Person photo'), findsWidgets);
      await tester.tap(find.text('Upload').first);
      await tester.pumpAndSettle();
      expect(picker.selections, 1);
      expect(api.uploads.single, contains('/photo-session/photos/PERSON'));
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
