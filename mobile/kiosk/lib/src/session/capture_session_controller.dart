import 'dart:async';

import 'package:flutter/foundation.dart';

import '../camera/camera_models.dart';
import '../camera/camera_service.dart';
import '../quality/image_quality.dart';
import '../settings/camera_settings_store.dart';
import 'capture_audio_service.dart';
import 'capture_flow.dart';
import 'temporary_capture_store.dart';

class CaptureSessionController extends ChangeNotifier {
  CaptureSessionController({
    required this.cameraService,
    required this.settingsStore,
    required this.analyzer,
    required this.captureStore,
    CaptureAudioService? audioService,
    Duration? countdownTickDuration,
  }) : audioService = audioService ?? AssetCaptureAudioService(),
       countdownTickDuration =
           countdownTickDuration ?? const Duration(seconds: 1);

  final CameraService cameraService;
  final CameraSettingsStore settingsStore;
  final KioskImageQualityAnalyzer analyzer;
  final TemporaryCaptureStore captureStore;
  final CaptureAudioService audioService;
  final Duration countdownTickDuration;

  CameraCaptureResult? capture;
  CameraCaptureResult? acceptedCapture;
  ImageQualityResult? qualityResult;
  bool isAnalyzingQuality = false;
  String? preferredCameraId;
  int captureCountdownSeconds = defaultCaptureCountdownSeconds;
  bool captureSoundsEnabled = true;
  CaptureAudioProfile captureAudioProfile = defaultCaptureAudioProfile;
  CaptureFlowState flowState = const CaptureFlowState();

  Timer? _countdownTimer;
  int _captureRunId = 0;
  bool _disposed = false;
  bool _captureInProgress = false;
  bool _currentCountdownSoundsEnabled = true;
  CaptureAudioProfile _currentAudioProfile = defaultCaptureAudioProfile;

  Future<void> startCamera() async {
    await loadOperatorSettings();
    preferredCameraId = await settingsStore.readPreferredCameraId();
    await cameraService.rediscoverDevices();
    await cameraService.initialize(preferredCameraId: preferredCameraId);
    notifyListeners();
  }

  Future<void> refreshCameras() async {
    await cameraService.rediscoverDevices();
    await cameraService.initialize(preferredCameraId: preferredCameraId);
    notifyListeners();
  }

  Future<void> selectCamera(CameraDevice device) async {
    preferredCameraId = device.id;
    await settingsStore.savePreferredCameraId(device.id);
    await cameraService.selectCamera(device);
    notifyListeners();
  }

  Future<void> loadOperatorSettings() async {
    captureCountdownSeconds = await settingsStore.readCaptureCountdownSeconds();
    captureSoundsEnabled = await settingsStore.readCaptureSoundsEnabled();
    captureAudioProfile = await settingsStore.readCaptureAudioProfile();
    notifyListeners();
  }

  Future<void> updateCaptureCountdownSeconds(int seconds) async {
    captureCountdownSeconds = normalizeCaptureCountdownSeconds(seconds);
    await settingsStore.saveCaptureCountdownSeconds(captureCountdownSeconds);
    notifyListeners();
  }

  Future<void> updateCaptureSoundsEnabled(bool enabled) async {
    captureSoundsEnabled = enabled;
    await settingsStore.saveCaptureSoundsEnabled(enabled);
    if (!enabled) {
      await _ignoreAudioFailure(audioService.stop);
    }
    notifyListeners();
  }

  Future<void> updateCaptureAudioProfile(CaptureAudioProfile profile) async {
    captureAudioProfile = profile;
    await settingsStore.saveCaptureAudioProfile(profile);
    notifyListeners();
  }

  Future<void> previewCaptureAudioProfile() async {
    if (!captureSoundsEnabled) {
      return;
    }
    await _ignoreAudioFailure(
      () => audioService.previewProfile(captureAudioProfile),
    );
  }

  Future<void> beginAssistedCapture() async {
    if (!flowState.canBeginCapture ||
        _captureInProgress ||
        !cameraService.state.value.canCapture) {
      return;
    }

    _cancelCountdownTimer();
    final runId = ++_captureRunId;
    _setFlowState(
      CaptureFlowState(
        stage: CaptureFlowStage.preparing,
        countdownSeconds: captureCountdownSeconds,
        guidance: const CaptureGuidance(
          message: 'Get ready',
          emphasizeNumber: false,
        ),
      ),
    );

    final seconds = await settingsStore.readCaptureCountdownSeconds();
    final soundsEnabled = await settingsStore.readCaptureSoundsEnabled();
    final profile = await settingsStore.readCaptureAudioProfile();
    if (!_isActiveRun(runId)) {
      return;
    }

    captureCountdownSeconds = seconds;
    captureSoundsEnabled = soundsEnabled;
    captureAudioProfile = profile;
    _currentCountdownSoundsEnabled = soundsEnabled;
    _currentAudioProfile = profile;
    _playAudioIfEnabled(() => audioService.playCountdownStart(profile));
    _setCountdownState(runId, seconds);

    _countdownTimer = Timer.periodic(countdownTickDuration, (_) {
      _tickCountdown(runId);
    });
  }

  Future<void> cancelCountdown() async {
    if (flowState.stage != CaptureFlowStage.countdown &&
        flowState.stage != CaptureFlowStage.preparing) {
      return;
    }
    _cancelCountdownTimer();
    _captureRunId++;
    _setFlowState(
      flowState.copyWith(
        stage: CaptureFlowStage.preview,
        clearSecondsRemaining: true,
        clearError: true,
      ),
    );
  }

  Future<void> capturePhoto() async {
    await _captureAndAnalyze();
  }

  Future<void> _captureAndAnalyze({int? runId}) async {
    if (_captureInProgress || (runId != null && !_isActiveRun(runId))) {
      return;
    }
    _captureInProgress = true;
    _setFlowState(
      flowState.copyWith(
        stage: CaptureFlowStage.capturing,
        clearSecondsRemaining: true,
        clearError: true,
      ),
    );
    final previous = capture;
    var capturedNewPhoto = false;
    try {
      final result = await cameraService.captureStill();
      if (runId != null && !_isActiveRun(runId)) {
        await captureStore.deleteCapture(result.originalPath);
        return;
      }
      _playAudioIfEnabled(() async {
        await audioService.playShutter(_currentAudioProfile);
        await audioService.playCaptureSuccess(_currentAudioProfile);
      });
      capture = result;
      acceptedCapture = null;
      qualityResult = null;
      isAnalyzingQuality = true;
      capturedNewPhoto = true;
      _setFlowState(
        flowState.copyWith(stage: CaptureFlowStage.analyzing, clearError: true),
      );
      await captureStore.deleteCapture(previous?.originalPath);

      qualityResult = await analyzer.analyzeStillImage(
        result.originalPath,
        ImageQualityTarget.person,
      );
    } catch (_) {
      if (capturedNewPhoto) {
        qualityResult = createUnavailableImageQualityResult();
      } else {
        _setFlowState(
          flowState.copyWith(
            stage: CaptureFlowStage.error,
            errorMessage:
                'Photo capture failed. Check the camera and try again.',
            clearSecondsRemaining: true,
          ),
        );
        rethrow;
      }
    } finally {
      isAnalyzingQuality = false;
      _captureInProgress = false;
      if (capturedNewPhoto) {
        _setFlowState(
          flowState.copyWith(
            stage: CaptureFlowStage.review,
            clearSecondsRemaining: true,
            clearError: true,
          ),
        );
      } else {
        notifyListeners();
      }
    }
  }

  Future<void> retake() async {
    _cancelCountdownTimer();
    _captureRunId++;
    final previous = capture;
    capture = null;
    acceptedCapture = null;
    qualityResult = null;
    isAnalyzingQuality = false;
    _setFlowState(
      flowState.copyWith(
        stage: CaptureFlowStage.preview,
        clearSecondsRemaining: true,
        clearError: true,
      ),
    );
    await captureStore.deleteCapture(previous?.originalPath);
  }

  bool usePhoto() {
    final current = capture;
    final quality = qualityResult;
    if (current == null || quality == null || quality.isBlocked) {
      return false;
    }
    acceptedCapture = current;
    _setFlowState(
      flowState.copyWith(
        stage: CaptureFlowStage.photoReady,
        clearSecondsRemaining: true,
        clearError: true,
      ),
    );
    return true;
  }

  Future<void> resetSession() async {
    _cancelCountdownTimer();
    _captureRunId++;
    capture = null;
    acceptedCapture = null;
    qualityResult = null;
    isAnalyzingQuality = false;
    _setFlowState(
      flowState.copyWith(
        stage: CaptureFlowStage.preview,
        clearSecondsRemaining: true,
        clearError: true,
      ),
    );
    await captureStore.clearAll();
  }

  void _tickCountdown(int runId) {
    if (!_isActiveRun(runId) || flowState.stage != CaptureFlowStage.countdown) {
      _cancelCountdownTimer();
      return;
    }

    final next = (flowState.secondsRemaining ?? 1) - 1;
    if (next <= 0) {
      _cancelCountdownTimer();
      _finishCountdown(runId);
      return;
    }
    _setCountdownState(runId, next);
  }

  void _finishCountdown(int runId) {
    if (!_isActiveRun(runId)) {
      return;
    }
    unawaited(_captureAndAnalyze(runId: runId));
  }

  void _setCountdownState(int runId, int secondsRemaining) {
    if (!_isActiveRun(runId)) {
      return;
    }
    if (secondsRemaining <= 3) {
      _playAudioIfEnabled(
        () => audioService.playFinalCountdownTick(
          _currentAudioProfile,
          secondsRemaining,
        ),
      );
    }
    _setFlowState(
      CaptureFlowState(
        stage: CaptureFlowStage.countdown,
        countdownSeconds: captureCountdownSeconds,
        secondsRemaining: secondsRemaining,
        guidance: scriptedCaptureGuidance(
          secondsRemaining: secondsRemaining,
          countdownSeconds: captureCountdownSeconds,
        ),
      ),
    );
  }

  void _playAudioIfEnabled(Future<void> Function() play) {
    if (!_currentCountdownSoundsEnabled) {
      return;
    }
    unawaited(_ignoreAudioFailure(play));
  }

  Future<void> _ignoreAudioFailure(Future<void> Function() play) async {
    try {
      await play();
    } catch (_) {
      // Capture audio is a convenience cue only; capture continues silently.
    }
  }

  void _cancelCountdownTimer() {
    _countdownTimer?.cancel();
    _countdownTimer = null;
  }

  bool _isActiveRun(int runId) => !_disposed && _captureRunId == runId;

  void _setFlowState(CaptureFlowState state) {
    if (_disposed) {
      return;
    }
    flowState = state;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _cancelCountdownTimer();
    analyzer.dispose();
    cameraService.dispose();
    unawaited(audioService.dispose());
    super.dispose();
  }
}
