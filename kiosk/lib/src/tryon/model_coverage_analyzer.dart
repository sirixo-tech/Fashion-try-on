import 'dart:io';
import 'dart:ui';

import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart'
    as mlkit;
import 'package:image/image.dart' as img;

import '../live/live_frame.dart';
import '../live/person_analysis.dart';
import '../session/capture_scope.dart';
import 'model_garment_compatibility.dart';

enum ModelCoverageAnalysisStatus { resolved, unknown, unavailable }

class ModelCoverageAnalysis {
  const ModelCoverageAnalysis({
    required this.coverage,
    required this.status,
    required this.reasonCode,
    this.confidence,
  });

  const ModelCoverageAnalysis.resolved({
    required ModelCoverage coverage,
    required double confidence,
    required String reasonCode,
  }) : this(
         coverage: coverage,
         status: ModelCoverageAnalysisStatus.resolved,
         confidence: confidence,
         reasonCode: reasonCode,
       );

  const ModelCoverageAnalysis.unknown({
    required String reasonCode,
    double? confidence,
  }) : this(
         coverage: ModelCoverage.unknown,
         status: ModelCoverageAnalysisStatus.unknown,
         confidence: confidence,
         reasonCode: reasonCode,
       );

  const ModelCoverageAnalysis.unavailable(String reasonCode)
    : this(
        coverage: ModelCoverage.unknown,
        status: ModelCoverageAnalysisStatus.unavailable,
        reasonCode: reasonCode,
      );

  final ModelCoverage coverage;
  final ModelCoverageAnalysisStatus status;
  final double? confidence;
  final String reasonCode;

  bool get analysisAvailable =>
      status != ModelCoverageAnalysisStatus.unavailable;
}

abstract class ModelCoverageAnalyzer {
  Future<ModelCoverageAnalysis> analyze(File image);

  Future<void> dispose();
}

class UnavailableModelCoverageAnalyzer implements ModelCoverageAnalyzer {
  const UnavailableModelCoverageAnalyzer([
    this.reasonCode = 'MODEL_COVERAGE_ANALYSIS_UNAVAILABLE',
  ]);

  final String reasonCode;

  @override
  Future<ModelCoverageAnalysis> analyze(File image) async {
    return ModelCoverageAnalysis.unavailable(reasonCode);
  }

  @override
  Future<void> dispose() async {}
}

class MlKitStillImageModelCoverageAnalyzer implements ModelCoverageAnalyzer {
  MlKitStillImageModelCoverageAnalyzer({
    mlkit.PoseDetector? detector,
    bool Function()? isSupportedPlatform,
  }) : _detector =
           detector ??
           mlkit.PoseDetector(
             options: mlkit.PoseDetectorOptions(
               model: mlkit.PoseDetectionModel.accurate,
               mode: mlkit.PoseDetectionMode.single,
             ),
           ),
       _isSupportedPlatform = isSupportedPlatform ?? (() => Platform.isAndroid);

  final mlkit.PoseDetector _detector;
  final bool Function() _isSupportedPlatform;

  @override
  Future<ModelCoverageAnalysis> analyze(File image) async {
    if (!_isSupportedPlatform()) {
      return const ModelCoverageAnalysis.unavailable(
        'MODEL_COVERAGE_PLATFORM_UNSUPPORTED',
      );
    }
    try {
      if (!await image.exists()) {
        return const ModelCoverageAnalysis.unavailable(
          'MODEL_IMAGE_FILE_MISSING',
        );
      }

      final dimensions = await _displayDimensions(image);
      if (dimensions == null) {
        return const ModelCoverageAnalysis.unavailable(
          'MODEL_IMAGE_DECODE_FAILED',
        );
      }

      final poses = await _detector.processImage(
        mlkit.InputImage.fromFilePath(image.path),
      );
      if (poses.isEmpty) {
        return const ModelCoverageAnalysis.unknown(
          reasonCode: 'MODEL_PERSON_NOT_DETECTED',
        );
      }

      final people = poses
          .map(_observationFromPose)
          .where((person) => person.landmarks.isNotEmpty)
          .toList(growable: false);
      if (people.isEmpty) {
        return const ModelCoverageAnalysis.unknown(
          reasonCode: 'MODEL_LANDMARKS_INSUFFICIENT',
        );
      }

      final primary = selectPrimaryPerson(people, dimensions) ?? people.first;
      final coverage = modelCoverageFromPersonObservation(primary);
      if (coverage == ModelCoverage.unknown) {
        return ModelCoverageAnalysis.unknown(
          reasonCode: 'MODEL_COVERAGE_INSUFFICIENT',
          confidence: primary.averageConfidence,
        );
      }
      return ModelCoverageAnalysis.resolved(
        coverage: coverage,
        confidence: primary.averageConfidence,
        reasonCode: _reasonCodeFor(coverage),
      );
    } catch (_) {
      return const ModelCoverageAnalysis.unavailable(
        'MODEL_COVERAGE_ANALYSIS_UNAVAILABLE',
      );
    }
  }

  @override
  Future<void> dispose() {
    return _detector.close();
  }
}

ModelCoverage modelCoverageFromPersonObservation(PersonObservation person) {
  if (bodyCoverageForScope(CaptureScope.fullBody, person) ==
      BodyCoverage.fullBodyReady) {
    return ModelCoverage.fullBody;
  }
  if (bodyCoverageForScope(CaptureScope.top, person) == BodyCoverage.topReady) {
    return ModelCoverage.upperBody;
  }
  if (bodyCoverageForScope(CaptureScope.bottom, person) ==
      BodyCoverage.bottomReady) {
    return ModelCoverage.lowerBody;
  }
  return ModelCoverage.unknown;
}

PersonObservation _observationFromPose(mlkit.Pose pose) {
  final observations = <LandmarkObservation>[];
  for (final entry in pose.landmarks.entries) {
    final landmark = entry.value;
    final confidence = landmark.likelihood.clamp(0, 1).toDouble();
    if (confidence < 0.25) {
      continue;
    }
    observations.add(
      LandmarkObservation(
        name: entry.key.name,
        position: Offset(landmark.x, landmark.y),
        confidence: confidence,
      ),
    );
  }
  return personObservationFromLandmarks(observations);
}

Future<FrameDimensions?> _displayDimensions(File image) async {
  final decoded = img.decodeImage(await image.readAsBytes());
  if (decoded == null || decoded.width <= 0 || decoded.height <= 0) {
    return null;
  }
  final oriented = img.bakeOrientation(decoded);
  return FrameDimensions(width: oriented.width, height: oriented.height);
}

String _reasonCodeFor(ModelCoverage coverage) {
  return switch (coverage) {
    ModelCoverage.upperBody => 'MODEL_UPPER_BODY_COVERAGE',
    ModelCoverage.lowerBody => 'MODEL_LOWER_BODY_COVERAGE',
    ModelCoverage.fullBody => 'MODEL_FULL_BODY_COVERAGE',
    ModelCoverage.unknown => 'MODEL_COVERAGE_INSUFFICIENT',
  };
}
