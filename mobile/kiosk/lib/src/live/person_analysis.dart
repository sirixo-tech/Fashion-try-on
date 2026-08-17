import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';

import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart'
    as mlkit;

import '../session/capture_scope.dart';
import 'live_frame.dart';

enum BodyCoverage {
  unknown,
  topReady,
  bottomReady,
  fullBodyReady,
  insufficient,
}

enum SubjectLightingState { unknown, good, dim, backlit }

enum SharpnessState { unknown, good, blurry }

enum PoseAnalyzerPersonMode { singleProminentPerson, multiplePeople }

enum PrimarySubjectLockState { unlocked, locked, absent }

class PoseAnalyzerCapabilities {
  const PoseAnalyzerCapabilities({
    required this.displayName,
    required this.personMode,
    required this.requiresFaceVisible,
  });

  const PoseAnalyzerCapabilities.mlKitSinglePrimary()
    : displayName = 'ML Kit Pose / single-primary',
      personMode = PoseAnalyzerPersonMode.singleProminentPerson,
      requiresFaceVisible = true;

  const PoseAnalyzerCapabilities.unavailable()
    : displayName = 'Unavailable',
      personMode = PoseAnalyzerPersonMode.singleProminentPerson,
      requiresFaceVisible = false;

  final String displayName;
  final PoseAnalyzerPersonMode personMode;
  final bool requiresFaceVisible;

  bool get supportsMultiplePeople =>
      personMode == PoseAnalyzerPersonMode.multiplePeople;
}

class LandmarkObservation {
  const LandmarkObservation({
    required this.name,
    required this.position,
    required this.confidence,
  });

  final String name;
  final Offset position;
  final double confidence;
}

class PersonObservation {
  const PersonObservation({
    required this.bounds,
    required this.landmarks,
    required this.averageConfidence,
  });

  final Rect bounds;
  final Map<String, LandmarkObservation> landmarks;
  final double averageConfidence;

  double get area => bounds.width * bounds.height;
  Offset get center => bounds.center;
}

class PoseAnalysisResult {
  const PoseAnalysisResult({
    required this.available,
    required this.people,
    this.capabilities = const PoseAnalyzerCapabilities.mlKitSinglePrimary(),
    this.failureCode,
  });

  factory PoseAnalysisResult.unavailable(String failureCode) {
    return PoseAnalysisResult(
      available: false,
      people: const [],
      capabilities: const PoseAnalyzerCapabilities.unavailable(),
      failureCode: failureCode,
    );
  }

  final bool available;
  final List<PersonObservation> people;
  final PoseAnalyzerCapabilities capabilities;
  final String? failureCode;
}

class LiveImageQualityResult {
  const LiveImageQualityResult({
    required this.available,
    required this.lightingState,
    required this.sharpnessState,
    required this.subjectBrightness,
    required this.backgroundBrightness,
    this.failureCode,
  });

  factory LiveImageQualityResult.unavailable(String failureCode) {
    return LiveImageQualityResult(
      available: false,
      lightingState: SubjectLightingState.unknown,
      sharpnessState: SharpnessState.unknown,
      subjectBrightness: null,
      backgroundBrightness: null,
      failureCode: failureCode,
    );
  }

  final bool available;
  final SubjectLightingState lightingState;
  final SharpnessState sharpnessState;
  final double? subjectBrightness;
  final double? backgroundBrightness;
  final String? failureCode;
}

class SemanticFrameAnalysis {
  const SemanticFrameAnalysis({
    required this.scope,
    required this.frameDimensions,
    required this.pose,
    required this.primarySubject,
    required this.quality,
    required this.analyzedAt,
    required this.poseLatency,
    required this.qualityLatency,
  });

  final CaptureScope scope;
  final FrameDimensions frameDimensions;
  final PoseAnalysisResult pose;
  final PrimarySubject? primarySubject;
  final LiveImageQualityResult quality;
  final DateTime analyzedAt;
  final Duration poseLatency;
  final Duration qualityLatency;
}

abstract class PersonPoseAnalyzer {
  Future<PoseAnalysisResult> analyze(LiveCameraFrame frame);

  Future<void> dispose();
}

abstract class LiveImageQualityAnalyzer {
  Future<LiveImageQualityResult> analyze(
    LiveCameraFrame frame, {
    TargetSubjectRegion? targetRegion,
  });

  Future<void> dispose();
}

class UnavailablePersonPoseAnalyzer implements PersonPoseAnalyzer {
  const UnavailablePersonPoseAnalyzer([this.reason = 'POSE_UNAVAILABLE']);

  final String reason;

  @override
  Future<PoseAnalysisResult> analyze(LiveCameraFrame frame) async {
    return PoseAnalysisResult.unavailable(reason);
  }

  @override
  Future<void> dispose() async {}
}

class MlKitPersonPoseAnalyzer implements PersonPoseAnalyzer {
  MlKitPersonPoseAnalyzer({mlkit.PoseDetector? detector})
    : _detector =
          detector ??
          mlkit.PoseDetector(
            options: mlkit.PoseDetectorOptions(
              model: mlkit.PoseDetectionModel.base,
              mode: mlkit.PoseDetectionMode.stream,
            ),
          );

  final mlkit.PoseDetector _detector;

  @override
  Future<PoseAnalysisResult> analyze(LiveCameraFrame frame) async {
    try {
      final input = _toInputImage(frame);
      if (input == null) {
        return PoseAnalysisResult.unavailable('POSE_FRAME_FORMAT_UNSUPPORTED');
      }
      final poses = await _detector.processImage(input);
      final selectedPose = poses.isEmpty ? null : poses.first;
      return PoseAnalysisResult(
        available: true,
        people: selectedPose == null ? const [] : [_toObservation(selectedPose)],
        capabilities: const PoseAnalyzerCapabilities.mlKitSinglePrimary(),
      );
    } catch (_) {
      return PoseAnalysisResult.unavailable('POSE_ANALYSIS_UNAVAILABLE');
    }
  }

  @override
  Future<void> dispose() {
    return _detector.close();
  }

  mlkit.InputImage? _toInputImage(LiveCameraFrame frame) {
    final format = switch (frame.format) {
      FramePixelFormat.nv21 => mlkit.InputImageFormat.nv21,
      FramePixelFormat.yuv420 => mlkit.InputImageFormat.yuv_420_888,
      FramePixelFormat.bgra8888 => mlkit.InputImageFormat.bgra8888,
      _ => null,
    };
    if (format == null || frame.planes.isEmpty) {
      return null;
    }
    final bytes = _combinedBytes(frame.planes);
    return mlkit.InputImage.fromBytes(
      bytes: bytes,
      metadata: mlkit.InputImageMetadata(
        size: Size(frame.width.toDouble(), frame.height.toDouble()),
        rotation:
            mlkit.InputImageRotationValue.fromRawValue(frame.rotationDegrees) ??
            mlkit.InputImageRotation.rotation0deg,
        format: format,
        bytesPerRow: frame.planes.first.bytesPerRow,
      ),
    );
  }

  Uint8List _combinedBytes(List<LiveFramePlane> planes) {
    if (planes.length == 1) {
      return planes.single.bytes;
    }
    final builder = BytesBuilder(copy: false);
    for (final plane in planes) {
      builder.add(plane.bytes);
    }
    return builder.takeBytes();
  }

  PersonObservation _toObservation(mlkit.Pose pose) {
    final landmarks = <String, LandmarkObservation>{};
    var minX = double.infinity;
    var minY = double.infinity;
    var maxX = 0.0;
    var maxY = 0.0;
    var confidenceSum = 0.0;
    var count = 0;

    for (final entry in pose.landmarks.entries) {
      final landmark = entry.value;
      final confidence = landmark.likelihood.clamp(0, 1).toDouble();
      if (confidence < 0.25) {
        continue;
      }
      final name = entry.key.name;
      final position = Offset(landmark.x, landmark.y);
      landmarks[name] = LandmarkObservation(
        name: name,
        position: position,
        confidence: confidence,
      );
      minX = math.min(minX, position.dx);
      minY = math.min(minY, position.dy);
      maxX = math.max(maxX, position.dx);
      maxY = math.max(maxY, position.dy);
      confidenceSum += confidence;
      count++;
    }

    final bounds = count == 0
        ? Rect.zero
        : Rect.fromLTRB(minX, minY, maxX, maxY);
    return PersonObservation(
      bounds: bounds,
      landmarks: landmarks,
      averageConfidence: count == 0 ? 0 : confidenceSum / count,
    );
  }
}

class LuminanceLiveImageQualityAnalyzer implements LiveImageQualityAnalyzer {
  const LuminanceLiveImageQualityAnalyzer();

  @override
  Future<LiveImageQualityResult> analyze(
    LiveCameraFrame frame, {
    TargetSubjectRegion? targetRegion,
  }) async {
    try {
      if (frame.planes.isEmpty) {
        return LiveImageQualityResult.unavailable('LIVE_QUALITY_NO_PLANE');
      }
      final plane = frame.planes.first;
      final sourceTargetRegion = targetRegion?.rotated(
        -frame.rotationDegrees,
      );
      final subjectBrightness = _meanBrightness(
        frame,
        plane,
        roi: sourceTargetRegion?.toRect(frame.dimensions),
      );
      final backgroundBrightness = _meanBrightness(frame, plane);
      final lighting = _lightingState(subjectBrightness, backgroundBrightness);
      final sharpness = _sharpnessState(frame, plane);
      return LiveImageQualityResult(
        available: true,
        lightingState: lighting,
        sharpnessState: sharpness,
        subjectBrightness: subjectBrightness,
        backgroundBrightness: backgroundBrightness,
      );
    } catch (_) {
      return LiveImageQualityResult.unavailable('LIVE_QUALITY_UNAVAILABLE');
    }
  }

  @override
  Future<void> dispose() async {}

  double _meanBrightness(
    LiveCameraFrame frame,
    LiveFramePlane plane, {
    Rect? roi,
  }) {
    final bounds =
        roi ??
        Rect.fromLTWH(0, 0, frame.width.toDouble(), frame.height.toDouble());
    final left = bounds.left.clamp(0, frame.width - 1).round();
    final top = bounds.top.clamp(0, frame.height - 1).round();
    final right = bounds.right.clamp(left + 1, frame.width).round();
    final bottom = bounds.bottom.clamp(top + 1, frame.height).round();
    var total = 0;
    var count = 0;
    final stepX = math.max(1, ((right - left) / 48).ceil());
    final stepY = math.max(1, ((bottom - top) / 64).ceil());
    for (var y = top; y < bottom; y += stepY) {
      final row = y * plane.bytesPerRow;
      for (var x = left; x < right; x += stepX) {
        final index = row + x;
        if (index >= 0 && index < plane.bytes.length) {
          total += plane.bytes[index];
          count++;
        }
      }
    }
    return count == 0 ? 0 : total / count;
  }

  SubjectLightingState _lightingState(double subject, double background) {
    if (subject < 55) {
      return SubjectLightingState.dim;
    }
    if (background - subject > 70 && subject < 95) {
      return SubjectLightingState.backlit;
    }
    return SubjectLightingState.good;
  }

  SharpnessState _sharpnessState(LiveCameraFrame frame, LiveFramePlane plane) {
    var diffTotal = 0;
    var count = 0;
    final step = math.max(1, (frame.width / 64).ceil());
    for (var y = 2; y < frame.height - 2; y += step) {
      final row = y * plane.bytesPerRow;
      for (var x = 2; x < frame.width - 2; x += step) {
        final index = row + x;
        final right = index + 1;
        final down = index + plane.bytesPerRow;
        if (down < plane.bytes.length && right < plane.bytes.length) {
          diffTotal +=
              (plane.bytes[index] - plane.bytes[right]).abs() +
              (plane.bytes[index] - plane.bytes[down]).abs();
          count += 2;
        }
      }
    }
    if (count == 0) {
      return SharpnessState.unknown;
    }
    return diffTotal / count < 3 ? SharpnessState.blurry : SharpnessState.good;
  }
}

class LiveFrameAnalyzer {
  LiveFrameAnalyzer({
    required this.poseAnalyzer,
    required this.qualityAnalyzer,
    PrimarySubjectResolver? primarySubjectResolver,
  }) : primarySubjectResolver =
           primarySubjectResolver ?? PrimarySubjectResolver();

  final PersonPoseAnalyzer poseAnalyzer;
  final LiveImageQualityAnalyzer qualityAnalyzer;
  final PrimarySubjectResolver primarySubjectResolver;

  Future<SemanticFrameAnalysis> analyze(
    LiveCameraFrame frame,
    CaptureScope scope, {
    bool allowSubjectReselection = true,
  }) async {
    final poseWatch = Stopwatch()..start();
    final pose = await poseAnalyzer.analyze(frame);
    poseWatch.stop();
    final analyzedAt = DateTime.now();
    final primarySubject = primarySubjectResolver.resolve(
      pose: pose,
      frameDimensions: frame.orientedDimensions,
      scope: scope,
      observedAt: analyzedAt,
      allowSubjectReselection: allowSubjectReselection,
    );
    final qualityWatch = Stopwatch()..start();
    final quality = await qualityAnalyzer.analyze(
      frame,
      targetRegion: primarySubject?.targetRegion,
    );
    qualityWatch.stop();
    return SemanticFrameAnalysis(
      scope: scope,
      pose: pose,
      primarySubject: primarySubject,
      quality: quality,
      analyzedAt: analyzedAt,
      frameDimensions: frame.orientedDimensions,
      poseLatency: poseWatch.elapsed,
      qualityLatency: qualityWatch.elapsed,
    );
  }

  Future<void> dispose() async {
    await poseAnalyzer.dispose();
    await qualityAnalyzer.dispose();
  }

  void resetSubjectLock() {
    primarySubjectResolver.reset();
  }
}

class TargetSubjectRegion {
  const TargetSubjectRegion({
    required this.x,
    required this.y,
    required this.width,
    required this.height,
  });

  factory TargetSubjectRegion.fromObservation({
    required PersonObservation person,
    required FrameDimensions frameDimensions,
    required CaptureScope scope,
  }) {
    final bounds = person.bounds;
    final horizontalMargin = bounds.width * 0.2;
    final topMargin = switch (scope) {
      CaptureScope.top => bounds.height * 0.28,
      CaptureScope.bottom => bounds.height * 0.75,
      CaptureScope.fullBody => bounds.height * 0.18,
    };
    final bottomMargin = switch (scope) {
      CaptureScope.top => bounds.height * 0.22,
      CaptureScope.bottom => bounds.height * 0.24,
      CaptureScope.fullBody => bounds.height * 0.16,
    };
    return TargetSubjectRegion.fromFrameRect(
      Rect.fromLTRB(
        bounds.left - horizontalMargin,
        bounds.top - topMargin,
        bounds.right + horizontalMargin,
        bounds.bottom + bottomMargin,
      ),
      frameDimensions,
    );
  }

  factory TargetSubjectRegion.fromFrameRect(
    Rect rect,
    FrameDimensions frameDimensions,
  ) {
    final frameWidth = math.max(1, frameDimensions.width).toDouble();
    final frameHeight = math.max(1, frameDimensions.height).toDouble();
    final left = rect.left.clamp(0, frameWidth).toDouble();
    final top = rect.top.clamp(0, frameHeight).toDouble();
    final right = rect.right.clamp(left, frameWidth).toDouble();
    final bottom = rect.bottom.clamp(top, frameHeight).toDouble();
    return TargetSubjectRegion(
      x: left / frameWidth,
      y: top / frameHeight,
      width: (right - left) / frameWidth,
      height: (bottom - top) / frameHeight,
    );
  }

  final double x;
  final double y;
  final double width;
  final double height;

  Rect toRect(FrameDimensions frameDimensions) {
    final frameWidth = math.max(1, frameDimensions.width).toDouble();
    final frameHeight = math.max(1, frameDimensions.height).toDouble();
    return Rect.fromLTWH(
      x * frameWidth,
      y * frameHeight,
      width * frameWidth,
      height * frameHeight,
    );
  }

  TargetSubjectRegion rotated(int degrees) {
    final normalized = _normalizeDegrees(degrees);
    final safeX = x.clamp(0, 1).toDouble();
    final safeY = y.clamp(0, 1).toDouble();
    final safeWidth = width.clamp(0, 1).toDouble();
    final safeHeight = height.clamp(0, 1).toDouble();
    return switch (normalized) {
      90 => TargetSubjectRegion(
          x: _unit(1 - (safeY + safeHeight)),
          y: _unit(safeX),
          width: _unit(safeHeight),
          height: _unit(safeWidth),
        ),
      180 => TargetSubjectRegion(
          x: _unit(1 - (safeX + safeWidth)),
          y: _unit(1 - (safeY + safeHeight)),
          width: _unit(safeWidth),
          height: _unit(safeHeight),
        ),
      270 => TargetSubjectRegion(
          x: _unit(safeY),
          y: _unit(1 - (safeX + safeWidth)),
          width: _unit(safeHeight),
          height: _unit(safeWidth),
        ),
      _ => TargetSubjectRegion(
          x: safeX,
          y: safeY,
          width: safeWidth,
          height: safeHeight,
        ),
    };
  }
}

class PrimarySubject {
  const PrimarySubject({
    required this.sourceObservation,
    required this.targetRegion,
    required this.bodyCoverage,
    required this.visualProminenceScore,
    required this.captureZoneOverlap,
    required this.selectedScope,
    required this.lockState,
    required this.observedFrameCount,
    required this.absentFrameCount,
    required this.firstObservedAt,
    required this.lastObservedAt,
    required this.analyzerCapabilities,
    required this.isUsableForScope,
  });

  final PersonObservation? sourceObservation;
  final TargetSubjectRegion targetRegion;
  final BodyCoverage bodyCoverage;
  final double visualProminenceScore;
  final double captureZoneOverlap;
  final CaptureScope selectedScope;
  final PrimarySubjectLockState lockState;
  final int observedFrameCount;
  final int absentFrameCount;
  final DateTime firstObservedAt;
  final DateTime lastObservedAt;
  final PoseAnalyzerCapabilities analyzerCapabilities;
  final bool isUsableForScope;

  bool get isCurrentlyObserved =>
      lockState == PrimarySubjectLockState.locked && sourceObservation != null;

  PrimarySubject copyWith({
    PersonObservation? sourceObservation,
    TargetSubjectRegion? targetRegion,
    BodyCoverage? bodyCoverage,
    double? visualProminenceScore,
    double? captureZoneOverlap,
    CaptureScope? selectedScope,
    PrimarySubjectLockState? lockState,
    int? observedFrameCount,
    int? absentFrameCount,
    DateTime? firstObservedAt,
    DateTime? lastObservedAt,
    PoseAnalyzerCapabilities? analyzerCapabilities,
    bool? isUsableForScope,
    bool clearSourceObservation = false,
  }) {
    return PrimarySubject(
      sourceObservation: clearSourceObservation
          ? null
          : sourceObservation ?? this.sourceObservation,
      targetRegion: targetRegion ?? this.targetRegion,
      bodyCoverage: bodyCoverage ?? this.bodyCoverage,
      visualProminenceScore:
          visualProminenceScore ?? this.visualProminenceScore,
      captureZoneOverlap: captureZoneOverlap ?? this.captureZoneOverlap,
      selectedScope: selectedScope ?? this.selectedScope,
      lockState: lockState ?? this.lockState,
      observedFrameCount: observedFrameCount ?? this.observedFrameCount,
      absentFrameCount: absentFrameCount ?? this.absentFrameCount,
      firstObservedAt: firstObservedAt ?? this.firstObservedAt,
      lastObservedAt: lastObservedAt ?? this.lastObservedAt,
      analyzerCapabilities:
          analyzerCapabilities ?? this.analyzerCapabilities,
      isUsableForScope: isUsableForScope ?? this.isUsableForScope,
    );
  }
}

class PrimarySubjectResolverConfig {
  const PrimarySubjectResolverConfig({
    this.minimumConfidence = 0.32,
    this.minimumFrameAreaRatio = 0.025,
    this.minimumIouForContinuity = 0.16,
    this.maximumCenterShiftRatio = 0.2,
    this.releaseAfterAbsentFrames = 3,
    this.releaseAfterAbsentDuration = const Duration(milliseconds: 1400),
  });

  final double minimumConfidence;
  final double minimumFrameAreaRatio;
  final double minimumIouForContinuity;
  final double maximumCenterShiftRatio;
  final int releaseAfterAbsentFrames;
  final Duration releaseAfterAbsentDuration;
}

class PrimarySubjectResolver {
  PrimarySubjectResolver({
    this.config = const PrimarySubjectResolverConfig(),
  });

  final PrimarySubjectResolverConfig config;

  PrimarySubject? _locked;

  PrimarySubject? get lockedSubject => _locked;

  void reset() {
    _locked = null;
  }

  PrimarySubject? resolve({
    required PoseAnalysisResult pose,
    required FrameDimensions frameDimensions,
    required CaptureScope scope,
    required DateTime observedAt,
    bool allowSubjectReselection = true,
  }) {
    if (!pose.available || pose.people.isEmpty) {
      return _markAbsent(observedAt);
    }

    final candidate = selectPrimaryPerson(pose.people, frameDimensions);
    if (candidate == null || !_isProminentEnough(candidate, frameDimensions)) {
      return _markAbsent(observedAt);
    }

    final next = _createSubject(
      candidate,
      frameDimensions,
      scope,
      observedAt,
      pose.capabilities,
    );
    final locked = _locked;
    if (locked == null) {
      _locked = next;
      return _locked;
    }

    if (_matchesLockedSubject(locked, next, frameDimensions)) {
      _locked = next.copyWith(
        firstObservedAt: locked.firstObservedAt,
        observedFrameCount: locked.observedFrameCount + 1,
      );
      return _locked;
    }

    final absent = _markAbsent(observedAt);
    if (!allowSubjectReselection || !_shouldRelease(absent, observedAt)) {
      return absent;
    }

    _locked = next;
    return _locked;
  }

  PrimarySubject _createSubject(
    PersonObservation observation,
    FrameDimensions frameDimensions,
    CaptureScope scope,
    DateTime observedAt,
    PoseAnalyzerCapabilities capabilities,
  ) {
    final targetRegion = TargetSubjectRegion.fromObservation(
      person: observation,
      frameDimensions: frameDimensions,
      scope: scope,
    );
    final coverage = bodyCoverageForScope(scope, observation);
    return PrimarySubject(
      sourceObservation: observation,
      targetRegion: targetRegion,
      bodyCoverage: coverage,
      visualProminenceScore: visualProminenceScore(
        observation,
        frameDimensions,
        scope,
      ),
      captureZoneOverlap: captureZoneOverlapForScope(
        observation.bounds,
        frameDimensions,
        scope,
      ),
      selectedScope: scope,
      lockState: PrimarySubjectLockState.locked,
      observedFrameCount: 1,
      absentFrameCount: 0,
      firstObservedAt: observedAt,
      lastObservedAt: observedAt,
      analyzerCapabilities: capabilities,
      isUsableForScope: isCoverageReadyForScope(scope, coverage),
    );
  }

  PrimarySubject? _markAbsent(DateTime observedAt) {
    final locked = _locked;
    if (locked == null) {
      return null;
    }
    _locked = locked.copyWith(
      lockState: PrimarySubjectLockState.absent,
      absentFrameCount: locked.absentFrameCount + 1,
      clearSourceObservation: true,
      isUsableForScope: false,
    );
    if (_shouldRelease(_locked, observedAt)) {
      _locked = null;
      return null;
    }
    return _locked;
  }

  bool _isProminentEnough(
    PersonObservation observation,
    FrameDimensions frameDimensions,
  ) {
    final frameArea = math.max(1, frameDimensions.width * frameDimensions.height);
    return observation.averageConfidence >= config.minimumConfidence &&
        observation.area / frameArea >= config.minimumFrameAreaRatio;
  }

  bool _matchesLockedSubject(
    PrimarySubject locked,
    PrimarySubject next,
    FrameDimensions frameDimensions,
  ) {
    final lockedRect = locked.targetRegion.toRect(frameDimensions);
    final nextRect = next.targetRegion.toRect(frameDimensions);
    if (_intersectionOverUnion(lockedRect, nextRect) >=
        config.minimumIouForContinuity) {
      return true;
    }
    final maxDimension = math.max(frameDimensions.width, frameDimensions.height);
    final centerShift = (lockedRect.center - nextRect.center).distance /
        math.max(1, maxDimension);
    return centerShift <= config.maximumCenterShiftRatio;
  }

  bool _shouldRelease(PrimarySubject? subject, DateTime observedAt) {
    if (subject == null) {
      return false;
    }
    final absentDuration = observedAt.difference(subject.lastObservedAt);
    return subject.absentFrameCount >= config.releaseAfterAbsentFrames ||
        absentDuration >= config.releaseAfterAbsentDuration;
  }
}

PersonObservation? selectPrimaryPerson(
  List<PersonObservation> people,
  FrameDimensions dimensions,
) {
  if (people.isEmpty) {
    return null;
  }
  final frameCenter = Offset(dimensions.width / 2, dimensions.height / 2);
  PersonObservation? best;
  var bestScore = double.negativeInfinity;
  for (final person in people) {
    final distance = (person.center - frameCenter).distance;
    final normalizedDistance =
        distance / math.max(dimensions.width, dimensions.height);
    final areaRatio =
        person.area / math.max(1, dimensions.width * dimensions.height);
    final score =
        areaRatio * 4 + person.averageConfidence - normalizedDistance * 1.8;
    if (score > bestScore) {
      bestScore = score;
      best = person;
    }
  }
  return best;
}

double visualProminenceScore(
  PersonObservation person,
  FrameDimensions dimensions,
  CaptureScope scope,
) {
  final frameCenter = Offset(dimensions.width / 2, dimensions.height / 2);
  final distance = (person.center - frameCenter).distance;
  final normalizedDistance =
      distance / math.max(dimensions.width, dimensions.height);
  final areaRatio =
      person.area / math.max(1, dimensions.width * dimensions.height);
  return areaRatio * 4 +
      person.averageConfidence +
      captureZoneOverlapForScope(person.bounds, dimensions, scope) * 1.6 -
      normalizedDistance * 1.2;
}

double captureZoneOverlapForScope(
  Rect bounds,
  FrameDimensions frame,
  CaptureScope scope,
) {
  final captureRegion = switch (scope) {
    CaptureScope.top => Rect.fromLTWH(
      frame.width * 0.22,
      frame.height * 0.08,
      frame.width * 0.56,
      frame.height * 0.52,
    ),
    CaptureScope.bottom => Rect.fromLTWH(
      frame.width * 0.2,
      frame.height * 0.12,
      frame.width * 0.6,
      frame.height * 0.78,
    ),
    CaptureScope.fullBody => Rect.fromLTWH(
      frame.width * 0.2,
      frame.height * 0.08,
      frame.width * 0.6,
      frame.height * 0.84,
    ),
  };
  return _overlapRatio(bounds, captureRegion);
}

bool isCoverageReadyForScope(CaptureScope scope, BodyCoverage coverage) {
  return switch (scope) {
    CaptureScope.top => coverage == BodyCoverage.topReady,
    CaptureScope.bottom => coverage == BodyCoverage.bottomReady,
    CaptureScope.fullBody => coverage == BodyCoverage.fullBodyReady,
  };
}

BodyCoverage bodyCoverageForScope(
  CaptureScope scope,
  PersonObservation? person,
) {
  if (person == null || person.landmarks.isEmpty) {
    return BodyCoverage.insufficient;
  }
  final upper =
      _hasAny(person, const ['leftShoulder', 'rightShoulder']) &&
      _hasAny(person, const ['leftHip', 'rightHip']);
  final lower =
      _hasAny(person, const ['leftHip', 'rightHip']) &&
      _hasAny(person, const ['leftKnee', 'rightKnee']) &&
      _hasAny(person, const [
        'leftAnkle',
        'rightAnkle',
        'leftFootIndex',
        'rightFootIndex',
      ]);

  return switch (scope) {
    CaptureScope.top =>
      upper ? BodyCoverage.topReady : BodyCoverage.insufficient,
    CaptureScope.bottom =>
      lower ? BodyCoverage.bottomReady : BodyCoverage.insufficient,
    CaptureScope.fullBody =>
      upper && lower ? BodyCoverage.fullBodyReady : BodyCoverage.insufficient,
  };
}

double _intersectionOverUnion(Rect a, Rect b) {
  final intersection = a.intersect(b);
  if (intersection.isEmpty) {
    return 0;
  }
  final intersectionArea = intersection.width * intersection.height;
  final unionArea = a.width * a.height + b.width * b.height - intersectionArea;
  return intersectionArea / math.max(1, unionArea);
}

double _overlapRatio(Rect a, Rect b) {
  final intersection = a.intersect(b);
  if (intersection.isEmpty) {
    return 0;
  }
  return (intersection.width * intersection.height) /
      math.max(1, a.width * a.height);
}

bool _hasAny(PersonObservation person, List<String> names) {
  return names.any((name) {
    final landmark = person.landmarks[name];
    return landmark != null && landmark.confidence >= 0.45;
  });
}

int _normalizeDegrees(int degrees) {
  final normalized = degrees % 360;
  final positive = normalized < 0 ? normalized + 360 : normalized;
  return switch (positive) {
    90 => 90,
    180 => 180,
    270 => 270,
    _ => 0,
  };
}

double _unit(num value) {
  return math.max(0, math.min(1, value.toDouble()));
}
