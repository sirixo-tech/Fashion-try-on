import 'dart:io';

import '../session/capture_scope.dart';
import 'kiosk_garment_input.dart';

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
  cancelled,
}

class KioskTryOnRequest {
  const KioskTryOnRequest({
    required this.clientRequestId,
    required this.personImage,
    required this.garmentInput,
    required this.captureScope,
    required this.targetMetadata,
  });

  final String clientRequestId;
  final File personImage;
  final KioskGarmentInput garmentInput;
  final CaptureScope captureScope;
  final TryOnTargetPreparationMetadata targetMetadata;
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
