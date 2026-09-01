import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { SELFX_CATALOG_SOURCES, type SelfxCatalogSource } from "@selfx/shared";

export class PublicApiUsageQueryDto {
  @ApiPropertyOptional({
    enum: ["today", "7d", "30d", "90d", "custom"],
    example: "7d",
  })
  @IsOptional()
  @IsIn(["today", "7d", "30d", "90d", "custom"])
  range?: "today" | "7d" | "30d" | "90d" | "custom";

  @ApiPropertyOptional({ example: "2026-08-22T12:00:00.000Z" })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: "2026-08-29T12:00:00.000Z" })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;

  @ApiPropertyOptional({ enum: SELFX_CATALOG_SOURCES, example: "SHOPIFY" })
  @IsOptional()
  @IsIn(SELFX_CATALOG_SOURCES)
  catalogSource?: SelfxCatalogSource;

  @ApiPropertyOptional({
    example: "LINEN-BLUE",
    description:
      "Searches product name, SKU, external product ID and external variant ID.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  productQuery?: string;
}

export class PublicApiUsageRangeDto {
  @ApiProperty({ enum: ["today", "7d", "30d", "90d", "custom"], example: "7d" })
  preset!: "today" | "7d" | "30d" | "90d" | "custom";

  @ApiProperty({ example: "2026-08-22T12:00:00.000Z" })
  from!: string;

  @ApiProperty({ example: "2026-08-29T12:00:00.000Z" })
  to!: string;
}

export class PublicApiUsageStoreDto {
  @ApiProperty({ example: "0198a9b3-d0bc-7000-8000-000000000001" })
  id!: string;

  @ApiProperty({ example: "Demo Store" })
  name!: string;
}

export class PublicApiUsageTotalsDto {
  @ApiProperty({ example: 42 })
  runsCreated!: number;

  @ApiProperty({ example: 1 })
  queuedRuns!: number;

  @ApiProperty({ example: 2 })
  processingRuns!: number;

  @ApiProperty({ example: 37 })
  completedRuns!: number;

  @ApiProperty({ example: 2 })
  failedRuns!: number;

  @ApiProperty({ example: 37 })
  generatedLooks!: number;

  @ApiProperty({ example: 8 })
  downloadsCompleted!: number;
}

export class PublicApiProviderUsageRowDto {
  @ApiProperty({ example: "fashn" })
  provider!: string;

  @ApiPropertyOptional({ nullable: true, example: "tryon-v1.6" })
  providerModel!: string | null;

  @ApiProperty({ example: 42 })
  runsCreated!: number;

  @ApiProperty({ example: 37 })
  completedRuns!: number;

  @ApiProperty({ example: 2 })
  failedRuns!: number;
}

export class PublicApiCatalogSourceUsageRowDto {
  @ApiPropertyOptional({ enum: SELFX_CATALOG_SOURCES, nullable: true })
  catalogSource!: SelfxCatalogSource | null;

  @ApiProperty({ example: 24 })
  runsCreated!: number;

  @ApiProperty({ example: 20 })
  completedRuns!: number;

  @ApiProperty({ example: 1 })
  failedRuns!: number;

  @ApiProperty({ example: 20 })
  generatedLooks!: number;

  @ApiProperty({ example: 6 })
  downloadsCompleted!: number;
}

export class PublicApiProductUsageRowDto {
  @ApiPropertyOptional({ nullable: true })
  selfxProductId?: string;

  @ApiPropertyOptional({ enum: SELFX_CATALOG_SOURCES, nullable: true })
  catalogSource?: SelfxCatalogSource;

  @ApiPropertyOptional({ example: "gid://shopify/Product/1001" })
  externalProductId?: string;

  @ApiPropertyOptional({ example: "gid://shopify/ProductVariant/2001" })
  externalVariantId?: string;

  @ApiPropertyOptional({ example: "LINEN-BLUE-XL" })
  sku?: string;

  @ApiPropertyOptional({ example: "Blue Linen Shirt" })
  productName?: string;

  @ApiPropertyOptional({ example: "2499.00" })
  price?: string;

  @ApiPropertyOptional({ example: "INR" })
  currency?: string;

  @ApiProperty({ example: 12 })
  runsCreated!: number;

  @ApiProperty({ example: 11 })
  completedRuns!: number;

  @ApiProperty({ example: 1 })
  failedRuns!: number;

  @ApiProperty({ example: 11 })
  generatedLooks!: number;

  @ApiProperty({ example: 4 })
  downloadsCompleted!: number;
}

export class PublicApiUsageResponseDto {
  @ApiProperty({ type: PublicApiUsageRangeDto })
  range!: PublicApiUsageRangeDto;

  @ApiProperty({ type: PublicApiUsageStoreDto })
  store!: PublicApiUsageStoreDto;

  @ApiProperty({ example: "selfx_test_abcd1234" })
  keyPrefix!: string;

  @ApiProperty({ type: PublicApiUsageTotalsDto })
  totals!: PublicApiUsageTotalsDto;

  @ApiProperty({ type: [PublicApiProviderUsageRowDto] })
  providerUsage!: PublicApiProviderUsageRowDto[];

  @ApiProperty({ type: [PublicApiCatalogSourceUsageRowDto] })
  catalogSourceUsage!: PublicApiCatalogSourceUsageRowDto[];

  @ApiProperty({ type: [PublicApiProductUsageRowDto] })
  productUsage!: PublicApiProductUsageRowDto[];
}
