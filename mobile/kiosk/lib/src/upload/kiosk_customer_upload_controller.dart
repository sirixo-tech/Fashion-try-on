import 'dart:async';

import 'package:flutter/foundation.dart';

import '../device/kiosk_device_session_controller.dart';
import '../session/capture_session_controller.dart';
import '../session/temporary_capture_store.dart';
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
  Duration? serverClockOffset;
  bool isBusy = false;

  Timer? _pollTimer;
  bool _disposed = false;

  Future<void> createSession() async {
    final token = deviceController.accessToken;
    if (token == null || token.isEmpty) {
      _fail('Kiosk is not paired.');
      return;
    }
    _pollTimer?.cancel();
    isBusy = true;
    message = 'Creating mobile upload QR...';
    notifyListeners();
    try {
      final created = await gateway.createSession(token);
      session = created;
      serverClockOffset = created.serverTime.difference(DateTime.now());
      message = 'Waiting for your photo...';
      isBusy = false;
      notifyListeners();
      _startPolling(created);
    } catch (_) {
      _fail('SelfX could not create a phone upload link.');
    }
  }

  Future<void> pollNow() async {
    final current = session;
    if (current == null) {
      await createSession();
      return;
    }
    await _poll(current);
  }

  Future<void> uploadAnother() async {
    await cancel();
    await createSession();
  }

  Future<void> cancel() async {
    _pollTimer?.cancel();
    final current = session;
    final token = deviceController.accessToken;
    if (current == null || token == null) {
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
    final token = deviceController.accessToken;
    final photo = current?.photo;
    if (current == null ||
        token == null ||
        current.status != KioskCustomerUploadStatus.ready ||
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
      session = await gateway.consumeSession(
        accessToken: token,
        sessionId: current.sessionId,
      );
      isBusy = false;
      notifyListeners();
      return true;
    } catch (_) {
      _fail('Uploaded photo could not be opened.');
      return false;
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
    final token = deviceController.accessToken;
    if (token == null) {
      _fail('Kiosk is not paired.');
      return;
    }
    if (remainingFor(current) <= Duration.zero) {
      await createSession();
      return;
    }
    try {
      final latest = await gateway.getSession(
        accessToken: token,
        sessionId: current.sessionId,
      );
      session = latest.copyWith(publicUploadUrl: current.publicUploadUrl);
      serverClockOffset = latest.serverTime.difference(DateTime.now());
      message = messageFor(latest.status);
      if (latest.isTerminal) {
        _pollTimer?.cancel();
        _pollTimer = null;
      }
      notifyListeners();
    } catch (_) {
      message = 'Waiting for SelfX connection...';
      notifyListeners();
    }
  }

  void _fail(String nextMessage) {
    _pollTimer?.cancel();
    _pollTimer = null;
    isBusy = false;
    message = nextMessage;
    notifyListeners();
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
