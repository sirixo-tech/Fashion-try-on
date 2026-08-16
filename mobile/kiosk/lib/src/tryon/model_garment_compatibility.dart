import '../session/capture_scope.dart';
import 'kiosk_garment_input.dart';

enum ModelCoverage { upperBody, lowerBody, fullBody, unknown }

extension ModelCoverageApi on ModelCoverage {
  String get apiValue {
    return switch (this) {
      ModelCoverage.upperBody => 'UPPER_BODY',
      ModelCoverage.lowerBody => 'LOWER_BODY',
      ModelCoverage.fullBody => 'FULL_BODY',
      ModelCoverage.unknown => 'UNKNOWN',
    };
  }
}

class ModelGarmentCompatibilityResult {
  const ModelGarmentCompatibilityResult.supported()
    : supported = true,
      guidance = null;

  const ModelGarmentCompatibilityResult.blocked(this.guidance)
    : supported = false;

  final bool supported;
  final CustomerCompatibilityGuidance? guidance;
}

class CustomerCompatibilityGuidance {
  const CustomerCompatibilityGuidance({
    required this.title,
    required this.message,
  });

  final String title;
  final String message;
}

class ModelGarmentCompatibilityService {
  const ModelGarmentCompatibilityService();

  ModelGarmentCompatibilityResult check({
    required ModelCoverage coverage,
    required KioskGarmentIntent intent,
  }) {
    if (_isSupported(coverage, intent)) {
      return const ModelGarmentCompatibilityResult.supported();
    }
    return ModelGarmentCompatibilityResult.blocked(guidanceFor(intent));
  }

  bool _isSupported(ModelCoverage coverage, KioskGarmentIntent intent) {
    return switch (coverage) {
      ModelCoverage.upperBody => intent == KioskGarmentIntent.top,
      ModelCoverage.lowerBody => intent == KioskGarmentIntent.bottom,
      ModelCoverage.fullBody => intent == KioskGarmentIntent.top ||
          intent == KioskGarmentIntent.bottom ||
          intent == KioskGarmentIntent.fullOutfit ||
          intent == KioskGarmentIntent.onePiece,
      ModelCoverage.unknown => false,
    };
  }
}

CustomerCompatibilityGuidance guidanceFor(KioskGarmentIntent intent) {
  return switch (intent) {
    KioskGarmentIntent.bottom => const CustomerCompatibilityGuidance(
      title: 'Update your photo to try bottoms',
      message: 'We need to see more of your lower body for this item.',
    ),
    KioskGarmentIntent.fullOutfit || KioskGarmentIntent.onePiece =>
      const CustomerCompatibilityGuidance(
        title: 'Update your photo to try a full outfit',
        message: 'We need a full-body photo for this item.',
      ),
    KioskGarmentIntent.top => const CustomerCompatibilityGuidance(
      title: 'Update your photo to try a top',
      message: 'We need to see more of your upper body for this item.',
    ),
    KioskGarmentIntent.auto => const CustomerCompatibilityGuidance(
      title: 'Update your photo',
      message: 'We need a clearer photo that shows more of you for this item.',
    ),
  };
}

ModelCoverage modelCoverageForCaptureScope(CaptureScope scope) {
  return switch (scope) {
    CaptureScope.top => ModelCoverage.upperBody,
    CaptureScope.bottom => ModelCoverage.lowerBody,
    CaptureScope.fullBody => ModelCoverage.fullBody,
  };
}
