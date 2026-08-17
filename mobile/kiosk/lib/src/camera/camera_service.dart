import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import 'camera_models.dart';
import '../live/live_frame.dart';
import 'camera_orientation.dart';

abstract class CameraService {
  ValueListenable<CameraState> get state;

  Stream<LiveCameraFrame> get liveFrames;

  Future<List<CameraDevice>> rediscoverDevices();

  Future<void> initialize({String? preferredCameraId});

  Future<void> selectCamera(CameraDevice device);

  Future<void> updateOrientationMode(CameraOrientationMode mode);

  Future<CameraCaptureResult> captureStill();

  Future<void> startLiveFrames();

  Future<void> stopLiveFrames();

  Widget buildPreview(BuildContext context);

  Future<void> dispose();
}
