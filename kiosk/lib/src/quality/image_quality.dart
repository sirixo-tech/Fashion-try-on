enum ImageQualityStatus { pass, warning, blocked }

enum ImageQualityIssueSeverity { warning, blocking }

enum ImageQualityIssueCode {
  imageInvalid,
  imageDecodeFailed,
  imageTooBlurry,
  imageTooDark,
  imageOverexposed,
  imageLowContrast,
  imageLowResolution,
  imageFramingSuboptimal,
  imageQualityAnalysisUnavailable,
}

enum ImageQualityTarget { person, garment }

class ImageQualityIssue {
  const ImageQualityIssue({
    required this.code,
    required this.severity,
    required this.message,
  });

  final ImageQualityIssueCode code;
  final ImageQualityIssueSeverity severity;
  final String message;
}

class ImageQualityMetrics {
  const ImageQualityMetrics({
    required this.width,
    required this.height,
    required this.sharpness,
    required this.brightness,
    required this.contrast,
  });

  final int? width;
  final int? height;
  final double? sharpness;
  final double? brightness;
  final double? contrast;
}

class CompleteImageQualityMetrics {
  const CompleteImageQualityMetrics({
    required this.width,
    required this.height,
    required this.sharpness,
    required this.brightness,
    required this.contrast,
  });

  final int width;
  final int height;
  final double sharpness;
  final double brightness;
  final double contrast;
}

class ImageQualityResult {
  const ImageQualityResult({
    required this.status,
    required this.passed,
    required this.score,
    required this.metrics,
    required this.issues,
  });

  final ImageQualityStatus status;
  final bool passed;
  final int score;
  final ImageQualityMetrics metrics;
  final List<ImageQualityIssue> issues;

  bool get isBlocked => status == ImageQualityStatus.blocked;
}

class ImageQualityThresholds {
  const ImageQualityThresholds({
    required this.minWidth,
    required this.minHeight,
    required this.sharpnessWarning,
    required this.brightnessMin,
    required this.brightnessMax,
    required this.contrastMin,
    required this.aspectRatioMin,
    required this.aspectRatioMax,
  });

  final int minWidth;
  final int minHeight;
  final double sharpnessWarning;
  final double brightnessMin;
  final double brightnessMax;
  final double contrastMin;
  final double aspectRatioMin;
  final double aspectRatioMax;
}

class ImageQualityProfile {
  const ImageQualityProfile({
    required this.version,
    required this.person,
    required this.garment,
  });

  final String version;
  final ImageQualityThresholds person;
  final ImageQualityThresholds garment;

  ImageQualityThresholds thresholdsFor(ImageQualityTarget target) {
    return target == ImageQualityTarget.person ? person : garment;
  }
}

const imageQualityProfileV1 = ImageQualityProfile(
  version: 'IMAGE_QUALITY_PROFILE_V1',
  person: ImageQualityThresholds(
    minWidth: 384,
    minHeight: 384,
    sharpnessWarning: 28,
    brightnessMin: 42,
    brightnessMax: 220,
    contrastMin: 22,
    aspectRatioMin: 0.45,
    aspectRatioMax: 2.4,
  ),
  garment: ImageQualityThresholds(
    minWidth: 320,
    minHeight: 320,
    sharpnessWarning: 24,
    brightnessMin: 38,
    brightnessMax: 226,
    contrastMin: 18,
    aspectRatioMin: 0.35,
    aspectRatioMax: 2.8,
  ),
);

abstract class KioskImageQualityAnalyzer {
  Future<ImageQualityResult> analyzeStillImage(
    String imagePath,
    ImageQualityTarget target,
  );

  void dispose();
}

ImageQualityResult createInvalidImageQualityResult(
  ImageQualityIssueCode code,
  String message,
) {
  return ImageQualityResult(
    status: ImageQualityStatus.blocked,
    passed: false,
    score: 0,
    metrics: const ImageQualityMetrics(
      width: null,
      height: null,
      sharpness: null,
      brightness: null,
      contrast: null,
    ),
    issues: [
      ImageQualityIssue(
        code: code,
        severity: ImageQualityIssueSeverity.blocking,
        message: message,
      ),
    ],
  );
}

ImageQualityResult createUnavailableImageQualityResult({
  int? width,
  int? height,
}) {
  return ImageQualityResult(
    status: ImageQualityStatus.warning,
    passed: true,
    score: 75,
    metrics: ImageQualityMetrics(
      width: width,
      height: height,
      sharpness: null,
      brightness: null,
      contrast: null,
    ),
    issues: const [
      ImageQualityIssue(
        code: ImageQualityIssueCode.imageQualityAnalysisUnavailable,
        severity: ImageQualityIssueSeverity.warning,
        message:
            'Image quality analysis could not be completed. You can retake or use this photo.',
      ),
    ],
  );
}

ImageQualityResult normalizeImageQualityResult(
  CompleteImageQualityMetrics metrics,
  ImageQualityTarget target, {
  ImageQualityProfile profile = imageQualityProfileV1,
}) {
  final thresholds = profile.thresholdsFor(target);
  final issues = <ImageQualityIssue>[];
  final aspectRatio = metrics.width / metrics.height.clamp(1, double.infinity);

  if (metrics.width < thresholds.minWidth ||
      metrics.height < thresholds.minHeight) {
    issues.add(
      const ImageQualityIssue(
        code: ImageQualityIssueCode.imageLowResolution,
        severity: ImageQualityIssueSeverity.warning,
        message: 'Image resolution is lower than recommended.',
      ),
    );
  }
  if (metrics.sharpness < thresholds.sharpnessWarning) {
    issues.add(
      const ImageQualityIssue(
        code: ImageQualityIssueCode.imageTooBlurry,
        severity: ImageQualityIssueSeverity.warning,
        message: 'Image may be blurry.',
      ),
    );
  }
  if (metrics.brightness < thresholds.brightnessMin) {
    issues.add(
      const ImageQualityIssue(
        code: ImageQualityIssueCode.imageTooDark,
        severity: ImageQualityIssueSeverity.warning,
        message: 'Image may be too dark.',
      ),
    );
  }
  if (metrics.brightness > thresholds.brightnessMax) {
    issues.add(
      const ImageQualityIssue(
        code: ImageQualityIssueCode.imageOverexposed,
        severity: ImageQualityIssueSeverity.warning,
        message: 'Image may be overexposed.',
      ),
    );
  }
  if (metrics.contrast < thresholds.contrastMin) {
    issues.add(
      const ImageQualityIssue(
        code: ImageQualityIssueCode.imageLowContrast,
        severity: ImageQualityIssueSeverity.warning,
        message: 'Image may have low contrast.',
      ),
    );
  }
  if (aspectRatio < thresholds.aspectRatioMin ||
      aspectRatio > thresholds.aspectRatioMax) {
    issues.add(
      const ImageQualityIssue(
        code: ImageQualityIssueCode.imageFramingSuboptimal,
        severity: ImageQualityIssueSeverity.warning,
        message: 'Image framing may be unusual for Try-On.',
      ),
    );
  }

  final blockingCount = issues
      .where((issue) => issue.severity == ImageQualityIssueSeverity.blocking)
      .length;
  final warningCount = issues
      .where((issue) => issue.severity == ImageQualityIssueSeverity.warning)
      .length;
  final status = blockingCount > 0
      ? ImageQualityStatus.blocked
      : warningCount > 0
      ? ImageQualityStatus.warning
      : ImageQualityStatus.pass;

  return ImageQualityResult(
    status: status,
    passed: blockingCount == 0,
    score: (100 - warningCount * 12 - blockingCount * 45).clamp(0, 100),
    metrics: ImageQualityMetrics(
      width: metrics.width,
      height: metrics.height,
      sharpness: metrics.sharpness,
      brightness: metrics.brightness,
      contrast: metrics.contrast,
    ),
    issues: issues,
  );
}

String qualityStatusLabel(ImageQualityStatus status) {
  return switch (status) {
    ImageQualityStatus.pass => 'PASS',
    ImageQualityStatus.warning => 'WARNING',
    ImageQualityStatus.blocked => 'BLOCKED',
  };
}
