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

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class UsageRangeDto {
  preset!: "today" | "7d" | "30d" | "90d" | "custom";
  from!: string;
  to!: string;
}

export class UsageTotalsDto {
  sessionsStarted!: number;
  sessionsCompleted!: number;
  sessionsIdleExpired!: number;
  tryOnsGenerated!: number;
  downloadsCompleted!: number;
  downloadRate!: number;
}

export class UsageProviderRowDto {
  provider!: string;
  providerModel!: string | null;
  tryOnsGenerated!: number;
}

export class UsageStoreRowDto {
  storeId!: string | null;
  storeName!: string;
  sessionsStarted!: number;
  tryOnsGenerated!: number;
  downloadsCompleted!: number;
}

export class UsageKioskRowDto {
  kioskDeviceId!: string;
  displayName!: string;
  storeId!: string | null;
  storeName!: string | null;
  sessionsStarted!: number;
  tryOnsGenerated!: number;
  downloadsCompleted!: number;
}

export class UsageProductRowDto {
  productId!: string;
  name!: string;
  tryOnsGenerated!: number;
  downloadsCompleted!: number;
}

export class UsageSummaryResponseDto {
  @ApiProperty({ type: UsageRangeDto })
  range!: UsageRangeDto;

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
}
