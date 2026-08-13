import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import {
  IMAGE_QUALITY_ISSUE_CODES,
  SELFX_GARMENT_ANALYSIS_REASON_CODES,
  SELFX_GARMENT_BODY_COVERAGES,
  SELFX_GARMENT_CATEGORIES,
  SELFX_GARMENT_PHOTO_TYPES,
  SELFX_GARMENT_INTENTS,
  SELFX_GARMENT_SOURCES,
  SELFX_GENERATION_PROFILES,
  SELFX_GENERATION_POLICY_RESOLUTION_SOURCES,
  SELFX_TRY_ON_CHANNELS,
  SELFX_TRY_ON_RUN_STATUSES,
  type SelfxGarmentAnalysisReasonCode,
  type SelfxGarmentBodyCoverage,
  type ImageQualityIssueCode,
  type SelfxGarmentCategory,
  type SelfxGarmentIntent,
  type SelfxGarmentPhotoType,
  type SelfxGarmentSource,
  type SelfxGenerationProfile,
  type SelfxGenerationPolicyResolutionSource,
  type SelfxTryOnChannel,
  type SelfxTryOnRunStatus,
  type TryOnLabErrorCode,
} from "@selfx/shared";

export class TryOnLabTelemetryDto {
  @ApiProperty()
  selfxRunId!: string;

  @ApiProperty({ enum: SELFX_TRY_ON_CHANNELS })
  channel!: SelfxTryOnChannel;

  @ApiProperty()
  provider!: string;

  @ApiProperty()
  providerDisplayName!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ enum: SELFX_GENERATION_PROFILES })
  profile!: SelfxGenerationProfile;

  @ApiProperty({ enum: SELFX_GARMENT_SOURCES })
  garmentSource!: SelfxGarmentSource;

  @ApiProperty({ enum: SELFX_GARMENT_INTENTS })
  garmentIntent!: SelfxGarmentIntent;

  @ApiProperty({ enum: SELFX_GARMENT_CATEGORIES })
  garmentCategory!: SelfxGarmentCategory;

  @ApiProperty({ enum: SELFX_GARMENT_PHOTO_TYPES })
  garmentPhotoType!: SelfxGarmentPhotoType;

  @ApiProperty({ enum: SELFX_GENERATION_POLICY_RESOLUTION_SOURCES })
  categoryResolutionSource!: SelfxGenerationPolicyResolutionSource;

  @ApiProperty({ enum: SELFX_GENERATION_POLICY_RESOLUTION_SOURCES })
  photoTypeResolutionSource!: SelfxGenerationPolicyResolutionSource;

  @ApiProperty({ enum: SELFX_GENERATION_POLICY_RESOLUTION_SOURCES })
  profileResolutionSource!: SelfxGenerationPolicyResolutionSource;

  @ApiPropertyOptional()
  analysisConfidence?: number;

  @ApiProperty()
  disambiguationRequired!: boolean;

  @ApiProperty()
  disambiguationResolved!: boolean;

  @ApiPropertyOptional({ enum: SELFX_GARMENT_BODY_COVERAGES })
  garmentAnalysisBodyCoverage?: SelfxGarmentBodyCoverage;

  @ApiProperty({ enum: SELFX_GARMENT_ANALYSIS_REASON_CODES, isArray: true })
  garmentAnalysisReasonCodes!: SelfxGarmentAnalysisReasonCode[];

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional()
  startedAt?: string;

  @ApiPropertyOptional()
  completedAt?: string;

  @ApiPropertyOptional()
  elapsedMs?: number;

  @ApiProperty({ enum: SELFX_TRY_ON_RUN_STATUSES })
  status!: SelfxTryOnRunStatus;

  @ApiPropertyOptional()
  failureCode?: TryOnLabErrorCode;

  @ApiProperty({ enum: IMAGE_QUALITY_ISSUE_CODES, isArray: true })
  qualityWarningCodes!: ImageQualityIssueCode[];

  @ApiProperty()
  qualityOverrideAccepted!: boolean;

  @ApiPropertyOptional()
  providerCreditUsage?: number;

  @ApiPropertyOptional()
  estimatedProviderCostCents?: number;

  @ApiPropertyOptional()
  estimatedProviderCostCurrency?: string;
}

export class TryOnLabRunResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: SELFX_TRY_ON_RUN_STATUSES })
  status!: SelfxTryOnRunStatus;

  @ApiProperty({ enum: SELFX_GARMENT_SOURCES })
  garmentSource!: SelfxGarmentSource;

  @ApiProperty({ enum: SELFX_GARMENT_INTENTS })
  garmentIntent!: SelfxGarmentIntent;

  @ApiProperty({ enum: SELFX_GARMENT_CATEGORIES })
  category!: SelfxGarmentCategory;

  @ApiProperty({ enum: SELFX_GARMENT_PHOTO_TYPES })
  garmentPhotoType!: SelfxGarmentPhotoType;

  @ApiProperty({ enum: SELFX_GENERATION_PROFILES })
  generationProfile!: SelfxGenerationProfile;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiPropertyOptional({
    description:
      "Ephemeral development-lab output. Base64 is returned only when the provider supplies it.",
  })
  resultImage?: string;

  @ApiPropertyOptional()
  errorCode?: TryOnLabErrorCode;

  @ApiPropertyOptional()
  errorMessage?: string;

  @ApiProperty({ type: TryOnLabTelemetryDto })
  telemetry!: TryOnLabTelemetryDto;
}
