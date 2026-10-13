import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/app/selfx_kiosk_app.dart';
import 'package:selfx_kiosk/src/config/kiosk_runtime_configuration_controller.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_session_controller.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/ui/kiosk_inactivity_warning.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_controller.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;

void main() {
  testWidgets('default warns at 90, counts down, and finishes once at 120', (
    tester,
  ) async {
    final h = await _harness(tester);
    await h.capture.capturePhoto();
    await h.capture.usePhoto();
    h.session.toggleGarmentPick(
      KioskTryOnPick(
        id: 'pick',
        displayName: 'Pick',
        garmentInput: fixtures
            .testCatalogProduct(id: 'pick', name: 'Pick')
            .toGarmentInput(),
      ),
    );
    await tester.pump(const Duration(seconds: 89));
    expect(find.byType(KioskInactivityWarning), findsNothing);
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('No activity detected'), findsOneWidget);
    expect(find.text('Returning to the home screen in'), findsOneWidget);
    expect(find.text('30 seconds'), findsOneWidget);
    expect(h.session.customerSessionActive, isTrue);
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('29 seconds'), findsOneWidget);
    await tester.pump(const Duration(seconds: 28));
    expect(find.text('1 second'), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
    await _settle(tester);
    expect(find.text('Start screen'), findsOneWidget);
    expect(find.byType(KioskInactivityWarning), findsNothing);
    expect(h.capture.activeAcceptedPersonPhoto, isNull);
    expect(h.session.garmentPicks, isEmpty);
    expect(h.gateway.completionReasons, [
      KioskTryOnSessionCompletionReason.idleTimeout,
    ]);
    expect(h.session.customerSessionActive, isFalse);
    await tester.pump(const Duration(seconds: 120));
    expect(h.gateway.completionReasons, hasLength(1));
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'tapping the warning consumes the touch and resets the full timeout',
    (tester) async {
      final h = await _harness(tester);
      final point = tester.getCenter(
        find.byKey(const Key('underlying-action')),
      );
      await tester.pump(const Duration(seconds: 95));
      expect(find.byType(KioskInactivityWarning), findsOneWidget);
      await tester.tapAt(point);
      await tester.pump();
      expect(find.byType(KioskInactivityWarning), findsNothing);
      expect(h.actions, 0);
      await tester.pump(const Duration(seconds: 89));
      expect(find.byType(KioskInactivityWarning), findsNothing);
      expect(h.session.customerSessionActive, isTrue);
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('30 seconds'), findsOneWidget);
      // A tap outside the card also resumes, without a dedicated action button.
      await tester.tapAt(const Offset(8, 8));
      await tester.pump();
      expect(find.byType(KioskInactivityWarning), findsNothing);
      await tester.tapAt(point);
      await tester.pump();
      expect(h.actions, 1);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  for (final page in [
    'Catalog',
    'Capture',
    'Preview',
    'QR upload',
    'Processing',
    'Results',
  ]) {
    testWidgets('warning covers $page without replacing or stopping the page', (
      tester,
    ) async {
      final h = await _harness(tester, page: page);
      await tester.pump(const Duration(seconds: 90));
      expect(find.text(page), findsOneWidget);
      expect(find.byType(KioskInactivityWarning), findsOneWidget);
      expect(h.gateway.completionReasons, isEmpty);
      expect(h.session.customerSessionActive, isTrue);
      await tester.tapAt(const Offset(8, 8));
      await tester.pump();
      expect(find.text(page), findsOneWidget);
      expect(find.byType(KioskInactivityWarning), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  for (final size in [
    const Size(320, 568),
    const Size(630, 1365),
    const Size(900, 1600),
    const Size(1280, 720),
    const Size(800, 480),
  ]) {
    testWidgets('warning is centered and has no action buttons at $size', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = size;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await _harness(tester);
      await tester.pump(const Duration(seconds: 90));
      final warning = find.byKey(const Key('kiosk-inactivity-warning'));
      expect(tester.getRect(warning).center.dx, closeTo(size.width / 2, 1));
      expect(tester.getRect(warning).center.dy, closeTo(size.height / 2, 1));
      final dialog = tester.widget<Dialog>(warning);
      expect(dialog.backgroundColor, Colors.white);
      expect(
        (dialog.shape as RoundedRectangleBorder).borderRadius,
        BorderRadius.circular(24),
      );
      expect(
        find.descendant(of: warning, matching: find.byType(TextButton)),
        findsNothing,
      );
      expect(
        find.descendant(of: warning, matching: find.byType(FilledButton)),
        findsNothing,
      );
      expect(find.text('Tap anywhere to continue.'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('saved longer timeout keeps its final 30-second warning', (
    tester,
  ) async {
    final h = await _harness(tester, timeout: const Duration(seconds: 180));
    await tester.pump(const Duration(seconds: 149));
    expect(find.byType(KioskInactivityWarning), findsNothing);
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('30 seconds'), findsOneWidget);
    await tester.pump(const Duration(seconds: 30));
    await _settle(tester);
    expect(h.session.customerSessionActive, isFalse);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'ending the session dismisses the warning and cancels its timers',
    (tester) async {
      final h = await _harness(tester);
      await tester.pump(const Duration(seconds: 90));
      expect(find.byType(KioskInactivityWarning), findsOneWidget);
      h.session.endCustomerSession();
      await tester.pump();
      expect(find.byType(KioskInactivityWarning), findsNothing);
      await tester.pump(const Duration(seconds: 120));
      expect(h.gateway.completionReasons, isEmpty);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('inactive start screen never shows the warning', (tester) async {
    final h = await _harness(tester, active: false);
    await tester.pump(const Duration(seconds: 240));
    expect(find.byType(KioskInactivityWarning), findsNothing);
    expect(h.gateway.completionReasons, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<_Harness> _harness(
  WidgetTester tester, {
  Duration? timeout,
  String page = 'Customer page',
  bool active = true,
}) async {
  final h = _Harness();
  addTearDown(h.dispose);
  if (active) await h.session.beginCustomerSession();
  await tester.pumpWidget(
    MaterialApp(
      navigatorKey: h.navigator,
      theme: buildSelfxKioskTheme(),
      builder: (context, child) => KioskCustomerSessionIdleGuard(
        navigatorKey: h.navigator,
        captureController: h.capture,
        tryOnController: h.session,
        uploadController: h.uploads,
        configurationController: h.configuration,
        timeoutOverride: timeout,
        now: tester.binding.clock.now,
        child: child!,
      ),
      home: const Scaffold(body: Text('Start screen')),
    ),
  );
  if (active) {
    h.navigator.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          body: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(page),
                TextButton(
                  key: const Key('underlying-action'),
                  onPressed: () => h.actions++,
                  child: const Text('Underlying action'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    // Begin the measured idle interval after the route's entrance animation.
    await tester.tapAt(const Offset(8, 8));
    await tester.pump();
  }
  return h;
}

class _Harness {
  _Harness() {
    session = KioskTryOnSessionController(gateway: gateway);
    device = KioskDeviceSessionController(
      gateway: fixtures.FakeKioskDeviceGateway(),
      store: fixtures.InMemoryKioskDeviceCredentialStore(),
    );
    configuration = KioskRuntimeConfigurationController(
      gateway: fixtures.FakeKioskDeviceGateway(),
      deviceController: device,
      cache: fixtures.InMemoryKioskRuntimeConfigurationCache(),
    );
    uploads = fixtures.testUploadController(capture.captureStore);
  }
  final navigator = GlobalKey<NavigatorState>();
  final capture = fixtures.testController();
  final gateway = fixtures.FakeKioskTryOnGateway();
  late final KioskTryOnSessionController session;
  late final KioskDeviceSessionController device;
  late final KioskRuntimeConfigurationController configuration;
  late final KioskCustomerUploadController uploads;
  int actions = 0;

  void dispose() {
    uploads.dispose();
    configuration.dispose();
    device.dispose();
    session.dispose();
    capture.dispose();
  }
}
