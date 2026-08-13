import {
  createInvalidImageQualityResult,
  type ImageQualityResult,
  type ImageQualityTarget,
} from "@selfx/shared";

export const TRY_ON_LAB_BROWSER_ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const TRY_ON_LAB_BROWSER_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface ImageQualityAnalyzer {
  analyze(file: File, target: ImageQualityTarget): Promise<ImageQualityResult>;
}

export function validateBrowserImageFile(
  file: File,
): ImageQualityResult | null {
  if (
    !(TRY_ON_LAB_BROWSER_ACCEPTED_IMAGE_TYPES as readonly string[]).includes(
      file.type,
    )
  ) {
    return createInvalidImageQualityResult(
      "IMAGE_UNSUPPORTED_FORMAT",
      "Only JPEG, PNG and WebP images are supported.",
    );
  }

  if (file.size > TRY_ON_LAB_BROWSER_MAX_IMAGE_BYTES) {
    return createInvalidImageQualityResult(
      "IMAGE_TOO_LARGE",
      "Image exceeds the 8 MB Try-On Lab limit.",
    );
  }

  return null;
}

export function qualityResultHasBlockingIssue(
  result: ImageQualityResult | null,
): boolean {
  return (
    !result || result.issues.some((issue) => issue.severity === "BLOCKING")
  );
}
