import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/camera/camera_models.dart';
import 'package:selfx_kiosk/src/session/capture_flow.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/ui/camera_capture_screen.dart';
import 'package:selfx_kiosk/src/ui/kiosk_attention_animations.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_button.dart';

void main() {
  for (final size in [
    const Size(320, 568),
    const Size(630, 1365),
    const Size(900, 1600),
    const Size(1280, 720),
    const Size(800, 480),
  ]) {
    for (final uploadAvailable in [false, true]) {
      testWidgets('capture rail fits $size, mobile upload=$uploadAvailable', (
        tester,
      ) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = size;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        var captures = 0;
        var uploads = 0;
        var backs = 0;
        await tester.pumpWidget(
          _page(
            uploadAvailable: uploadAvailable,
            onCapture: () => captures++,
            onUpload: () => uploads++,
            onBack: () => backs++,
          ),
        );
        final capture = find.byKey(const Key('capture-photo'));
        final upload = find.byKey(const Key('upload-jewellery-person-photo'));
        final back = find.byKey(const Key('camera-back'));
        expect(find.text('Flip'), findsNothing);
        expect(find.byKey(const Key('flip-person-camera')), findsNothing);
        expect(
          tester.getCenter(capture).dx,
          greaterThan(tester.getCenter(back).dx),
        );
        expect(
          tester.getCenter(capture).dy,
          closeTo(tester.getCenter(back).dy, 1),
        );
        expect(
          tester
              .widget<SelfxActionPulse>(find.byType(SelfxActionPulse))
              .enabled,
          isTrue,
        );
        final captureButton = tester.widget<SelfxKioskButton>(capture);
        expect(captureButton.backgroundColor, SelfxKioskTokens.primary);
        expect(captureButton.foregroundColor, Colors.white);
        if (uploadAvailable) {
          expect(find.text('Upload From Mobile'), findsOneWidget);
          final uploadButton = tester.widget<SelfxKioskButton>(upload);
          expect(uploadButton.backgroundColor, captureButton.backgroundColor);
          expect(uploadButton.foregroundColor, captureButton.foregroundColor);
          expect(uploadButton.minHeight, captureButton.minHeight);
          final uploadText = tester.widget<Text>(
            find.descendant(
              of: upload,
              matching: find.text('Upload From Mobile'),
            ),
          );
          final captureText = tester.widget<Text>(
            find.descendant(of: capture, matching: find.text('Capture')),
          );
          expect(uploadText.style!.fontSize, captureText.style!.fontSize);
          expect(
            find.ancestor(of: upload, matching: find.byType(SelfxActionPulse)),
            findsNothing,
          );
          if (size.width >= 630) {
            expect(
              tester.getCenter(upload).dx,
              lessThan(tester.getCenter(capture).dx),
            );
            expect(
              tester.getCenter(upload).dy,
              closeTo(tester.getCenter(capture).dy, 1),
            );
          }
          expect(upload.hitTestable(), findsOneWidget);
          await tester.tap(upload);
        } else {
          expect(upload, findsNothing);
        }
        expect(capture.hitTestable(), findsOneWidget);
        await tester.tap(capture);
        await tester.tap(back);
        expect([captures, uploads, backs], [1, uploadAvailable ? 1 : 0, 1]);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }
  testWidgets('phone upload remains available when no camera can capture', (
    tester,
  ) async {
    var uploads = 0;
    await tester.pumpWidget(
      _page(cameraStatus: CameraStatus.noDevices, onUpload: () => uploads++),
    );
    expect(
      tester
          .widget<SelfxKioskButton>(find.byKey(const Key('capture-photo')))
          .onPressed,
      isNull,
    );
    expect(
      tester.widget<SelfxActionPulse>(find.byType(SelfxActionPulse)).enabled,
      isFalse,
    );
    await tester.tap(find.byKey(const Key('upload-jewellery-person-photo')));
    expect(uploads, 1);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final stage in [
    CaptureFlowStage.preparing,
    CaptureFlowStage.countdown,
    CaptureFlowStage.capturing,
    CaptureFlowStage.analyzing,
  ]) {
    testWidgets('$stage disables capture pulse and upload', (tester) async {
      var cancelled = 0;
      await tester.pumpWidget(
        _page(stage: stage, onCancel: () => cancelled++, onUpload: () {}),
      );
      expect(
        tester.widget<SelfxActionPulse>(find.byType(SelfxActionPulse)).enabled,
        isFalse,
      );
      for (final key in ['capture-photo', 'upload-jewellery-person-photo']) {
        expect(
          tester.widget<SelfxKioskButton>(find.byKey(Key(key))).onPressed,
          isNull,
        );
      }
      if (stage == CaptureFlowStage.countdown) {
        await tester.tap(find.text('Cancel'));
        expect(cancelled, 1);
      }
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
}

Widget _page({
  VoidCallback? onCapture,
  VoidCallback? onUpload,
  VoidCallback? onBack,
  VoidCallback? onCancel,
  bool uploadAvailable = true,
  CaptureFlowStage stage = CaptureFlowStage.preview,
  CameraStatus cameraStatus = CameraStatus.ready,
}) => MaterialApp(
  theme: buildSelfxKioskTheme(),
  home: Scaffold(
    backgroundColor: Colors.black,
    body: Align(
      alignment: Alignment.bottomCenter,
      child: CaptureGuidancePanel(
        state: CameraState(status: cameraStatus),
        flowState: CaptureFlowState(stage: stage),
        readinessResult: null,
        mobileUploadAvailable: uploadAvailable,
        onBack: onBack ?? () {},
        onCapture: onCapture ?? () {},
        onCancelCountdown: onCancel ?? () {},
        onCaptureAnyway: () {},
        onUploadFromMobile: uploadAvailable ? onUpload : null,
      ),
    ),
  ),
);
