import 'dart:async';
import 'dart:io';

import 'package:camera/camera.dart' as camera;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image/image.dart' as image;

import '../live/live_frame.dart';
import '../session/temporary_capture_store.dart';
import 'camera_models.dart';
import 'camera_orientation.dart';
import 'camera_service.dart';

class CameraPluginService implements CameraService {
  CameraPluginService({TemporaryCaptureStore? captureStore})
    : _captureStore = captureStore ?? TemporaryCaptureStore();

  final TemporaryCaptureStore _captureStore;
  final ValueNotifier<CameraState> _state = ValueNotifier(const CameraState());
  final StreamController<LiveCameraFrame> _liveFrameController =
      StreamController<LiveCameraFrame>.broadcast();
  final CameraOrientationResolver _orientationResolver =
      const CameraOrientationResolver();
  camera.CameraController? _controller;
  List<camera.CameraDescription> _descriptions = [];
  bool _streamingLiveFrames = false;
  CameraOrientationMode _orientationMode = defaultCameraOrientationMode;

  @override
  ValueListenable<CameraState> get state => _state;

  @override
  Stream<LiveCameraFrame> get liveFrames => _liveFrameController.stream;

  @override
  Future<List<CameraDevice>> rediscoverDevices() async {
    _state.value = _state.value.copyWith(
      status: CameraStatus.discovering,
      clearFailure: true,
    );

    try {
      _descriptions = await camera.availableCameras();
      final devices = _descriptions.map(_toDevice).toList(growable: false);
      _state.value = _state.value.copyWith(
        status: devices.isEmpty ? CameraStatus.noDevices : CameraStatus.idle,
        devices: devices,
        clearSelectedDevice: devices.isEmpty,
        failure: devices.isEmpty
            ? CameraFailure(
                code: CameraFailureCode.noCameras,
                message: _noCameraMessage,
              )
            : null,
        clearFailure: devices.isNotEmpty,
      );
      return devices;
    } catch (error) {
      _state.value = _state.value.copyWith(
        status: CameraStatus.failed,
        failure: CameraFailure(
          code: CameraFailureCode.unknown,
          message: 'Camera discovery failed: $error',
        ),
      );
      return const [];
    }
  }

  @override
  Future<void> initialize({String? preferredCameraId}) async {
    final devices = _state.value.devices.isEmpty
        ? await rediscoverDevices()
        : _state.value.devices;
    if (devices.isEmpty) {
      return;
    }

    final preferred = preferredCameraId == null
        ? null
        : devices.where((device) => device.id == preferredCameraId).firstOrNull;
    final selected = preferred ?? devices.first;
    await _initializeDevice(selected);
  }

  @override
  Future<void> selectCamera(CameraDevice device) async {
    await _initializeDevice(device);
  }

  @override
  Future<void> updateOrientationMode(CameraOrientationMode mode) async {
    _orientationMode = mode;
    final controller = _controller;
    if (controller != null && controller.value.isInitialized) {
      await _lockDisplayCaptureOrientation(controller);
    }
    _publishReadyState();
  }

  @override
  Future<CameraCaptureResult> captureStill() async {
    final controller = _controller;
    final selected = _state.value.selectedDevice;
    if (controller == null ||
        selected == null ||
        !controller.value.isInitialized) {
      throw const CameraServiceException(
        CameraFailureCode.disconnected,
        'Camera is not ready.',
      );
    }

    _state.value = _state.value.copyWith(status: CameraStatus.capturing);
    try {
      await stopLiveFrames();
      final file = await controller.takePicture();
      final normalization = _currentOrientationResolution();
      final normalizedCapture = await _preserveCapture(
        File(file.path),
        normalization,
      );
      _state.value = _state.value.copyWith(status: CameraStatus.ready);
      return CameraCaptureResult(
        originalPath: normalizedCapture.path,
        createdAt: DateTime.now(),
        deviceId: selected.id,
        isTemporary: true,
        orientationMode: normalization.mode,
        normalizationDegrees: normalizedCapture.rotationDegrees,
        orientationNormalized: normalizedCapture.normalized,
      );
    } catch (error) {
      _state.value = _state.value.copyWith(
        status: CameraStatus.failed,
        failure: const CameraFailure(
          code: CameraFailureCode.captureFailed,
          message: 'Capture failed. Check the camera connection and try again.',
        ),
      );
      throw CameraServiceException(
        CameraFailureCode.captureFailed,
        'Capture failed: $error',
      );
    }
  }

  @override
  Future<void> startLiveFrames() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      throw const CameraServiceException(
        CameraFailureCode.disconnected,
        'Camera is not ready for live frames.',
      );
    }
    if (!_state.value.capabilities.supportsLiveFrames ||
        !controller.supportsImageStreaming()) {
      throw const CameraServiceException(
        CameraFailureCode.unknown,
        'Live camera frames are not supported by this camera adapter.',
      );
    }
    if (_streamingLiveFrames || controller.value.isStreamingImages) {
      _streamingLiveFrames = true;
      return;
    }
    await controller.startImageStream((image) {
      if (!_liveFrameController.isClosed) {
        _liveFrameController.add(_toLiveFrame(image, controller.description));
      }
    });
    _streamingLiveFrames = true;
  }

  @override
  Future<void> stopLiveFrames() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      _streamingLiveFrames = false;
      return;
    }
    if (_streamingLiveFrames || controller.value.isStreamingImages) {
      await controller.stopImageStream();
    }
    _streamingLiveFrames = false;
  }

  @override
  Widget buildPreview(BuildContext context) {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      return const ColoredBox(
        color: Color(0xFF102A43),
        child: Center(
          child: Text(
            'Camera preview unavailable',
            style: TextStyle(color: Colors.white),
          ),
        ),
      );
    }
    final preview = camera.CameraPreview(controller);
    final resolution = _currentOrientationResolution();
    if (!resolution.hasManualCorrection ||
        resolution.effectiveRotationDegrees == 0) {
      return preview;
    }
    return RotatedBox(
      quarterTurns: quarterTurnsForDegrees(resolution.effectiveRotationDegrees),
      child: preview,
    );
  }

  @override
  Future<void> dispose() async {
    await _disposeController();
    _state.value = _state.value.copyWith(status: CameraStatus.disposed);
    await _liveFrameController.close();
    _state.dispose();
  }

  Future<void> _initializeDevice(CameraDevice device) async {
    final description = _descriptionFor(device);
    if (description == null) {
      _state.value = _state.value.copyWith(
        status: CameraStatus.disconnected,
        failure: const CameraFailure(
          code: CameraFailureCode.selectedCameraMissing,
          message: 'The selected camera is no longer connected.',
        ),
      );
      await rediscoverDevices();
      return;
    }

    _state.value = _state.value.copyWith(
      status: CameraStatus.initializing,
      selectedDevice: device,
      clearFailure: true,
    );
    await _disposeController();

    final controller = camera.CameraController(
      description,
      camera.ResolutionPreset.max,
      enableAudio: false,
      imageFormatGroup: Platform.isAndroid
          ? camera.ImageFormatGroup.nv21
          : camera.ImageFormatGroup.jpeg,
    );

    try {
      await controller.initialize();
      await _lockDisplayCaptureOrientation(controller);
      _controller = controller;
      controller.addListener(_handleControllerChanged);
      _publishReadyState();
    } on camera.CameraException catch (error) {
      await controller.dispose();
      final code = _failureCodeFor(error);
      _state.value = _state.value.copyWith(
        status: CameraStatus.failed,
        failure: CameraFailure(code: code, message: _friendlyCameraError(code)),
      );
      throw CameraServiceException(code, error.description ?? error.code);
    } catch (error) {
      await controller.dispose();
      _state.value = _state.value.copyWith(
        status: CameraStatus.failed,
        failure: const CameraFailure(
          code: CameraFailureCode.initializationFailed,
          message: 'Camera could not be initialized.',
        ),
      );
      throw CameraServiceException(
        CameraFailureCode.initializationFailed,
        'Camera initialization failed: $error',
      );
    }
  }

  Future<void> _disposeController() async {
    final controller = _controller;
    _controller = null;
    controller?.removeListener(_handleControllerChanged);
    if (controller != null &&
        controller.value.isInitialized &&
        controller.value.isStreamingImages) {
      await controller.stopImageStream();
    }
    _streamingLiveFrames = false;
    await controller?.dispose();
  }

  LiveCameraFrame _toLiveFrame(
    camera.CameraImage image,
    camera.CameraDescription description,
  ) {
    return LiveCameraFrame(
      dimensions: FrameDimensions(width: image.width, height: image.height),
      format: _pixelFormatFor(image.format.group),
      timestamp: DateTime.now(),
      rotationDegrees: _orientationResolver.resolveLiveFrameRotationDegrees(
        mode: _orientationMode,
        sensorOrientationDegrees: description.sensorOrientation,
      ),
      planes: image.planes
          .map(
            (plane) => LiveFramePlane(
              bytes: plane.bytes,
              bytesPerRow: plane.bytesPerRow,
              bytesPerPixel: plane.bytesPerPixel,
              width: plane.width,
              height: plane.height,
            ),
          )
          .toList(growable: false),
    );
  }

  FramePixelFormat _pixelFormatFor(camera.ImageFormatGroup group) {
    return switch (group) {
      camera.ImageFormatGroup.yuv420 => FramePixelFormat.yuv420,
      camera.ImageFormatGroup.nv21 => FramePixelFormat.nv21,
      camera.ImageFormatGroup.jpeg => FramePixelFormat.jpeg,
      camera.ImageFormatGroup.bgra8888 => FramePixelFormat.bgra8888,
      _ => FramePixelFormat.unknown,
    };
  }

  void _handleControllerChanged() {
    final controller = _controller;
    if (controller == null || !controller.value.hasError) {
      return;
    }
    _state.value = _state.value.copyWith(
      status: CameraStatus.disconnected,
      failure: const CameraFailure(
        code: CameraFailureCode.disconnected,
        message: 'Camera connection was interrupted. Refresh cameras to retry.',
      ),
    );
  }

  camera.CameraDescription? _descriptionFor(CameraDevice device) {
    for (final description in _descriptions) {
      if (description.name == device.id) {
        return description;
      }
    }
    return null;
  }

  CameraDevice _toDevice(camera.CameraDescription description) {
    return CameraDevice(
      id: description.name,
      label: description.name,
      facing: switch (description.lensDirection) {
        camera.CameraLensDirection.front => CameraFacing.front,
        camera.CameraLensDirection.back => CameraFacing.back,
        camera.CameraLensDirection.external => CameraFacing.external,
      },
      sensorOrientation: description.sensorOrientation,
    );
  }

  Future<void> _lockDisplayCaptureOrientation(
    camera.CameraController controller,
  ) async {
    if (!Platform.isAndroid) {
      return;
    }
    try {
      await controller.lockCaptureOrientation(DeviceOrientation.portraitUp);
    } catch (_) {
      // Capture orientation locking is best-effort; manual normalization below
      // still keeps SelfX's canonical output consistent when calibration is set.
    }
  }

  void _publishReadyState() {
    final controller = _controller;
    final selected = _state.value.selectedDevice;
    if (controller == null ||
        selected == null ||
        !controller.value.isInitialized) {
      return;
    }
    final previewSize = controller.value.previewSize;
    final resolution = _currentOrientationResolution();
    final effectiveSize = previewSize == null
        ? null
        : rotatedSize(previewSize, resolution.effectiveRotationDegrees);
    _state.value = _state.value.copyWith(
      status: CameraStatus.ready,
      selectedDevice: selected,
      capabilities: CameraCapabilities(
        previewWidth: previewSize?.width,
        previewHeight: previewSize?.height,
        effectivePreviewWidth: effectiveSize?.width,
        effectivePreviewHeight: effectiveSize?.height,
        supportsStillCapture: true,
        supportsLiveFrames:
            Platform.isAndroid && controller.supportsImageStreaming(),
        nativeBackend: _nativeBackendLabel,
        orientationMode: _orientationMode,
        effectiveRotationDegrees: resolution.effectiveRotationDegrees,
        notes: _capabilityNotes,
      ),
      clearFailure: true,
    );
  }

  CameraOrientationResolution _currentOrientationResolution() {
    final selected = _state.value.selectedDevice;
    final controller = _controller;
    return _orientationResolver.resolve(
      mode: _orientationMode,
      displayOrientation:
          controller?.value.lockedCaptureOrientation ??
          controller?.value.deviceOrientation ??
          DeviceOrientation.portraitUp,
      lensFacingLabel: selected?.facing.name ?? CameraFacing.unknown.name,
      sensorOrientationDegrees: selected?.sensorOrientation,
    );
  }

  Future<_PreservedCapture> _preserveCapture(
    File source,
    CameraOrientationResolution orientation,
  ) async {
    final degrees = orientation.effectiveRotationDegrees;
    if (!orientation.hasManualCorrection || degrees == 0) {
      return _PreservedCapture(
        path: await _captureStore.preserveOriginal(source),
        rotationDegrees: 0,
        normalized: false,
      );
    }

    final bytes = await source.readAsBytes();
    final decoded = image.decodeImage(bytes);
    if (decoded == null) {
      throw const CameraServiceException(
        CameraFailureCode.captureFailed,
        'Captured image could not be decoded for orientation normalization.',
      );
    }
    final baked = image.bakeOrientation(decoded);
    final rotated = image.copyRotate(baked, angle: degrees);
    final targetPath = await _captureStore.createTempCapturePath(
      prefix: 'capture-normalized',
      extension: '.jpg',
    );
    await File(targetPath).writeAsBytes(image.encodeJpg(rotated, quality: 95));
    return _PreservedCapture(
      path: targetPath,
      rotationDegrees: degrees,
      normalized: true,
    );
  }

  CameraFailureCode _failureCodeFor(camera.CameraException error) {
    final normalized = error.code.toLowerCase();
    if (normalized.contains('deniedwithoutprompt') ||
        normalized.contains('restricted')) {
      return CameraFailureCode.permissionPermanentlyDenied;
    }
    if (normalized.contains('accessdenied') || normalized.contains('denied')) {
      return CameraFailureCode.permissionDenied;
    }
    return CameraFailureCode.initializationFailed;
  }

  String _friendlyCameraError(CameraFailureCode code) {
    return switch (code) {
      CameraFailureCode.permissionDenied =>
        'SelfX needs camera permission before capture can start.',
      CameraFailureCode.permissionPermanentlyDenied =>
        'Camera permission is blocked. Enable it in device settings, then retry.',
      CameraFailureCode.initializationFailed =>
        'Camera could not be started. Try reconnecting it.',
      _ => 'Camera is unavailable.',
    };
  }

  String get _nativeBackendLabel {
    if (Platform.isAndroid) {
      return 'Android CameraX via Flutter camera';
    }
    if (Platform.isWindows) {
      return 'Windows camera via camera_windows';
    }
    return 'Flutter camera plugin';
  }

  String get _noCameraMessage {
    if (Platform.isAndroid) {
      return 'No camera is available through Android CameraX on this device.';
    }
    if (Platform.isWindows) {
      return 'No camera is available on this Windows device.';
    }
    return 'No camera is available on this device.';
  }

  List<String> get _capabilityNotes {
    if (Platform.isAndroid) {
      return const [
        'Android uses the endorsed CameraX implementation from Flutter camera.',
        'External USB camera support depends on what the Android box exposes.',
        'KIOSK-2A samples Android image streams for local readiness analysis.',
      ];
    }
    if (Platform.isWindows) {
      return const [
        'camera_windows does not expose Windows image streams.',
        'KIOSK-2 may replace this adapter for live quality analysis.',
      ];
    }
    return const ['KIOSK-1.5 supports Android and Windows kiosk builds.'];
  }
}

class _PreservedCapture {
  const _PreservedCapture({
    required this.path,
    required this.rotationDegrees,
    required this.normalized,
  });

  final String path;
  final int rotationDegrees;
  final bool normalized;
}

class CameraServiceException implements Exception {
  const CameraServiceException(this.code, this.message);

  final CameraFailureCode code;
  final String message;

  @override
  String toString() => 'CameraServiceException($code, $message)';
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
