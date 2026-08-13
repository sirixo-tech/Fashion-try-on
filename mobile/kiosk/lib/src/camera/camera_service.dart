import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import 'camera_models.dart';

abstract class CameraService {
  ValueListenable<CameraState> get state;

  Future<List<CameraDevice>> rediscoverDevices();

  Future<void> initialize({String? preferredCameraId});

  Future<void> selectCamera(CameraDevice device);

  Future<CameraCaptureResult> captureStill();

  Widget buildPreview(BuildContext context);

  Future<void> dispose();
}
