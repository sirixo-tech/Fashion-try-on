import 'dart:io';

import '../session/capture_scope.dart';
import 'kiosk_garment_input.dart';
import 'model_garment_compatibility.dart';

enum KioskTryOnStatus {
  idle,
  preparing,
  uploading,
  queued,
  processing,
  succeeded,
  failed,
  timedOut,
  cancelled,
}

enum KioskTryOnFailureCode {
  configurationMissing,
  authenticationMissing,
  deviceAuthenticationRejected,
  garmentMissing,
  personMissing,
  imagePreparationFailed,
  uploadFailed,
  networkUnavailable,
  generationFailed,
  generationTimedOut,
  modelImageIncompatibleWithGarment,
  cancelled,
}

enum KioskTryOnSessionStatus { active, completed, expired }

enum KioskTryOnAssetPurpose { person, garment, result }

class KioskTryOnRequest {
  const KioskTryOnRequest({
    required this.clientRequestId,
    required this.garmentInput,
    required this.captureScope,
    required this.modelCoverage,
    required this.targetMetadata,
    this.personImage,
    this.sessionId,
    this.personAssetId,
  });

  final String clientRequestId;
  final File? personImage;
  final KioskGarmentInput garmentInput;
  final CaptureScope captureScope;
  final ModelCoverage modelCoverage;
  final TryOnTargetPreparationMetadata targetMetadata;
  final String? sessionId;
  final String? personAssetId;

  bool get usesStoredPerson => sessionId != null && personAssetId != null;
}

class KioskTryOnRun {
  const KioskTryOnRun({
    required this.id,
    required this.status,
    this.resultImage,
    this.failureCode,
    this.failureMessage,
  });

  final String id;
  final KioskTryOnStatus status;
  final String? resultImage;
  final KioskTryOnFailureCode? failureCode;
  final String? failureMessage;

  bool get isTerminal =>
      status == KioskTryOnStatus.succeeded ||
      status == KioskTryOnStatus.failed ||
      status == KioskTryOnStatus.timedOut ||
      status == KioskTryOnStatus.cancelled;

  KioskTryOnRun copyWith({
    KioskTryOnStatus? status,
    String? resultImage,
    KioskTryOnFailureCode? failureCode,
    String? failureMessage,
  }) {
    return KioskTryOnRun(
      id: id,
      status: status ?? this.status,
      resultImage: resultImage ?? this.resultImage,
      failureCode: failureCode ?? this.failureCode,
      failureMessage: failureMessage ?? this.failureMessage,
    );
  }
}

class KioskTryOnResult {
  const KioskTryOnResult({required this.run, required this.generatedImage});

  final KioskTryOnRun run;
  final String generatedImage;
}

class KioskTryOnSession {
  const KioskTryOnSession({
    required this.sessionId,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    required this.expiresAt,
    this.currentPersonAssetId,
  });

  final String sessionId;
  final KioskTryOnSessionStatus status;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime expiresAt;
  final String? currentPersonAssetId;

  bool get isActive => status == KioskTryOnSessionStatus.active;
}

class KioskTryOnAsset {
  const KioskTryOnAsset({
    required this.assetId,
    required this.purpose,
    required this.contentType,
    required this.sizeBytes,
    required this.width,
    required this.height,
    required this.expiresAt,
  });

  final String assetId;
  final KioskTryOnAssetPurpose purpose;
  final String contentType;
  final int sizeBytes;
  final int width;
  final int height;
  final DateTime expiresAt;
}

class KioskTryOnLook {
  const KioskTryOnLook({
    required this.lookId,
    required this.runId,
    required this.personAssetId,
    required this.resultAssetId,
    required this.resultReadUrl,
    required this.createdAt,
    required this.expiresAt,
    this.garmentAssetId,
    this.productId,
  });

  final String lookId;
  final String runId;
  final String personAssetId;
  final String? garmentAssetId;
  final String? productId;
  final String resultAssetId;
  final String resultReadUrl;
  final DateTime createdAt;
  final DateTime expiresAt;
}

class TryOnTargetPreparationMetadata {
  const TryOnTargetPreparationMetadata({
    required this.originalPath,
    required this.preparedPath,
    required this.originalWidth,
    required this.originalHeight,
    required this.cropX,
    required this.cropY,
    required this.cropWidth,
    required this.cropHeight,
    required this.scope,
    required this.usedTargetRegion,
    required this.windowsFullFrameFallback,
  });

  final String originalPath;
  final String preparedPath;
  final int originalWidth;
  final int originalHeight;
  final int cropX;
  final int cropY;
  final int cropWidth;
  final int cropHeight;
  final CaptureScope scope;
  final bool usedTargetRegion;
  final bool windowsFullFrameFallback;
}

class KioskTryOnException implements Exception {
  const KioskTryOnException(this.code, this.message);

  final KioskTryOnFailureCode code;
  final String message;

  @override
  String toString() => message;
}
