import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../acquisition/photo_acquisition.dart';
import '../device/kiosk_device_session_controller.dart';
import '../device/kiosk_device_models.dart';
import '../session/capture_session_controller.dart';
import '../session/temporary_capture_store.dart';
import '../tryon/kiosk_garment_input.dart';
import 'kiosk_customer_upload_gateway.dart';
import 'kiosk_customer_upload_models.dart';

class KioskCustomerUploadController extends ChangeNotifier {
  KioskCustomerUploadController({
    required this.deviceController,
    required this.gateway,
    required this.captureStore,
    this.pollInterval = const Duration(seconds: 3),
  });

  final KioskDeviceSessionController deviceController;
  final KioskCustomerUploadGateway gateway;
  final TemporaryCaptureStore captureStore;
  final Duration pollInterval;

  KioskCustomerUploadSession? session;
  String? message;
  String? errorCode;
  Duration? serverClockOffset;
  KioskCustomerUploadFlowState flowState = KioskCustomerUploadFlowState.idle;
  bool isBusy = false;

  Timer? _pollTimer;
  bool _isPolling = false;
  bool _disposed = false;
  PhotoAcquisitionPurpose _activePurpose = PhotoAcquisitionPurpose.model;

  @visibleForTesting
  bool get hasActivePoller => _pollTimer?.isActive ?? false;

  Future<void> createSession({
    PhotoAcquisitionPurpose purpose = PhotoAcquisitionPurpose.model,
  }) async {
    final startedAt = DateTime.now();
    _activePurpose = purpose;
    _pollTimer?.cancel();
    _pollTimer = null;
    isBusy = true;
    flowState = KioskCustomerUploadFlowState.creating;
    session = null;
    errorCode = null;
    message = 'Preparing secure upload...';
    notifyListeners();
    debugPrint(
      'MOBILE_UPLOAD_CREATE_START path=/api/v1/kiosk/customer-upload-sessions',
    );
    try {
      final created = await _createSessionWithDeviceAuth(purpose);
      session = created;
      serverClockOffset = created.serverTime.difference(DateTime.now());
      flowState = KioskCustomerUploadFlowState.waiting;
      message = purpose.waitingMessage;
      isBusy = false;
      _logCreateSuccess(startedAt);
      notifyListeners();
      _startPolling(created);
    } on KioskCustomerUploadException catch (error) {
      _logCreateFailure(error.code, startedAt, statusCode: error.statusCode);
      if (error.isDeviceRevoked) {
        _fail(
          'Kiosk pairing is no longer valid.',
          code: error.code,
          stopForPairing: true,
        );
        await deviceController.handleDeviceAuthRejected();
        return;
      }
      _fail('Unable to start phone upload.', code: error.code);
    } on TimeoutException {
      _logCreateFailure('CUSTOMER_UPLOAD_TIMEOUT', startedAt);
      _fail('Unable to start phone upload.', code: 'CUSTOMER_UPLOAD_TIMEOUT');
    } on SocketException {
      _logCreateFailure('CUSTOMER_UPLOAD_CONNECTION_FAILED', startedAt);
      _fail(
        'Unable to start phone upload.',
        code: 'CUSTOMER_UPLOAD_CONNECTION_FAILED',
      );
    } on KioskDeviceException catch (error) {
      _logCreateFailure(error.code, startedAt);
      if (error.isRevoked) {
        _fail(
          'Kiosk pairing is no longer valid.',
          code: error.code,
          stopForPairing: true,
        );
        await deviceController.handleDeviceAuthRejected();
        return;
      }
      _fail('Unable to start phone upload.', code: error.code);
    } catch (_) {
      _logCreateFailure('CUSTOMER_UPLOAD_CREATE_FAILED', startedAt);
      _fail(
        'Unable to start phone upload.',
        code: 'CUSTOMER_UPLOAD_CREATE_FAILED',
      );
    }
  }

  Future<void> pollNow() async {
    final current = session;
    if (current == null) {
      await createSession(purpose: _activePurpose);
      return;
    }
    await _poll(current);
  }

  Future<void> uploadAnother() async {
    await cancel();
    await createSession(purpose: _activePurpose);
  }

  Future<void> cancel() async {
    _pollTimer?.cancel();
    _pollTimer = null;
    final current = session;
    final token = deviceController.accessToken;
    if (current == null || token == null) {
      flowState = KioskCustomerUploadFlowState.idle;
      isBusy = false;
      notifyListeners();
      return;
    }
    try {
      session = await gateway.cancelSession(
        accessToken: token,
        sessionId: current.sessionId,
      );
    } catch (_) {
      // Navigation away should still stop local polling even if cancel fails.
    }
    notifyListeners();
  }

  Future<bool> useReadyPhoto(CaptureSessionController captureController) async {
    final current = session;
    final photo = current?.photo;
    if (current == null ||
        current.status != KioskCustomerUploadStatus.ready ||
        current.purpose != PhotoAcquisitionPurpose.model ||
        photo == null) {
      return false;
    }
    isBusy = true;
    message = 'Opening uploaded photo...';
    notifyListeners();
    try {
      final path = await captureStore.createTempCapturePath(
        prefix: 'mobile-upload',
        extension: extensionForContentType(photo.contentType),
      );
      await gateway.downloadReadyPhoto(readUrl: photo.readUrl, targetPath: path);
      captureController.acceptMobileUpload(
        originalPath: path,
        width: photo.width,
        height: photo.height,
      );
      session = await _withDeviceAuth(
        (token) => gateway.consumeSession(
          accessToken: token,
          sessionId: current.sessionId,
          purpose: PhotoAcquisitionPurpose.model,
        ),
      );
      isBusy = false;
      notifyListeners();
      return true;
    } catch (_) {
      _fail('Uploaded photo could not be opened.');
      return false;
    }
  }

  Future<KioskGarmentInput?> useReadyGarment({
    required KioskGarmentIntent intent,
  }) async {
    final current = session;
    final photo = current?.photo;
    if (current == null ||
        current.status != KioskCustomerUploadStatus.ready ||
        current.purpose != PhotoAcquisitionPurpose.garment ||
        photo == null) {
      return null;
    }
    isBusy = true;
    message = 'Opening garment photo...';
    notifyListeners();
    try {
      final path = await captureStore.createTempCapturePath(
        prefix: 'mobile-garment-upload',
        extension: extensionForContentType(photo.contentType),
      );
      await gateway.downloadReadyPhoto(readUrl: photo.readUrl, targetPath: path);
      session = await _withDeviceAuth(
        (token) => gateway.consumeSession(
          accessToken: token,
          sessionId: current.sessionId,
          purpose: PhotoAcquisitionPurpose.garment,
        ),
      );
      isBusy = false;
      notifyListeners();
      return KioskGarmentInput(
        source: KioskGarmentInputSource.phoneUpload,
        localPath: path,
        intent: intent,
        photoType: KioskGarmentPhotoType.onModel,
      );
    } catch (_) {
      _fail('Uploaded garment photo could not be opened.');
      return null;
    }
  }

  Duration remainingFor(KioskCustomerUploadSession current) {
    final serverNow = DateTime.now().add(serverClockOffset ?? Duration.zero);
    return current.expiresAt.difference(serverNow);
  }

  double progressFor(KioskCustomerUploadSession current) {
    final remaining = remainingFor(current);
    if (remaining <= Duration.zero) {
      return 0;
    }
    return (remaining.inMilliseconds / (5 * 60 * 1000)).clamp(0, 1);
  }

  void _startPolling(KioskCustomerUploadSession current) {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(
      Duration(seconds: current.pollIntervalSeconds.clamp(2, 5).toInt()),
      (_) => unawaited(_poll(current)),
    );
    unawaited(_poll(current));
  }

  Future<void> _poll(KioskCustomerUploadSession current) async {
    if (_isPolling) {
      return;
    }
    if (remainingFor(current) <= Duration.zero) {
      _pollTimer?.cancel();
      _pollTimer = null;
      await createSession(purpose: _activePurpose);
      return;
    }
    _isPolling = true;
    try {
      final latest = await _withDeviceAuth(
        (token) => gateway.getSession(
          accessToken: token,
          sessionId: current.sessionId,
        ),
      );
      session = latest.copyWith(publicUploadUrl: current.publicUploadUrl);
      serverClockOffset = latest.serverTime.difference(DateTime.now());
      flowState = KioskCustomerUploadFlowState.waiting;
      message = messageFor(latest.status);
      if (latest.isTerminal) {
        _pollTimer?.cancel();
        _pollTimer = null;
      }
      notifyListeners();
    } on KioskCustomerUploadException catch (error) {
      if (error.isDeviceRevoked) {
        _fail(
          'Kiosk pairing is no longer valid.',
          code: error.code,
          stopForPairing: true,
        );
        await deviceController.handleDeviceAuthRejected();
        return;
      }
      message = 'Waiting for SelfX connection...';
      errorCode = error.code;
      notifyListeners();
    } on KioskDeviceException catch (error) {
      if (error.isRevoked) {
        _fail(
          'Kiosk pairing is no longer valid.',
          code: error.code,
          stopForPairing: true,
        );
        await deviceController.handleDeviceAuthRejected();
        return;
      }
      message = 'Waiting for SelfX connection...';
      errorCode = error.code;
      notifyListeners();
    } catch (_) {
      message = 'Waiting for SelfX connection...';
      notifyListeners();
    } finally {
      _isPolling = false;
    }
  }

  Future<KioskCustomerUploadSession> _createSessionWithDeviceAuth(
    PhotoAcquisitionPurpose purpose,
  ) async {
    return _withDeviceAuth(
      (token) => gateway.createSession(token, purpose: purpose),
    );
  }

  Future<T> _withDeviceAuth<T>(
    Future<T> Function(String accessToken) request,
  ) async {
    final token = await deviceController.requireAccessToken();
    try {
      return await request(token);
    } on KioskCustomerUploadException catch (error) {
      if (!error.isRefreshableDeviceAuth) {
        rethrow;
      }
      final refreshedToken = await deviceController.requireAccessToken(
        forceRefresh: true,
      );
      return request(refreshedToken);
    }
  }

  void _fail(
    String nextMessage, {
    String? code,
    bool stopForPairing = false,
  }) {
    _pollTimer?.cancel();
    _pollTimer = null;
    isBusy = false;
    flowState = KioskCustomerUploadFlowState.failed;
    message = nextMessage;
    errorCode = code;
    if (stopForPairing) {
      session = null;
    }
    notifyListeners();
  }

  void _logCreateSuccess(DateTime startedAt) {
    final durationMs = DateTime.now().difference(startedAt).inMilliseconds;
    debugPrint('MOBILE_UPLOAD_CREATE_OK durationMs=$durationMs');
  }

  void _logCreateFailure(
    String code,
    DateTime startedAt, {
    int? statusCode,
  }) {
    final durationMs = DateTime.now().difference(startedAt).inMilliseconds;
    final status = statusCode == null ? '' : ' status=$statusCode';
    debugPrint(
      'MOBILE_UPLOAD_CREATE_FAILED$status code=$code durationMs=$durationMs',
    );
  }

  @override
  void dispose() {
    _disposed = true;
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  void notifyListeners() {
    if (!_disposed) {
      super.notifyListeners();
    }
  }
}

String messageFor(KioskCustomerUploadStatus status) {
  return switch (status) {
    KioskCustomerUploadStatus.waiting => 'Waiting for your photo...',
    KioskCustomerUploadStatus.uploading => 'Uploading your photo...',
    KioskCustomerUploadStatus.validating => 'Validating photo...',
    KioskCustomerUploadStatus.ready => 'Photo received',
    KioskCustomerUploadStatus.rejected => 'Photo could not be processed.',
    KioskCustomerUploadStatus.expired => 'Upload link expired.',
    KioskCustomerUploadStatus.consumed => 'Photo selected.',
    KioskCustomerUploadStatus.cancelled => 'Upload cancelled.',
  };
}

String extensionForContentType(String contentType) {
  final lower = contentType.toLowerCase();
  if (lower == 'image/png') {
    return '.png';
  }
  if (lower == 'image/webp') {
    return '.webp';
  }
  return '.jpg';
}
