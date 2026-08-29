import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

import {
  SELFX_GARMENT_CATEGORIES,
  SELFX_GARMENT_INTENTS,
  SELFX_GARMENT_PHOTO_TYPES,
  SELFX_GENERATION_PROFILES,
  SELFX_MODEL_COVERAGES,
  type SelfxGarmentCategory,
  type SelfxGarmentIntent,
  type SelfxGarmentPhotoType,
  type SelfxGenerationProfile,
  type SelfxModelCoverage,
  type SelfxTryOnRunStatus,
  type TryOnLabErrorCode,
} from "@selfx/shared";

export class CreatePublicApiTryOnDto {
  @ApiProperty({
    description:
      "Client-supplied idempotency key. Reusing it with the same API key returns the original run.",
    example: "order-1001-look-1",
  })
  @IsString()
  @MaxLength(160)
  clientRequestId!: string;

  @ApiProperty({ example: "0198a9b3-d0bc-7000-8000-000000000101" })
  @IsUUID()
  sessionId!: string;

  @ApiPropertyOptional({
    description:
      "Person asset ID. Omit to use the current person image for the session.",
    example: "0198a9b3-d0bc-7000-8000-000000000201",
  })
  @IsOptional()
  @IsUUID()
  personAssetId?: string;

  @ApiProperty({ example: "0198a9b3-d0bc-7000-8000-000000000202" })
  @IsUUID()
  garmentAssetId!: string;

  @ApiPropertyOptional({ enum: SELFX_GARMENT_INTENTS, example: "TOP" })
  @IsOptional()
  @IsIn(SELFX_GARMENT_INTENTS)
  garmentIntent?: SelfxGarmentIntent;

  @ApiPropertyOptional({ enum: SELFX_GARMENT_CATEGORIES, example: "TOP" })
  @IsOptional()
  @IsIn(SELFX_GARMENT_CATEGORIES)
  category?: SelfxGarmentCategory;

  @ApiPropertyOptional({ enum: SELFX_GARMENT_PHOTO_TYPES, example: "FLAT_LAY" })
  @IsOptional()
  @IsIn(SELFX_GARMENT_PHOTO_TYPES)
  garmentPhotoType?: SelfxGarmentPhotoType;

  @ApiPropertyOptional({ enum: SELFX_GENERATION_PROFILES, example: "BALANCED" })
  @IsOptional()
  @IsIn(SELFX_GENERATION_PROFILES)
  generationProfile?: SelfxGenerationProfile;

  @ApiPropertyOptional({ enum: SELFX_MODEL_COVERAGES, example: "UPPER_BODY" })
  @IsOptional()
  @IsIn(SELFX_MODEL_COVERAGES)
  modelCoverage?: SelfxModelCoverage;
}

export class PublicApiTryOnResultDto {
  @ApiProperty({ example: "0198a9b3-d0bc-7000-8000-000000000401" })
  assetId!: string;

  @ApiProperty({
    example:
      "https://api.selfx.example/api/v1/public/try-ons/0198a9b3-d0bc-7000-8000-000000000301/download",
  })
  readUrl!: string;

  @ApiPropertyOptional({ example: "image/png" })
  contentType?: string;

  @ApiPropertyOptional({ example: 312420 })
  sizeBytes?: number;

  @ApiPropertyOptional({ example: 1080 })
  width?: number;

  @ApiPropertyOptional({ example: 1440 })
  height?: number;

  @ApiProperty({ example: "2026-09-05T12:02:18.000Z" })
  expiresAt!: string;
}

export class PublicApiTryOnRunResponseDto {
  @ApiProperty({ example: "0198a9b3-d0bc-7000-8000-000000000301" })
  id!: string;

  @ApiProperty({
    enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"],
    example: "COMPLETED",
  })
  status!: SelfxTryOnRunStatus;

  @ApiProperty({ example: "0198a9b3-d0bc-7000-8000-000000000101" })
  sessionId!: string;

  @ApiPropertyOptional({ example: "0198a9b3-d0bc-7000-8000-000000000201" })
  personAssetId?: string;

  @ApiPropertyOptional({ example: "0198a9b3-d0bc-7000-8000-000000000202" })
  garmentAssetId?: string;

  @ApiProperty({ example: "2026-08-29T12:02:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-08-29T12:02:18.000Z" })
  updatedAt!: string;

  @ApiPropertyOptional({ type: PublicApiTryOnResultDto })
  result?: PublicApiTryOnResultDto;

  @ApiPropertyOptional({ example: "TRYON_FAILED" })
  errorCode?: TryOnLabErrorCode;

  @ApiPropertyOptional({ example: "Try-On generation failed." })
  errorMessage?: string;
}
