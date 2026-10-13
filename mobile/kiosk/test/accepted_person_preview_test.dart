import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/acquisition/photo_acquisition.dart';
import 'package:selfx_kiosk/src/catalog/kiosk_catalog_models.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/tryon/model_coverage_analyzer.dart';
import 'package:selfx_kiosk/src/tryon/model_garment_compatibility.dart';
import 'package:selfx_kiosk/src/ui/browse_products_screen.dart';
import 'package:selfx_kiosk/src/ui/camera_capture_screen.dart';
import 'package:selfx_kiosk/src/ui/capture_review_screen.dart';
import 'package:selfx_kiosk/src/ui/capture_review_presentation.dart';
import 'package:selfx_kiosk/src/ui/selfx_logo.dart';
import 'package:selfx_kiosk/src/ui/mobile_upload_screen.dart';
import 'package:selfx_kiosk/src/ui/try_on_generation_screen.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_button.dart';
import 'package:selfx_kiosk/src/ui/kiosk_attention_animations.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_controller.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;
import 'kiosk_mobile_upload_test.dart' as phone;

void main() {
  for (final prioritizePhoto in [true, false]) {
    for (final size in [const Size(320, 568), const Size(900, 1600)]) {
      testWidgets('visible preview Back at $size (photo=$prioritizePhoto)', (
        tester,
      ) async {
        _viewport(tester, size);
        var backs = 0;
        await tester.pumpWidget(
          MaterialApp(
            theme: buildSelfxKioskTheme(),
            home: Scaffold(
              body: CaptureReviewPresentation(
                imagePath: 'unavailable-test-photo.jpg',
                onBack: () => backs++,
                prioritizePhoto: prioritizePhoto,
                actions: const SizedBox(height: 60),
              ),
            ),
          ),
        );
        final back = find.byKey(const Key('capture-review-back'));
        expect(
          find.descendant(of: back, matching: find.text('Back')),
          findsOneWidget,
        );
        expect(back.hitTestable(), findsOneWidget);
        final button = tester.widget<TextButton>(back);
        expect(
          button.style!.backgroundColor!.resolve({}),
          const Color(0xFFECECEC),
        );
        expect(
          button.style!.foregroundColor!.resolve({}),
          SelfxKioskTokens.textPrimary,
        );
        expect(
          tester.getRect(back).right,
          lessThanOrEqualTo(tester.getRect(find.byType(SelfxLogo)).left),
        );
        await tester.tap(back);
        expect(backs, 1);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets(
    'Browse Garments preserves picks and continues from camera person review',
    (tester) async {
      _viewport(tester, const Size(630, 1365));
      final capture = fixtures.testController();
      final products = _products(2);
      final session = _session();
      final uploads = fixtures.testUploadController(capture.captureStore);
      addTearDown(capture.dispose);
      addTearDown(session.dispose);
      addTearDown(uploads.dispose);
      await session.beginCustomerSession();
      await tester.pumpWidget(
        MaterialApp(
          theme: buildSelfxKioskTheme(),
          home: BrowseProductsScreen(
            captureController: capture,
            tryOnController: session,
            uploadController: uploads,
            catalogGateway: _Catalog(products),
          ),
        ),
      );
      await _pump(tester);
      for (final product in products) {
        await tester.tap(find.byKey(ValueKey('catalog-product-${product.id}')));
        await _pump(tester);
      }
      await tester.tap(find.byKey(const Key('continue-selected-product')));
      await _pump(tester);
      expect(
        tester
            .widget<CameraCaptureScreen>(find.byType(CameraCaptureScreen))
            .purpose,
        PhotoAcquisitionPurpose.model,
      );
      await capture.capturePhoto();
      await _pump(tester);
      expect(find.byType(CaptureReviewScreen), findsOneWidget);
      expect(find.byKey(const Key('take-garment-photo')), findsNothing);
      expect(
        find.text('Your photo is ready for this garment.'),
        findsOneWidget,
      );
      expect(session.garmentPicks, hasLength(2));
      final person = capture.activeAcceptedPersonPhoto;
      final sessionId = session.activeSessionId;
      final continueButton = find.byKey(
        const Key('continue-selected-product-try-on'),
      );
      expect(tester.widget<SelfxKioskButton>(continueButton).label, 'Continue');
      expect((session.gateway as _TryOnGateway).created, 0);
      final onContinue = tester
          .widget<SelfxKioskButton>(continueButton)
          .onPressed!;
      onContinue();
      onContinue();
      await _pump(tester);
      await _pumpGeneration(tester);
      expect(find.byType(TryOnGenerationScreen), findsOneWidget);
      expect(session.garmentInput?.productId, 'p0');
      expect(session.garmentPicks, hasLength(2));
      expect(capture.activeAcceptedPersonPhoto, same(person));
      expect(session.activeSessionId, sessionId);
      expect((session.gateway as _TryOnGateway).created, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      session.tryAnotherGarment();
    },
  );

  for (final selectedCatalogProduct in [true, false]) {
    testWidgets(
      'phone person preview ${selectedCatalogProduct ? 'continues selected catalog product' : 'keeps Virtual Try-On garment capture'}',
      (tester) async {
        _viewport(tester, const Size(630, 1365));
        final capture = fixtures.testController();
        final products = _products(2);
        final session = _session();
        final device = phone.testDeviceController();
        final gateway = _UploadGateway()
          ..nextSession = phone.readyUploadSession('ready-selected-phone');
        final uploads = KioskCustomerUploadController(
          deviceController: device,
          gateway: gateway,
          captureStore: capture.captureStore,
        );
        addTearDown(capture.dispose);
        addTearDown(session.dispose);
        addTearDown(uploads.dispose);
        addTearDown(device.dispose);
        await session.beginCustomerSession();
        if (selectedCatalogProduct) {
          session.selectGarment(products.first.toGarmentInput());
        }
        await tester.pumpWidget(
          MaterialApp(
            theme: buildSelfxKioskTheme(),
            home: MobileUploadScreen(
              captureController: capture,
              tryOnController: session,
              uploadController: uploads,
              catalogGateway: _Catalog(products),
            ),
          ),
        );
        await _pump(tester);
        final person = capture.activeAcceptedPersonPhoto;
        expect(person, isNotNull);
        expect(gateway.downloads, 1);
        final action = find.byKey(
          Key(
            selectedCatalogProduct
                ? 'continue-selected-product-try-on'
                : 'take-garment-photo',
          ),
        );
        expect(
          tester.widget<SelfxKioskButton>(action).label,
          selectedCatalogProduct ? 'Continue' : 'Take Garment Photo',
        );
        expect(find.text('Recommended for you'), findsNothing);
        expect(
          tester.getCenter(find.byKey(const Key('retake-photo'))).dx,
          lessThan(tester.getCenter(action).dx),
        );
        expect(
          tester
              .widget<SelfxActionPulse>(
                find.byKey(const Key('accepted-person-next-step-pulse')),
              )
              .enabled,
          isTrue,
        );
        if (selectedCatalogProduct) {
          expect(find.byKey(const Key('take-garment-photo')), findsNothing);
          expect(
            find.text('Your photo is ready for this garment.'),
            findsOneWidget,
          );
        }
        expect((session.gateway as _TryOnGateway).created, 0);
        await tester.tap(action);
        await tester.tap(action);
        await _pump(tester);
        await _pumpGeneration(tester);
        expect(capture.activeAcceptedPersonPhoto, same(person));
        expect(gateway.downloads, 1);
        if (selectedCatalogProduct) {
          expect(find.byType(TryOnGenerationScreen), findsOneWidget);
          expect(session.garmentInput?.productId, 'p0');
          expect((session.gateway as _TryOnGateway).created, 1);
        } else {
          expect(
            tester
                .widget<CameraCaptureScreen>(find.byType(CameraCaptureScreen))
                .purpose,
            PhotoAcquisitionPurpose.garment,
          );
          expect((session.gateway as _TryOnGateway).created, 0);
        }
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        session.tryAnotherGarment();
      },
    );
  }

  test(
    'late phone download cannot accept a photo after its session ended',
    () async {
      final capture = fixtures.testController();
      final device = phone.testDeviceController();
      final gateway = _DelayedUploadGateway();
      final uploads = KioskCustomerUploadController(
        deviceController: device,
        gateway: gateway,
        captureStore: capture.captureStore,
      )..session = phone.readyUploadSession('old-session');
      addTearDown(capture.dispose);
      addTearDown(device.dispose);
      addTearDown(uploads.dispose);
      final session = _session();
      addTearDown(session.dispose);
      await session.beginCustomerSession();
      final revision = session.customerSessionRevision;
      final accepting = uploads.useReadyPhoto(
        capture,
        canAcceptPhoto: () => session.isCustomerSessionCurrent(revision),
      );
      await gateway.started.future;
      session.endCustomerSession();
      await session.beginCustomerSession();
      gateway.download.complete();
      expect(await accepting, isFalse);
      expect(capture.activeAcceptedPersonPhoto, isNull);
      expect(gateway.consumedSessionId, isNull);
    },
  );

  for (final size in [
    const Size(320, 568),
    const Size(630, 1365),
    const Size(900, 1600),
    const Size(1280, 720),
    const Size(800, 480),
  ]) {
    testWidgets(
      'person preview preserves layout and continues selected try-on at $size',
      (tester) async {
        _viewport(tester, size);
        final capture = fixtures.testController();
        final session = _session();
        final uploads = fixtures.testUploadController(capture.captureStore);
        addTearDown(capture.dispose);
        addTearDown(session.dispose);
        addTearDown(uploads.dispose);
        await capture.capturePhoto();
        await session.beginCustomerSession();
        session.selectGarment(_products(2).first.toGarmentInput());
        await tester.pumpWidget(
          MaterialApp(
            theme: buildSelfxKioskTheme(),
            home: CaptureReviewScreen(
              controller: capture,
              tryOnController: session,
              uploadController: uploads,
              catalogGateway: _Catalog(_products(2)),
            ),
          ),
        );
        await _pump(tester);
        final preview = tester.getRect(
          find.byKey(const Key('accepted-photo-preview')),
        );
        expect(find.byKey(const Key('recommendations-glass')), findsNothing);
        expect(find.byKey(const Key('accepted-photo-dimmer')), findsNothing);
        final status = tester.getRect(
          find.byKey(const Key('capture-review-status')),
        );
        for (final key in [
          'person-photo-status-title',
          'person-photo-status-message',
        ]) {
          final text = find.byKey(Key(key));
          expect(tester.getRect(text).center.dx, closeTo(status.center.dx, 1));
          expect(tester.widget<Text>(text).textAlign, TextAlign.center);
        }
        if (size.height >= 1000) {
          expect(preview.height, closeTo(size.height * 0.7, 1));
          expect(
            tester
                .getSize(find.byKey(const Key('accepted-photo-header')))
                .height,
            closeTo(size.height * 0.1, 1),
          );
          expect(
            tester
                .getSize(find.byKey(const Key('accepted-photo-footer')))
                .height,
            closeTo(size.height * 0.2, 1),
          );
        }
        final garmentButton = tester.widget<SelfxKioskButton>(
          find.byKey(const Key('continue-selected-product-try-on')),
        );
        expect(garmentButton.backgroundColor, SelfxKioskTokens.primary);
        expect(garmentButton.foregroundColor, Colors.white);
        final garmentRect = tester.getRect(
          find.byKey(const Key('continue-selected-product-try-on')),
        );
        final retakeRect = tester.getRect(
          find.byKey(const Key('retake-photo')),
        );
        expect(garmentRect.center.dy, closeTo(retakeRect.center.dy, 1));
        // Tiny phone windows allow the footer to scroll instead of shrinking text.
        if (size.width < 420) {
          await tester.ensureVisible(
            find.byKey(const Key('continue-selected-product-try-on')),
          );
          await tester.pump();
        }
        expect(
          find
              .byKey(const Key('continue-selected-product-try-on'))
              .hitTestable(),
          findsOneWidget,
          reason:
              'button=$garmentRect footer=${tester.getRect(find.byKey(const Key('accepted-photo-footer')))}',
        );
        expect(
          find.byKey(const Key('retake-photo')).hitTestable(),
          findsOneWidget,
        );
        expect(find.byKey(const Key('browse-catalog')), findsNothing);
        expect(find.byKey(const Key('take-garment-photo')), findsNothing);
        expect(retakeRect.center.dx, lessThan(garmentRect.center.dx));
        final pulse = tester.widget<SelfxActionPulse>(
          find.byKey(const Key('accepted-person-next-step-pulse')),
        );
        expect(pulse.enabled, isTrue);
        await tester.tap(
          find.byKey(const Key('continue-selected-product-try-on')),
        );
        await _pump(tester);
        expect(session.garmentInput?.productId, 'p0');
        expect(find.byType(TryOnGenerationScreen), findsOneWidget);
        // Let the existing async file-size guard complete outside the fake clock.
        await _pumpGeneration(tester);
        expect(
          (session.gateway as _TryOnGateway).created,
          1,
          reason:
              '${session.status}: ${session.failureCode}: ${session.customerMessage}',
        );
        expect(session.garmentPicks, isEmpty);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        session.tryAnotherGarment();
      },
    );
  }

  test(
    'ending a session during phone validation prevents committing its photo',
    () async {
      final coverage = _DelayedCoverage();
      final capture = fixtures.testController(modelCoverageAnalyzer: coverage);
      final device = phone.testDeviceController();
      final gateway = _UploadGateway();
      final uploads = KioskCustomerUploadController(
        deviceController: device,
        gateway: gateway,
        captureStore: capture.captureStore,
      )..session = phone.readyUploadSession('validating-old-photo');
      addTearDown(capture.dispose);
      addTearDown(device.dispose);
      addTearDown(uploads.dispose);
      final session = _session();
      addTearDown(session.dispose);
      await session.beginCustomerSession();
      final revision = session.customerSessionRevision;
      final preparing = uploads.useReadyPhoto(
        capture,
        canAcceptPhoto: () => session.isCustomerSessionCurrent(revision),
      );
      await coverage.started.future;
      session.endCustomerSession();
      coverage.result.complete(
        const ModelCoverageAnalysis.resolved(
          coverage: ModelCoverage.fullBody,
          confidence: 0.9,
          reasonCode: 'TEST',
        ),
      );
      expect(await preparing, isFalse);
      expect(capture.activeAcceptedPersonPhoto, isNull);
      expect(gateway.consumedSessionId, isNull);
    },
  );
}

void _viewport(WidgetTester tester, Size size) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> _pump(WidgetTester tester) async {
  for (var i = 0; i < 16; i++) {
    await tester.pump(const Duration(milliseconds: 30));
  }
}

Future<void> _pumpGeneration(WidgetTester tester) async {
  for (var i = 0; i < 4; i++) {
    await tester.runAsync(phone.testerPumpEventQueue);
    await _pump(tester);
  }
}

List<KioskCatalogProduct> _products(int count) => [
  for (var i = 0; i < count; i++)
    fixtures.testCatalogProduct(id: 'p$i', name: 'Garment $i'),
];
KioskTryOnSessionController _session() => KioskTryOnSessionController(
  gateway: _TryOnGateway(),
  targetPreparer: phone.FakeTargetPreparer(),
);

class _Catalog extends fixtures.FakeKioskCatalogGateway {
  _Catalog(List<KioskCatalogProduct> products) : super(products: products);
  KioskCatalogAudience? lastAudience;
  @override
  Future<List<KioskCatalogCategory>> getCatalogCategories({
    required KioskCatalogAudience audience,
    KioskProductVertical productVertical = KioskProductVertical.garment,
  }) {
    lastAudience = audience;
    return super.getCatalogCategories(
      audience: audience,
      productVertical: productVertical,
    );
  }
}

class _UploadGateway extends phone.FakeUploadGateway {
  int downloads = 0;
  @override
  Future<void> downloadReadyPhoto({
    required String readUrl,
    required String targetPath,
  }) async {
    downloads++;
  }
}

class _DelayedUploadGateway extends phone.FakeUploadGateway {
  final started = Completer<void>();
  final download = Completer<void>();
  @override
  Future<void> downloadReadyPhoto({
    required String readUrl,
    required String targetPath,
  }) async {
    started.complete();
    await download.future;
  }
}

class _DelayedCoverage extends ModelCoverageAnalyzer {
  final started = Completer<void>();
  final result = Completer<ModelCoverageAnalysis>();
  @override
  Future<ModelCoverageAnalysis> analyze(File image) {
    started.complete();
    return result.future;
  }

  @override
  Future<void> dispose() async {}
}

class _TryOnGateway extends fixtures.FakeKioskTryOnGateway {
  int created = 0;
  @override
  Future<KioskTryOnRun> createRun(KioskTryOnRequest request) {
    created++;
    return super.createRun(request);
  }
}
