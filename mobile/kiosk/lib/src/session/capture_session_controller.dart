import 'dart:async';

import 'package:flutter/foundation.dart';

import '../camera/camera_models.dart';
import '../camera/camera_service.dart';
import '../live/capture_readiness_engine.dart';
import '../live/frame_analysis_scheduler.dart';
import '../live/live_frame.dart';
import '../live/person_analysis.dart';
import '../quality/image_quality.dart';
import '../settings/camera_settings_store.dart';
import 'capture_audio_service.dart';
import 'capture_flow.dart';
import 'capture_scope.dart';
import 'temporary_capture_store.dart';

class CaptureSessionController extends ChangeNotifier {
  CaptureSessionController({
    required this.cameraService,
    required this.settingsStore,
    required this.analyzer,
    required this.captureStore,
    CaptureAudioService? audioService,
    LiveFrameAnalyzer? liveFrameAnalyzer,
    this.readinessConfig = const CaptureReadinessConfig(),
    this.schedulerConfig = const FrameAnalysisSchedulerConfig(),
    Duration? countdownTickDuration,
  }) : audioService = audioService ?? AssetCaptureAudioService(),
       liveFrameAnalyzer =
           liveFrameAnalyzer ??
           LiveFrameAnalyzer(
             poseAnalyzer: const UnavailablePersonPoseAnalyzer(),
             qualityAnalyzer: const LuminanceLiveImageQualityAnalyzer(),
           ),
       countdownTickDuration =
           countdownTickDuration ?? const Duration(seconds: 1);

  final CameraService cameraService;
  final CameraSettingsStore settingsStore;
  final KioskImageQualityAnalyzer analyzer;
  final TemporaryCaptureStore captureStore;
  final CaptureAudioService audioService;
  final LiveFrameAnalyzer liveFrameAnalyzer;
  final CaptureReadinessConfig readinessConfig;
  final FrameAnalysisSchedulerConfig schedulerConfig;
  final Duration countdownTickDuration;

  CameraCaptureResult? capture;
  CameraCaptureResult? acceptedCapture;
  CustomerPersonImage? acceptedPersonImage;
  ImageQualityResult? qualityResult;
  CaptureReadinessResult? readinessResult;
  FrameAnalysisDiagnostics? analysisDiagnostics;
  PrimarySubject? primarySubject;
  CaptureTargetMetadata? captureTargetMetadata;
  CaptureTargetMetadata? acceptedCaptureTargetMetadata;
  Duration? poseAnalyzerLatency;
  Duration? imageQualityAnalyzerLatency;
  bool isAnalyzingQuality = false;
  String? preferredCameraId;
  CaptureScope captureScope = defaultCaptureScope;
  int captureCountdownSeconds = defaultCaptureCountdownSeconds;
  bool captureSoundsEnabled = true;
  CaptureAudioProfile captureAudioProfile = defaultCaptureAudioProfile;
  CaptureFlowState flowState = const CaptureFlowState();

  Timer? _countdownTimer;
  Timer? _readinessTimeoutTimer;
  VoidCallback? _diagnosticsListener;
  StreamSubscription<LiveCameraFrame>? _liveFrameSubscription;
  FrameAnalysisScheduler? _frameScheduler;
  CaptureReadinessEngine? _readinessEngine;
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

  void selectCaptureScope(CaptureScope scope) {
    captureScope = scope;
    liveFrameAnalyzer.resetSubjectLock();
    primarySubject = null;
    readinessResult = null;
    captureTargetMetadata = null;
    acceptedCaptureTargetMetadata = null;
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

    final runId = ++_captureRunId;
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

    if (cameraService.state.value.capabilities.supportsLiveFrames) {
      await _beginLiveReadinessCapture(runId);
      return;
    }

    _beginScriptedCountdown(runId, seconds);
  }

  Future<void> cancelCountdown() async {
    if (flowState.stage != CaptureFlowStage.countdown &&
        flowState.stage != CaptureFlowStage.preparing) {
      return;
    }
    await _stopLiveReadiness();
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

  Future<void> captureAnyway() async {
    if (!_captureInProgress &&
        cameraService.state.value.canCapture &&
        (readinessResult?.canCaptureAnyway ?? false)) {
      final runId = ++_captureRunId;
      await _stopLiveReadiness();
      await _captureAndAnalyze(runId: runId);
    }
  }

  Future<void> _captureAndAnalyze({int? runId}) async {
    if (_captureInProgress || (runId != null && !_isActiveRun(runId))) {
      return;
    }
    _captureInProgress = true;
    final targetMetadata = _currentCaptureTargetMetadata();
    await _stopLiveReadiness();
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
      acceptedPersonImage = null;
      captureTargetMetadata = targetMetadata;
      acceptedCaptureTargetMetadata = null;
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
    await _stopLiveReadiness();
    _cancelCountdownTimer();
    _captureRunId++;
    final previous = capture;
    capture = null;
    acceptedCapture = null;
    acceptedPersonImage = null;
    captureTargetMetadata = null;
    acceptedCaptureTargetMetadata = null;
    primarySubject = null;
    liveFrameAnalyzer.resetSubjectLock();
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
    acceptedPersonImage = CustomerPersonImage(
      originalPath: current.originalPath,
      source: CustomerPersonImageSource.kioskCamera,
      captureScope: captureScope,
      createdAt: current.createdAt,
    );
    acceptedCaptureTargetMetadata = captureTargetMetadata;
    _setFlowState(
      flowState.copyWith(
        stage: CaptureFlowStage.photoReady,
        clearSecondsRemaining: true,
        clearError: true,
      ),
    );
    return true;
  }

  void acceptMobileUpload({
    required String originalPath,
    required int width,
    required int height,
  }) {
    final result = CameraCaptureResult(
      originalPath: originalPath,
      createdAt: DateTime.now(),
      deviceId: 'mobile-upload',
      isTemporary: true,
    );
    capture = result;
    acceptedCapture = result;
    captureTargetMetadata = null;
    acceptedCaptureTargetMetadata = null;
    qualityResult = ImageQualityResult(
      status: ImageQualityStatus.pass,
      passed: true,
      score: 100,
      metrics: ImageQualityMetrics(
        width: width,
        height: height,
        sharpness: null,
        brightness: null,
        contrast: null,
      ),
      issues: const [],
    );
    acceptedPersonImage = CustomerPersonImage(
      originalPath: originalPath,
      source: CustomerPersonImageSource.mobileUpload,
      captureScope: captureScope,
      createdAt: result.createdAt,
    );
    _setFlowState(
      flowState.copyWith(
        stage: CaptureFlowStage.photoReady,
        clearSecondsRemaining: true,
        clearError: true,
      ),
    );
  }

  Future<void> resetSession() async {
    await _stopLiveReadiness();
    _cancelCountdownTimer();
    _captureRunId++;
    capture = null;
    acceptedCapture = null;
    acceptedPersonImage = null;
    captureTargetMetadata = null;
    acceptedCaptureTargetMetadata = null;
    primarySubject = null;
    liveFrameAnalyzer.resetSubjectLock();
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

  Future<void> _beginLiveReadinessCapture(int runId) async {
    _cancelCountdownTimer();
    await _stopLiveReadiness();
    _readinessEngine = CaptureReadinessEngine(
      scope: captureScope,
      config: readinessConfig,
    )..start();
    liveFrameAnalyzer.resetSubjectLock();
    primarySubject = null;
    captureTargetMetadata = null;
    acceptedCaptureTargetMetadata = null;
    readinessResult = _readinessEngine?.lastResult;
    _setFlowState(
      CaptureFlowState(
        stage: CaptureFlowStage.preparing,
        countdownSeconds: captureCountdownSeconds,
        guidance: CaptureGuidance(
          message: captureScope.guidance,
          emphasizeNumber: false,
        ),
      ),
    );

    _frameScheduler = FrameAnalysisScheduler(
      config: schedulerConfig,
      analyze: (frame) => _analyzeLiveFrame(runId, frame),
    );
    _diagnosticsListener = () {
      final scheduler = _frameScheduler;
      if (scheduler == null) {
        return;
      }
      analysisDiagnostics = scheduler.diagnostics.value;
      notifyListeners();
    };
    _frameScheduler!.diagnostics.addListener(_diagnosticsListener!);

    try {
      await cameraService.startLiveFrames();
      _liveFrameSubscription = cameraService.liveFrames.listen(
        (frame) => _frameScheduler?.submit(frame),
        onError: (_) {
          if (_isActiveRun(runId)) {
            _degradeLiveReadiness();
          }
        },
      );
      _readinessTimeoutTimer = Timer(readinessConfig.readinessTimeout, () {
        if (_isActiveRun(runId) &&
            flowState.stage == CaptureFlowStage.preparing) {
          readinessResult = _readinessEngine?.markLiveAnalysisUnavailable();
          _setFlowState(
            flowState.copyWith(
              guidance: const CaptureGuidance(
                message: "We're having trouble getting the perfect framing.",
                emphasizeNumber: false,
              ),
              clearError: true,
            ),
          );
        }
      });
    } catch (_) {
      _degradeLiveReadiness();
      _beginScriptedCountdown(runId, captureCountdownSeconds);
    }
  }

  void _beginScriptedCountdown(int runId, int seconds) {
    _cancelCountdownTimer();
    readinessResult = null;
    _setCountdownState(runId, seconds);
    _countdownTimer = Timer.periodic(countdownTickDuration, (_) {
      _tickCountdown(runId);
    });
  }

  Future<void> _analyzeLiveFrame(int runId, LiveCameraFrame frame) async {
    if (!_isActiveRun(runId) ||
        (flowState.stage != CaptureFlowStage.preparing &&
            flowState.stage != CaptureFlowStage.countdown)) {
      return;
    }
    final analysis = await liveFrameAnalyzer.analyze(
      frame,
      captureScope,
      allowSubjectReselection: flowState.stage != CaptureFlowStage.countdown,
    );
    poseAnalyzerLatency = analysis.poseLatency;
    imageQualityAnalyzerLatency = analysis.qualityLatency;
    final result = _readinessEngine?.update(analysis);
    if (result == null || !_isActiveRun(runId)) {
      return;
    }
    readinessResult = result;
    primarySubject = result.primarySubject;
    if (flowState.stage == CaptureFlowStage.countdown &&
        _readinessEngine!.shouldCancelFinalCountdown(result)) {
      _cancelCountdownTimer();
      _setFlowState(
        CaptureFlowState(
          stage: CaptureFlowStage.preparing,
          countdownSeconds: captureCountdownSeconds,
          guidance: CaptureGuidance(
            message: result.guidanceMessage,
            emphasizeNumber: false,
          ),
        ),
      );
      notifyListeners();
      return;
    }
    if (flowState.stage == CaptureFlowStage.preparing) {
      _setFlowState(
        flowState.copyWith(
          guidance: CaptureGuidance(
            message: result.guidanceMessage,
            emphasizeNumber:
                result.status == CaptureReadinessStatus.readyCandidate ||
                result.status == CaptureReadinessStatus.ready,
          ),
          clearError: true,
        ),
      );
      if (result.isReadyForFinalCountdown) {
        _beginScriptedCountdown(runId, 3);
      }
    } else {
      notifyListeners();
    }
  }

  void _degradeLiveReadiness() {
    readinessResult = _readinessEngine?.markLiveAnalysisUnavailable();
    primarySubject = null;
    notifyListeners();
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

  Future<void> _stopLiveReadiness() async {
    _readinessTimeoutTimer?.cancel();
    _readinessTimeoutTimer = null;
    await _liveFrameSubscription?.cancel();
    _liveFrameSubscription = null;
    final diagnosticsListener = _diagnosticsListener;
    final frameScheduler = _frameScheduler;
    if (diagnosticsListener != null && frameScheduler != null) {
      frameScheduler.diagnostics.removeListener(diagnosticsListener);
    }
    _diagnosticsListener = null;
    _frameScheduler?.dispose();
    _frameScheduler = null;
    try {
      await cameraService.stopLiveFrames();
    } catch (_) {
      // Live analysis degradation must never invalidate still capture.
    }
  }

  CaptureTargetMetadata? _currentCaptureTargetMetadata() {
    final subject = primarySubject;
    if (subject == null || !subject.isCurrentlyObserved) {
      return null;
    }
    return CaptureTargetMetadata(
      scope: captureScope,
      targetRegion: subject.targetRegion,
      lockState: subject.lockState,
      visualProminenceScore: subject.visualProminenceScore,
      observedFrameCount: subject.observedFrameCount,
      analyzerDisplayName: subject.analyzerCapabilities.displayName,
      supportsMultiplePeople:
          subject.analyzerCapabilities.supportsMultiplePeople,
      capturedAt: DateTime.now(),
    );
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
    unawaited(_stopLiveReadiness());
    analyzer.dispose();
    cameraService.dispose();
    unawaited(liveFrameAnalyzer.dispose());
    unawaited(audioService.dispose());
    super.dispose();
  }
}

enum CustomerPersonImageSource { kioskCamera, mobileUpload }

@immutable
class CustomerPersonImage {
  const CustomerPersonImage({
    required this.originalPath,
    required this.source,
    required this.captureScope,
    required this.createdAt,
  });

  final String originalPath;
  final CustomerPersonImageSource source;
  final CaptureScope captureScope;
  final DateTime createdAt;
}

@immutable
class CaptureTargetMetadata {
  const CaptureTargetMetadata({
    required this.scope,
    required this.targetRegion,
    required this.lockState,
    required this.visualProminenceScore,
    required this.observedFrameCount,
    required this.analyzerDisplayName,
    required this.supportsMultiplePeople,
    required this.capturedAt,
  });

  final CaptureScope scope;
  final TargetSubjectRegion targetRegion;
  final PrimarySubjectLockState lockState;
  final double visualProminenceScore;
  final int observedFrameCount;
  final String analyzerDisplayName;
  final bool supportsMultiplePeople;
  final DateTime capturedAt;
}
