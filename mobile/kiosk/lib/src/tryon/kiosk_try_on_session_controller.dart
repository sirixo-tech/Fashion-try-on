import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import '../session/capture_session_controller.dart';
import '../config/kiosk_runtime_configuration.dart';
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
  List<KioskGarmentIntent> enabledGarmentIntents = const [
    KioskGarmentIntent.top,
    KioskGarmentIntent.bottom,
    KioskGarmentIntent.fullOutfit,
  ];
  bool garmentPreviewEnabled = false;
  int captureUploadMaxImageBytes = defaultCaptureUploadMaxImageBytes;
  KioskTryOnStatus status = KioskTryOnStatus.idle;
  KioskTryOnRun? run;
  KioskTryOnResult? result;
  KioskTryOnFailureCode? failureCode;
  String? customerTitle;
  String? customerMessage;
  String? sessionMessage;
  String? activeSessionId;
  String? currentPersonAssetId;
  KioskTryOnSessionStatus? sessionStatus;
  List<KioskTryOnLook> looks = const [];
  TryOnTargetPreparationMetadata? targetMetadata;
  bool customerSessionActive = false;

  Timer? _pollTimer;
  DateTime? _pollStartedAt;
  bool _submitting = false;
  bool _creatingSession = false;
  bool _attachingPerson = false;
  bool _refreshingLooks = false;
  bool _creatingShare = false;
  bool _completingSession = false;
  bool _disposed = false;
  String? _activeClientRequestId;
  File? _preparedPersonFile;
  KioskTryOnShare? _currentShare;

  bool get canActivateRuntimeConfiguration =>
      !customerSessionActive &&
      activeSessionId == null &&
      currentPersonAssetId == null &&
      looks.isEmpty &&
      garmentInput == null &&
      pendingGarmentIntent == null &&
      run == null &&
      result == null &&
      status == KioskTryOnStatus.idle;

  bool get creatingShare => _creatingShare;

  Future<bool> beginCustomerSession() async {
    if (!customerSessionActive) {
      _clearRunState(keepGarment: false);
      _clearBackendSessionState();
      customerSessionActive = true;
      notifyListeners();
    }
    await createBackendSession();
    return activeSessionId != null;
  }

  void endCustomerSession() {
    if (!customerSessionActive) {
      return;
    }
    customerSessionActive = false;
    notifyListeners();
  }

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

  void applyEnabledGarmentIntents(List<KioskGarmentIntent> intents) {
    enabledGarmentIntents = intents;
    if (pendingGarmentIntent != null &&
        _isDisabledKnownCategory(
          pendingGarmentIntent!,
          enabledGarmentIntents,
        )) {
      pendingGarmentIntent = null;
    }
    if (garmentInput != null &&
        _isDisabledKnownCategory(garmentInput!.intent, enabledGarmentIntents)) {
      garmentInput = null;
    }
    notifyListeners();
  }

  void applyGarmentPreviewEnabled(bool enabled) {
    if (garmentPreviewEnabled == enabled) {
      return;
    }
    garmentPreviewEnabled = enabled;
    notifyListeners();
  }

  void applyCaptureUploadMaxImageBytes(int maxBytes) {
    if (maxBytes <= 0 || captureUploadMaxImageBytes == maxBytes) {
      return;
    }
    captureUploadMaxImageBytes = maxBytes;
    notifyListeners();
  }

  Future<bool> captureUploadExceedsLimit(String path) async {
    final file = File(path);
    if (!await file.exists()) {
      return false;
    }
    return (await file.length()) > captureUploadMaxImageBytes;
  }

  String get captureUploadTooLargeMessage =>
      'This photo is too big for SelfX. Retake it or choose a smaller image. Limit: ${_formatMegabytes(captureUploadMaxImageBytes)}.';

  Future<bool> createBackendSession() async {
    if (_creatingSession ||
        (activeSessionId != null &&
            sessionStatus == KioskTryOnSessionStatus.active)) {
      return activeSessionId != null;
    }
    _creatingSession = true;
    sessionMessage = null;
    notifyListeners();
    try {
      final session = await _sessionGateway.createTryOnSession();
      _applySession(session);
    } on KioskTryOnException catch (error) {
      sessionMessage = error.message;
    } on TimeoutException {
      sessionMessage = 'SelfX session could not be started right now.';
    } on SocketException {
      sessionMessage = 'SelfX session could not be started right now.';
    } catch (_) {
      sessionMessage = 'SelfX session could not be started right now.';
    } finally {
      _creatingSession = false;
      notifyListeners();
    }
    return activeSessionId != null;
  }

  Future<bool> attachAcceptedPerson(CaptureSessionController capture) async {
    if (_attachingPerson) {
      return currentPersonAssetId != null;
    }
    final personPhoto = capture.activeAcceptedPersonPhoto;
    if (personPhoto == null) {
      return false;
    }
    if (await captureUploadExceedsLimit(personPhoto.capture.originalPath)) {
      sessionMessage = captureUploadTooLargeMessage;
      notifyListeners();
      return false;
    }
    await createBackendSession();
    final sessionId = activeSessionId;
    if (sessionId == null) {
      return false;
    }

    _attachingPerson = true;
    sessionMessage = null;
    notifyListeners();
    try {
      final asset = await _sessionGateway.setSessionPerson(
        sessionId: sessionId,
        personImage: File(personPhoto.capture.originalPath),
      );
      if (asset.purpose == KioskTryOnAssetPurpose.person) {
        currentPersonAssetId = asset.assetId;
      }
      return currentPersonAssetId != null;
    } on KioskTryOnException catch (error) {
      sessionMessage = error.message;
      return false;
    } on TimeoutException {
      sessionMessage = 'SelfX could not save this photo for reuse.';
      return false;
    } on SocketException {
      sessionMessage = 'SelfX could not save this photo for reuse.';
      return false;
    } catch (_) {
      sessionMessage = 'SelfX could not save this photo for reuse.';
      return false;
    } finally {
      _attachingPerson = false;
      notifyListeners();
    }
  }

  Future<void> refreshLooks() async {
    if (_refreshingLooks) {
      return;
    }
    final sessionId = activeSessionId;
    if (sessionId == null) {
      looks = const [];
      notifyListeners();
      return;
    }
    _refreshingLooks = true;
    sessionMessage = null;
    notifyListeners();
    try {
      looks = await _sessionGateway.getSessionLooks(sessionId);
    } on KioskTryOnException catch (error) {
      sessionMessage = error.message;
    } on TimeoutException {
      sessionMessage = 'SelfX could not refresh your looks.';
    } on SocketException {
      sessionMessage = 'SelfX could not refresh your looks.';
    } catch (_) {
      sessionMessage = 'SelfX could not refresh your looks.';
    } finally {
      _refreshingLooks = false;
      notifyListeners();
    }
  }

  Future<KioskTryOnShare?> createSessionShare() async {
    final cached = _currentShare;
    if (cached != null && _shareIsReusable(cached)) {
      return cached;
    }
    if (_creatingShare) {
      return null;
    }
    final sessionId = activeSessionId;
    if (sessionId == null) {
      sessionMessage = "Couldn't prepare your looks. Please try again.";
      notifyListeners();
      return null;
    }
    _creatingShare = true;
    sessionMessage = null;
    notifyListeners();
    try {
      final share = await _sessionGateway.createSessionShare(sessionId);
      _currentShare = share;
      return share;
    } on KioskTryOnException {
      sessionMessage = "Couldn't prepare your looks. Please try again.";
      return null;
    } on TimeoutException {
      sessionMessage = "Couldn't prepare your looks. Please try again.";
      return null;
    } on SocketException {
      sessionMessage = "Couldn't prepare your looks. Please try again.";
      return null;
    } catch (_) {
      sessionMessage = "Couldn't prepare your looks. Please try again.";
      return null;
    } finally {
      _creatingShare = false;
      notifyListeners();
    }
  }

  Future<void> completeBackendSession() async {
    if (_completingSession) {
      return;
    }
    final sessionId = activeSessionId;
    if (sessionId == null) {
      _clearBackendSessionState();
      notifyListeners();
      return;
    }
    _completingSession = true;
    try {
      final session = await _sessionGateway.completeTryOnSession(sessionId);
      _applySession(session);
    } catch (_) {
      // Finish must still clear local kiosk state even if the network is down.
    } finally {
      _completingSession = false;
      _clearBackendSessionState();
      notifyListeners();
    }
  }

  Future<void> submitFromCapture(CaptureSessionController capture) async {
    if (_submitting || run != null) {
      return;
    }
    final garment = garmentInput;
    final personPhoto = capture.activeAcceptedPersonPhoto;
    if (garment == null) {
      _fail(
        KioskTryOnFailureCode.garmentMissing,
        'Choose a garment image before generating.',
      );
      return;
    }
    if (personPhoto == null) {
      _fail(
        KioskTryOnFailureCode.personMissing,
        'Retake your photo before generating.',
      );
      return;
    }
    if (!garment.isCatalogProduct &&
        await captureUploadExceedsLimit(garment.localPath)) {
      _fail(KioskTryOnFailureCode.imageTooLarge, captureUploadTooLargeMessage);
      return;
    }
    if (await captureUploadExceedsLimit(personPhoto.capture.originalPath)) {
      _fail(KioskTryOnFailureCode.imageTooLarge, captureUploadTooLargeMessage);
      return;
    }
    final modelCoverage = personPhoto.coverage;
    if (modelCoverage == ModelCoverage.unknown) {
      final guidance = guidanceFor(garment.intent);
      _fail(
        KioskTryOnFailureCode.modelImageIncompatibleWithGarment,
        guidance.message,
        title: guidance.title,
      );
      return;
    }
    if (_requiresKnownCategoryCompatibility(garment)) {
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
    }

    _submitting = true;
    _setStatus(KioskTryOnStatus.preparing, 'Preparing your photo');
    try {
      if (activeSessionId == null && customerSessionActive) {
        await createBackendSession();
      }
      if (activeSessionId != null && currentPersonAssetId == null) {
        await attachAcceptedPerson(capture);
      }
      _activeClientRequestId ??= _createClientRequestId();
      final sessionId = activeSessionId;
      final personAssetId = currentPersonAssetId;
      final prepared = await targetPreparer.prepare(
        originalPath: personPhoto.capture.originalPath,
        scope: personPhoto.captureScope,
        targetMetadata: personPhoto.targetMetadata,
        windowsFullFrameFallback: personPhoto.targetMetadata == null,
      );
      _preparedPersonFile = prepared.file;
      targetMetadata = prepared.metadata;
      final usesStoredPerson = sessionId != null && personAssetId != null;
      if (!usesStoredPerson &&
          await captureUploadExceedsLimit(prepared.file.path)) {
        _fail(
          KioskTryOnFailureCode.imageTooLarge,
          captureUploadTooLargeMessage,
        );
        return;
      }

      _setStatus(KioskTryOnStatus.uploading, 'Uploading securely to SelfX');
      final created = await gateway.createRun(
        KioskTryOnRequest(
          clientRequestId: _activeClientRequestId!,
          personImage: usesStoredPerson ? null : prepared.file,
          garmentInput: garment,
          captureScope: personPhoto.captureScope,
          modelCoverage: modelCoverage,
          targetMetadata: prepared.metadata,
          sessionId: sessionId,
          personAssetId: personAssetId,
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
    currentPersonAssetId = null;
    _clearRunState(keepGarment: true);
    await capture.retake();
    notifyListeners();
  }

  Future<void> finish(CaptureSessionController capture) async {
    await completeBackendSession();
    _clearRunState(keepGarment: false);
    await capture.resetSession();
    customerSessionActive = false;
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
    if (startedAt != null &&
        DateTime.now().difference(startedAt) > pollTimeout) {
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
      if (activeSessionId != null) {
        unawaited(refreshLooks());
      }
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

  void _applySession(KioskTryOnSession session) {
    activeSessionId = session.sessionId;
    sessionStatus = session.status;
    currentPersonAssetId = session.currentPersonAssetId ?? currentPersonAssetId;
  }

  void _clearBackendSessionState() {
    activeSessionId = null;
    currentPersonAssetId = null;
    sessionStatus = null;
    sessionMessage = null;
    looks = const [];
    _currentShare = null;
  }

  KioskTryOnSessionGateway get _sessionGateway {
    final sessionGateway = gateway;

    if (sessionGateway is! KioskTryOnSessionGateway) {
      throw const KioskTryOnException(
        KioskTryOnFailureCode.configurationMissing,
        'Try-On sessions are not available.',
      );
    }

    return sessionGateway as KioskTryOnSessionGateway;
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
      KioskTryOnFailureCode.garmentIntentUnresolved =>
        "We couldn't identify the garment clearly. Retake the garment photo or choose from catalog.",
      KioskTryOnFailureCode.imageTooLarge => fallback,
      KioskTryOnFailureCode.modelImageIncompatibleWithGarment => guidanceFor(
        intent ?? KioskGarmentIntent.auto,
      ).message,
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
      KioskTryOnFailureCode.garmentIntentUnresolved => 'Retake garment photo',
      KioskTryOnFailureCode.imageTooLarge => 'Photo too large',
      KioskTryOnFailureCode.modelImageIncompatibleWithGarment => guidanceFor(
        intent ?? KioskGarmentIntent.auto,
      ).title,
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

bool _requiresKnownCategoryCompatibility(KioskGarmentInput garment) {
  return garment.intent != KioskGarmentIntent.auto;
}

bool _isDisabledKnownCategory(
  KioskGarmentIntent intent,
  List<KioskGarmentIntent> enabledIntents,
) {
  return intent != KioskGarmentIntent.auto && !enabledIntents.contains(intent);
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

bool _shareIsReusable(KioskTryOnShare share) {
  return share.expiresAt.difference(DateTime.now()) >
      const Duration(minutes: 1);
}

String _formatMegabytes(int bytes) {
  final megabytes = bytes / (1024 * 1024);
  if (megabytes == megabytes.roundToDouble()) {
    return '${megabytes.toInt()} MB';
  }
  return '${megabytes.toStringAsFixed(1)} MB';
}
