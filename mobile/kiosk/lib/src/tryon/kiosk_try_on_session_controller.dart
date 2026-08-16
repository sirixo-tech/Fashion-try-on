import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import '../session/capture_session_controller.dart';
import 'kiosk_garment_input.dart';
import 'kiosk_try_on_gateway.dart';
import 'kiosk_try_on_models.dart';
import 'model_garment_compatibility.dart';
import 'try_on_target_preparer.dart';

class KioskTryOnSessionController extends ChangeNotifier {
  KioskTryOnSessionController({
    required this.gateway,
    TryOnTargetPreparer? targetPreparer,
    this.pollInterval = const Duration(seconds: 3),
    this.pollTimeout = const Duration(minutes: 3),
  }) : targetPreparer = targetPreparer ?? TryOnTargetPreparer();

  final KioskTryOnGateway gateway;
  final TryOnTargetPreparer targetPreparer;
  final Duration pollInterval;
  final Duration pollTimeout;

  KioskGarmentInput? garmentInput;
  KioskGarmentIntent? pendingGarmentIntent;
  KioskTryOnStatus status = KioskTryOnStatus.idle;
  KioskTryOnRun? run;
  KioskTryOnResult? result;
  KioskTryOnFailureCode? failureCode;
  String? customerTitle;
  String? customerMessage;
  TryOnTargetPreparationMetadata? targetMetadata;

  Timer? _pollTimer;
  DateTime? _pollStartedAt;
  bool _submitting = false;
  bool _disposed = false;
  String? _activeClientRequestId;
  File? _preparedPersonFile;

  void selectGarment(KioskGarmentInput input) {
    garmentInput = input;
    pendingGarmentIntent = input.intent;
    _clearRunState(keepGarment: true);
    notifyListeners();
  }

  void selectPendingGarmentIntent(KioskGarmentIntent intent) {
    pendingGarmentIntent = intent;
    notifyListeners();
  }

  Future<void> submitFromCapture(CaptureSessionController capture) async {
    if (_submitting || run != null) {
      return;
    }
    final garment = garmentInput;
    final accepted = capture.acceptedCapture;
    if (garment == null) {
      _fail(
        KioskTryOnFailureCode.garmentMissing,
        'Choose a garment image before generating.',
      );
      return;
    }
    if (accepted == null) {
      _fail(
        KioskTryOnFailureCode.personMissing,
        'Retake your photo before generating.',
      );
      return;
    }
    final modelCoverage = capture.acceptedModelCoverage ?? ModelCoverage.unknown;
    final compatibility = const ModelGarmentCompatibilityService().check(
      coverage: modelCoverage,
      intent: garment.intent,
    );
    if (!compatibility.supported) {
      final guidance = compatibility.guidance!;
      _fail(
        KioskTryOnFailureCode.modelImageIncompatibleWithGarment,
        guidance.message,
        title: guidance.title,
      );
      return;
    }

    _submitting = true;
    _setStatus(KioskTryOnStatus.preparing, 'Preparing your photo');
    try {
      final prepared = await targetPreparer.prepare(
        originalPath: accepted.originalPath,
        scope: capture.captureScope,
        targetMetadata: capture.acceptedCaptureTargetMetadata,
        windowsFullFrameFallback:
            capture.acceptedCaptureTargetMetadata == null,
      );
      _preparedPersonFile = prepared.file;
      targetMetadata = prepared.metadata;
      _activeClientRequestId ??= _createClientRequestId();

      _setStatus(KioskTryOnStatus.uploading, 'Uploading securely to SelfX');
      final created = await gateway.createRun(
        KioskTryOnRequest(
          clientRequestId: _activeClientRequestId!,
          personImage: prepared.file,
          garmentInput: garment,
          captureScope: capture.captureScope,
          modelCoverage: modelCoverage,
          targetMetadata: prepared.metadata,
        ),
      );
      run = created;
      _setStatus(created.status, _messageForStatus(created.status));
      if (created.isTerminal) {
        _handleTerminal(created);
      } else {
        _beginPolling(created.id);
      }
    } on KioskTryOnException catch (error) {
      _fail(
        error.code,
        _customerSafeMessage(error.code, error.message, garment.intent),
        title: _customerSafeTitle(error.code, garment.intent),
      );
    } on TimeoutException {
      _fail(
        KioskTryOnFailureCode.networkUnavailable,
        'SelfX could not be reached. Check the connection and try again.',
      );
    } on SocketException {
      _fail(
        KioskTryOnFailureCode.networkUnavailable,
        'SelfX could not be reached. Check the connection and try again.',
      );
    } catch (_) {
      _fail(
        KioskTryOnFailureCode.uploadFailed,
        'SelfX could not start this Try-On. Please try again.',
      );
    } finally {
      _submitting = false;
    }
  }

  Future<void> retryPolling() async {
    final current = run;
    if (current == null || current.isTerminal) {
      return;
    }
    _beginPolling(current.id);
  }

  void tryAnotherGarment() {
    _clearRunState(keepGarment: false);
    notifyListeners();
  }

  Future<void> retakePhoto(CaptureSessionController capture) async {
    _clearRunState(keepGarment: true);
    await capture.retake();
    notifyListeners();
  }

  Future<void> finish(CaptureSessionController capture) async {
    _clearRunState(keepGarment: false);
    await capture.resetSession();
    notifyListeners();
  }

  void cancelActivePolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
    if (run != null && !run!.isTerminal) {
      status = KioskTryOnStatus.cancelled;
      failureCode = KioskTryOnFailureCode.cancelled;
      customerTitle = null;
      customerMessage = 'Try-On generation was cancelled.';
      notifyListeners();
    }
  }

  void _beginPolling(String runId) {
    _pollTimer?.cancel();
    _pollStartedAt = DateTime.now();
    _pollTimer = Timer.periodic(pollInterval, (_) {
      unawaited(_poll(runId));
    });
    unawaited(_poll(runId));
  }

  Future<void> _poll(String runId) async {
    final startedAt = _pollStartedAt;
    if (startedAt != null && DateTime.now().difference(startedAt) > pollTimeout) {
      _pollTimer?.cancel();
      _pollTimer = null;
      _fail(
        KioskTryOnFailureCode.generationTimedOut,
        'Try-On generation is taking too long. Please try again.',
        statusOverride: KioskTryOnStatus.timedOut,
      );
      return;
    }

    try {
      final latest = await gateway.getRun(runId);
      run = latest;
      _setStatus(latest.status, _messageForStatus(latest.status));
      if (latest.isTerminal) {
        _pollTimer?.cancel();
        _pollTimer = null;
        _handleTerminal(latest);
      }
    } on KioskTryOnException catch (error) {
      if (error.code == KioskTryOnFailureCode.networkUnavailable) {
        _setStatus(
          status,
          'Still generating. Connection is unstable, retrying safely.',
        );
        return;
      }
      _pollTimer?.cancel();
      _pollTimer = null;
      _fail(
        error.code,
        _customerSafeMessage(error.code, error.message, garmentInput?.intent),
        title: _customerSafeTitle(error.code, garmentInput?.intent),
      );
    } on TimeoutException {
      _setStatus(status, 'Still generating. Connection is slow, retrying.');
    } on SocketException {
      _setStatus(status, 'Still generating. Connection is unstable.');
    }
  }

  void _handleTerminal(KioskTryOnRun terminalRun) {
    if (terminalRun.status == KioskTryOnStatus.succeeded &&
        terminalRun.resultImage != null) {
      result = KioskTryOnResult(
        run: terminalRun,
        generatedImage: terminalRun.resultImage!,
      );
      _setStatus(KioskTryOnStatus.succeeded, 'Your Try-On is ready');
      return;
    }

    _fail(
      terminalRun.failureCode ?? KioskTryOnFailureCode.generationFailed,
      terminalRun.failureMessage ??
          'SelfX could not generate this Try-On. Please try again.',
    );
  }

  void _fail(
    KioskTryOnFailureCode code,
    String message, {
    String? title,
    KioskTryOnStatus statusOverride = KioskTryOnStatus.failed,
  }) {
    failureCode = code;
    status = statusOverride;
    customerTitle = title ?? _customerSafeTitle(code, garmentInput?.intent);
    customerMessage = _customerSafeMessage(code, message, garmentInput?.intent);
    notifyListeners();
  }

  void _setStatus(KioskTryOnStatus next, String message) {
    status = next;
    customerTitle = null;
    customerMessage = message;
    notifyListeners();
  }

  void _clearRunState({required bool keepGarment}) {
    _pollTimer?.cancel();
    _pollTimer = null;
    _pollStartedAt = null;
    run = null;
    result = null;
    status = KioskTryOnStatus.idle;
    failureCode = null;
    customerTitle = null;
    customerMessage = null;
    targetMetadata = null;
    _activeClientRequestId = null;
    final preparedPath = _preparedPersonFile?.path;
    _preparedPersonFile = null;
    if (!keepGarment) {
      garmentInput = null;
      pendingGarmentIntent = null;
    }
    if (preparedPath != null) {
      unawaited(_deleteIfPresent(preparedPath));
    }
  }

  String _messageForStatus(KioskTryOnStatus status) {
    return switch (status) {
      KioskTryOnStatus.idle => 'Ready',
      KioskTryOnStatus.preparing => 'Preparing your photo',
      KioskTryOnStatus.uploading => 'Uploading securely to SelfX',
      KioskTryOnStatus.queued => 'Creating your Try-On',
      KioskTryOnStatus.processing => 'Generating your look',
      KioskTryOnStatus.succeeded => 'Your Try-On is ready',
      KioskTryOnStatus.failed => 'Try-On generation failed',
      KioskTryOnStatus.timedOut => 'Try-On generation timed out',
      KioskTryOnStatus.cancelled => 'Try-On generation cancelled',
    };
  }

  String _customerSafeMessage(
    KioskTryOnFailureCode code,
    String fallback,
    KioskGarmentIntent? intent,
  ) {
    return switch (code) {
      KioskTryOnFailureCode.configurationMissing =>
        'SelfX Try-On is not configured on this kiosk yet.',
      KioskTryOnFailureCode.authenticationMissing =>
        'SelfX Try-On access is not configured for this kiosk.',
      KioskTryOnFailureCode.deviceAuthenticationRejected =>
        'This kiosk needs to be paired again before Try-On can continue.',
      KioskTryOnFailureCode.garmentMissing =>
        'Choose a garment image before generating.',
      KioskTryOnFailureCode.personMissing =>
        'Retake your photo before generating.',
      KioskTryOnFailureCode.imagePreparationFailed =>
        'SelfX could not prepare this photo. Please retake it.',
      KioskTryOnFailureCode.networkUnavailable =>
        'SelfX could not be reached. Check the connection and try again.',
      KioskTryOnFailureCode.generationTimedOut =>
        'Try-On generation is taking too long. Please try again.',
      KioskTryOnFailureCode.modelImageIncompatibleWithGarment =>
        guidanceFor(intent ?? KioskGarmentIntent.auto).message,
      KioskTryOnFailureCode.cancelled => 'Try-On generation was cancelled.',
      KioskTryOnFailureCode.uploadFailed ||
      KioskTryOnFailureCode.generationFailed => fallback,
    };
  }

  String? _customerSafeTitle(
    KioskTryOnFailureCode code,
    KioskGarmentIntent? intent,
  ) {
    return switch (code) {
      KioskTryOnFailureCode.modelImageIncompatibleWithGarment =>
        guidanceFor(intent ?? KioskGarmentIntent.auto).title,
      _ => null,
    };
  }

  String _createClientRequestId() {
    final random = math.Random().nextInt(1 << 32).toRadixString(16);
    return 'kiosk-${DateTime.now().microsecondsSinceEpoch}-$random';
  }

  @override
  void dispose() {
    _disposed = true;
    _pollTimer?.cancel();
    final preparedPath = _preparedPersonFile?.path;
    if (preparedPath != null) {
      unawaited(_deleteIfPresent(preparedPath));
    }
    super.dispose();
  }

  @override
  void notifyListeners() {
    if (!_disposed) {
      super.notifyListeners();
    }
  }
}

Future<void> _deleteIfPresent(String path) async {
  try {
    final file = File(path);
    if (await file.exists()) {
      await file.delete();
    }
  } catch (_) {
    // Temporary prepared inputs are best-effort cleanup only.
  }
}
