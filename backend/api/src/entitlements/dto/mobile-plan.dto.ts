import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { MobilePlanBillingPeriod, PricingPlanStatus } from "@prisma/client";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";

export class CreateMobilePlanDto {
  @ApiProperty({ example: "mobile-style-20" })
  @IsString()
  @Length(3, 80)
  @Matches(/^[a-z0-9][a-z0-9-]*$/)
  code!: string;

  @ApiProperty({ example: "Style 20" })
  @IsString()
  @Length(2, 160)
  @Matches(/\S/)
  name!: string;

  @ApiPropertyOptional({ default: "" })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @ApiPropertyOptional({
    enum: PricingPlanStatus,
    default: PricingPlanStatus.INACTIVE,
  })
  @IsOptional()
  @IsIn(Object.values(PricingPlanStatus))
  status?: PricingPlanStatus;

  @ApiProperty({ example: "INR" })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  priceCents!: number;

  @ApiProperty({ enum: MobilePlanBillingPeriod })
  @IsIn(Object.values(MobilePlanBillingPeriod))
  billingPeriod!: MobilePlanBillingPeriod;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  includedCredits!: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  trialCredits?: number;
}

export class UpdateMobilePlanDto extends PartialType(CreateMobilePlanDto) {}

export class MobilePlanResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: PricingPlanStatus }) status!: PricingPlanStatus;
  @ApiProperty() currency!: string;
  @ApiProperty() priceCents!: number;
  @ApiProperty({ enum: MobilePlanBillingPeriod })
  billingPeriod!: MobilePlanBillingPeriod;
  @ApiProperty() includedCredits!: number;
  @ApiProperty() trialCredits!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class MobilePlanListResponseDto {
  @ApiProperty({ type: [MobilePlanResponseDto] })
  data!: MobilePlanResponseDto[];
}
