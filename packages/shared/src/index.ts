export const SELFX_GARMENT_CATEGORIES = [
  "AUTO",
  "TOP",
  "BOTTOM",
  "ONE_PIECE",
] as const;

export type SelfxGarmentCategory = (typeof SELFX_GARMENT_CATEGORIES)[number];

export const SELFX_GARMENT_INTENTS = [
  "AUTO",
  "TOP",
  "BOTTOM",
  "ONE_PIECE",
  "FULL_OUTFIT",
] as const;

export type SelfxGarmentIntent = (typeof SELFX_GARMENT_INTENTS)[number];

export const SELFX_GARMENT_PHOTO_TYPES = [
  "AUTO",
  "FLAT_LAY",
  "ON_MODEL",
] as const;

export type SelfxGarmentPhotoType = (typeof SELFX_GARMENT_PHOTO_TYPES)[number];

export const SELFX_MODEL_COVERAGES = [
  "UPPER_BODY",
  "LOWER_BODY",
  "FULL_BODY",
  "UNKNOWN",
] as const;

export type SelfxModelCoverage = (typeof SELFX_MODEL_COVERAGES)[number];

export const SELFX_GENERATION_PROFILES = [
  "PERFORMANCE",
  "BALANCED",
  "QUALITY",
] as const;

export type SelfxGenerationProfile = (typeof SELFX_GENERATION_PROFILES)[number];

export const DEFAULT_TRY_ON_GENERATION_PROFILE: SelfxGenerationProfile =
  "BALANCED";

export const SELFX_GARMENT_SOURCES = [
  "DIRECT_UPLOAD",
  "SELFX_CATALOG",
  "SHOPIFY",
  "WOOCOMMERCE",
  "PUBLIC_API",
] as const;

export type SelfxGarmentSource = (typeof SELFX_GARMENT_SOURCES)[number];

export const SELFX_GARMENT_BODY_COVERAGES = [
  "NO_PERSON",
  "UPPER_BODY_MODEL",
  "LOWER_BODY_MODEL",
  "FULL_BODY_MODEL",
  "UNKNOWN",
] as const;

export type SelfxGarmentBodyCoverage =
  (typeof SELFX_GARMENT_BODY_COVERAGES)[number];

export const SELFX_GARMENT_ANALYSIS_REASON_CODES = [
  "POSE_PERSON_NOT_DETECTED",
  "POSE_UPPER_BODY_COVERAGE",
  "POSE_LOWER_BODY_COVERAGE",
  "POSE_FULL_BODY_COVERAGE",
  "POSE_LOW_CONFIDENCE",
  "POSE_ANALYSIS_UNAVAILABLE",
  "PRODUCT_ONLY_AUTO_FALLBACK",
] as const;

export type SelfxGarmentAnalysisReasonCode =
  (typeof SELFX_GARMENT_ANALYSIS_REASON_CODES)[number];

export const SELFX_GENERATION_POLICY_RESOLUTION_SOURCES = [
  "SELFX_CATALOG_METADATA",
  "SHOPIFY_CATALOG_METADATA",
  "WOOCOMMERCE_CATALOG_METADATA",
  "PUBLIC_API_METADATA",
  "BODY_COVERAGE_ANALYSIS",
  "GARMENT_CLASSIFIER",
  "USER_DISAMBIGUATION",
  "AUTO_FALLBACK",
  "INTERNAL_LAB_OVERRIDE",
  "PLATFORM_DEFAULT",
  "ORGANIZATION_POLICY",
  "PLAN_POLICY",
] as const;

export type SelfxGenerationPolicyResolutionSource =
  (typeof SELFX_GENERATION_POLICY_RESOLUTION_SOURCES)[number];

export interface GarmentInputAnalysisResult {
  personPresent: boolean;
  bodyCoverage: SelfxGarmentBodyCoverage;
  ambiguity: boolean;
  suggestedCategory: SelfxGarmentCategory;
  confidence: number;
  reasonCodes: SelfxGarmentAnalysisReasonCode[];
}

export interface PoseLandmarkLike {
  x?: number;
  y?: number;
  z?: number;
  visibility?: number;
  presence?: number;
}

export interface GarmentBodyCoverageAnalysisProfile {
  version: "GARMENT_BODY_COVERAGE_ANALYSIS_PROFILE_V1";
  minLandmarkConfidence: number;
  minAverageConfidence: number;
}

export const GARMENT_BODY_COVERAGE_ANALYSIS_PROFILE_V1: GarmentBodyCoverageAnalysisProfile =
  {
    version: "GARMENT_BODY_COVERAGE_ANALYSIS_PROFILE_V1",
    minLandmarkConfidence: 0.45,
    minAverageConfidence: 0.5,
  };

export interface GenerationPolicyOverrideInput {
  garmentIntent?: SelfxGarmentIntent;
  garmentPhotoType?: SelfxGarmentPhotoType;
  generationProfile?: SelfxGenerationProfile;
}

export interface TrustedGarmentMetadataInput {
  category?: SelfxGarmentCategory;
  photoType?: SelfxGarmentPhotoType;
  categorySource?: SelfxGenerationPolicyResolutionSource;
  photoTypeSource?: SelfxGenerationPolicyResolutionSource;
}

export interface GenerationPolicyResolverInput {
  garmentSource: SelfxGarmentSource;
  trustedMetadata?: TrustedGarmentMetadataInput;
  directUploadAnalysis?: GarmentInputAnalysisResult | null;
  userDisambiguationIntent?: SelfxGarmentIntent | null;
  internalLabOverride?: GenerationPolicyOverrideInput | null;
  organizationProfile?: SelfxGenerationProfile | null;
}

export interface ResolvedGenerationPolicy {
  garmentSource: SelfxGarmentSource;
  garmentIntent: SelfxGarmentIntent;
  category: SelfxGarmentCategory;
  garmentPhotoType: SelfxGarmentPhotoType;
  generationProfile: SelfxGenerationProfile;
  categoryResolutionSource: SelfxGenerationPolicyResolutionSource;
  photoTypeResolutionSource: SelfxGenerationPolicyResolutionSource;
  profileResolutionSource: SelfxGenerationPolicyResolutionSource;
  analysisConfidence: number | null;
  disambiguationRequired: boolean;
  disambiguationResolved: boolean;
  analysisBodyCoverage?: SelfxGarmentBodyCoverage;
  analysisReasonCodes: SelfxGarmentAnalysisReasonCode[];
}

export const SELFX_TRY_ON_RUN_STATUSES = [
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
] as const;

export type SelfxTryOnRunStatus = (typeof SELFX_TRY_ON_RUN_STATUSES)[number];

export const SELFX_TRY_ON_SESSION_STATUSES = [
  "ACTIVE",
  "COMPLETED",
  "EXPIRED",
] as const;

export type SelfxTryOnSessionStatus =
  (typeof SELFX_TRY_ON_SESSION_STATUSES)[number];

export const SELFX_TRY_ON_ASSET_PURPOSES = [
  "PERSON",
  "GARMENT",
  "RESULT",
] as const;

export type SelfxTryOnAssetPurpose =
  (typeof SELFX_TRY_ON_ASSET_PURPOSES)[number];

export const TRY_ON_LAB_ERROR_CODES = {
  imageInvalid: "TRYON_IMAGE_INVALID",
  imageTooSmall: "TRYON_IMAGE_TOO_SMALL",
  multipartInvalid: "TRYON_MULTIPART_INVALID",
  resolutionMetadataInvalid: "TRYON_RESOLUTION_METADATA_INVALID",
  providerUnavailable: "TRYON_PROVIDER_UNAVAILABLE",
  providerRateLimited: "TRYON_PROVIDER_RATE_LIMITED",
  poseNotDetected: "TRYON_POSE_NOT_DETECTED",
  modelImageIncompatibleWithGarment: "MODEL_IMAGE_INCOMPATIBLE_WITH_GARMENT",
  garmentIntentUnresolved: "GARMENT_INTENT_UNRESOLVED",
  moderationRejected: "TRYON_MODERATION_REJECTED",
  failed: "TRYON_FAILED",
  timedOut: "TRYON_TIMED_OUT",
  configurationError: "TRYON_CONFIGURATION_ERROR",
} as const;

export type TryOnLabErrorCode =
  (typeof TRY_ON_LAB_ERROR_CODES)[keyof typeof TRY_ON_LAB_ERROR_CODES];

export type ImageQualityStatus = "PASS" | "WARNING" | "BLOCKED";

export type ImageQualityIssueSeverity = "BLOCKING" | "WARNING";

export const IMAGE_QUALITY_ISSUE_CODES = [
  "IMAGE_INVALID",
  "IMAGE_UNSUPPORTED_FORMAT",
  "IMAGE_TOO_LARGE",
  "IMAGE_DECODE_FAILED",
  "IMAGE_SIGNATURE_INVALID",
  "IMAGE_TOO_BLURRY",
  "IMAGE_TOO_DARK",
  "OVEREXPOSED",
  "IMAGE_LOW_CONTRAST",
  "IMAGE_LOW_RESOLUTION",
  "IMAGE_FRAMING_SUBOPTIMAL",
  "IMAGE_QUALITY_ANALYSIS_UNAVAILABLE",
] as const;

export type ImageQualityIssueCode = (typeof IMAGE_QUALITY_ISSUE_CODES)[number];

export interface ImageQualityIssue {
  code: ImageQualityIssueCode;
  severity: ImageQualityIssueSeverity;
  message: string;
}

export interface ImageQualityMetrics {
  width: number | null;
  height: number | null;
  sharpness: number | null;
  brightness: number | null;
  contrast: number | null;
}

export interface CompleteImageQualityMetrics {
  width: number;
  height: number;
  sharpness: number;
  brightness: number;
  contrast: number;
}

export interface ImageQualityResult {
  status: ImageQualityStatus;
  passed: boolean;
  score: number;
  metrics: ImageQualityMetrics;
  issues: ImageQualityIssue[];
}

export type ImageQualityTarget = "person" | "garment";

export interface ImageQualityThresholds {
  minWidth: number;
  minHeight: number;
  sharpnessWarning: number;
  brightnessMin: number;
  brightnessMax: number;
  contrastMin: number;
  aspectRatioMin: number;
  aspectRatioMax: number;
}

export interface ImageQualityProfile {
  version: "IMAGE_QUALITY_PROFILE_V1";
  person: ImageQualityThresholds;
  garment: ImageQualityThresholds;
}

export const IMAGE_QUALITY_PROFILE_V1: ImageQualityProfile = {
  version: "IMAGE_QUALITY_PROFILE_V1",
  person: {
    minWidth: 384,
    minHeight: 384,
    sharpnessWarning: 28,
    brightnessMin: 42,
    brightnessMax: 220,
    contrastMin: 22,
    aspectRatioMin: 0.45,
    aspectRatioMax: 2.4,
  },
  garment: {
    minWidth: 320,
    minHeight: 320,
    sharpnessWarning: 24,
    brightnessMin: 38,
    brightnessMax: 226,
    contrastMin: 18,
    aspectRatioMin: 0.35,
    aspectRatioMax: 2.8,
  },
};

export function createInvalidImageQualityResult(
  code: Extract<
    ImageQualityIssueCode,
    | "IMAGE_INVALID"
    | "IMAGE_UNSUPPORTED_FORMAT"
    | "IMAGE_TOO_LARGE"
    | "IMAGE_DECODE_FAILED"
    | "IMAGE_SIGNATURE_INVALID"
  >,
  message: string,
): ImageQualityResult {
  return {
    status: "BLOCKED",
    passed: false,
    score: 0,
    metrics: {
      width: null,
      height: null,
      sharpness: null,
      brightness: null,
      contrast: null,
    },
    issues: [{ code, severity: "BLOCKING", message }],
  };
}

export function createUnavailableImageQualityResult(
  metrics: Pick<ImageQualityMetrics, "width" | "height">,
): ImageQualityResult {
  return {
    status: "WARNING",
    passed: true,
    score: 75,
    metrics: {
      width: metrics.width,
      height: metrics.height,
      sharpness: null,
      brightness: null,
      contrast: null,
    },
    issues: [
      {
        code: "IMAGE_QUALITY_ANALYSIS_UNAVAILABLE",
        severity: "WARNING",
        message:
          "Image quality analysis could not be completed. You can upload another image or continue with this image.",
      },
    ],
  };
}

export function normalizeImageQualityResult(
  metrics: CompleteImageQualityMetrics,
  target: ImageQualityTarget,
  profile = IMAGE_QUALITY_PROFILE_V1,
): ImageQualityResult {
  const thresholds = profile[target];
  const issues: ImageQualityIssue[] = [];
  const aspectRatio = metrics.width / Math.max(metrics.height, 1);

  if (
    metrics.width < thresholds.minWidth ||
    metrics.height < thresholds.minHeight
  ) {
    issues.push({
      code: "IMAGE_LOW_RESOLUTION",
      severity: "WARNING",
      message:
        "Image resolution is lower than recommended and may reduce Try-On quality.",
    });
  }

  if (metrics.sharpness < thresholds.sharpnessWarning) {
    issues.push({
      code: "IMAGE_TOO_BLURRY",
      severity: "WARNING",
      message: "Image may be blurry.",
    });
  }

  if (metrics.brightness < thresholds.brightnessMin) {
    issues.push({
      code: "IMAGE_TOO_DARK",
      severity: "WARNING",
      message: "Image may be too dark.",
    });
  }

  if (metrics.brightness > thresholds.brightnessMax) {
    issues.push({
      code: "OVEREXPOSED",
      severity: "WARNING",
      message: "Image may be overexposed.",
    });
  }

  if (metrics.contrast < thresholds.contrastMin) {
    issues.push({
      code: "IMAGE_LOW_CONTRAST",
      severity: "WARNING",
      message: "Image may have low contrast.",
    });
  }

  if (
    aspectRatio < thresholds.aspectRatioMin ||
    aspectRatio > thresholds.aspectRatioMax
  ) {
    issues.push({
      code: "IMAGE_FRAMING_SUBOPTIMAL",
      severity: "WARNING",
      message: "Image framing may be unusual for Try-On.",
    });
  }

  const warningCount = issues.filter(
    (issue) => issue.severity === "WARNING",
  ).length;
  const blockingCount = issues.filter(
    (issue) => issue.severity === "BLOCKING",
  ).length;
  const score = Math.max(
    0,
    Math.min(100, Math.round(100 - warningCount * 12 - blockingCount * 45)),
  );
  const status =
    blockingCount > 0 ? "BLOCKED" : warningCount > 0 ? "WARNING" : "PASS";

  return {
    status,
    passed: blockingCount === 0,
    score,
    metrics,
    issues,
  };
}

export function captureGuidanceForCategory(
  category: SelfxGarmentCategory,
): string {
  switch (category) {
    case "TOP":
      return "Upper body or full body framing is recommended.";
    case "BOTTOM":
      return "Lower body or full body framing is recommended.";
    case "ONE_PIECE":
      return "Full body framing is recommended.";
    case "AUTO":
      return "Full body framing is recommended while category detection is automatic.";
  }
}

export function analyzeGarmentBodyCoverageFromPoseLandmarks(
  poseLandmarks: readonly PoseLandmarkLike[] | null | undefined,
  profile = GARMENT_BODY_COVERAGE_ANALYSIS_PROFILE_V1,
): GarmentInputAnalysisResult {
  if (!poseLandmarks || poseLandmarks.length === 0) {
    return {
      personPresent: false,
      bodyCoverage: "NO_PERSON",
      ambiguity: false,
      suggestedCategory: "AUTO",
      confidence: 0.9,
      reasonCodes: ["POSE_PERSON_NOT_DETECTED", "PRODUCT_ONLY_AUTO_FALLBACK"],
    };
  }

  const shoulders = visiblePairConfidence(poseLandmarks, 11, 12, profile);
  const hips = visiblePairConfidence(poseLandmarks, 23, 24, profile);
  const knees = visiblePairConfidence(poseLandmarks, 25, 26, profile);
  const ankles = visiblePairConfidence(poseLandmarks, 27, 28, profile);
  const visibleRegions = [shoulders, hips, knees, ankles].filter(
    (value): value is number => value !== null,
  );
  const averageConfidence =
    visibleRegions.length > 0
      ? visibleRegions.reduce((sum, value) => sum + value, 0) /
        visibleRegions.length
      : 0;

  if (
    visibleRegions.length === 0 ||
    averageConfidence < profile.minAverageConfidence
  ) {
    return {
      personPresent: false,
      bodyCoverage: "UNKNOWN",
      ambiguity: false,
      suggestedCategory: "AUTO",
      confidence: roundConfidence(averageConfidence),
      reasonCodes: ["POSE_LOW_CONFIDENCE"],
    };
  }

  if (
    shoulders !== null &&
    hips !== null &&
    knees !== null &&
    ankles !== null
  ) {
    return {
      personPresent: true,
      bodyCoverage: "FULL_BODY_MODEL",
      ambiguity: true,
      suggestedCategory: "AUTO",
      confidence: roundConfidence(averageConfidence),
      reasonCodes: ["POSE_FULL_BODY_COVERAGE"],
    };
  }

  if (shoulders !== null && hips !== null && ankles === null) {
    return {
      personPresent: true,
      bodyCoverage: "UPPER_BODY_MODEL",
      ambiguity: false,
      suggestedCategory: "TOP",
      confidence: roundConfidence(averageConfidence),
      reasonCodes: ["POSE_UPPER_BODY_COVERAGE"],
    };
  }

  if (
    hips !== null &&
    knees !== null &&
    ankles !== null &&
    shoulders === null
  ) {
    return {
      personPresent: true,
      bodyCoverage: "LOWER_BODY_MODEL",
      ambiguity: false,
      suggestedCategory: "BOTTOM",
      confidence: roundConfidence(averageConfidence),
      reasonCodes: ["POSE_LOWER_BODY_COVERAGE"],
    };
  }

  return {
    personPresent: true,
    bodyCoverage: "UNKNOWN",
    ambiguity: false,
    suggestedCategory: "AUTO",
    confidence: roundConfidence(averageConfidence),
    reasonCodes: ["POSE_LOW_CONFIDENCE"],
  };
}

export function createUnavailableGarmentInputAnalysisResult(): GarmentInputAnalysisResult {
  return {
    personPresent: false,
    bodyCoverage: "UNKNOWN",
    ambiguity: false,
    suggestedCategory: "AUTO",
    confidence: 0,
    reasonCodes: ["POSE_ANALYSIS_UNAVAILABLE"],
  };
}

export function resolveGenerationPolicy(
  input: GenerationPolicyResolverInput,
): ResolvedGenerationPolicy {
  const override = input.internalLabOverride;
  const metadata = input.trustedMetadata;
  const analysis = input.directUploadAnalysis ?? null;
  const profile =
    override?.generationProfile ??
    input.organizationProfile ??
    DEFAULT_TRY_ON_GENERATION_PROFILE;
  const profileResolutionSource: SelfxGenerationPolicyResolutionSource =
    override?.generationProfile
      ? "INTERNAL_LAB_OVERRIDE"
      : input.organizationProfile
        ? "ORGANIZATION_POLICY"
        : "PLATFORM_DEFAULT";

  let garmentIntent: SelfxGarmentIntent = "AUTO";
  let category: SelfxGarmentCategory = "AUTO";
  let garmentPhotoType: SelfxGarmentPhotoType = "AUTO";
  let categoryResolutionSource: SelfxGenerationPolicyResolutionSource =
    "AUTO_FALLBACK";
  let photoTypeResolutionSource: SelfxGenerationPolicyResolutionSource =
    "AUTO_FALLBACK";
  let disambiguationRequired = false;
  let disambiguationResolved = false;

  if (metadata?.category) {
    category = metadata.category;
    garmentIntent = metadata.category;
    categoryResolutionSource =
      metadata.categorySource ?? trustedMetadataSourceFor(input.garmentSource);
  }

  if (metadata?.photoType) {
    garmentPhotoType = metadata.photoType;
    photoTypeResolutionSource =
      metadata.photoTypeSource ?? trustedMetadataSourceFor(input.garmentSource);
  }

  if (input.garmentSource === "DIRECT_UPLOAD" && !metadata?.category) {
    if (input.userDisambiguationIntent) {
      garmentIntent = input.userDisambiguationIntent;
      category = categoryFromGarmentIntent(input.userDisambiguationIntent);
      categoryResolutionSource = "USER_DISAMBIGUATION";
      disambiguationResolved = true;
    } else if (analysis?.bodyCoverage === "UPPER_BODY_MODEL") {
      garmentIntent = "TOP";
      category = "TOP";
      categoryResolutionSource = "BODY_COVERAGE_ANALYSIS";
    } else if (analysis?.bodyCoverage === "LOWER_BODY_MODEL") {
      garmentIntent = "BOTTOM";
      category = "BOTTOM";
      categoryResolutionSource = "BODY_COVERAGE_ANALYSIS";
    } else if (analysis?.bodyCoverage === "FULL_BODY_MODEL") {
      disambiguationRequired = true;
    }
  }

  if (input.garmentSource === "DIRECT_UPLOAD" && !metadata?.photoType) {
    if (analysis?.personPresent) {
      garmentPhotoType = "ON_MODEL";
      photoTypeResolutionSource = "BODY_COVERAGE_ANALYSIS";
    } else {
      garmentPhotoType = "AUTO";
      photoTypeResolutionSource = "AUTO_FALLBACK";
    }
  }

  if (override?.garmentIntent) {
    garmentIntent = override.garmentIntent;
    category = categoryFromGarmentIntent(override.garmentIntent);
    categoryResolutionSource = "INTERNAL_LAB_OVERRIDE";
    disambiguationRequired = false;
    disambiguationResolved = false;
  }

  if (override?.garmentPhotoType) {
    garmentPhotoType = override.garmentPhotoType;
    photoTypeResolutionSource = "INTERNAL_LAB_OVERRIDE";
  }

  return {
    garmentSource: input.garmentSource,
    garmentIntent,
    category,
    garmentPhotoType,
    generationProfile: profile,
    categoryResolutionSource,
    photoTypeResolutionSource,
    profileResolutionSource,
    analysisConfidence: isAnalysisUnavailable(analysis)
      ? null
      : (analysis?.confidence ?? null),
    disambiguationRequired,
    disambiguationResolved,
    analysisBodyCoverage: analysis?.bodyCoverage,
    analysisReasonCodes: analysis?.reasonCodes ?? [],
  };
}

export function categoryFromGarmentIntent(
  intent: SelfxGarmentIntent,
): SelfxGarmentCategory {
  switch (intent) {
    case "TOP":
      return "TOP";
    case "BOTTOM":
      return "BOTTOM";
    case "ONE_PIECE":
      return "ONE_PIECE";
    case "AUTO":
    case "FULL_OUTFIT":
      return "AUTO";
  }
}

export function isModelCoverageCompatibleWithGarment(
  coverage: SelfxModelCoverage,
  intent: SelfxGarmentIntent,
): boolean {
  switch (coverage) {
    case "UPPER_BODY":
      return intent === "TOP";
    case "LOWER_BODY":
      return intent === "BOTTOM";
    case "FULL_BODY":
      return (
        intent === "AUTO" ||
        intent === "TOP" ||
        intent === "BOTTOM" ||
        intent === "FULL_OUTFIT" ||
        intent === "ONE_PIECE"
      );
    case "UNKNOWN":
      return false;
  }
}

function trustedMetadataSourceFor(
  source: SelfxGarmentSource,
): SelfxGenerationPolicyResolutionSource {
  switch (source) {
    case "SELFX_CATALOG":
      return "SELFX_CATALOG_METADATA";
    case "SHOPIFY":
      return "SHOPIFY_CATALOG_METADATA";
    case "WOOCOMMERCE":
      return "WOOCOMMERCE_CATALOG_METADATA";
    case "PUBLIC_API":
      return "PUBLIC_API_METADATA";
    case "DIRECT_UPLOAD":
      return "AUTO_FALLBACK";
  }
}

function isAnalysisUnavailable(
  analysis: GarmentInputAnalysisResult | null,
): boolean {
  return (
    !analysis || analysis.reasonCodes.includes("POSE_ANALYSIS_UNAVAILABLE")
  );
}

function visiblePairConfidence(
  landmarks: readonly PoseLandmarkLike[],
  leftIndex: number,
  rightIndex: number,
  profile: GarmentBodyCoverageAnalysisProfile,
): number | null {
  const values = [landmarks[leftIndex], landmarks[rightIndex]]
    .map((landmark) => landmarkConfidence(landmark))
    .filter((value): value is number => value !== null);
  if (values.length === 0) {
    return null;
  }

  const confidence =
    values.reduce((sum, value) => sum + value, 0) / values.length;
  return confidence >= profile.minLandmarkConfidence ? confidence : null;
}

function landmarkConfidence(
  landmark: PoseLandmarkLike | undefined,
): number | null {
  if (!landmark) {
    return null;
  }
  const confidence = Math.min(landmark.visibility ?? 1, landmark.presence ?? 1);
  return Number.isFinite(confidence) ? confidence : null;
}

function roundConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

export const SELFX_TRY_ON_CHANNELS = [
  "WEB_LAB",
  "WEB_CUSTOMER",
  "KIOSK",
  "MOBILE",
  "SHOPIFY",
  "WOOCOMMERCE",
  "PUBLIC_API",
] as const;

export type SelfxTryOnChannel = (typeof SELFX_TRY_ON_CHANNELS)[number];

export interface SelfxTryOnTelemetry {
  selfxRunId: string;
  channel: SelfxTryOnChannel;
  provider: string;
  providerDisplayName: string;
  model: string;
  profile: SelfxGenerationProfile;
  garmentSource: SelfxGarmentSource;
  garmentIntent: SelfxGarmentIntent;
  garmentCategory: SelfxGarmentCategory;
  garmentPhotoType: SelfxGarmentPhotoType;
  categoryResolutionSource: SelfxGenerationPolicyResolutionSource;
  photoTypeResolutionSource: SelfxGenerationPolicyResolutionSource;
  profileResolutionSource: SelfxGenerationPolicyResolutionSource;
  analysisConfidence?: number;
  disambiguationRequired: boolean;
  disambiguationResolved: boolean;
  garmentAnalysisBodyCoverage?: SelfxGarmentBodyCoverage;
  garmentAnalysisReasonCodes: SelfxGarmentAnalysisReasonCode[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
  status: SelfxTryOnRunStatus;
  failureCode?: TryOnLabErrorCode;
  qualityWarningCodes: ImageQualityIssueCode[];
  qualityOverrideAccepted: boolean;
  providerCreditUsage?: number;
  estimatedProviderCostCents?: number;
  estimatedProviderCostCurrency?: string;
}

export interface TryOnLabRunResponse {
  id: string;
  status: SelfxTryOnRunStatus;
  garmentSource: SelfxGarmentSource;
  garmentIntent: SelfxGarmentIntent;
  category: SelfxGarmentCategory;
  garmentPhotoType: SelfxGarmentPhotoType;
  generationProfile: SelfxGenerationProfile;
  createdAt: string;
  updatedAt: string;
  resultImage?: string;
  errorCode?: TryOnLabErrorCode;
  errorMessage?: string;
  telemetry: SelfxTryOnTelemetry;
}
