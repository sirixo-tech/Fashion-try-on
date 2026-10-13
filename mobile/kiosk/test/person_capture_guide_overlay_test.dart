import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/acquisition/photo_acquisition.dart';
import 'package:selfx_kiosk/src/session/capture_scope.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/ui/camera_capture_screen.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;

void main() {
  for (final scope in CaptureScope.values) {
    for (final size in [
      const Size(320, 568),
      const Size(630, 1365),
      const Size(1280, 720),
      const Size(800, 480),
    ]) {
      testWidgets('$scope positioning and countdown guides fit $size', (
        tester,
      ) async {
        _viewport(tester, size);
        Future<void> showGuide(bool countdown) => tester.pumpWidget(
          MaterialApp(
            theme: buildSelfxKioskTheme(),
            home: Scaffold(
              body: CaptureFramingGuideOverlay(
                purpose: PhotoAcquisitionPurpose.model,
                captureScope: scope,
                countdownActive: countdown,
                reserveUploadAction: true,
              ),
            ),
          ),
        );
        await showGuide(false);
        expect(find.text('Stand in Position'), findsOneWidget);
        expect(find.text('Stand\nstraight'), findsOneWidget);
        expect(find.text('Look at\ncamera'), findsOneWidget);
        expect(find.text('Good\nlighting'), findsOneWidget);
        final outline = tester.getRect(find.byKey(const Key('person-outline')));
        expect(outline.width, greaterThan(0));
        expect(outline.height, greaterThan(0));
        expect(outline.bottom, lessThan(size.height - 80));
        if (scope == CaptureScope.bottom) {
          expect(find.textContaining('Keep your face visible'), findsOneWidget);
        }
        expect(tester.takeException(), isNull);
        await showGuide(true);
        expect(find.byKey(const Key('person-positioning-tips')), findsNothing);
        expect(
          tester
              .widget<Visibility>(
                find.byKey(const Key('person-positioning-heading')),
              )
              .visible,
          isFalse,
        );
        // Countdown must not shift the positioning target.
        expect(
          tester.getRect(find.byKey(const Key('person-outline'))),
          outline,
        );
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }

  testWidgets('starting and cancelling actual countdown toggles person tips', (
    tester,
  ) async {
    _viewport(tester, const Size(630, 1365));
    final camera = fixtures.readyCamera();
    final capture = fixtures.testController(camera: camera);
    final session = KioskTryOnSessionController(
      gateway: fixtures.FakeKioskTryOnGateway(),
    );
    final uploads = fixtures.testUploadController(capture.captureStore);
    addTearDown(capture.dispose);
    addTearDown(session.dispose);
    addTearDown(uploads.dispose);
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
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('person-positioning-tips')), findsOneWidget);
    await tester.tap(find.byKey(const Key('capture-photo')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const Key('camera-countdown-number')), findsOneWidget);
    expect(find.byKey(const Key('person-positioning-tips')), findsNothing);
    expect(find.byKey(const Key('person-outline')), findsOneWidget);
    expect(camera.captureCount, 0);
    await tester.tap(find.byKey(const Key('camera-back')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('person-positioning-tips')), findsOneWidget);
    expect(find.byKey(const Key('camera-countdown-number')), findsNothing);
    await tester.pump(const Duration(seconds: 16));
    expect(camera.captureCount, 0);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

void _viewport(WidgetTester tester, Size size) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}
