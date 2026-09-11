import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export const integrationCatalogSyncModes = ["INCREMENTAL", "FULL"] as const;
export type IntegrationCatalogSyncMode =
  (typeof integrationCatalogSyncModes)[number];

export const integrationCatalogProductStatuses = [
  "ACTIVE",
  "DRAFT",
  "ARCHIVED",
] as const;
export type IntegrationCatalogProductStatus =
  (typeof integrationCatalogProductStatuses)[number];

export class IntegrationCatalogVariantInputDto {
  @ApiProperty()
  @IsString()
  @Length(1, 180)
  externalVariantId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  priceAmountCents?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  priceCurrency?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["https", "http"] })
  @MaxLength(2048)
  imageUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  available?: boolean;
}

export class IntegrationCatalogProductInputDto {
  @ApiProperty()
  @IsString()
  @Length(1, 180)
  externalProductId!: string;

  @ApiPropertyOptional({
    description: "Required unless status is ARCHIVED.",
  })
  @ValidateIf(
    (input: IntegrationCatalogProductInputDto) => input.status !== "ARCHIVED",
  )
  @IsString()
  @Length(1, 180)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(220)
  handle?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiProperty({ enum: integrationCatalogProductStatuses })
  @IsIn(integrationCatalogProductStatuses)
  status!: IntegrationCatalogProductStatus;

  @ApiPropertyOptional({
    description:
      "Optional commerce-owned VTO eligibility signal. Omitted values preserve existing SelfX-owned eligibility on updates.",
  })
  @IsOptional()
  @IsBoolean()
  vtoEnabled?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["https", "http"] })
  @MaxLength(2048)
  productUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["https", "http"] })
  @MaxLength(2048)
  featuredImageUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  priceAmountCents?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  priceCurrency?: string | null;

  @ApiProperty()
  @IsISO8601()
  sourceUpdatedAt!: string;

  @ApiPropertyOptional({ type: [IntegrationCatalogVariantInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2048)
  @ValidateNested({ each: true })
  @Type(() => IntegrationCatalogVariantInputDto)
  variants?: IntegrationCatalogVariantInputDto[];
}

export class IntegrationCatalogSyncInputDto {
  @ApiProperty({ enum: integrationCatalogSyncModes })
  @IsIn(integrationCatalogSyncModes)
  mode!: IntegrationCatalogSyncMode;

  @ApiPropertyOptional({
    description:
      "Required for FULL syncs so newer commerce updates are not archived by an older snapshot.",
  })
  @ValidateIf(
    (input: IntegrationCatalogSyncInputDto, value: unknown) =>
      input.mode === "FULL" || value !== undefined,
  )
  @IsISO8601()
  sourceSnapshotAt?: string;

  @ApiPropertyOptional({
    description:
      "Required for FULL syncs. Set true only on the final batch to archive products not seen in the completed snapshot.",
  })
  @ValidateIf(
    (input: IntegrationCatalogSyncInputDto, value: unknown) =>
      input.mode === "FULL" || value !== undefined,
  )
  @IsBoolean()
  finalize?: boolean;

  @ApiProperty({ type: [IntegrationCatalogProductInputDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => IntegrationCatalogProductInputDto)
  products!: IntegrationCatalogProductInputDto[];
}

export class IntegrationCatalogSyncResponseDto {
  @ApiProperty()
  direction!: "COMMERCE_TO_SELFX";

  @ApiProperty()
  sourceOfTruth!: "COMMERCE_PLATFORM";

  @ApiProperty()
  finalized!: boolean;

  @ApiProperty()
  created!: number;

  @ApiProperty()
  updated!: number;

  @ApiProperty()
  archived!: number;

  @ApiProperty()
  ignoredAsStale!: number;

  @ApiProperty()
  skippedWithoutImage!: number;

  @ApiProperty()
  processedAt!: string;
}
