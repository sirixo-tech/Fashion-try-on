import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/camera/camera_models.dart';
import 'package:selfx_kiosk/src/session/capture_flow.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/ui/camera_capture_screen.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_button.dart';

void main() {
  for (final size in [
    const Size(320, 568),
    const Size(630, 1365),
    const Size(900, 1600),
    const Size(1280, 720),
  ]) {
    testWidgets('capture above mobile upload at $size keeps actions', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = size;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var captures = 0;
      var uploads = 0;
      var backs = 0;
      var flips = 0;
      await tester.pumpWidget(
        _page(
          onCapture: () => captures++,
          onUpload: () => uploads++,
          onBack: () => backs++,
          onFlip: () => flips++,
        ),
      );
      final capture = find.byKey(const Key('capture-photo'));
      final upload = find.byKey(const Key('upload-jewellery-person-photo'));
      final back = find.byKey(const Key('camera-back'));
      final flip = find.byKey(const Key('flip-person-camera'));
      expect(find.text('Mobile Upload'), findsOneWidget);
      expect(find.text('Upload From Mobile'), findsNothing);
      expect(
        tester.getRect(capture).bottom,
        lessThan(tester.getRect(upload).top),
      );
      expect(
        tester.getSize(capture).width,
        greaterThan(tester.getSize(upload).width),
      );
      expect(tester.getCenter(back).dx, lessThan(tester.getCenter(upload).dx));
      expect(
        tester.getCenter(flip).dx,
        greaterThan(tester.getCenter(upload).dx),
      );
      expect(
        tester.getCenter(back).dy,
        closeTo(tester.getCenter(upload).dy, 1),
      );
      expect(
        tester.getCenter(flip).dy,
        closeTo(tester.getCenter(upload).dy, 1),
      );
      expect(
        tester.widget<SelfxKioskButton>(capture).backgroundColor,
        SelfxKioskTokens.primary,
      );
      for (final key in [back, flip]) {
        final button = tester.widget<OutlinedButton>(
          find.descendant(of: key, matching: find.byType(OutlinedButton)),
        );
        expect(button.style!.backgroundColor!.resolve({}), Colors.transparent);
        expect(button.style!.foregroundColor!.resolve({}), Colors.white);
        expect(
          button.style!.side!.resolve({})!.color,
          Colors.white.withValues(alpha: 0.95),
        );
      }
      await tester.tap(capture);
      await tester.tap(upload);
      await tester.tap(back);
      await tester.tap(flip);
      expect([captures, uploads, backs, flips], [1, 1, 1, 1]);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('countdown keeps wide capture and disables mobile upload', (
    tester,
  ) async {
    var cancelled = 0;
    await tester.pumpWidget(
      _page(countdown: true, onCancel: () => cancelled++),
    );
    final capture = find.byKey(const Key('capture-photo'));
    final upload = find.byKey(const Key('upload-jewellery-person-photo'));
    expect(
      tester.getRect(capture).bottom,
      lessThan(tester.getRect(upload).top),
    );
    expect(tester.widget<SelfxKioskButton>(capture).onPressed, isNull);
    expect(
      tester
          .widget<FilledButton>(
            find.descendant(of: upload, matching: find.byType(FilledButton)),
          )
          .onPressed,
      isNull,
    );
    await tester.tap(find.text('Cancel'));
    expect(cancelled, 1);
    expect(tester.takeException(), isNull);
  });
}

Widget _page({
  VoidCallback? onCapture,
  VoidCallback? onUpload,
  VoidCallback? onBack,
  VoidCallback? onFlip,
  VoidCallback? onCancel,
  bool countdown = false,
}) => MaterialApp(
  theme: buildSelfxKioskTheme(),
  home: Scaffold(
    backgroundColor: Colors.black,
    body: Align(
      alignment: Alignment.bottomCenter,
      child: CaptureGuidancePanel(
        state: const CameraState(status: CameraStatus.ready),
        flowState: CaptureFlowState(
          stage: countdown
              ? CaptureFlowStage.countdown
              : CaptureFlowStage.preview,
        ),
        readinessResult: null,
        mobileUploadAvailable: true,
        onBack: onBack ?? () {},
        onCapture: onCapture ?? () {},
        onCancelCountdown: onCancel ?? () {},
        onCaptureAnyway: () {},
        canFlipCamera: !countdown,
        onFlipCamera: onFlip,
        onUploadFromMobile: countdown ? null : onUpload,
      ),
    ),
  ),
);
