import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart';
import 'package:image/image.dart' as img;
import 'package:selfx_kiosk/src/tryon/jewellery_result_region_detector.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/ui/jewellery_result_preview.dart';

void main() {
  const imageSize = Size(1000, 700);
  test('portrait crop includes an off-centre target without stretching', () {
    const region = Rect.fromLTRB(0.67, 0.3, 0.95, 0.9);
    final crop = calculateJewelleryPortraitCrop(
      imageSize: imageSize,
      normalizedRegion: region,
    )!;
    expect(crop.width / crop.height, closeTo(0.75, 0.0001));
    expect(crop.right, lessThanOrEqualTo(1000));
    expect(crop.bottom, lessThanOrEqualTo(700));
    expect(crop.left, lessThanOrEqualTo(670));
    expect(crop.top, lessThanOrEqualTo(210));
    expect(crop.right, greaterThanOrEqualTo(950));
    expect(crop.bottom, greaterThanOrEqualTo(630));
  });

  test('unsafe, missing and invalid regions keep the full result', () {
    for (final region in <Rect?>[
      null,
      Rect.zero,
      const Rect.fromLTRB(0, 0, 1, 1),
      const Rect.fromLTRB(-0.1, 0.2, 0.5, 0.7),
      Rect.fromLTRB(double.nan, 0.2, 0.5, 0.7),
    ]) {
      expect(
        calculateJewelleryPortraitCrop(
          imageSize: imageSize,
          normalizedRegion: region,
        ),
        isNull,
      );
    }
  });

  test('wide hand uses a wider portrait crop instead of losing the target', () {
    final crop = calculateJewelleryPortraitCrop(
      imageSize: imageSize,
      normalizedRegion: const Rect.fromLTRB(0.15, 0.2, 0.75, 0.9),
      aspectRatio: 0.6,
    )!;
    expect(crop.width / crop.height, lessThan(1));
    expect(crop.left, lessThanOrEqualTo(150));
    expect(crop.right, greaterThanOrEqualTo(750));
    expect(crop.height, lessThanOrEqualTo(700));
  });

  test('earring and necklace crops require confident target landmarks', () {
    final landmarks = <PoseLandmarkType, PoseLandmark>{};
    void add(PoseLandmarkType type, double x, double y) {
      landmarks[type] = PoseLandmark(
        type: type,
        x: x,
        y: y,
        z: 0,
        likelihood: 0.95,
      );
    }

    add(PoseLandmarkType.nose, 650, 200);
    add(PoseLandmarkType.leftEar, 720, 210);
    add(PoseLandmarkType.rightEar, 580, 210);
    add(PoseLandmarkType.leftShoulder, 800, 370);
    add(PoseLandmarkType.rightShoulder, 500, 370);
    for (final type in [
      KioskJewelleryType.earring,
      KioskJewelleryType.necklace,
    ]) {
      final region = jewelleryRegionFromPose(
        landmarks,
        type: type,
        imageSize: imageSize,
      )!;
      expect(region.left, lessThan(580));
      expect(region.right, greaterThan(720));
    }
    landmarks.remove(PoseLandmarkType.rightEar);
    expect(
      jewelleryRegionFromPose(
        landmarks,
        type: KioskJewelleryType.earring,
        imageSize: imageSize,
      ),
      isNull,
    );
  });

  final source = _syntheticResult();
  for (final viewport in [const Size(600, 1000), const Size(1000, 600)]) {
    testWidgets('jewellery preview and original zoom work at $viewport', (
      tester,
    ) async {
      tester.view.physicalSize = viewport;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await _mount(
        tester,
        source,
        _Detector(const Rect.fromLTRB(0.68, 0.3, 0.94, 0.85)),
      );
      final painter = _painter(tester);
      expect(painter.sourceRect.width, lessThan(1000));
      expect(painter.sourceRect.left, greaterThan(400));
      expect(painter.image.width, 1000);
      final boundary = tester.renderObject<RenderRepaintBoundary>(
        find.byKey(const Key('preview-pixels')),
      );
      await tester.runAsync(() async {
        final rendered = await boundary.toImage();
        try {
          final pixels = (await rendered.toByteData())!;
          final center =
              ((rendered.height ~/ 2) * rendered.width + rendered.width ~/ 2) *
              4;
          expect(pixels.getUint8(center), 200);
          expect(pixels.getUint8(center + 1), 80);
          expect(pixels.getUint8(center + 2), 50);
        } finally {
          rendered.dispose();
        }
      });
      await tester.tap(find.byKey(const Key('expand-jewellery-result')));
      await tester.pumpAndSettle();
      final fullImage = tester.widget<RawImage>(find.byType(RawImage));
      expect(fullImage.image!.width, 1000);
      expect(fullImage.image!.height, 700);
      expect(fullImage.fit, BoxFit.contain);
      final viewer = tester.widget<InteractiveViewer>(
        find.byType(InteractiveViewer),
      );
      await tester.tap(find.byTooltip('Zoom in'));
      await tester.pump();
      expect(
        viewer.transformationController!.value.getMaxScaleOnAxis(),
        greaterThan(1),
      );
      await tester.tap(find.byTooltip('Reset zoom'));
      await tester.pump();
      expect(viewer.transformationController!.value.getMaxScaleOnAxis(), 1);
      await tester.tap(find.byKey(const Key('close-jewellery-result')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('failed target analysis keeps full result available', (
    tester,
  ) async {
    await _mount(tester, source, _Detector(null, fail: true));
    expect(_painter(tester).sourceRect, const Rect.fromLTWH(0, 0, 1000, 700));
    expect(find.byKey(const Key('expand-jewellery-result')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'cover result fills all corners and preserves the full-image viewer',
    (tester) async {
      await _mount(tester, source, _Detector(null), fit: BoxFit.cover);
      final boundary = tester.renderObject<RenderRepaintBoundary>(
        find.byKey(const Key('preview-pixels')),
      );
      await tester.runAsync(() async {
        final rendered = await boundary.toImage();
        try {
          final pixels = (await rendered.toByteData())!;
          for (final point in [
            Offset.zero,
            Offset(rendered.width - 1, 0),
            Offset(0, rendered.height - 1),
            Offset(rendered.width - 1, rendered.height - 1),
          ]) {
            final offset =
                (point.dy.toInt() * rendered.width + point.dx.toInt()) * 4;
            expect(pixels.getUint8(offset), 20);
            expect(pixels.getUint8(offset + 1), 30);
            expect(pixels.getUint8(offset + 2), 40);
          }
        } finally {
          rendered.dispose();
        }
      });
      await tester.tap(find.byKey(const Key('expand-jewellery-result')));
      await tester.pumpAndSettle();
      final full = tester.widget<RawImage>(find.byType(RawImage));
      expect(full.image!.width, 1000);
      expect(full.image!.height, 700);
      expect(full.fit, BoxFit.contain);
      await tester.pumpWidget(const SizedBox.shrink());
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('late detection cannot update a replaced result', (tester) async {
    final pending = Completer<Rect?>();
    await _mount(tester, source, _PendingDetector(pending));
    await _mount(tester, source, _Detector(null));
    pending.complete(const Rect.fromLTRB(0.68, 0.3, 0.94, 0.85));
    await tester.pumpAndSettle();
    expect(_painter(tester).sourceRect, const Rect.fromLTWH(0, 0, 1000, 700));
    expect(tester.takeException(), isNull);
  });

  testWidgets('invalid image displays a recoverable unavailable state', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: SizedBox(
          width: 400,
          height: 600,
          child: JewelleryResultPreview(
            src: 'invalid-base64!',
            jewelleryType: KioskJewelleryType.ring,
          ),
        ),
      ),
    );
    expect(find.text('Generated image unavailable'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

String _syntheticResult() {
  final image = img.Image(width: 1000, height: 700);
  img.fill(image, color: img.ColorRgb8(20, 30, 40));
  img.fillRect(
    image,
    x1: 680,
    y1: 210,
    x2: 940,
    y2: 595,
    color: img.ColorRgb8(200, 80, 50),
  );
  return 'data:image/png;base64,${base64Encode(img.encodePng(image))}';
}

Future<void> _mount(
  WidgetTester tester,
  String src,
  JewelleryResultRegionDetector detector, {
  BoxFit fit = BoxFit.contain,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: ThemeData(splashFactory: NoSplash.splashFactory),
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: 420,
            height: 650,
            child: RepaintBoundary(
              key: const Key('preview-pixels'),
              child: JewelleryResultPreview(
                src: src,
                jewelleryType: KioskJewelleryType.ring,
                regionDetector: detector,
                fit: fit,
              ),
            ),
          ),
        ),
      ),
    ),
  );
  for (var attempt = 0; attempt < 30; attempt++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pump();
    if (find
        .byKey(const Key('jewellery-result-preview'))
        .evaluate()
        .isNotEmpty) {
      break;
    }
  }
  await tester.pump();
}

JewelleryResultImagePainter _painter(WidgetTester tester) {
  final finder = find.descendant(
    of: find.byKey(const Key('jewellery-result-preview')),
    matching: find.byType(CustomPaint),
  );
  return tester.widget<CustomPaint>(finder).painter!
      as JewelleryResultImagePainter;
}

class _Detector implements JewelleryResultRegionDetector {
  _Detector(this.region, {this.fail = false});
  final Rect? region;
  final bool fail;
  @override
  Future<Rect?> detect(ui.Image image, KioskJewelleryType type) async {
    if (fail) throw StateError('Detector unavailable');
    return region;
  }
}

class _PendingDetector implements JewelleryResultRegionDetector {
  _PendingDetector(this.pending);
  final Completer<Rect?> pending;
  @override
  Future<Rect?> detect(ui.Image image, KioskJewelleryType type) =>
      pending.future;
}
