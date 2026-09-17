import '../quality/image_quality.dart';
import 'kiosk_jewellery_capture_requirements.dart';
import 'model_coverage_analyzer.dart';
import 'model_garment_compatibility.dart';

class JewelleryPersonPreflightResult {
  const JewelleryPersonPreflightResult._({
    required this.canProceed,
    required this.message,
    required this.reasonCode,
  });

  const JewelleryPersonPreflightResult.proceed()
    : this._(canProceed: true, message: null, reasonCode: null);

  const JewelleryPersonPreflightResult.rejected({
    required String message,
    required String reasonCode,
  }) : this._(canProceed: false, message: message, reasonCode: reasonCode);

  final bool canProceed;
  final String? message;
  final String? reasonCode;
}

JewelleryPersonPreflightResult evaluateJewelleryPersonPreflight({
  required KioskJewelleryCaptureRequirements requirements,
  required ImageQualityResult quality,
  ModelCoverageAnalysis? coverageAnalysis,
}) {
  final qualityRejection = _qualityRejection(quality);
  if (qualityRejection != null) {
    return qualityRejection;
  }

  final coverage = coverageAnalysis?.coverage;
  if (coverageAnalysis?.status == ModelCoverageAnalysisStatus.resolved &&
      !_coverageSupportsTargetRegion(requirements.targetRegion, coverage)) {
    return JewelleryPersonPreflightResult.rejected(
      reasonCode: 'JEWELLERY_REQUIRED_REGION_NOT_VISIBLE',
      message: requirements.instruction,
    );
  }

  return const JewelleryPersonPreflightResult.proceed();
}

JewelleryPersonPreflightResult? _qualityRejection(ImageQualityResult quality) {
  final codes = quality.issues.map((issue) => issue.code).toSet();
  if (codes.contains(ImageQualityIssueCode.imageTooBlurry)) {
    return const JewelleryPersonPreflightResult.rejected(
      reasonCode: 'JEWELLERY_PHOTO_TOO_BLURRY',
      message: 'Photo is too blurry. Please retake.',
    );
  }
  if (codes.contains(ImageQualityIssueCode.imageTooDark)) {
    return const JewelleryPersonPreflightResult.rejected(
      reasonCode: 'JEWELLERY_PHOTO_TOO_DARK',
      message: 'More light is needed. Please retake.',
    );
  }
  if (codes.contains(ImageQualityIssueCode.imageOverexposed)) {
    return const JewelleryPersonPreflightResult.rejected(
      reasonCode: 'JEWELLERY_PHOTO_OVEREXPOSED',
      message: 'Lighting is too bright. Please retake.',
    );
  }
  if (codes.contains(ImageQualityIssueCode.imageLowContrast)) {
    return const JewelleryPersonPreflightResult.rejected(
      reasonCode: 'JEWELLERY_PHOTO_LOW_CONTRAST',
      message: 'Use clearer lighting and retake the photo.',
    );
  }
  if (codes.contains(ImageQualityIssueCode.imageLowResolution)) {
    return const JewelleryPersonPreflightResult.rejected(
      reasonCode: 'JEWELLERY_PHOTO_LOW_RESOLUTION',
      message: 'Photo is too small or unclear. Please retake.',
    );
  }
  return null;
}

bool _coverageSupportsTargetRegion(
  KioskJewelleryCaptureTargetRegion targetRegion,
  ModelCoverage? coverage,
) {
  return switch (targetRegion) {
    KioskJewelleryCaptureTargetRegion.neckShouldersAndUpperChest ||
    KioskJewelleryCaptureTargetRegion.faceAndEars =>
      coverage == ModelCoverage.upperBody || coverage == ModelCoverage.fullBody,
    KioskJewelleryCaptureTargetRegion.hand ||
    KioskJewelleryCaptureTargetRegion.wristAndLowerForearm => true,
  };
}
