// External services and their configuration belong in backend diagnostics.
// Keep stable SelfX error codes and actionable image guidance in client payloads.
export function publicTryOnErrorMessage(
  code: string | null | undefined,
  message: string | null | undefined,
): string | undefined {
  if (!message) return undefined;
  if (
    !code?.includes("PROVIDER") &&
    !/\bfashn\b|perfect[\s_-]*corp|\bgoogle\b|\bvertex\b|\bgemini\b|\bopenai\b|provider|prediction|virtual-try-on-\d+|tryon-v\d|GOOGLE_|FASHN_|OPENAI_|PERFECT_CORP_|aiplatform\.googleapis|makeupar\.com/i.test(
      message,
    )
  )
    return message;
  if (code === "TRYON_PROVIDER_RATE_LIMITED" || code === "RATE_LIMITED")
    return "SelfX Try-On is busy. Please try again shortly.";
  if (
    code === "TRYON_CONFIGURATION_ERROR" ||
    code === "CONFIGURATION_ERROR" ||
    code === "PROVIDER_AUTH_FAILED" ||
    code === "TRYON_PROVIDER_UNAVAILABLE" ||
    code === "PROVIDER_UNAVAILABLE"
  )
    return "SelfX Try-On is temporarily unavailable. Please try again later.";
  if (code === "TRYON_IMAGE_INVALID" || code === "INVALID_IMAGE")
    return "This image could not be used. Upload a valid JPEG, PNG or WebP image and try again.";
  return "SelfX could not complete this Try-On. Please try again.";
}
