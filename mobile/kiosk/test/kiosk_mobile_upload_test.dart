import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/camera/camera_models.dart';
import 'package:selfx_kiosk/src/camera/camera_service.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_gateway.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_models.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_session_controller.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_storage.dart';
import 'package:selfx_kiosk/src/live/live_frame.dart';
import 'package:selfx_kiosk/src/quality/image_quality.dart';
import 'package:selfx_kiosk/src/session/capture_audio_service.dart';
import 'package:selfx_kiosk/src/session/capture_flow.dart';
import 'package:selfx_kiosk/src/session/capture_scope.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/session/temporary_capture_store.dart';
import 'package:selfx_kiosk/src/settings/camera_settings_store.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_controller.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_gateway.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_models.dart';

void main() {
  test('mobile upload session creates QR state from active device token', () async {
    final gateway = FakeUploadGateway();
    final controller = KioskCustomerUploadController(
      deviceController: testDeviceController(),
      gateway: gateway,
      captureStore: InMemoryTemporaryCaptureStore(),
    );

    await controller.createSession();

    expect(controller.session?.publicUploadUrl, contains('/upload/capability'));
    expect(controller.message, 'Waiting for your photo...');
    expect(gateway.createdAccessToken, 'device-token');
    controller.dispose();
  });

  test('ready mobile upload is accepted as temporary person photo', () async {
    final gateway = FakeUploadGateway()
      ..nextSession = readyUploadSession('upload-session');
    final uploadController = KioskCustomerUploadController(
      deviceController: testDeviceController(),
      gateway: gateway,
      captureStore: InMemoryTemporaryCaptureStore(),
    )..session = readyUploadSession('upload-session');
    final captureController = testCaptureController();

    final accepted = await uploadController.useReadyPhoto(captureController);

    expect(accepted, isTrue);
    expect(
      captureController.acceptedCapture?.originalPath,
      'mobile-upload-0.jpg',
    );
    expect(
      captureController.acceptedPersonImage?.source,
      CustomerPersonImageSource.mobileUpload,
    );
    expect(captureController.flowState.stage, CaptureFlowStage.photoReady);
    expect(gateway.consumedSessionId, 'upload-session');
    uploadController.dispose();
    captureController.dispose();
  });
}

KioskDeviceSessionController testDeviceController() {
  return KioskDeviceSessionController(
    gateway: FakeDeviceGateway(),
    store: InMemoryDeviceStore(),
  )..accessToken = 'device-token';
}

KioskCustomerUploadSession readyUploadSession(String sessionId) {
  return KioskCustomerUploadSession(
    sessionId: sessionId,
    status: KioskCustomerUploadStatus.ready,
    expiresAt: DateTime.now().add(const Duration(minutes: 5)),
    serverTime: DateTime.now(),
    pollIntervalSeconds: 3,
    publicUploadUrl: 'https://try.selfx.test/upload/capability',
    photo: const KioskCustomerUploadPhoto(
      readUrl: 'https://storage.selfx.test/customer-photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 128,
      width: 1024,
      height: 1536,
    ),
  );
}

CaptureSessionController testCaptureController() {
  return CaptureSessionController(
    cameraService: FakeCameraService(),
    settingsStore: FakeSettingsStore(),
    analyzer: FakeQualityAnalyzer(),
    captureStore: InMemoryTemporaryCaptureStore(),
    audioService: const SilentCaptureAudioService(),
  )..selectCaptureScope(CaptureScope.fullBody);
}

class FakeUploadGateway implements KioskCustomerUploadGateway {
  KioskCustomerUploadSession? nextSession;
  String? createdAccessToken;
  String? consumedSessionId;

  @override
  Future<KioskCustomerUploadSession> createSession(String accessToken) async {
    createdAccessToken = accessToken;
    return KioskCustomerUploadSession(
      sessionId: 'upload-session',
      status: KioskCustomerUploadStatus.waiting,
      expiresAt: DateTime.now().add(const Duration(minutes: 5)),
      serverTime: DateTime.now(),
      pollIntervalSeconds: 3,
      publicUploadUrl: 'https://try.selfx.test/upload/capability',
    );
  }

  @override
  Future<KioskCustomerUploadSession> getSession({
    required String accessToken,
    required String sessionId,
  }) async {
    return nextSession ?? readyUploadSession(sessionId);
  }

  @override
  Future<KioskCustomerUploadSession> cancelSession({
    required String accessToken,
    required String sessionId,
  }) async {
    return KioskCustomerUploadSession(
      sessionId: sessionId,
      status: KioskCustomerUploadStatus.cancelled,
      expiresAt: DateTime.now(),
      serverTime: DateTime.now(),
      pollIntervalSeconds: 3,
    );
  }

  @override
  Future<KioskCustomerUploadSession> consumeSession({
    required String accessToken,
    required String sessionId,
  }) async {
    consumedSessionId = sessionId;
    return KioskCustomerUploadSession(
      sessionId: sessionId,
      status: KioskCustomerUploadStatus.consumed,
      expiresAt: DateTime.now(),
      serverTime: DateTime.now(),
      pollIntervalSeconds: 3,
    );
  }

  @override
  Future<void> downloadReadyPhoto({
    required String readUrl,
    required String targetPath,
  }) async {}
}

class FakeDeviceGateway implements KioskDeviceGateway {
  @override
  Future<KioskPairingSession> createPairingSession({
    required String installationId,
    required String platform,
    required String appVersion,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<KioskPairingStatusResult> getPairingStatus({
    required String sessionId,
    required String provisioningSecret,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<KioskDeviceCredentials> exchangeProvisioningGrant({
    required String pairingSessionId,
    required String provisioningSecret,
    required String provisioningGrant,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<KioskDeviceCredentials> refreshSession(String refreshToken) {
    throw UnimplementedError();
  }

  @override
  Future<KioskDeviceIdentity> me(String accessToken) {
    throw UnimplementedError();
  }

  @override
  Future<KioskDeviceIdentity> heartbeat({
    required String accessToken,
    required String platform,
    required String appVersion,
  }) {
    throw UnimplementedError();
  }
}

class InMemoryDeviceStore implements KioskDeviceCredentialStore {
  String? refreshToken;

  @override
  Future<String> installationId() async => 'install-id';

  @override
  Future<String?> readRefreshToken() async => refreshToken;

  @override
  Future<void> writeRefreshToken(String token) async {
    refreshToken = token;
  }

  @override
  Future<void> clearRefreshToken() async {
    refreshToken = null;
  }
}

class FakeCameraService implements CameraService {
  final ValueNotifier<CameraState> _state = ValueNotifier(const CameraState());
  final StreamController<LiveCameraFrame> _frames =
      StreamController<LiveCameraFrame>.broadcast();

  @override
  ValueListenable<CameraState> get state => _state;

  @override
  Stream<LiveCameraFrame> get liveFrames => _frames.stream;

  @override
  Future<List<CameraDevice>> rediscoverDevices() async => [];

  @override
  Future<void> initialize({String? preferredCameraId}) async {}

  @override
  Future<void> selectCamera(CameraDevice device) async {}

  @override
  Future<CameraCaptureResult> captureStill() {
    throw UnimplementedError();
  }

  @override
  Widget buildPreview(BuildContext context) => const SizedBox.shrink();

  @override
  Future<void> startLiveFrames() async {}

  @override
  Future<void> stopLiveFrames() async {}

  @override
  Future<void> dispose() async {
    await _frames.close();
  }
}

class FakeSettingsStore implements CameraSettingsStore {
  @override
  Future<String?> readPreferredCameraId() async => null;

  @override
  Future<void> savePreferredCameraId(String id) async {}

  @override
  Future<void> clearPreferredCameraId() async {}

  @override
  Future<int> readCaptureCountdownSeconds() async {
    return defaultCaptureCountdownSeconds;
  }

  @override
  Future<void> saveCaptureCountdownSeconds(int seconds) async {}

  @override
  Future<bool> readCaptureSoundsEnabled() async => true;

  @override
  Future<void> saveCaptureSoundsEnabled(bool enabled) async {}

  @override
  Future<CaptureAudioProfile> readCaptureAudioProfile() async =>
      defaultCaptureAudioProfile;

  @override
  Future<void> saveCaptureAudioProfile(CaptureAudioProfile profile) async {}
}

class FakeQualityAnalyzer implements KioskImageQualityAnalyzer {
  @override
  Future<ImageQualityResult> analyzeStillImage(
    String imagePath,
    ImageQualityTarget target,
  ) async {
    return createUnavailableImageQualityResult(width: 1024, height: 1536);
  }

  @override
  void dispose() {}
}
