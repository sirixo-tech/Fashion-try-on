import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/catalog/kiosk_catalog_models.dart';
import 'package:selfx_kiosk/src/config/kiosk_runtime_configuration_controller.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_session_controller.dart';
import 'package:selfx_kiosk/src/session/capture_flow.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/tryon/model_coverage_analyzer.dart';
import 'package:selfx_kiosk/src/tryon/model_garment_compatibility.dart';
import 'package:selfx_kiosk/src/ui/browse_products_screen.dart';
import 'package:selfx_kiosk/src/ui/camera_capture_screen.dart';
import 'package:selfx_kiosk/src/ui/capture_review_screen.dart';
import 'package:selfx_kiosk/src/ui/catalog_filter_icon.dart';
import 'package:selfx_kiosk/src/ui/kiosk_home_screen.dart';
import 'package:selfx_kiosk/src/ui/mobile_upload_screen.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_button.dart';
import 'package:selfx_kiosk/src/ui/try_on_generation_screen.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_controller.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;
import 'kiosk_mobile_upload_test.dart' as phone;

void main() {
  testWidgets('jewellery Mobile Upload opens QR before the catalog', (
    tester,
  ) async {
    final h = await _harness(tester);
    final deviceGateway = fixtures.FakeKioskDeviceGateway();
    final device = KioskDeviceSessionController(
      gateway: deviceGateway,
      store: fixtures.InMemoryKioskDeviceCredentialStore(),
    );
    final configuration = KioskRuntimeConfigurationController(
      gateway: deviceGateway,
      deviceController: device,
      cache: fixtures.InMemoryKioskRuntimeConfigurationCache(),
    );
    addTearDown(configuration.dispose);
    addTearDown(device.dispose);
    await tester.pumpWidget(
      MaterialApp(
        theme: buildSelfxKioskTheme(),
        home: KioskHomeScreen(
          configurationController: configuration,
          controller: h.capture,
          tryOnController: h.session,
          uploadController: h.uploads,
          catalogGateway: h.catalog,
          operatorAccessController: fixtures.testOperatorAccessController(),
          presentation: fixtures.testIdlePresentation,
        ),
      ),
    );
    await _frames(tester);
    await tester.tap(find.byKey(const Key('home-jewellery-category')));
    await _frames(tester);
    await tester.tap(
      find.byKey(const Key('upload-jewellery-from-mobile-start')),
    );
    await _frames(tester);
    await tester.tap(find.byKey(const Key('customer-consent-ok')));
    await _frames(tester);
    expect(find.byType(MobileUploadScreen), findsOneWidget);
    expect(find.byKey(const Key('mobile-upload-qr')), findsOneWidget);
    expect(find.byType(BrowseProductsScreen), findsNothing);
    expect(h.session.activeTryOnVertical, KioskTryOnVertical.jewellery);
    expect(h.session.garmentInput, isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await h.uploads.cancel();
    await h.session.finish(h.capture);
  });

  for (final type in KioskJewelleryType.values) {
    testWidgets(
      '${type.name} catalog Continue opens live capture with its guide',
      (tester) async {
        final h = await _harness(tester, type: type);
        await _catalog(tester, h);
        await _select(tester, h);
        final button = tester.widget<SelfxKioskButton>(
          find.byKey(const Key('continue-selected-product')),
        );
        expect(button.backgroundColor, SelfxKioskTokens.primary);
        await tester.tap(find.byKey(const Key('continue-selected-product')));
        await _frames(tester);
        expect(find.byType(CameraCaptureScreen), findsOneWidget);
        expect(find.byType(MobileUploadScreen), findsNothing);
        expect(h.capture.jewelleryCaptureRequirements?.jewelleryType, type);
        expect(h.session.garmentInput?.productId, h.product.id);
        expect(
          find.text(h.capture.jewelleryCaptureRequirements!.instruction),
          findsOneWidget,
        );
        await tester.tap(find.byKey(const Key('capture-photo')));
        await tester.pump();
        expect(h.capture.flowState.stage, CaptureFlowStage.countdown);
        await h.capture.cancelCountdown();
        await tester.pump();
        await h.capture.capturePhoto();
        await _frames(tester);
        expect(find.byType(CaptureReviewScreen), findsOneWidget);
        expect(
          find.byKey(const Key('continue-selected-product-try-on')),
          findsOneWidget,
        );
        expect(find.byKey(const Key('take-garment-photo')), findsNothing);
        expect(
          tester.getRect(find.byKey(const Key('retake-photo'))).left,
          lessThan(
            tester
                .getRect(
                  find.byKey(const Key('continue-selected-product-try-on')),
                )
                .left,
          ),
        );
        await tester.binding.handlePopRoute();
        await _frames(tester);
        expect(find.byType(CameraCaptureScreen), findsOneWidget);
        expect(h.capture.flowState.stage, CaptureFlowStage.preview);
        expect(h.session.garmentInput?.productId, h.product.id);
        await h.capture.capturePhoto();
        await _frames(tester);
        await tester.tap(
          find.byKey(const Key('continue-selected-product-try-on')),
        );
        await tester.runAsync(phone.testerPumpEventQueue);
        await _frames(tester);
        await tester.runAsync(phone.testerPumpEventQueue);
        await _frames(tester);
        for (
          var attempt = 0;
          attempt < 20 && h.gateway.lastRequest == null;
          attempt++
        ) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 10)),
          );
          await tester.pump();
        }
        expect(find.byType(TryOnGenerationScreen), findsOneWidget);
        expect(
          h.gateway.lastRequest?.garmentInput.productId,
          h.product.id,
          reason:
              'status=${h.session.status}, message=${h.session.customerMessage}, accepted=${h.capture.activeAcceptedPersonPhoto?.image.originalPath}, session=${h.session.sessionMessage}',
        );
        expect(h.gateway.lastRequest?.garmentInput.jewelleryType, type);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        await h.uploads.cancel();
        await h.session.finish(h.capture);
      },
    );
  }

  testWidgets(
    'upload-first photo chooses jewellery then generates without another QR or camera',
    (tester) async {
      final h = await _harness(tester, ready: true);
      await tester.pumpWidget(
        MaterialApp(
          theme: buildSelfxKioskTheme(),
          home: MobileUploadScreen(
            captureController: h.capture,
            tryOnController: h.session,
            uploadController: h.uploads,
            catalogGateway: h.catalog,
          ),
        ),
      );
      await phone.pumpMobileUploadState(tester);
      await _frames(tester);
      expect(find.text('Choose Jewellery'), findsOneWidget);
      expect(find.byKey(const Key('take-garment-photo')), findsNothing);
      final original = h.capture.activeAcceptedPersonPhoto;
      expect(original, isNotNull);
      await tester.tap(find.byKey(const Key('use-mobile-photo')));
      await tester.runAsync(phone.testerPumpEventQueue);
      await phone.pumpMobileUploadState(tester);
      await _frames(tester);
      expect(find.byType(BrowseProductsScreen), findsOneWidget);
      await _select(tester, h);
      await tester.tap(find.byKey(const Key('continue-selected-product')));
      await tester.runAsync(phone.testerPumpEventQueue);
      await phone.pumpMobileUploadState(tester);
      await _frames(tester);
      await tester.runAsync(phone.testerPumpEventQueue);
      await _frames(tester);
      expect(find.byType(TryOnGenerationScreen), findsOneWidget);
      expect(find.byType(MobileUploadScreen), findsNothing);
      expect(find.byType(CameraCaptureScreen), findsNothing);
      expect(h.session.garmentInput?.productId, h.product.id);
      expect(h.capture.activeAcceptedPersonPhoto, same(original));
      expect(h.gateway.lastRequest?.garmentInput.productId, h.product.id);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await h.uploads.cancel();
      await h.session.finish(h.capture);
    },
  );

  test('jewellery categories have distinct icons', () {
    expect(categoryFilterIconType('rings'), CatalogFilterIconType.rings);
    expect(
      categoryFilterIconType('bracelets'),
      CatalogFilterIconType.bracelets,
    );
    expect(
      categoryFilterIconType('necklaces'),
      CatalogFilterIconType.necklaces,
    );
    expect(categoryFilterIconType('earrings'), CatalogFilterIconType.earrings);
    expect(categoryFilterIconType('tops'), CatalogFilterIconType.tops);
  });

  testWidgets(
    'upload-first photo is checked against the chosen jewellery region',
    (tester) async {
      final h = await _harness(
        tester,
        type: KioskJewelleryType.necklace,
        ready: true,
        coverage: ModelCoverage.lowerBody,
      );
      await tester.pumpWidget(
        MaterialApp(
          home: MobileUploadScreen(
            captureController: h.capture,
            tryOnController: h.session,
            uploadController: h.uploads,
            catalogGateway: h.catalog,
          ),
        ),
      );
      await _frames(tester);
      await tester.tap(find.byKey(const Key('use-mobile-photo')));
      await tester.runAsync(phone.testerPumpEventQueue);
      await _frames(tester);
      await _select(tester, h);
      (h.uploads.gateway as phone.FakeUploadGateway).nextSession = phone
          .waitingUploadSession('correct-neck-photo');
      await tester.tap(find.byKey(const Key('continue-selected-product')));
      await _frames(tester);
      expect(find.byType(MobileUploadScreen), findsOneWidget);
      expect(find.byKey(const Key('mobile-upload-qr')), findsOneWidget);
      expect(
        h.session.jewelleryCaptureRequirements?.jewelleryType,
        KioskJewelleryType.necklace,
      );
      expect(h.gateway.lastRequest, isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await h.uploads.cancel();
      await h.session.finish(h.capture);
    },
  );
}

Future<void> _frames(WidgetTester tester) async {
  for (var i = 0; i < 25; i++) {
    await tester.pump(const Duration(milliseconds: 30));
  }
}

Future<void> _catalog(WidgetTester tester, _Harness h) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: buildSelfxKioskTheme(),
      home: BrowseProductsScreen(
        captureController: h.capture,
        tryOnController: h.session,
        uploadController: h.uploads,
        catalogGateway: h.catalog,
        productVertical: KioskProductVertical.jewellery,
      ),
    ),
  );
  await _frames(tester);
}

Future<void> _select(WidgetTester tester, _Harness h) async {
  await tester.tap(find.byKey(Key('catalog-product-${h.product.id}')));
  await _frames(tester);
}

Future<_Harness> _harness(
  WidgetTester tester, {
  KioskJewelleryType type = KioskJewelleryType.ring,
  bool ready = false,
  ModelCoverage coverage = ModelCoverage.fullBody,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(630, 1365);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final capture = fixtures.testController(
    modelCoverageAnalyzer: fixtures.FakeModelCoverageAnalyzer(
      ModelCoverageAnalysis.resolved(
        coverage: coverage,
        confidence: 0.9,
        reasonCode: 'TEST_COVERAGE',
      ),
    ),
  );
  final gateway = phone.JewellerySessionGateway();
  final session = KioskTryOnSessionController(
    gateway: gateway,
    targetPreparer: phone.FakeTargetPreparer(),
  );
  final device = phone.testDeviceController();
  final uploadGateway = phone.FakeUploadGateway();
  if (ready) {
    uploadGateway.nextSession = phone.readyUploadSession('upload-first');
  }
  final uploads = KioskCustomerUploadController(
    deviceController: device,
    gateway: uploadGateway,
    captureStore: capture.captureStore,
  );
  final product = fixtures.testCatalogProduct(
    id: '${type.name}-1',
    name: 'Selected ${type.name}',
    productVertical: KioskProductVertical.jewellery,
    jewelleryType: type,
  );
  addTearDown(capture.dispose);
  addTearDown(session.dispose);
  addTearDown(uploads.dispose);
  addTearDown(device.dispose);
  await session.beginCustomerSession(vertical: KioskTryOnVertical.jewellery);
  return _Harness(capture, session, uploads, gateway, product);
}

class _Harness {
  _Harness(
    this.capture,
    this.session,
    this.uploads,
    this.gateway,
    this.product,
  );
  final CaptureSessionController capture;
  final KioskTryOnSessionController session;
  final KioskCustomerUploadController uploads;
  final phone.JewellerySessionGateway gateway;
  final KioskCatalogProduct product;
  fixtures.FakeKioskCatalogGateway get catalog =>
      fixtures.FakeKioskCatalogGateway(products: [product]);
}
