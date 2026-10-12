import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/services.dart';
import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart'
    as mlkit;

import '../session/temporary_capture_store.dart';
import 'kiosk_garment_input.dart';

abstract class JewelleryResultRegionDetector {
  Future<ui.Rect?> detect(ui.Image image, KioskJewelleryType type);
}

class LocalJewelleryResultRegionDetector
    implements JewelleryResultRegionDetector {
  const LocalJewelleryResultRegionDetector();

  static const _handChannel = MethodChannel('selfx/jewellery_result_region');

  @override
  Future<ui.Rect?> detect(ui.Image image, KioskJewelleryType type) async {
    if (!Platform.isAndroid) return null;
    ui.Image? thumbnail;
    File? temporaryFile;
    mlkit.PoseDetector? poseDetector;
    try {
      final scale = math.min(1.0, 1280 / math.max(image.width, image.height));
      final width = math.max(1, (image.width * scale).round());
      final height = math.max(1, (image.height * scale).round());
      final recorder = ui.PictureRecorder();
      ui.Canvas(recorder).drawImageRect(
        image,
        ui.Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
        ui.Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()),
        ui.Paint()..filterQuality = ui.FilterQuality.medium,
      );
      final picture = recorder.endRecording();
      try {
        thumbnail = await picture.toImage(width, height);
      } finally {
        picture.dispose();
      }
      final data = await thumbnail.toByteData(format: ui.ImageByteFormat.png);
      if (data == null) return null;
      final bytes = data.buffer.asUint8List(
        data.offsetInBytes,
        data.lengthInBytes,
      );
      final size = ui.Size(width.toDouble(), height.toDouble());
      if (type == KioskJewelleryType.ring ||
          type == KioskJewelleryType.bracelet) {
        final bounds = await _handChannel.invokeMapMethod<String, num>(
          'detectHandRegion',
          {'image': bytes},
        );
        if (bounds == null) return null;
        final values = [
          'left',
          'top',
          'right',
          'bottom',
        ].map((key) => bounds[key]?.toDouble()).toList();
        if (values.any((value) => value == null || !value.isFinite)) {
          return null;
        }
        final region = ui.Rect.fromLTRB(
          values[0]! * width,
          values[1]! * height,
          values[2]! * width,
          values[3]! * height,
        );
        // Bracelets need context beyond the detected hand, including the wrist.
        final padding = type == KioskJewelleryType.bracelet ? 0.55 : 0.16;
        return _normalize(
          region.inflate(math.max(region.width, region.height) * padding),
          size,
        );
      }

      temporaryFile = File(
        await TemporaryCaptureStore().createTempCapturePath(
          prefix: 'selfx_result_region',
          extension: '.png',
        ),
      );
      await temporaryFile.writeAsBytes(bytes);
      poseDetector = mlkit.PoseDetector(
        options: mlkit.PoseDetectorOptions(
          model: mlkit.PoseDetectionModel.accurate,
          mode: mlkit.PoseDetectionMode.single,
        ),
      );
      final poses = await poseDetector.processImage(
        mlkit.InputImage.fromFilePath(temporaryFile.path),
      );
      if (poses.length != 1) return null;
      final region = jewelleryRegionFromPose(
        poses.single.landmarks,
        type: type,
        imageSize: size,
      );
      return region == null ? null : _normalize(region, size);
    } catch (_) {
      return null;
    } finally {
      thumbnail?.dispose();
      try {
        await poseDetector?.close();
      } catch (_) {}
      try {
        if (temporaryFile != null && await temporaryFile.exists()) {
          await temporaryFile.delete();
        }
      } catch (_) {}
    }
  }
}

ui.Rect? jewelleryRegionFromPose(
  Map<mlkit.PoseLandmarkType, mlkit.PoseLandmark> landmarks, {
  required KioskJewelleryType type,
  required ui.Size imageSize,
}) {
  ui.Offset? point(mlkit.PoseLandmarkType name) {
    final value = landmarks[name];
    if (value == null ||
        !value.likelihood.isFinite ||
        value.likelihood < 0.75 ||
        !value.x.isFinite ||
        !value.y.isFinite ||
        value.x < 0 ||
        value.y < 0 ||
        value.x > imageSize.width ||
        value.y > imageSize.height) {
      return null;
    }
    return ui.Offset(value.x, value.y);
  }

  final nose = point(mlkit.PoseLandmarkType.nose);
  final leftEar = point(mlkit.PoseLandmarkType.leftEar);
  final rightEar = point(mlkit.PoseLandmarkType.rightEar);
  if (nose == null || leftEar == null || rightEar == null) return null;
  final faceWidth = (leftEar.dx - rightEar.dx).abs();
  if (faceWidth < imageSize.width * 0.06) return null;
  if (type == KioskJewelleryType.earring) {
    return ui.Rect.fromLTRB(
      math.min(leftEar.dx, rightEar.dx) - faceWidth * 0.35,
      math.min(nose.dy, math.min(leftEar.dy, rightEar.dy)) - faceWidth * 0.65,
      math.max(leftEar.dx, rightEar.dx) + faceWidth * 0.35,
      math.max(nose.dy, math.max(leftEar.dy, rightEar.dy)) + faceWidth * 0.8,
    );
  }
  if (type != KioskJewelleryType.necklace) return null;
  final leftShoulder = point(mlkit.PoseLandmarkType.leftShoulder);
  final rightShoulder = point(mlkit.PoseLandmarkType.rightShoulder);
  if (leftShoulder == null || rightShoulder == null) return null;
  final shoulderSpan = (leftShoulder - rightShoulder).distance;
  if (shoulderSpan < faceWidth || shoulderSpan < imageSize.width * 0.15) {
    return null;
  }
  final shoulderCenter = (leftShoulder + rightShoulder) / 2;
  return ui.Rect.fromLTRB(
    math.min(nose.dx, shoulderCenter.dx) - shoulderSpan * 0.4,
    math.min(leftEar.dy, rightEar.dy) - faceWidth * 0.25,
    math.max(nose.dx, shoulderCenter.dx) + shoulderSpan * 0.4,
    math.max(leftShoulder.dy, rightShoulder.dy) + shoulderSpan * 0.55,
  );
}

ui.Rect? _normalize(ui.Rect region, ui.Size size) {
  final clipped = region.intersect(ui.Offset.zero & size);
  if (clipped.isEmpty) return null;
  return ui.Rect.fromLTRB(
    clipped.left / size.width,
    clipped.top / size.height,
    clipped.right / size.width,
    clipped.bottom / size.height,
  );
}

ui.Rect? calculateJewelleryPortraitCrop({
  required ui.Size imageSize,
  required ui.Rect? normalizedRegion,
  double aspectRatio = 0.75,
}) {
  if (normalizedRegion == null ||
      !imageSize.width.isFinite ||
      !imageSize.height.isFinite ||
      imageSize.isEmpty ||
      !aspectRatio.isFinite ||
      aspectRatio <= 0 ||
      aspectRatio > 1) {
    return null;
  }
  final values = [
    normalizedRegion.left,
    normalizedRegion.top,
    normalizedRegion.right,
    normalizedRegion.bottom,
  ];
  if (values.any((value) => !value.isFinite || value < 0 || value > 1) ||
      normalizedRegion.isEmpty) {
    return null;
  }
  final region = ui.Rect.fromLTRB(
    normalizedRegion.left * imageSize.width,
    normalizedRegion.top * imageSize.height,
    normalizedRegion.right * imageSize.width,
    normalizedRegion.bottom * imageSize.height,
  );
  // A wider portrait crop can retain a spread hand that cannot fit the panel's
  // exact aspect ratio. Contained painting preserves its proportions.
  final minimumAspectRatio = region.width / imageSize.height;
  if (minimumAspectRatio > 0.9) return null;
  final cropAspectRatio = math.max(aspectRatio, minimumAspectRatio);
  final width = math.max(region.width, region.height * cropAspectRatio);
  final height = width / cropAspectRatio;
  // Never trim the detected target just to force it into a portrait frame.
  if (width > imageSize.width || height > imageSize.height) return null;
  final left = (region.center.dx - width / 2).clamp(
    0.0,
    imageSize.width - width,
  );
  final top = (region.center.dy - height / 2).clamp(
    0.0,
    imageSize.height - height,
  );
  return ui.Rect.fromLTWH(left, top, width, height);
}
