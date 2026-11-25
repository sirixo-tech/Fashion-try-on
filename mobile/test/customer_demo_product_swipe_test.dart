import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/experience/customer_experience.dart';
import 'package:selfx_customer/src/ui/customer_demo_catalog.dart';
import 'package:selfx_customer/src/ui/customer_theme.dart';
import 'fakes.dart';

const garments = <Json>[
  {'id': 'navy-overshirt', 'name': 'Navy Overshirt', 'category': 'MEN'},
  {'id': 'charcoal-blazer', 'name': 'Charcoal Blazer', 'category': 'MEN'},
  {'id': 'burgundy-dress', 'name': 'Burgundy Dress', 'category': 'WOMEN'},
];
const models = <Json>[
  {'id': 'tailored', 'name': 'Arjun', 'category': 'MEN'},
  {'id': 'kabir', 'name': 'Kabir', 'category': 'MEN'},
  {'id': 'muse', 'name': 'Maya', 'category': 'WOMEN'},
];

void main() {
  setUpAll(() async {
    if (!const bool.fromEnvironment('SELFX_RENDER_DEMO_SWIPE')) return;
    final sdk = Platform.environment['FLUTTER_ROOT'];
    if (sdk == null) {
      throw StateError('FLUTTER_ROOT is required for rendered reviews');
    }
    Future<void> font(String family, List<String> files) async {
      final loader = FontLoader(family);
      for (final file in files) {
        loader.addFont(
          File(file).readAsBytes().then((bytes) => ByteData.sublistView(bytes)),
        );
      }
      await loader.load();
    }

    final fonts = '$sdk/bin/cache/artifacts/material_fonts';
    await font('Roboto', [
      '$fonts/roboto-regular.ttf',
      '$fonts/roboto-bold.ttf',
    ]);
    await font('MaterialIcons', ['$fonts/materialicons-regular.otf']);
  });
  late FakeCustomerApi api;
  late CustomerController auth;
  late CustomerExperience experience;
  late GlobalKey boundary;
  final pager = find.byKey(const ValueKey('demo-product-pager'));
  final previous = find.byKey(const ValueKey('demo-product-previous'));
  final next = find.byKey(const ValueKey('demo-product-next'));

  setUp(() async {
    api = FakeCustomerApi();
    auth = CustomerController(
      api: api,
      store: MemorySessionStore(),
      identity: FakeIdentity(),
    );
    await auth.initialize();
    await auth.signIn('synthetic@example.test', 'synthetic-passphrase');
    experience = CustomerExperience(auth)
      ..demoProducts = List<Json>.of(garments)
      ..demoModels = List<Json>.of(models);
    boundary = GlobalKey();
  });
  tearDown(() {
    experience.dispose();
    auth.dispose();
  });

  Future<void> mount(
    WidgetTester tester,
    Widget home, {
    bool rtl = false,
  }) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      RepaintBoundary(
        key: boundary,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: customerTheme().copyWith(
            scaffoldBackgroundColor: CustomerColors.canvas,
          ),
          home: Directionality(
            textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
            child: home,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    if (const bool.fromEnvironment('SELFX_RENDER_DEMO_SWIPE')) {
      await tester.runAsync(() async {
        await Future.wait(
          [
            for (final product in garments)
              demoProductImage(product['id'] as String)!,
            for (final model in models) demoModelImage(model['id'] as String)!,
          ].map(
            (path) => precacheImage(AssetImage(path), boundary.currentContext!),
          ),
        );
      });
      await tester.pumpAndSettle();
    }
  }

  CustomerDemoProductScreen screen({
    int initial = 0,
    List<Json> products = garments,
    Future<void> Function(Json, String?)? onTryOn,
    Future<void> Function(Json, String?)? onUpload,
  }) => CustomerDemoProductScreen(
    experience: experience,
    product: garments[initial],
    products: products,
    models: models,
    onTryOn: onTryOn ?? (_, _) async {},
    onUploadPerson: onUpload ?? (_, _) async {},
  );

  Future<void> swipe(WidgetTester tester, Offset offset) async {
    await tester.ensureVisible(pager);
    await tester.pumpAndSettle();
    await tester.drag(pager, offset);
    await tester.pumpAndSettle();
  }

  Future<void> capture(WidgetTester tester, String name) async {
    if (!const bool.fromEnvironment('SELFX_RENDER_DEMO_SWIPE')) return;
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

  testWidgets(
    'starts on the opened garment and swipes through the bounded product list',
    (tester) async {
      await mount(tester, screen(initial: 1));
      expect(find.text('Charcoal Blazer'), findsOneWidget);
      expect(find.text('2 / 3'), findsOneWidget);
      await capture(tester, 'demo-product-swipe-middle');
      await swipe(tester, const Offset(-300, 0));
      expect(find.text('Burgundy Dress'), findsOneWidget);
      expect(find.text('3 / 3'), findsOneWidget);
      expect(tester.widget<IconButton>(next).onPressed, isNull);
      await tester.tap(previous);
      await tester.pumpAndSettle();
      await swipe(tester, const Offset(300, 0));
      expect(find.text('Navy Overshirt'), findsOneWidget);
      expect(find.text('1 / 3'), findsOneWidget);
      expect(tester.widget<IconButton>(previous).onPressed, isNull);
      expect(
        api.calls.where((call) => call.path.startsWith('/try-on/')),
        isEmpty,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'favourites and actions follow the current garment and compatible models persist',
    (tester) async {
      String? chosenProduct, chosenModel;
      await mount(
        tester,
        screen(
          onTryOn: (product, model) async {
            chosenProduct = product['id'] as String;
            chosenModel = model;
          },
        ),
      );
      await tester.drag(
        find.byKey(const ValueKey('demo-product-details')),
        const Offset(0, -220),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Kabir'));
      await tester.pumpAndSettle();
      await swipe(tester, const Offset(-300, 0));
      expect(find.byIcon(Icons.check_circle), findsOneWidget);
      await tester.tap(find.byType(FilledButton).last);
      await tester.pumpAndSettle();
      expect(chosenProduct, 'charcoal-blazer');
      expect(chosenModel, 'kabir');
      await tester.tap(find.byTooltip('Save garment'));
      await tester.pumpAndSettle();
      expect(experience.isGarmentSaved('DEMO', 'charcoal-blazer'), isTrue);
      expect(experience.isGarmentSaved('DEMO', 'navy-overshirt'), isFalse);
      await swipe(tester, const Offset(-300, 0));
      expect(find.byTooltip('Save garment'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle), findsNothing);
      expect(find.text('Kabir'), findsNothing);
      await tester.tap(find.byType(FilledButton).last);
      await tester.pumpAndSettle();
      expect(chosenProduct, 'burgundy-dress');
      expect(chosenModel, isNull);
      await capture(tester, 'demo-product-swipe-women');
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'upload uses the displayed garment and browsing freezes while launching',
    (tester) async {
      String? uploadedProduct;
      final pending = Completer<void>();
      await mount(
        tester,
        screen(
          onUpload: (product, _) async {
            uploadedProduct = product['id'] as String;
            await pending.future;
          },
        ),
      );
      await tester.tap(next);
      await tester.pumpAndSettle();
      await tester.drag(
        find.byKey(const ValueKey('demo-product-details')),
        const Offset(0, -350),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Upload my photo'));
      await tester.pump();
      expect(uploadedProduct, 'charcoal-blazer');
      expect(tester.widget<IconButton>(next).onPressed, isNull);
      expect(
        tester.widget<PageView>(pager).physics,
        isA<NeverScrollableScrollPhysics>(),
      );
      pending.complete();
      await tester.pumpAndSettle();
      expect(tester.widget<IconButton>(next).onPressed, isNotNull);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'catalog passes its category filter and name sort to the opened product',
    (tester) async {
      await mount(
        tester,
        Scaffold(
          body: SingleChildScrollView(
            child: CustomerDemoCatalog(
              experience: experience,
              onTryOn: (_, _) async {},
              onUploadPerson: (_, _) async {},
            ),
          ),
        ),
      );
      await tester.tap(find.text('Men'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Sort products'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Name, A to Z'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Navy Overshirt'));
      await tester.tap(find.text('Navy Overshirt'));
      await tester.pumpAndSettle();
      expect(find.text('2 / 2'), findsOneWidget);
      await tester.tap(previous);
      await tester.pumpAndSettle();
      expect(find.text('Charcoal Blazer'), findsOneWidget);
      expect(find.text('1 / 2'), findsOneWidget);
      expect(tester.widget<IconButton>(previous).onPressed, isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('a single garment needs no navigation controls', (tester) async {
    await mount(tester, screen(products: const []));
    expect(find.text('Navy Overshirt'), findsOneWidget);
    expect(next, findsNothing);
    expect(previous, findsNothing);
    await swipe(tester, const Offset(-300, 0));
    expect(find.text('Navy Overshirt'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('RTL swipes and arrows follow the reading direction', (
    tester,
  ) async {
    await mount(tester, screen(), rtl: true);
    expect(tester.getCenter(next).dx, lessThan(tester.getCenter(previous).dx));
    await swipe(tester, const Offset(300, 0));
    expect(find.text('Charcoal Blazer'), findsOneWidget);
    expect(find.text('2 / 3'), findsOneWidget);
    await capture(tester, 'demo-product-swipe-rtl');
    await tester.tap(next);
    await tester.pumpAndSettle();
    expect(find.text('Burgundy Dress'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
