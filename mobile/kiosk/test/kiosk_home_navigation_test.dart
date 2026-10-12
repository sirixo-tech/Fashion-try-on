import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/catalog/kiosk_catalog_models.dart';
import 'package:selfx_kiosk/src/config/kiosk_runtime_configuration.dart';
import 'package:selfx_kiosk/src/config/kiosk_runtime_configuration_controller.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_session_controller.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/ui/kiosk_home_screen.dart';
import 'package:selfx_kiosk/src/ui/try_on_generation_screen.dart';
import 'package:selfx_kiosk/src/ui/try_on_result_screen.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;

void main() {
  for (final replaceRoute in [false, true]) {
    testWidgets(
      'returning home clears picks ${replaceRoute ? 'after a screen replacement' : 'from the catalog'}',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(630, 1365);
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final capture = fixtures.testController();
        final gateway = fixtures.FakeKioskTryOnGateway();
        final tryOn = KioskTryOnSessionController(gateway: gateway);
        final uploads = fixtures.testUploadController(capture.captureStore);
        final navigator = GlobalKey<NavigatorState>();
        final product = fixtures.testCatalogProduct(
          id: 'pick-1',
          name: 'Blue top',
        );
        addTearDown(() {
          uploads.dispose();
          tryOn.dispose();
          capture.dispose();
        });
        await tester.pumpWidget(
          MaterialApp(
            navigatorKey: navigator,
            theme: buildSelfxKioskTheme(),
            home: KioskHomeScreen(
              controller: capture,
              tryOnController: tryOn,
              uploadController: uploads,
              presentation: fixtures.testIdlePresentation,
              operatorAccessController: fixtures.testOperatorAccessController(),
              catalogGateway: fixtures.FakeKioskCatalogGateway(
                products: [product],
              ),
            ),
          ),
        );
        await tester.tap(find.byKey(const Key('home-garments-category')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('garment-catalog-start')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('customer-consent-ok')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('catalog-product-pick-1')));
        await tester.pumpAndSettle();
        expect(tryOn.garmentPicks, hasLength(1));
        final sessionId = tryOn.activeSessionId;

        // An in-session screen must preserve picks. Replacing the original
        // route also exercises the case where its push future completes early.
        final next = MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Next step')),
        );
        if (replaceRoute) {
          navigator.currentState!.pushReplacement(next);
        } else {
          navigator.currentState!.push(next);
        }
        await tester.pumpAndSettle();
        expect(tryOn.garmentPicks, hasLength(1));
        navigator.currentState!.pop();
        await tester.pumpAndSettle();
        if (!replaceRoute) {
          expect(tryOn.garmentPicks, hasLength(1));
          await tester.tap(find.byKey(const Key('catalog-back')));
          await tester.pumpAndSettle();
        }
        expect(tryOn.garmentPicks, isEmpty);
        expect(tryOn.activeGarmentPickId, isNull);
        expect(tryOn.customerSessionActive, isFalse);
        expect(gateway.completedSessionIds, contains(sessionId));
        expect(find.byKey(const Key('home-garments-category')), findsOneWidget);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  for (final resultScreen in [false, true]) {
    testWidgets(
      'jewellery photo replacement from ${resultScreen ? 'result' : 'generation error'} keeps the item and opens phone upload',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(630, 1365);
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final capture = fixtures.testController();
        final uploads = fixtures.testUploadController(capture.captureStore);
        final tryOn = KioskTryOnSessionController(
          gateway: fixtures.FakeKioskTryOnGateway(),
        );
        final product = fixtures.testCatalogProduct(
          id: 'ring-1',
          name: 'Golden ring',
          productVertical: KioskProductVertical.jewellery,
          jewelleryType: KioskJewelleryType.ring,
        );
        final catalog = fixtures.FakeKioskCatalogGateway(products: [product]);
        tryOn.selectJewelleryProduct(
          product.toGarmentInput(),
          await catalog.getJewelleryCaptureRequirements(product.id),
        );
        if (resultScreen) {
          tryOn.result = KioskTryOnResult(
            run: const KioskTryOnRun(
              id: 'run-1',
              status: KioskTryOnStatus.succeeded,
            ),
            generatedImage:
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
          );
        }
        addTearDown(() {
          uploads.dispose();
          tryOn.dispose();
          capture.dispose();
        });
        await tester.pumpWidget(
          MaterialApp(
            theme: buildSelfxKioskTheme(),
            home: resultScreen
                ? TryOnResultScreen(
                    captureController: capture,
                    tryOnController: tryOn,
                    uploadController: uploads,
                    catalogGateway: catalog,
                  )
                : TryOnGenerationScreen(
                    captureController: capture,
                    tryOnController: tryOn,
                    uploadController: uploads,
                    catalogGateway: catalog,
                  ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        final replacement = find.byKey(
          Key(resultScreen ? 'result-retake-photo' : 'try-on-retake-photo'),
        );
        await tester.ensureVisible(replacement);
        await tester.tap(replacement);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        expect(find.byKey(const Key('mobile-upload-qr')), findsOneWidget);
        expect(find.byKey(const Key('capture-photo')), findsNothing);
        expect(tryOn.garmentInput?.productId, 'ring-1');
        expect(tryOn.jewelleryCaptureRequirements?.productId, 'ring-1');
        await tester.pumpWidget(const SizedBox.shrink());
        await uploads.cancel();
      },
    );
  }
  for (final entry in [
    'start-jewellery-try-on',
    'upload-jewellery-from-mobile-start',
  ]) {
    testWidgets(
      '$entry resolves the item before phone upload without opening the camera',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(630, 1365);
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final capture = fixtures.testController();
        final tryOn = KioskTryOnSessionController(
          gateway: fixtures.FakeKioskTryOnGateway(),
        );
        final uploads = fixtures.testUploadController(capture.captureStore);
        final device = KioskDeviceSessionController(
          gateway: fixtures.FakeKioskDeviceGateway(),
          store: fixtures.InMemoryKioskDeviceCredentialStore(),
        );
        final config = KioskRuntimeConfigurationController(
          gateway: fixtures.FakeKioskDeviceGateway(),
          deviceController: device,
          cache: fixtures.InMemoryKioskRuntimeConfigurationCache(),
        );
        addTearDown(() {
          uploads.dispose();
          tryOn.dispose();
          capture.dispose();
          config.dispose();
          device.dispose();
        });
        await tester.pumpWidget(
          MaterialApp(
            theme: buildSelfxKioskTheme(),
            home: KioskHomeScreen(
              controller: capture,
              tryOnController: tryOn,
              uploadController: uploads,
              operatorAccessController: fixtures.testOperatorAccessController(),
              configurationController: config,
              catalogGateway: fixtures.FakeKioskCatalogGateway(
                products: [
                  fixtures.testCatalogProduct(
                    id: 'ring-1',
                    name: 'Golden ring',
                    productVertical: KioskProductVertical.jewellery,
                    jewelleryType: KioskJewelleryType.ring,
                  ),
                ],
              ),
            ),
          ),
        );
        await tester.tap(find.byKey(const Key('home-jewellery-category')));
        await tester.pumpAndSettle();
        expect(tryOn.customerSessionActive, isFalse);
        await tester.tap(find.byKey(Key(entry)));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('mobile-upload-qr')), findsNothing);
        await tester.tap(find.byKey(const Key('customer-consent-ok')));
        await tester.pumpAndSettle();
        expect(find.text('Choose Jewellery'), findsOneWidget);
        expect(uploads.session, isNull);
        await tester.tap(find.text('Golden ring'));
        await tester.pump();
        await tester.tap(find.byKey(const Key('continue-selected-product')));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('mobile-upload-qr')), findsOneWidget);
        expect(find.byKey(const Key('capture-photo')), findsNothing);
        expect(tryOn.garmentInput?.productId, 'ring-1');
        expect(
          tryOn.jewelleryCaptureRequirements?.jewelleryType,
          KioskJewelleryType.ring,
        );
        expect(
          find.text('Keep your hand open and visible inside the guide.'),
          findsOneWidget,
        );
        await tester.ensureVisible(
          find.byKey(const Key('cancel-mobile-upload')),
        );
        await tester.tap(find.byKey(const Key('cancel-mobile-upload')));
        await tester.pumpAndSettle();
        expect(find.text('Choose Jewellery'), findsOneWidget);
        expect(uploads.hasActivePoller, isFalse);
        expect(find.byKey(const Key('capture-photo')), findsNothing);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  for (final size in [
    const Size(320, 568),
    const Size(390, 844),
    const Size(900, 1600),
    const Size(1080, 1920),
    const Size(1280, 720),
    const Size(800, 480),
  ]) {
    testWidgets('home and both menus fit $size', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = size;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final capture = fixtures.testController();
      final tryOn = KioskTryOnSessionController(
        gateway: fixtures.FakeKioskTryOnGateway(),
      );
      final uploads = fixtures.testUploadController(capture.captureStore);
      final device = KioskDeviceSessionController(
        gateway: fixtures.FakeKioskDeviceGateway(),
        store: fixtures.InMemoryKioskDeviceCredentialStore(),
      );
      final config = KioskRuntimeConfigurationController(
        gateway: fixtures.FakeKioskDeviceGateway(),
        deviceController: device,
        cache: fixtures.InMemoryKioskRuntimeConfigurationCache(),
      );
      addTearDown(() {
        uploads.dispose();
        tryOn.dispose();
        capture.dispose();
        config.dispose();
        device.dispose();
      });
      await tester.pumpWidget(
        MaterialApp(
          theme: buildSelfxKioskTheme(),
          home: KioskHomeScreen(
            controller: capture,
            tryOnController: tryOn,
            uploadController: uploads,
            operatorAccessController: fixtures.testOperatorAccessController(),
            configurationController: config,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      for (final key in ['home-garments-category', 'home-jewellery-category']) {
        await tester.ensureVisible(find.byKey(Key(key)));
        await tester.tap(find.byKey(Key(key)));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.ensureVisible(find.byKey(const Key('home-menu-back')));
        await tester.tap(find.byKey(const Key('home-menu-back')));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      }
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('a jewellery-only Store exposes no garment category', (
    tester,
  ) async {
    final capture = fixtures.testController();
    final tryOn = KioskTryOnSessionController(
      gateway: fixtures.FakeKioskTryOnGateway(),
    );
    final uploads = fixtures.testUploadController(capture.captureStore);
    final device = KioskDeviceSessionController(
      gateway: fixtures.FakeKioskDeviceGateway(),
      store: fixtures.InMemoryKioskDeviceCredentialStore(),
    );
    final config =
        KioskRuntimeConfigurationController(
            gateway: fixtures.FakeKioskDeviceGateway(),
            deviceController: device,
            cache: fixtures.InMemoryKioskRuntimeConfigurationCache(),
          )
          ..configuration = KioskRuntimeConfiguration.fromJson({
            'experience': {
              'enabledTryOnCapabilities': ['JEWELLERY_TRY_ON'],
            },
          });
    addTearDown(() {
      uploads.dispose();
      tryOn.dispose();
      capture.dispose();
      config.dispose();
      device.dispose();
    });
    await tester.pumpWidget(
      MaterialApp(
        home: KioskHomeScreen(
          controller: capture,
          tryOnController: tryOn,
          uploadController: uploads,
          operatorAccessController: fixtures.testOperatorAccessController(),
          configurationController: config,
        ),
      ),
    );
    expect(find.byKey(const Key('home-garments-category')), findsNothing);
    expect(find.byKey(const Key('home-jewellery-category')), findsOneWidget);
    await tester.tap(find.byKey(const Key('home-jewellery-category')));
    await tester.pumpAndSettle();
    expect(find.text('Virtual Try-On'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  if (const bool.fromEnvironment('SELFX_CAPTURE_HOME_PREVIEWS')) {
    testWidgets('render customer home previews', (tester) async {
      await tester.runAsync(() async {
        final file = File(
          '${Platform.environment['FLUTTER_ROOT']}/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
        );
        final loader = FontLoader('MaterialIcons')
          ..addFont(
            file.readAsBytes().then((bytes) => ByteData.sublistView(bytes)),
          );
        await loader.load();
      });
      for (final font in {
        'Manrope': 'assets/fonts/Manrope[wght].ttf',
        'Inter': 'assets/fonts/InterVariable.ttf',
      }.entries) {
        await tester.runAsync(() async {
          final loader = FontLoader(font.key)
            ..addFont(rootBundle.load(font.value));
          await loader.load();
        });
      }
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(900, 1600);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final capture = fixtures.testController();
      final tryOn = KioskTryOnSessionController(
        gateway: fixtures.FakeKioskTryOnGateway(),
      );
      final uploads = fixtures.testUploadController(capture.captureStore);
      final device = KioskDeviceSessionController(
        gateway: fixtures.FakeKioskDeviceGateway(),
        store: fixtures.InMemoryKioskDeviceCredentialStore(),
      );
      final config = KioskRuntimeConfigurationController(
        gateway: fixtures.FakeKioskDeviceGateway(),
        deviceController: device,
        cache: fixtures.InMemoryKioskRuntimeConfigurationCache(),
      );
      addTearDown(() {
        uploads.dispose();
        tryOn.dispose();
        capture.dispose();
        config.dispose();
        device.dispose();
      });
      final boundaryKey = GlobalKey();
      await tester.pumpWidget(
        MaterialApp(
          theme: buildSelfxKioskTheme(),
          home: RepaintBoundary(
            key: boundaryKey,
            child: KioskHomeScreen(
              controller: capture,
              tryOnController: tryOn,
              uploadController: uploads,
              operatorAccessController: fixtures.testOperatorAccessController(),
              configurationController: config,
            ),
          ),
        ),
      );
      await tester.runAsync(() async {
        await precacheImage(
          const AssetImage(
            'assets/wallpapers/selfx-default-kiosk-wallpaper.png',
          ),
          boundaryKey.currentContext!,
        );
      });
      await tester.pumpAndSettle();
      Future<void> save(String name) async {
        final boundary =
            boundaryKey.currentContext!.findRenderObject()!
                as RenderRepaintBoundary;
        await tester.runAsync(() async {
          final image = await boundary.toImage();
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          final dir = Directory('output/kiosk-preview')
            ..createSync(recursive: true);
          await File(
            '${dir.path}/$name.png',
          ).writeAsBytes(bytes!.buffer.asUint8List());
          image.dispose();
        });
      }

      await save('landing');
      await tester.tap(find.byKey(const Key('home-garments-category')));
      await tester.pumpAndSettle();
      await save('garments-menu');
      await tester.tap(find.byKey(const Key('home-menu-back')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('home-jewellery-category')));
      await tester.pumpAndSettle();
      await save('jewellery-menu');
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
}
