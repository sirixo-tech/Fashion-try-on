import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PricingPlanStatus } from "@prisma/client";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  Matches,
} from "class-validator";

const pricingChannels = ["SHOPIFY", "KIOSK", "PUBLIC_API"] as const;
type PricingChannel = (typeof pricingChannels)[number];

export class PricingPlanResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: PricingPlanStatus })
  status!: PricingPlanStatus;

  @ApiProperty({ enum: pricingChannels, isArray: true })
  channels!: PricingChannel[];

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  monthlyPriceCents!: number;

  @ApiProperty()
  includedCredits!: number;

  @ApiProperty()
  trialCredits!: number;

  @ApiPropertyOptional({ nullable: true })
  extraCreditPriceCents!: number | null;

  @ApiPropertyOptional({ nullable: true })
  kioskMonthlyRentCents!: number | null;

  @ApiPropertyOptional({ nullable: true })
  kioskDeviceLimit!: number | null;

  @ApiPropertyOptional({ nullable: true })
  metadata!: Record<string, unknown> | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class PricingPlanListResponseDto {
  @ApiProperty({ type: [PricingPlanResponseDto] })
  data!: PricingPlanResponseDto[];
}

export class CreatePricingPlanDto {
  @ApiProperty({ example: "shopify-starter" })
  @IsString()
  @Length(3, 80)
  @Matches(/^[a-z0-9][a-z0-9-]*$/)
  code!: string;

  @ApiProperty({ example: "Shopify Starter" })
  @IsString()
  @Length(2, 160)
  name!: string;

  @ApiPropertyOptional({ enum: PricingPlanStatus })
  @IsOptional()
  @IsIn(Object.values(PricingPlanStatus))
  status?: PricingPlanStatus;

  @ApiProperty({ enum: pricingChannels, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(pricingChannels, { each: true })
  channels!: PricingChannel[];

  @ApiProperty({ example: "USD" })
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  monthlyPriceCents!: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  includedCredits!: number;

  @ApiProperty({ minimum: 0, default: 10 })
  @IsInt()
  @Min(0)
  @Max(100_000)
  trialCredits!: number;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  extraCreditPriceCents?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  kioskMonthlyRentCents?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  kioskDeviceLimit?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class UpdatePricingPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

  @ApiPropertyOptional({ enum: PricingPlanStatus })
  @IsOptional()
  @IsIn(Object.values(PricingPlanStatus))
  status?: PricingPlanStatus;

  @ApiPropertyOptional({ enum: pricingChannels, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(pricingChannels, { each: true })
  channels?: PricingChannel[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  monthlyPriceCents?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  includedCredits?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  trialCredits?: number;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  extraCreditPriceCents?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  kioskMonthlyRentCents?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  kioskDeviceLimit?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
