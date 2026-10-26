import 'dart:typed_data';

enum FramePixelFormat { yuv420, nv21, jpeg, bgra8888, unknown }

class FrameDimensions {
  const FrameDimensions({required this.width, required this.height});

  final int width;
  final int height;
}

class LiveFramePlane {
  const LiveFramePlane({
    required this.bytes,
    required this.bytesPerRow,
    this.bytesPerPixel,
    this.width,
    this.height,
  });

  final Uint8List bytes;
  final int bytesPerRow;
  final int? bytesPerPixel;
  final int? width;
  final int? height;
}

class LiveCameraFrame {
  const LiveCameraFrame({
    required this.dimensions,
    required this.format,
    required this.timestamp,
    required this.rotationDegrees,
    required this.planes,
  });

  final FrameDimensions dimensions;
  final FramePixelFormat format;
  final DateTime timestamp;
  final int rotationDegrees;
  final List<LiveFramePlane> planes;

  int get width => dimensions.width;
  int get height => dimensions.height;

  FrameDimensions get orientedDimensions {
    final rotation = rotationDegrees % 360;
    if (rotation == 90 || rotation == 270 || rotation == -90 || rotation == -270) {
      return FrameDimensions(width: height, height: width);
    }
    return dimensions;
  }
}

class LiveFrameSourceCapabilities {
  const LiveFrameSourceCapabilities({
    required this.supportsPreview,
    required this.supportsStillCapture,
    required this.supportsLiveFrames,
    required this.targetAnalysisFps,
    required this.effectiveAnalysisFps,
    required this.droppedFrameCount,
  });

  final bool supportsPreview;
  final bool supportsStillCapture;
  final bool supportsLiveFrames;
  final double targetAnalysisFps;
  final double effectiveAnalysisFps;
  final int droppedFrameCount;
}
