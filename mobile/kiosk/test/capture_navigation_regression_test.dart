import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/session/capture_flow.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/ui/camera_capture_screen.dart';
import 'package:selfx_kiosk/src/ui/capture_review_screen.dart';
import 'package:selfx_kiosk/src/ui/mobile_upload_screen.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_button.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_controller.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_models.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;
import 'kiosk_mobile_upload_test.dart' as phone;

void main() {
  testWidgets(
    'system Back from accepted review restores both controls repeatedly',
    (tester) async {
      final harness = await _camera(tester);
      for (var i = 0; i < 3; i++) {
        await harness.capture.capturePhoto();
        await _frames(tester);
        expect(find.byType(CaptureReviewScreen), findsOneWidget);
        expect(harness.capture.flowState.stage, CaptureFlowStage.photoReady);
        final accepted = harness.capture.activeAcceptedPersonPhoto;
        expect(accepted, isNotNull);
        await tester.binding.handlePopRoute();
        await _frames(tester);
        expect(find.byType(CaptureReviewScreen), findsNothing);
        expect(harness.capture.activeAcceptedPersonPhoto, same(accepted));
        expect(harness.session.garmentInput?.productId, 'selected');
        await _checkControls(tester, harness);
      }
      await tester.pumpWidget(const SizedBox.shrink());
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Back from a replaced review/result route restores retained camera',
    (tester) async {
      final harness = await _camera(tester);
      await harness.capture.capturePhoto();
      await _frames(tester);
      final accepted = harness.capture.activeAcceptedPersonPhoto;
      final context = tester.element(find.byType(CaptureReviewScreen));
      unawaited(
        Navigator.of(context).pushReplacement<void, void>(
          MaterialPageRoute<void>(
            builder: (_) => const Scaffold(body: Text('Result fixture')),
          ),
        ),
      );
      await _frames(tester);
      expect(find.text('Result fixture'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await _frames(tester);
      expect(find.byType(CameraCaptureScreen), findsOneWidget);
      expect(harness.capture.activeAcceptedPersonPhoto, same(accepted));
      await _checkControls(tester, harness);
      await tester.pumpWidget(const SizedBox.shrink());
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'phone system Back cancels garment upload and allows opening it again',
    (tester) async {
      final gateway = _UploadGateway();
      final harness = await _camera(tester, gateway: gateway);
      for (var i = 0; i < 2; i++) {
        await tester.tap(
          find.byKey(const Key('upload-jewellery-person-photo')),
        );
        await _frames(tester);
        expect(find.byType(MobileUploadScreen), findsOneWidget);
        expect(harness.uploads.hasActivePoller, isTrue);
        await tester.binding.handlePopRoute();
        await _frames(tester);
        expect(find.byType(MobileUploadScreen), findsNothing);
        expect(harness.uploads.hasActivePoller, isFalse);
        await _checkControls(tester, harness);
      }
      expect(gateway.cancelled, 2);
      await tester.pumpWidget(const SizedBox.shrink());
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'hidden camera ignores review notifications from the shared controller',
    (tester) async {
      final harness = await _camera(tester);
      await tester.tap(find.byKey(const Key('upload-jewellery-person-photo')));
      await _frames(tester);
      await harness.capture.capturePhoto();
      await _frames(tester);
      expect(find.byType(MobileUploadScreen), findsOneWidget);
      expect(find.byType(CaptureReviewScreen), findsNothing);
      await tester.binding.handlePopRoute();
      await _frames(tester);
      await _checkControls(tester, harness);
      await tester.pumpWidget(const SizedBox.shrink());
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Back from accepted phone preview restores usable capture controls',
    (tester) async {
      final gateway = _ReadyUploadGateway()
        ..nextSession = phone.readyUploadSession('ready-cancelled');
      final harness = await _camera(tester, gateway: gateway);
      await tester.tap(find.byKey(const Key('upload-jewellery-person-photo')));
      await _frames(tester);
      expect(harness.capture.activeAcceptedPersonPhoto, isNotNull);
      expect(harness.capture.flowState.stage, CaptureFlowStage.photoReady);
      expect(
        find.byKey(const Key('continue-selected-product-try-on')),
        findsOneWidget,
      );
      await tester.binding.handlePopRoute();
      await _frames(tester);
      expect(find.byType(MobileUploadScreen), findsNothing);
      expect(harness.capture.activeAcceptedPersonPhoto, isNull);
      expect(harness.session.garmentInput?.productId, 'selected');
      await _checkControls(tester, harness);
      await tester.pumpWidget(const SizedBox.shrink());
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'system Back during upload creation waits then stops late polling',
    (tester) async {
      final created = Completer<KioskCustomerUploadSession>();
      final gateway = _UploadGateway()..createOutcomes.add(created);
      final harness = await _camera(tester, gateway: gateway);
      await tester.tap(find.byKey(const Key('upload-jewellery-person-photo')));
      await _frames(tester);
      await tester.binding.handlePopRoute();
      await _frames(tester);
      expect(find.byType(MobileUploadScreen), findsOneWidget);
      created.complete(phone.waitingUploadSession('late-created'));
      await _frames(tester);
      expect(find.byType(MobileUploadScreen), findsNothing);
      expect(harness.uploads.hasActivePoller, isFalse);
      expect(gateway.cancelled, 1);
      await _checkControls(tester, harness);
      await tester.pumpWidget(const SizedBox.shrink());
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Back during phone download invalidates acceptance before camera returns',
    (tester) async {
      final gateway = _DelayedDownload()
        ..nextSession = phone.readyUploadSession('downloading');
      final harness = await _camera(tester, gateway: gateway);
      await tester.tap(find.byKey(const Key('upload-jewellery-person-photo')));
      await _frames(tester);
      expect(gateway.started.isCompleted, isTrue);
      await tester.binding.handlePopRoute();
      await _frames(tester);
      gateway.download.complete();
      await _frames(tester);
      expect(find.byType(MobileUploadScreen), findsNothing);
      expect(harness.capture.activeAcceptedPersonPhoto, isNull);
      expect(gateway.consumedSessionId, isNull);
      expect(harness.uploads.hasActivePoller, isFalse);
      await _checkControls(tester, harness);
      await tester.pumpWidget(const SizedBox.shrink());
      expect(tester.takeException(), isNull);
    },
  );
}

Future<void> _checkControls(WidgetTester tester, _Harness harness) async {
  expect(harness.capture.flowState.stage, CaptureFlowStage.preview);
  final capture = tester.widget<SelfxKioskButton>(
    find.byKey(const Key('capture-photo')),
  );
  expect(capture.onPressed, isNotNull);
  final mobile = tester.widget<SelfxKioskButton>(
    find.byKey(const Key('upload-jewellery-person-photo')),
  );
  expect(mobile.onPressed, isNotNull);
  await tester.tap(find.byKey(const Key('capture-photo')));
  await tester.pump();
  expect(harness.capture.flowState.stage, CaptureFlowStage.countdown);
  await harness.capture.cancelCountdown();
  await tester.pump();
  expect(harness.capture.flowState.stage, CaptureFlowStage.preview);
}

Future<_Harness> _camera(WidgetTester tester, {_UploadGateway? gateway}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(630, 1365);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final capture = fixtures.testController();
  final session = KioskTryOnSessionController(
    gateway: fixtures.FakeKioskTryOnGateway(),
  );
  final device = phone.testDeviceController();
  final uploads = KioskCustomerUploadController(
    deviceController: device,
    gateway: gateway ?? _UploadGateway(),
    captureStore: capture.captureStore,
  );
  addTearDown(capture.dispose);
  addTearDown(session.dispose);
  addTearDown(uploads.dispose);
  addTearDown(device.dispose);
  await session.beginCustomerSession();
  session.selectGarment(
    fixtures
        .testCatalogProduct(id: 'selected', name: 'Selected garment')
        .toGarmentInput(),
  );
  await tester.pumpWidget(
    MaterialApp(
      theme: buildSelfxKioskTheme(),
      home: CameraCaptureScreen(
        controller: capture,
        tryOnController: session,
        uploadController: uploads,
      ),
    ),
  );
  await _frames(tester);
  return _Harness(capture, session, uploads);
}

Future<void> _frames(WidgetTester tester) async {
  for (var i = 0; i < 30; i++) {
    await tester.pump(const Duration(milliseconds: 30));
  }
}

class _Harness {
  _Harness(this.capture, this.session, this.uploads);
  final CaptureSessionController capture;
  final KioskTryOnSessionController session;
  final KioskCustomerUploadController uploads;
}

class _UploadGateway extends phone.FakeUploadGateway {
  int cancelled = 0;
  @override
  Future<KioskCustomerUploadSession> cancelSession({
    required String accessToken,
    required String sessionId,
  }) {
    cancelled++;
    return super.cancelSession(accessToken: accessToken, sessionId: sessionId);
  }
}

class _DelayedDownload extends _UploadGateway {
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

class _ReadyUploadGateway extends _UploadGateway {
  @override
  Future<void> downloadReadyPhoto({
    required String readUrl,
    required String targetPath,
  }) async {}
}
