import '../session/capture_session_controller.dart';
import 'kiosk_garment_input.dart';

enum GarmentReferenceKind { onPerson, productOrIsolated, unknown }

class GarmentReferenceProfile {
  const GarmentReferenceProfile({
    required this.kind,
    required this.photoType,
    required this.confidence,
    this.advisoryMessages = const [],
  });

  final GarmentReferenceKind kind;
  final KioskGarmentPhotoType photoType;
  final double confidence;
  final List<String> advisoryMessages;
}

const garmentLayeringAdvisory =
    'For best results, use a photo where the item you want to try is clearly visible.';

GarmentReferenceProfile resolveGarmentReferenceProfile({
  CaptureTargetMetadata? bodyContext,
}) {
  if (bodyContext != null && bodyContext.observedFrameCount > 0) {
    return const GarmentReferenceProfile(
      kind: GarmentReferenceKind.onPerson,
      photoType: KioskGarmentPhotoType.onModel,
      confidence: 0.75,
      advisoryMessages: [garmentLayeringAdvisory],
    );
  }

  return const GarmentReferenceProfile(
    kind: GarmentReferenceKind.unknown,
    photoType: KioskGarmentPhotoType.auto,
    confidence: 0.25,
    advisoryMessages: [garmentLayeringAdvisory],
  );
}
