import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/painting.dart';
import 'package:image/image.dart' as img;
import 'package:path/path.dart' as path;

import '../live/live_frame.dart';
import '../live/person_analysis.dart';
import '../session/capture_scope.dart';
import '../session/capture_session_controller.dart';
import '../session/temporary_capture_store.dart';
import 'kiosk_try_on_models.dart';

class TryOnTargetPreparer {
  TryOnTargetPreparer({TemporaryCaptureStore? captureStore})
    : captureStore = captureStore ?? TemporaryCaptureStore();

  final TemporaryCaptureStore captureStore;

  Future<TryOnPreparedTarget> prepare({
    required String originalPath,
    required CaptureScope scope,
    required CaptureTargetMetadata? targetMetadata,
    bool windowsFullFrameFallback = false,
  }) async {
    final original = File(originalPath);
    if (!await original.exists()) {
      throw const KioskTryOnException(
        KioskTryOnFailureCode.personMissing,
        'Customer photo is unavailable.',
      );
    }

    final bytes = await original.readAsBytes();
    final decoded = img.decodeImage(bytes);
    if (decoded == null || decoded.width <= 0 || decoded.height <= 0) {
      throw const KioskTryOnException(
        KioskTryOnFailureCode.imagePreparationFailed,
        'Customer photo could not be prepared.',
      );
    }

    final targetRegion = targetMetadata?.targetRegion;
    final crop = calculatePreparedTargetCrop(
      imageWidth: decoded.width,
      imageHeight: decoded.height,
      scope: scope,
      targetRegion: targetRegion,
    );
    final usedTargetRegion = targetRegion != null;
    final preparedPath = await captureStore.createTempCapturePath(
      prefix: 'selfx_prepared_person',
      extension: '.jpg',
    );

    final prepared = crop.isFullImage(decoded.width, decoded.height)
        ? decoded
        : img.copyCrop(
            decoded,
            x: crop.x,
            y: crop.y,
            width: crop.width,
            height: crop.height,
          );

    await File(preparedPath).writeAsBytes(img.encodeJpg(prepared, quality: 94));

    return TryOnPreparedTarget(
      file: File(preparedPath),
      metadata: TryOnTargetPreparationMetadata(
        originalPath: originalPath,
        preparedPath: preparedPath,
        originalWidth: decoded.width,
        originalHeight: decoded.height,
        cropX: crop.x,
        cropY: crop.y,
        cropWidth: crop.width,
        cropHeight: crop.height,
        scope: scope,
        usedTargetRegion: usedTargetRegion,
        windowsFullFrameFallback: windowsFullFrameFallback || !usedTargetRegion,
      ),
    );
  }
}

class TryOnPreparedTarget {
  const TryOnPreparedTarget({required this.file, required this.metadata});

  final File file;
  final TryOnTargetPreparationMetadata metadata;
}

class PreparedTargetCrop {
  const PreparedTargetCrop({
    required this.x,
    required this.y,
    required this.width,
    required this.height,
  });

  final int x;
  final int y;
  final int width;
  final int height;

  bool isFullImage(int imageWidth, int imageHeight) {
    return x == 0 && y == 0 && width == imageWidth && height == imageHeight;
  }
}

PreparedTargetCrop calculatePreparedTargetCrop({
  required int imageWidth,
  required int imageHeight,
  required CaptureScope scope,
  TargetSubjectRegion? targetRegion,
}) {
  if (imageWidth <= 0 || imageHeight <= 0 || targetRegion == null) {
    return PreparedTargetCrop(
      x: 0,
      y: 0,
      width: math.max(1, imageWidth),
      height: math.max(1, imageHeight),
    );
  }

  final frame = FrameDimensions(width: imageWidth, height: imageHeight);
  final region = targetRegion.toRect(frame);
  final horizontalPadding = region.width * 0.18;
  final topPadding = switch (scope) {
    CaptureScope.top => region.height * 0.16,
    CaptureScope.bottom => region.height * 0.32,
    CaptureScope.fullBody => region.height * 0.10,
  };
  final bottomPadding = switch (scope) {
    CaptureScope.top => region.height * 0.14,
    CaptureScope.bottom => region.height * 0.12,
    CaptureScope.fullBody => region.height * 0.10,
  };

  final desired = Rect.fromLTRB(
    region.left - horizontalPadding,
    region.top - topPadding,
    region.right + horizontalPadding,
    region.bottom + bottomPadding,
  );
  return _clampCrop(desired, imageWidth, imageHeight);
}

PreparedTargetCrop _clampCrop(Rect rect, int imageWidth, int imageHeight) {
  final safeWidth = math.max(1, imageWidth);
  final safeHeight = math.max(1, imageHeight);
  final left = rect.left.clamp(0, safeWidth.toDouble()).toDouble();
  final top = rect.top.clamp(0, safeHeight.toDouble()).toDouble();
  final right = rect.right.clamp(left + 1, safeWidth.toDouble()).toDouble();
  final bottom = rect.bottom.clamp(top + 1, safeHeight.toDouble()).toDouble();

  return PreparedTargetCrop(
    x: left.floor(),
    y: top.floor(),
    width: math.max(1, right.ceil() - left.floor()),
    height: math.max(1, bottom.ceil() - top.floor()),
  );
}

String safeFileName(String value) {
  return path.basename(value).replaceAll(RegExp(r'[^A-Za-z0-9_.-]'), '_');
}
