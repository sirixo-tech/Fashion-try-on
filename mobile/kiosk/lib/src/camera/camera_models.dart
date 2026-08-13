import 'package:flutter/foundation.dart';

enum CameraStatus {
  idle,
  discovering,
  noDevices,
  initializing,
  ready,
  capturing,
  disconnected,
  failed,
  disposed,
}

enum CameraFailureCode {
  noCameras,
  permissionDenied,
  permissionPermanentlyDenied,
  initializationFailed,
  captureFailed,
  disconnected,
  selectedCameraMissing,
  unknown,
}

enum CameraFacing { front, back, external, unknown }

@immutable
class CameraDevice {
  const CameraDevice({
    required this.id,
    required this.label,
    this.facing = CameraFacing.unknown,
    this.sensorOrientation,
  });

  final String id;
  final String label;
  final CameraFacing facing;
  final int? sensorOrientation;
}

@immutable
class CameraCapabilities {
  const CameraCapabilities({
    this.supportsPreview = true,
    this.previewWidth,
    this.previewHeight,
    this.supportsStillCapture = true,
    this.supportsLiveFrames = false,
    this.nativeBackend = 'Flutter camera plugin',
    this.notes = const [],
  });

  final bool supportsPreview;
  final double? previewWidth;
  final double? previewHeight;
  final bool supportsStillCapture;
  final bool supportsLiveFrames;
  final String nativeBackend;
  final List<String> notes;

  String get resolutionLabel {
    if (previewWidth == null || previewHeight == null) {
      return 'Resolution available after preview starts';
    }
    return '${previewWidth!.round()} x ${previewHeight!.round()}';
  }
}

@immutable
class CameraFailure {
  const CameraFailure({required this.code, required this.message});

  final CameraFailureCode code;
  final String message;
}

@immutable
class CameraState {
  const CameraState({
    this.status = CameraStatus.idle,
    this.devices = const [],
    this.selectedDevice,
    this.capabilities = const CameraCapabilities(),
    this.failure,
  });

  final CameraStatus status;
  final List<CameraDevice> devices;
  final CameraDevice? selectedDevice;
  final CameraCapabilities capabilities;
  final CameraFailure? failure;

  bool get isReady => status == CameraStatus.ready;
  bool get canCapture =>
      status == CameraStatus.ready && capabilities.supportsStillCapture;

  CameraState copyWith({
    CameraStatus? status,
    List<CameraDevice>? devices,
    CameraDevice? selectedDevice,
    CameraCapabilities? capabilities,
    CameraFailure? failure,
    bool clearFailure = false,
    bool clearSelectedDevice = false,
  }) {
    return CameraState(
      status: status ?? this.status,
      devices: devices ?? this.devices,
      selectedDevice: clearSelectedDevice
          ? null
          : selectedDevice ?? this.selectedDevice,
      capabilities: capabilities ?? this.capabilities,
      failure: clearFailure ? null : failure ?? this.failure,
    );
  }
}

@immutable
class CameraCaptureResult {
  const CameraCaptureResult({
    required this.originalPath,
    required this.createdAt,
    required this.deviceId,
    required this.isTemporary,
  });

  final String originalPath;
  final DateTime createdAt;
  final String deviceId;
  final bool isTemporary;
}
