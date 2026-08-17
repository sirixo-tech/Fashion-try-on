import 'dart:math' as math;

import 'package:flutter/services.dart';

import '../live/live_frame.dart';
import '../live/person_analysis.dart';

enum CameraOrientationMode { auto, deg0, deg90, deg180, deg270 }

const defaultCameraOrientationMode = CameraOrientationMode.auto;

extension CameraOrientationModeInfo on CameraOrientationMode {
  String get storageValue {
    return switch (this) {
      CameraOrientationMode.auto => 'AUTO',
      CameraOrientationMode.deg0 => 'DEG_0',
      CameraOrientationMode.deg90 => 'DEG_90',
      CameraOrientationMode.deg180 => 'DEG_180',
      CameraOrientationMode.deg270 => 'DEG_270',
    };
  }

  String get label {
    return switch (this) {
      CameraOrientationMode.auto => 'Auto',
      CameraOrientationMode.deg0 => '0 deg',
      CameraOrientationMode.deg90 => '90 deg',
      CameraOrientationMode.deg180 => '180 deg',
      CameraOrientationMode.deg270 => '270 deg',
    };
  }

  String get diagnosticLabel {
    return switch (this) {
      CameraOrientationMode.auto => 'AUTO',
      CameraOrientationMode.deg0 => '0',
      CameraOrientationMode.deg90 => '90',
      CameraOrientationMode.deg180 => '180',
      CameraOrientationMode.deg270 => '270',
    };
  }

  int? get manualDegrees {
    return switch (this) {
      CameraOrientationMode.auto => null,
      CameraOrientationMode.deg0 => 0,
      CameraOrientationMode.deg90 => 90,
      CameraOrientationMode.deg180 => 180,
      CameraOrientationMode.deg270 => 270,
    };
  }
}

CameraOrientationMode cameraOrientationModeFromStorage(String? value) {
  final normalized = value?.trim().toUpperCase();
  for (final mode in CameraOrientationMode.values) {
    if (mode.storageValue == normalized || mode.name.toUpperCase() == normalized) {
      return mode;
    }
  }
  return defaultCameraOrientationMode;
}

class CameraOrientationResolution {
  const CameraOrientationResolution({
    required this.mode,
    required this.displayOrientation,
    required this.sensorOrientationDegrees,
    required this.lensFacingLabel,
    required this.manualCorrectionDegrees,
    required this.effectiveRotationDegrees,
  });

  final CameraOrientationMode mode;
  final DeviceOrientation displayOrientation;
  final int? sensorOrientationDegrees;
  final String lensFacingLabel;
  final int manualCorrectionDegrees;
  final int effectiveRotationDegrees;

  bool get hasManualCorrection => mode != CameraOrientationMode.auto;

  bool get swapsDimensions =>
      effectiveRotationDegrees == 90 || effectiveRotationDegrees == 270;
}

class CameraOrientationResolver {
  const CameraOrientationResolver();

  CameraOrientationResolution resolve({
    required CameraOrientationMode mode,
    required DeviceOrientation displayOrientation,
    required String lensFacingLabel,
    int? sensorOrientationDegrees,
  }) {
    final sensor = sensorOrientationDegrees == null
        ? null
        : normalizeQuarterTurnDegrees(sensorOrientationDegrees);
    final manualCorrection = mode.manualDegrees ?? 0;
    final effectiveRotation = normalizeQuarterTurnDegrees(manualCorrection);
    return CameraOrientationResolution(
      mode: mode,
      displayOrientation: displayOrientation,
      sensorOrientationDegrees: sensor,
      lensFacingLabel: lensFacingLabel,
      manualCorrectionDegrees: manualCorrection,
      effectiveRotationDegrees: effectiveRotation,
    );
  }

  int resolveLiveFrameRotationDegrees({
    required CameraOrientationMode mode,
    required int sensorOrientationDegrees,
  }) {
    return normalizeQuarterTurnDegrees(
      sensorOrientationDegrees + (mode.manualDegrees ?? 0),
    );
  }
}

int normalizeQuarterTurnDegrees(int value) {
  final normalized = value % 360;
  final positive = normalized < 0 ? normalized + 360 : normalized;
  return switch (positive) {
    90 => 90,
    180 => 180,
    270 => 270,
    _ => 0,
  };
}

int quarterTurnsForDegrees(int degrees) {
  return normalizeQuarterTurnDegrees(degrees) ~/ 90;
}

FrameDimensions rotatedFrameDimensions(
  FrameDimensions dimensions,
  int degrees,
) {
  final rotation = normalizeQuarterTurnDegrees(degrees);
  if (rotation == 90 || rotation == 270) {
    return FrameDimensions(width: dimensions.height, height: dimensions.width);
  }
  return dimensions;
}

Size rotatedSize(Size size, int degrees) {
  final rotation = normalizeQuarterTurnDegrees(degrees);
  if (rotation == 90 || rotation == 270) {
    return Size(size.height, size.width);
  }
  return size;
}

TargetSubjectRegion rotateTargetSubjectRegion(
  TargetSubjectRegion region,
  int degrees,
) {
  final rotation = normalizeQuarterTurnDegrees(degrees);
  final x = region.x.clamp(0, 1).toDouble();
  final y = region.y.clamp(0, 1).toDouble();
  final width = region.width.clamp(0, 1).toDouble();
  final height = region.height.clamp(0, 1).toDouble();
  return switch (rotation) {
    90 => TargetSubjectRegion(
        x: _unit(1 - (y + height)),
        y: _unit(x),
        width: _unit(height),
        height: _unit(width),
      ),
    180 => TargetSubjectRegion(
        x: _unit(1 - (x + width)),
        y: _unit(1 - (y + height)),
        width: _unit(width),
        height: _unit(height),
      ),
    270 => TargetSubjectRegion(
        x: _unit(y),
        y: _unit(1 - (x + width)),
        width: _unit(height),
        height: _unit(width),
      ),
    _ => TargetSubjectRegion(x: x, y: y, width: width, height: height),
  };
}

Rect rotateNormalizedRect(Rect rect, int degrees) {
  final region = rotateTargetSubjectRegion(
    TargetSubjectRegion(
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    ),
    degrees,
  );
  return Rect.fromLTWH(region.x, region.y, region.width, region.height);
}

double _unit(num value) {
  return math.max(0, math.min(1, value.toDouble()));
}
