import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from "class-validator";

import { SELFX_CATALOG_SOURCES, type SelfxCatalogSource } from "@selfx/shared";

export const usageChannelOptions = ["ALL", "KIOSK", "PUBLIC_API"] as const;
export type UsageChannelFilter = (typeof usageChannelOptions)[number];

export class UsageSummaryQueryDto {
  @ApiPropertyOptional({ enum: ["today", "7d", "30d", "90d", "custom"] })
  @IsOptional()
  @IsIn(["today", "7d", "30d", "90d", "custom"])
  range?: "today" | "7d" | "30d" | "90d" | "custom";

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  kioskDeviceId?: string;

  @ApiPropertyOptional({ enum: usageChannelOptions })
  @IsOptional()
  @IsIn(usageChannelOptions)
  channel?: UsageChannelFilter;

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class UsageRangeDto {
  @ApiProperty({ enum: ["today", "7d", "30d", "90d", "custom"] })
  preset!: "today" | "7d" | "30d" | "90d" | "custom";

  @ApiProperty()
  from!: string;

  @ApiProperty()
  to!: string;
}

export class UsageScopeDto {
  @ApiProperty({ enum: ["PLATFORM", "STORE"] })
  mode!: "PLATFORM" | "STORE";

  @ApiPropertyOptional()
  storeId?: string;

  @ApiPropertyOptional()
  storeName?: string;
}

export class UsageTotalsDto {
  @ApiProperty()
  sessionsStarted!: number;

  @ApiProperty()
  sessionsCompleted!: number;

  @ApiProperty()
  sessionsIdleExpired!: number;

  @ApiProperty()
  runsCreated!: number;

  @ApiProperty()
  queuedRuns!: number;

  @ApiProperty()
  processingRuns!: number;

  @ApiProperty()
  completedRuns!: number;

  @ApiProperty()
  failedRuns!: number;

  @ApiProperty()
  tryOnsGenerated!: number;

  @ApiProperty()
  downloadsCompleted!: number;

  @ApiProperty()
  downloadRate!: number;

  @ApiProperty()
  successRate!: number;
}

export class UsageProviderRowDto {
  @ApiProperty()
  provider!: string;

  @ApiPropertyOptional({ nullable: true })
  providerModel!: string | null;

  @ApiProperty()
  runsCreated!: number;

  @ApiProperty()
  completedRuns!: number;

  @ApiProperty()
  failedRuns!: number;

  @ApiProperty()
  tryOnsGenerated!: number;

  @ApiProperty()
  downloadsCompleted!: number;
}

export class UsageStoreRowDto {
  @ApiPropertyOptional({ nullable: true })
  storeId!: string | null;

  @ApiProperty()
  storeName!: string;

  @ApiProperty()
  sessionsStarted!: number;

  @ApiProperty()
  runsCreated!: number;

  @ApiProperty()
  completedRuns!: number;

  @ApiProperty()
  failedRuns!: number;

  @ApiProperty()
  tryOnsGenerated!: number;

  @ApiProperty()
  downloadsCompleted!: number;
}

export class UsageKioskRowDto {
  @ApiProperty()
  kioskDeviceId!: string;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional({ nullable: true })
  storeId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  storeName!: string | null;

  @ApiProperty()
  sessionsStarted!: number;

  @ApiProperty()
  runsCreated!: number;

  @ApiProperty()
  completedRuns!: number;

  @ApiProperty()
  failedRuns!: number;

  @ApiProperty()
  tryOnsGenerated!: number;

  @ApiProperty()
  downloadsCompleted!: number;
}

export class UsageProductRowDto {
  @ApiPropertyOptional({ nullable: true })
  productId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  category?: string;

  @ApiPropertyOptional({ enum: SELFX_CATALOG_SOURCES, nullable: true })
  catalogSource?: SelfxCatalogSource | null;

  @ApiPropertyOptional()
  externalProductId?: string;

  @ApiPropertyOptional()
  externalVariantId?: string;

  @ApiPropertyOptional()
  sku?: string;

  @ApiProperty()
  runsCreated!: number;

  @ApiProperty()
  completedRuns!: number;

  @ApiProperty()
  failedRuns!: number;

  @ApiProperty()
  tryOnsGenerated!: number;

  @ApiProperty()
  downloadsCompleted!: number;
}

export class UsageChannelRowDto {
  @ApiProperty({ enum: ["KIOSK", "PUBLIC_API"] })
  channel!: "KIOSK" | "PUBLIC_API";

  @ApiProperty()
  sessionsStarted!: number;

  @ApiProperty()
  runsCreated!: number;

  @ApiProperty()
  completedRuns!: number;

  @ApiProperty()
  failedRuns!: number;

  @ApiProperty()
  tryOnsGenerated!: number;

  @ApiProperty()
  downloadsCompleted!: number;
}

export class UsageCategoryRowDto {
  @ApiProperty()
  category!: string;

  @ApiProperty()
  runsCreated!: number;

  @ApiProperty()
  completedRuns!: number;

  @ApiProperty()
  failedRuns!: number;

  @ApiProperty()
  tryOnsGenerated!: number;

  @ApiProperty()
  downloadsCompleted!: number;
}

export class UsageDailyRowDto {
  @ApiProperty({ example: "2026-09-01" })
  date!: string;

  @ApiProperty()
  sessionsStarted!: number;

  @ApiProperty()
  runsCreated!: number;

  @ApiProperty()
  completedRuns!: number;

  @ApiProperty()
  failedRuns!: number;

  @ApiProperty()
  tryOnsGenerated!: number;

  @ApiProperty()
  downloadsCompleted!: number;
}

export class UsageSummaryResponseDto {
  @ApiProperty({ type: UsageRangeDto })
  range!: UsageRangeDto;

  @ApiProperty({ type: UsageScopeDto })
  scope!: UsageScopeDto;

  @ApiProperty({ type: UsageTotalsDto })
  totals!: UsageTotalsDto;

  @ApiProperty({ type: [UsageProviderRowDto] })
  providerUsage!: UsageProviderRowDto[];

  @ApiProperty({ type: [UsageStoreRowDto] })
  stores!: UsageStoreRowDto[];

  @ApiProperty({ type: [UsageKioskRowDto] })
  kiosks!: UsageKioskRowDto[];

  @ApiProperty({ type: [UsageProductRowDto] })
  products!: UsageProductRowDto[];

  @ApiProperty({ type: [UsageCategoryRowDto] })
  categories!: UsageCategoryRowDto[];

  @ApiProperty({ type: [UsageChannelRowDto] })
  channels!: UsageChannelRowDto[];

  @ApiProperty({ type: [UsageDailyRowDto] })
  daily!: UsageDailyRowDto[];
}
