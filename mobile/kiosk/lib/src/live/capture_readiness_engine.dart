import 'dart:math' as math;

import '../session/capture_scope.dart';
import 'live_frame.dart';
import 'person_analysis.dart';

enum CaptureReadinessStatus {
  searching,
  adjust,
  readyCandidate,
  ready,
  degraded,
  timedOut,
}

enum CaptureGuidanceCode {
  stepIntoPosition,
  moveBack,
  moveCloser,
  centerYourself,
  moreLightNeeded,
  moveAwayFromBrightBackground,
  holdStill,
  almostReady,
  ready,
  liveAnalysisUnavailable,
  troubleFraming,
}

enum PrimarySubjectReadinessState {
  none,
  locked,
  absent,
  liveAnalysisUnavailable,
}

class CaptureReadinessConfig {
  const CaptureReadinessConfig({
    this.requiredStableFrames = 3,
    this.readinessTimeout = const Duration(seconds: 25),
    this.maxInvalidFramesDuringCountdown = 2,
  });

  final int requiredStableFrames;
  final Duration readinessTimeout;
  final int maxInvalidFramesDuringCountdown;
}

class CaptureReadinessResult {
  const CaptureReadinessResult({
    required this.status,
    required this.guidanceCode,
    required this.guidanceMessage,
    required this.bodyCoverage,
    required this.subjectState,
    required this.lightingState,
    required this.sharpnessState,
    required this.stableReadyFrames,
    required this.canCaptureAnyway,
    required this.isReadyForFinalCountdown,
    this.primarySubject,
    this.targetSubjectRegion,
    this.warningCodes = const [],
  });

  final CaptureReadinessStatus status;
  final CaptureGuidanceCode guidanceCode;
  final String guidanceMessage;
  final BodyCoverage bodyCoverage;
  final PrimarySubjectReadinessState subjectState;
  final SubjectLightingState lightingState;
  final SharpnessState sharpnessState;
  final int stableReadyFrames;
  final bool canCaptureAnyway;
  final bool isReadyForFinalCountdown;
  final PrimarySubject? primarySubject;
  final TargetSubjectRegion? targetSubjectRegion;
  final List<String> warningCodes;
}

class CaptureReadinessEngine {
  CaptureReadinessEngine({
    required this.scope,
    this.config = const CaptureReadinessConfig(),
    DateTime Function()? clock,
  }) : _clock = clock ?? DateTime.now;

  final CaptureScope scope;
  final CaptureReadinessConfig config;
  final DateTime Function() _clock;

  DateTime? _startedAt;
  int _stableReadyFrames = 0;
  int _invalidDuringCountdown = 0;
  CaptureReadinessResult _last = _initialResult();

  CaptureReadinessResult get lastResult => _last;

  void start() {
    _startedAt = _clock();
    _stableReadyFrames = 0;
    _invalidDuringCountdown = 0;
    _last = _initialResult();
  }

  CaptureReadinessResult update(SemanticFrameAnalysis analysis) {
    _startedAt ??= _clock();
    final primarySubject = analysis.primarySubject;
    final primary = primarySubject?.sourceObservation;
    final frameDimensions = analysis.frameDimensions;
    final subjectState = _subjectStateFor(analysis);
    final coverage = primarySubject?.bodyCoverage ?? BodyCoverage.insufficient;
    final baseGuidance = _guidanceFor(
      poseAvailable: analysis.pose.available,
      primarySubject: primarySubject,
      primary: primary,
      coverage: coverage,
      lighting: analysis.quality.lightingState,
      sharpness: analysis.quality.sharpnessState,
      frame: frameDimensions,
    );
    final readyCandidate =
        analysis.pose.available &&
        primarySubject?.isCurrentlyObserved == true &&
        primarySubject?.isUsableForScope == true &&
        analysis.quality.lightingState != SubjectLightingState.dim &&
        analysis.quality.sharpnessState != SharpnessState.blurry &&
        baseGuidance == CaptureGuidanceCode.almostReady;

    if (readyCandidate) {
      _stableReadyFrames++;
    } else {
      _stableReadyFrames = 0;
    }

    final timedOut = _hasTimedOut();
    final ready = _stableReadyFrames >= config.requiredStableFrames;
    _last = CaptureReadinessResult(
      status: timedOut
          ? CaptureReadinessStatus.timedOut
          : ready
          ? CaptureReadinessStatus.ready
          : readyCandidate
          ? CaptureReadinessStatus.readyCandidate
          : analysis.pose.available
          ? CaptureReadinessStatus.adjust
          : CaptureReadinessStatus.degraded,
      guidanceCode: timedOut
          ? CaptureGuidanceCode.troubleFraming
          : ready
          ? CaptureGuidanceCode.ready
          : baseGuidance,
      guidanceMessage: _messageFor(
        timedOut
            ? CaptureGuidanceCode.troubleFraming
            : ready
            ? CaptureGuidanceCode.ready
            : baseGuidance,
      ),
      bodyCoverage: coverage,
      subjectState: subjectState,
      lightingState: analysis.quality.lightingState,
      sharpnessState: analysis.quality.sharpnessState,
      stableReadyFrames: _stableReadyFrames,
      canCaptureAnyway: timedOut,
      isReadyForFinalCountdown: ready,
      primarySubject: primarySubject,
      targetSubjectRegion: primarySubject?.targetRegion,
      warningCodes: _warningCodes(analysis),
    );
    return _last;
  }

  bool shouldCancelFinalCountdown(CaptureReadinessResult result) {
    final invalid =
        result.subjectState == PrimarySubjectReadinessState.none ||
        result.subjectState == PrimarySubjectReadinessState.absent ||
        result.bodyCoverage == BodyCoverage.insufficient;
    if (invalid) {
      _invalidDuringCountdown++;
    } else {
      _invalidDuringCountdown = 0;
    }
    return _invalidDuringCountdown > config.maxInvalidFramesDuringCountdown;
  }

  CaptureReadinessResult markLiveAnalysisUnavailable() {
    _startedAt ??= _clock();
    _last = CaptureReadinessResult(
      status: CaptureReadinessStatus.degraded,
      guidanceCode: CaptureGuidanceCode.liveAnalysisUnavailable,
      guidanceMessage: _messageFor(CaptureGuidanceCode.liveAnalysisUnavailable),
      bodyCoverage: BodyCoverage.unknown,
      subjectState: PrimarySubjectReadinessState.liveAnalysisUnavailable,
      lightingState: SubjectLightingState.unknown,
      sharpnessState: SharpnessState.unknown,
      stableReadyFrames: 0,
      canCaptureAnyway: _hasTimedOut(),
      isReadyForFinalCountdown: false,
      warningCodes: const ['LIVE_ANALYSIS_UNAVAILABLE'],
    );
    return _last;
  }

  static CaptureReadinessResult _initialResult() {
    return const CaptureReadinessResult(
      status: CaptureReadinessStatus.searching,
      guidanceCode: CaptureGuidanceCode.stepIntoPosition,
      guidanceMessage: 'Step into position',
      bodyCoverage: BodyCoverage.unknown,
      subjectState: PrimarySubjectReadinessState.none,
      lightingState: SubjectLightingState.unknown,
      sharpnessState: SharpnessState.unknown,
      stableReadyFrames: 0,
      canCaptureAnyway: false,
      isReadyForFinalCountdown: false,
    );
  }

  bool _hasTimedOut() {
    final startedAt = _startedAt;
    return startedAt != null &&
        _clock().difference(startedAt) >= config.readinessTimeout;
  }

  CaptureGuidanceCode _guidanceFor({
    required bool poseAvailable,
    required PrimarySubject? primarySubject,
    required PersonObservation? primary,
    required BodyCoverage coverage,
    required SubjectLightingState lighting,
    required SharpnessState sharpness,
    required FrameDimensions frame,
  }) {
    if (!poseAvailable) {
      return CaptureGuidanceCode.liveAnalysisUnavailable;
    }
    if (primary == null) {
      return CaptureGuidanceCode.stepIntoPosition;
    }
    if (primarySubject?.isCurrentlyObserved != true) {
      return CaptureGuidanceCode.stepIntoPosition;
    }
    if (lighting == SubjectLightingState.dim) {
      return CaptureGuidanceCode.moreLightNeeded;
    }
    if (lighting == SubjectLightingState.backlit) {
      return CaptureGuidanceCode.moveAwayFromBrightBackground;
    }
    if (sharpness == SharpnessState.blurry) {
      return CaptureGuidanceCode.holdStill;
    }
    final occupancy = primary.area / math.max(1, frame.width * frame.height);
    if (occupancy > 0.72) {
      return CaptureGuidanceCode.moveBack;
    }
    if (occupancy < 0.10) {
      return CaptureGuidanceCode.moveCloser;
    }
    final centerOffset =
        (primary.center.dx - frame.width / 2).abs() / math.max(1, frame.width);
    if (centerOffset > 0.18) {
      return CaptureGuidanceCode.centerYourself;
    }
    if (!isCoverageReadyForScope(scope, coverage)) {
      return scope == CaptureScope.top
          ? CaptureGuidanceCode.moveCloser
          : CaptureGuidanceCode.moveBack;
    }
    return CaptureGuidanceCode.almostReady;
  }

  String _messageFor(CaptureGuidanceCode code) {
    return switch (code) {
      CaptureGuidanceCode.stepIntoPosition => 'Step into position',
      CaptureGuidanceCode.moveBack => 'Move back slightly',
      CaptureGuidanceCode.moveCloser => 'Move closer',
      CaptureGuidanceCode.centerYourself => 'Center yourself',
      CaptureGuidanceCode.moreLightNeeded => 'More light is needed',
      CaptureGuidanceCode.moveAwayFromBrightBackground =>
        'Move away from the bright background',
      CaptureGuidanceCode.holdStill => 'Hold still',
      CaptureGuidanceCode.almostReady => 'Almost ready',
      CaptureGuidanceCode.ready => 'Ready',
      CaptureGuidanceCode.liveAnalysisUnavailable =>
        'Follow the framing guide and hold still',
      CaptureGuidanceCode.troubleFraming =>
        "We're having trouble getting the perfect framing.",
    };
  }

  List<String> _warningCodes(SemanticFrameAnalysis analysis) {
    final warnings = <String>[];
    if (!analysis.pose.available) {
      warnings.add(analysis.pose.failureCode ?? 'POSE_ANALYSIS_UNAVAILABLE');
    }
    if (!analysis.quality.available) {
      warnings.add(
        analysis.quality.failureCode ?? 'LIVE_QUALITY_ANALYSIS_UNAVAILABLE',
      );
    }
    return warnings;
  }

  PrimarySubjectReadinessState _subjectStateFor(SemanticFrameAnalysis analysis) {
    if (!analysis.pose.available) {
      return PrimarySubjectReadinessState.liveAnalysisUnavailable;
    }
    final subject = analysis.primarySubject;
    if (subject == null) {
      return PrimarySubjectReadinessState.none;
    }
    return subject.isCurrentlyObserved
        ? PrimarySubjectReadinessState.locked
        : PrimarySubjectReadinessState.absent;
  }
}
