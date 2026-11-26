import 'package:flutter/services.dart';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/rendering.dart';
import 'package:selfx_customer/src/ui/customer_experience_screens.dart';
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/experience/customer_experience.dart';
import 'package:selfx_customer/src/experience/customer_media.dart';
import 'package:selfx_customer/src/services/customer_wardrobe.dart';
import 'package:selfx_customer/src/ui/customer_wardrobe_screen.dart';
import 'package:selfx_customer/src/ui/customer_theme.dart';
import 'fakes.dart';

final photoBytes = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/fteaysAAAAASUVORK5CYII=',
);
final garment = <String, dynamic>{
  'id': 'garment-a',
  'name': 'Navy shirt',
  'category': 'TOPS',
  'colour': 'Navy',
  'notes': 'Owned garment',
};

class WardrobeApi extends FakeCustomerApi implements CustomerMediaApi {
  bool failUpload = false;
  Uint8List? imageBytes;
  final uploads = <String>[];
  @override
  Future<Map<String, dynamic>> upload(
    String path,
    Uint8List bytes,
    String mime,
    String token,
  ) async {
    uploads.add(path);
    if (failUpload) {
      throw const CustomerApiException('NETWORK_ERROR', 'Connection lost.');
    }
    return {'item': garment};
  }

  @override
  Future<Uint8List> download(String path, String token) async =>
      imageBytes ?? photoBytes;
}

class WardrobePicker implements CustomerWardrobePicker {
  int reads = 0, discards = 0;
  @override
  Future<List<WardrobeSelection>> pick(CustomerPhotoSource source) async => [
    for (var i = 0; i < 2; i++)
      WardrobeSelection(
        read: () async {
          reads++;
          return PickedCustomerPhoto(photoBytes, 'image/png');
        },
        discard: () async {
          discards++;
        },
      ),
  ];
}

void main() {
  setUpAll(() async {
    if (!const bool.fromEnvironment('SELFX_RENDER_WARDROBE')) return;
    final sdk = Platform.environment['FLUTTER_ROOT'];
    if (sdk == null) {
      throw StateError('FLUTTER_ROOT is required for rendered reviews');
    }
    Future<void> font(String family, List<String> files) async {
      final loader = FontLoader(family);
      for (final file in files) {
        loader.addFont(File(file).readAsBytes().then(ByteData.sublistView));
      }
      await loader.load();
    }

    final fonts = '$sdk/bin/cache/artifacts/material_fonts';
    await font('Roboto', [
      '$fonts/roboto-regular.ttf',
      '$fonts/roboto-bold.ttf',
    ]);
    await font('MaterialIcons', ['$fonts/materialicons-regular.otf']);
    if (Platform.isWindows) {
      await font('serif', [
        '${Platform.environment['WINDIR']}/Fonts/georgia.ttf',
      ]);
    }
  });
  late WardrobeApi api;
  late CustomerController auth;
  late CustomerWardrobe wardrobe;
  setUp(() async {
    api = WardrobeApi();
    auth = CustomerController(
      api: api,
      store: MemorySessionStore(),
      identity: FakeIdentity(),
    );
    await auth.initialize();
    await auth.signIn('synthetic@example.test', 'synthetic-passphrase');
    wardrobe = CustomerWardrobe(auth);
  });
  tearDown(() {
    wardrobe.dispose();
    auth.dispose();
  });
  Map<String, dynamic> page(
    List<Map<String, dynamic>> items, {
    int number = 1,
    bool more = false,
  }) => {'items': items, 'page': number, 'hasMore': more};
  test('pagination deduplicates and search/category are encoded', () async {
    api.handler = (path, method, body) async => path.contains('page=2')
        ? page([
            garment,
            {...garment, 'id': 'garment-b'},
          ], number: 2)
        : page([garment], more: true);
    await wardrobe.load(query: 'navy & white', filter: 'TOPS');
    expect(Uri.parse(api.calls.last.path).queryParameters, {
      'page': '1',
      'search': 'navy & white',
      'category': 'TOPS',
    });
    await wardrobe.load(more: true);
    expect(wardrobe.items.length, 2);
    expect(wardrobe.hasMore, false);
  });
  test(
    'late list responses cannot restore another signed-out account photos',
    () async {
      final pending = Completer<Map<String, dynamic>>();
      api.handler = (path, method, body) async =>
          path.startsWith('/wardrobe') ? pending.future : <String, dynamic>{};
      final loading = wardrobe.load();
      await auth.signOut();
      pending.complete(page([garment]));
      await loading;
      expect(wardrobe.items, isEmpty);
      expect(wardrobe.loading, false);
    },
  );
  test(
    'interrupted upload retries the same UUID and metadata without generation',
    () async {
      api.handler = (path, method, body) async => {'item': garment};
      final id = wardrobe.newId();
      expect(id.split('-')[2].startsWith('7'), true);
      api.failUpload = true;
      final photo = PickedCustomerPhoto(photoBytes, 'image/png');
      await expectLater(
        wardrobe.save(id, {'name': 'Navy shirt', 'category': 'TOPS'}, photo),
        throwsA(isA<CustomerApiException>()),
      );
      api.failUpload = false;
      await wardrobe.save(id, {
        'name': 'Navy shirt',
        'category': 'TOPS',
      }, photo);
      expect(api.uploads, ['/wardrobe/$id/photo', '/wardrobe/$id/photo']);
      expect(
        api.calls.where((c) => c.path == '/wardrobe').map((c) => c.body!['id']),
        [id, id],
      );
      expect(api.calls.any((c) => c.path == '/try-on/runs'), false);
    },
  );
  test(
    'selecting a saved garment preserves the model and never starts generation',
    () async {
      api.handler = (path, method, body) async {
        if (path == '/try-on/sessions') {
          return {'id': 'session-a', 'payer': 'PERSONAL'};
        }
        return {
          'id': path.endsWith('/wardrobe')
              ? 'saved-garment-copy'
              : 'model-copy',
          'url': 'https://private.invalid/photo',
          'expiresAt': DateTime.now()
              .add(const Duration(days: 7))
              .toIso8601String(),
        };
      };
      final experience = CustomerExperience(auth);
      await experience.begin(selectedDemoModelId: 'muse');
      await experience.chooseWardrobe('garment-a');
      expect(experience.person?.id, 'model-copy');
      expect(experience.outfit?.id, 'saved-garment-copy');
      expect(experience.demoProduct, isNull);
      expect(api.calls.last.body, {'itemId': 'garment-a'});
      expect(api.calls.any((call) => call.path == '/try-on/runs'), false);
      experience.dispose();
    },
  );
  test(
    'a late selection cannot restore private garments after sign-out',
    () async {
      final pending = Completer<Map<String, dynamic>>();
      api.handler = (path, method, body) async => path.endsWith('/wardrobe')
          ? pending.future
          : {'id': 'session-a', 'payer': 'PERSONAL'};
      final experience = CustomerExperience(auth);
      await experience.begin();
      final selecting = experience.chooseWardrobe('garment-a');
      final rejected = expectLater(
        selecting,
        throwsA(isA<CustomerApiException>()),
      );
      await auth.signOut();
      pending.complete({
        'id': 'private-copy',
        'url': 'https://private.invalid/photo',
        'expiresAt': DateTime.now()
            .add(const Duration(days: 7))
            .toIso8601String(),
      });
      await rejected;
      expect(experience.outfit, isNull);
      experience.dispose();
    },
  );
  testWidgets(
    'empty wardrobe imports sequentially; Skip advances and Back cancels remaining',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      api.handler = (path, method, body) async => page([]);
      final experience = CustomerExperience(auth);
      final picker = WardrobePicker();
      await tester.pumpWidget(
        MaterialApp(
          theme: customerTheme(),
          home: Scaffold(
            body: SingleChildScrollView(
              child: CustomerWardrobePanel(
                experience: experience,
                picker: picker,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Your wardrobe starts here'), findsOneWidget);
      await tester.ensureVisible(find.text('Import photos').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Import photos').first);
      await tester.pumpAndSettle();
      expect(find.text('1 / 2'), findsOneWidget);
      expect(picker.reads, 1);
      await tester.tap(find.text('Skip'));
      await tester.pumpAndSettle();
      expect(find.text('2 / 2'), findsOneWidget);
      expect(picker.reads, 2);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('Your wardrobe starts here'), findsOneWidget);
      expect(api.uploads, isEmpty);
      expect(picker.discards, greaterThanOrEqualTo(2));
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      experience.dispose();
    },
  );
  testWidgets(
    'detail edits metadata, selects only when tapped, and deletes with confirmation',
    (tester) async {
      api.handler = (path, method, body) async => method == 'PATCH'
          ? {
              'item': {...garment, ...?body},
            }
          : page([]);
      var selections = 0;
      await tester.pumpWidget(
        MaterialApp(
          theme: customerTheme(),
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.push<void>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => CustomerWardrobeDetail(
                      wardrobe: wardrobe,
                      item: garment,
                      onTryOn: (item) async {
                        selections++;
                      },
                    ),
                  ),
                ),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(selections, 0);
      await tester.ensureVisible(find.text('Try it on'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Try it on'));
      await tester.pumpAndSettle();
      expect(selections, 1);
      await tester.tap(find.byKey(const ValueKey('wardrobe-actions')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit garment'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).first, 'Blue shirt');
      await tester.tap(find.text('Save garment'));
      await tester.pumpAndSettle();
      expect(find.text('Blue shirt'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('wardrobe-actions')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();
      expect(api.calls.where((c) => c.method == 'DELETE'), isEmpty);
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();
      expect(
        api.calls.where((c) => c.method == 'DELETE').single.path,
        '/wardrobe/garment-a',
      );
      expect(find.text('Open'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  Future<void> mountDetail(
    WidgetTester tester, {
    Json? initial,
    Future<void> Function(Json)? onTryOn,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: customerTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.push<void>(
                context,
                MaterialPageRoute(
                  builder: (_) => CustomerWardrobeDetail(
                    wardrobe: wardrobe,
                    item: initial ?? wardrobe.items.first,
                    onTryOn: onTryOn,
                  ),
                ),
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
  }

  List<Json> collection() => [
    garment,
    {
      'id': 'garment-b',
      'name': 'Grey jacket',
      'category': 'JACKETS',
      'colour': 'Grey',
      'notes': 'Winter layer',
    },
    {
      'id': 'garment-c',
      'name': 'Black trousers',
      'category': 'BOTTOMS',
      'colour': 'Black',
      'notes': 'Workwear',
    },
  ];
  testWidgets(
    'swipe, thumbnails, metadata and Try-On use the same selected garment',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      wardrobe.items = collection();
      String? chosen;
      await mountDetail(
        tester,
        initial: wardrobe.items[1],
        onTryOn: (item) async {
          chosen = item['id'] as String;
        },
      );
      expect(find.text('Grey jacket'), findsOneWidget);
      expect(find.text('2 of 3'), findsOneWidget);
      expect(find.text('Private. Saved until you delete them.'), findsNothing);
      await tester.drag(
        find.byKey(const ValueKey('wardrobe-pages')),
        const Offset(-320, 0),
      );
      await tester.pumpAndSettle();
      expect(find.text('Black trousers'), findsOneWidget);
      expect(find.text('Bottoms'), findsOneWidget);
      expect(find.text('Workwear'), findsOneWidget);
      expect(find.text('3 of 3'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const ValueKey('wardrobe-try-on')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('wardrobe-try-on')));
      await tester.pumpAndSettle();
      expect(chosen, 'garment-c');
      await tester.ensureVisible(
        find.byKey(const ValueKey('wardrobe-thumbnail-garment-a')),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('wardrobe-thumbnail-garment-a')),
      );
      await tester.pumpAndSettle();
      expect(find.text('Navy shirt'), findsOneWidget);
      expect(find.text('1 of 3'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'viewer loads the next filtered page, retries errors and preserves the current garment',
    (tester) async {
      wardrobe.items = [garment];
      wardrobe.page = 1;
      wardrobe.hasMore = true;
      wardrobe.search = 'navy';
      wardrobe.category = 'TOPS';
      var fail = true;
      api.handler = (path, method, body) async {
        if (fail) {
          throw const CustomerApiException('NETWORK_ERROR', 'Connection lost.');
        }
        return page([collection()[1]], number: 2);
      };
      await mountDetail(tester);
      expect(find.text('Navy shirt'), findsOneWidget);
      expect(find.text('1 of 1+'), findsOneWidget);
      expect(Uri.parse(api.calls.last.path).queryParameters, {
        'page': '2',
        'search': 'navy',
        'category': 'TOPS',
      });
      fail = false;
      await tester.ensureVisible(find.text('Try again'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(find.text('Navy shirt'), findsOneWidget);
      expect(find.text('1 of 2'), findsOneWidget);
      await tester.ensureVisible(
        find.byKey(const ValueKey('wardrobe-thumbnail-garment-b')),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('wardrobe-thumbnail-garment-b')),
      );
      await tester.pumpAndSettle();
      expect(find.text('Grey jacket'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('overflow edit and delete target the garment selected by swipe', (
    tester,
  ) async {
    wardrobe.items = collection();
    api.handler = (path, method, body) async => method == 'PATCH'
        ? {
            'item': {...collection()[1], ...?body},
          }
        : page([]);
    await mountDetail(tester);
    await tester.drag(
      find.byKey(const ValueKey('wardrobe-pages')),
      const Offset(-700, 0),
    );
    await tester.pumpAndSettle();
    expect(find.text('Grey jacket'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('wardrobe-actions')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Edit garment'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).first, 'Edited jacket');
    await tester.tap(find.text('Save garment'));
    await tester.pumpAndSettle();
    expect(
      api.calls.lastWhere((call) => call.method == 'PATCH').path,
      '/wardrobe/garment-b',
    );
    expect(find.text('Edited jacket'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('wardrobe-actions')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(api.calls.where((call) => call.method == 'DELETE'), isEmpty);
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(
      api.calls.singleWhere((call) => call.method == 'DELETE').path,
      '/wardrobe/garment-b',
    );
    expect(find.text('Open'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'fullscreen zoom and the viewer discard private previews after sign-out',
    (tester) async {
      wardrobe.items = collection();
      await mountDetail(tester);
      await tester.tap(find.byTooltip('View full screen'));
      await tester.pumpAndSettle();
      expect(find.byType(InteractiveViewer), findsOneWidget);
      // Session persistence was initialized outside the widget fake-async zone.
      await tester.runAsync(() => auth.signOut());
      await tester.pumpAndSettle();
      expect(find.byType(WardrobeImage), findsNothing);
      expect(find.text('Navy shirt'), findsNothing);
      expect(find.text('Open'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'compact Saved header and favourite icon replace the redundant strips',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      api.imageBytes = File(
        'assets/editorial/navy-overshirt.webp',
      ).readAsBytesSync();
      api.handler = (path, method, body) async {
        if (path == '/experience') {
          return {
            'trial': {'remaining': 6},
            'generationAvailable': true,
          };
        }
        if (path.startsWith('/wardrobe')) return page(collection());
        if (path == '/saved-garments') return {'items': <Json>[]};
        return {
          'data': <Json>[],
          'pagination': {'hasMore': false},
        };
      };
      final experience = CustomerExperience(auth);
      await experience.refresh();
      var plans = 0;
      final boundary = GlobalKey();
      await tester.pumpWidget(
        RepaintBoundary(
          key: boundary,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            builder: (context, child) => DecoratedBox(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  stops: [0, .55, 1],
                  colors: [
                    Color(0xFFFFF8EF),
                    Color(0xFFFAF7F2),
                    Color(0xFFF4E4D6),
                  ],
                ),
              ),
              child: child,
            ),
            theme: customerTheme(),
            home: Scaffold(
              body: CustomerSavedScreen(
                experience: experience,
                onTryOnWardrobe: (item) async {},
                onHome: () {},
                onPlans: () {
                  plans++;
                },
                onTryOnGarment: (item, store) async {},
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('6 credits left'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('saved-header-credits')));
      expect(plans, 1);
      await tester.tap(find.text('Wardrobe'));
      await tester.pumpAndSettle();
      expect(find.text('My clothes'), findsNothing);
      expect(find.text('Private. Saved until you delete them.'), findsNothing);
      expect(find.text('Favourite products'), findsNothing);
      await captureWardrobe(tester, boundary, 'wardrobe-compact');
      await tester.tap(find.byTooltip('Favourite products'));
      await tester.pumpAndSettle();
      expect(find.byType(CustomerFavouriteProductsScreen), findsOneWidget);
      expect(find.text('Favourite products'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.byType(CustomerWardrobePanel), findsOneWidget);
      await tester.tap(find.text('Navy shirt'));
      await tester.pumpAndSettle();
      await captureWardrobe(tester, boundary, 'wardrobe-viewer');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      experience.dispose();
    },
  );
  for (final configuration in [
    (const Size(320, 740), TextDirection.rtl, 1.4),
    (const Size(844, 390), TextDirection.ltr, 1.0),
  ]) {
    testWidgets(
      'garment controls fit ${configuration.$1} ${configuration.$2}',
      (tester) async {
        tester.view.physicalSize = configuration.$1;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        wardrobe.items = collection();
        await tester.pumpWidget(
          MaterialApp(
            theme: customerTheme(),
            builder: (context, child) => Directionality(
              textDirection: configuration.$2,
              child: MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(configuration.$3)),
                child: child!,
              ),
            ),
            home: CustomerWardrobeDetail(
              wardrobe: wardrobe,
              item: garment,
              onTryOn: (item) async {},
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.scrollUntilVisible(
          find.byKey(const ValueKey('wardrobe-try-on')),
          150,
          scrollable: find
              .descendant(
                of: find.byKey(const ValueKey('wardrobe-detail-scroll')),
                matching: find.byType(Scrollable),
              )
              .first,
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      },
    );
  }
}

Future<void> captureWardrobe(
  WidgetTester tester,
  GlobalKey boundary,
  String name,
) async {
  if (!const bool.fromEnvironment('SELFX_RENDER_WARDROBE')) return;
  await tester.runAsync(
    () => Future<void>.delayed(const Duration(milliseconds: 150)),
  );
  await tester.pumpAndSettle();
  await tester.runAsync(() async {
    final image =
        await (boundary.currentContext!.findRenderObject()!
                as RenderRepaintBoundary)
            .toImage(pixelRatio: 1.5);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final file = File('../tmp/customer-mobile-review/$name.png');
    await file.parent.create(recursive: true);
    await file.writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}
