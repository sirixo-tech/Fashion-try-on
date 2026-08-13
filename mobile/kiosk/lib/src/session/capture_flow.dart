enum CaptureFlowStage {
  preview,
  preparing,
  countdown,
  capturing,
  analyzing,
  review,
  photoReady,
  error,
}

class CaptureFlowState {
  const CaptureFlowState({
    this.stage = CaptureFlowStage.preview,
    this.countdownSeconds = defaultCaptureCountdownSeconds,
    this.secondsRemaining,
    this.guidance = const CaptureGuidance(
      message: 'Step into position',
      emphasizeNumber: false,
    ),
    this.errorMessage,
  });

  final CaptureFlowStage stage;
  final int countdownSeconds;
  final int? secondsRemaining;
  final CaptureGuidance guidance;
  final String? errorMessage;

  bool get canBeginCapture =>
      stage == CaptureFlowStage.preview || stage == CaptureFlowStage.error;

  double get countdownProgress {
    final remaining = secondsRemaining;
    if (remaining == null || countdownSeconds <= 0) {
      return 0;
    }
    return ((countdownSeconds - remaining) / countdownSeconds).clamp(0, 1);
  }

  CaptureFlowState copyWith({
    CaptureFlowStage? stage,
    int? countdownSeconds,
    int? secondsRemaining,
    CaptureGuidance? guidance,
    String? errorMessage,
    bool clearSecondsRemaining = false,
    bool clearError = false,
  }) {
    return CaptureFlowState(
      stage: stage ?? this.stage,
      countdownSeconds: countdownSeconds ?? this.countdownSeconds,
      secondsRemaining: clearSecondsRemaining
          ? null
          : secondsRemaining ?? this.secondsRemaining,
      guidance: guidance ?? this.guidance,
      errorMessage: clearError ? null : errorMessage ?? this.errorMessage,
    );
  }
}

class CaptureGuidance {
  const CaptureGuidance({required this.message, required this.emphasizeNumber});

  final String message;
  final bool emphasizeNumber;
}

const defaultCaptureCountdownSeconds = 10;
const allowedCaptureCountdownSeconds = [5, 10, 15];

int normalizeCaptureCountdownSeconds(int? value) {
  if (allowedCaptureCountdownSeconds.contains(value)) {
    return value!;
  }
  return defaultCaptureCountdownSeconds;
}

CaptureGuidance scriptedCaptureGuidance({
  required int secondsRemaining,
  required int countdownSeconds,
}) {
  if (secondsRemaining <= 3) {
    return const CaptureGuidance(message: 'Hold still', emphasizeNumber: true);
  }

  final elapsed = countdownSeconds - secondsRemaining;
  final progress = elapsed / countdownSeconds;

  if (progress < 0.28) {
    return const CaptureGuidance(
      message: 'Step into position',
      emphasizeNumber: false,
    );
  }
  if (progress < 0.52) {
    return const CaptureGuidance(
      message: 'Move to a comfortable distance from the kiosk',
      emphasizeNumber: false,
    );
  }
  return const CaptureGuidance(
    message: 'Face the camera and center yourself',
    emphasizeNumber: false,
  );
}
