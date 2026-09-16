import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateShopifyStorefrontTryOnSessionDto {
  @ApiProperty({ example: "shopify" })
  @IsIn(["shopify"])
  source!: "shopify";

  @ApiProperty({ example: "merchant-store.myshopify.com" })
  @IsString()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)
  shop!: string;

  @ApiPropertyOptional({ example: "gid://shopify/Product/1001" })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  externalProductId?: string;

  @ApiPropertyOptional({ example: "linen-shirt" })
  @IsOptional()
  @IsString()
  @MaxLength(220)
  productHandle?: string;

  @ApiPropertyOptional({ example: "es" })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;

  @ApiPropertyOptional({
    description:
      "Anonymous visitor token generated after Shopify app proxy verification.",
  })
  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  visitorToken?: string;

  @ApiPropertyOptional({
    description:
      "Maximum Try-Ons this visitor can run in the selected period. 0 disables the custom visitor limit.",
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  visitorTryOnLimit?: number;

  @ApiPropertyOptional({ enum: ["DAY", "WEEK", "MONTH"], example: "DAY" })
  @IsOptional()
  @IsIn(["DAY", "WEEK", "MONTH"])
  visitorTryOnLimitPeriod?: "DAY" | "WEEK" | "MONTH";

  @ApiPropertyOptional({
    description:
      "Maximum Shopify storefront Try-Ons for the store per calendar month. 0 disables the custom monthly cap.",
    example: 300,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  monthlyStoreTryOnLimit?: number;
}

export class CreateShopifyStorefrontTryOnRunDto {
  @ApiPropertyOptional({ example: "shopify-look-0198a9b3-d0bc" })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  clientRequestId?: string;
}

export class ShopifyStorefrontTryOnProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  handle?: string;

  @ApiPropertyOptional()
  externalProductId?: string;

  @ApiPropertyOptional()
  imageUrl?: string;
}

export class ShopifyStorefrontTryOnSessionDto {
  @ApiProperty()
  session!: string;

  @ApiProperty()
  garmentAssetId!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiPropertyOptional()
  locale?: string;

  @ApiProperty({ type: ShopifyStorefrontTryOnProductDto })
  product!: ShopifyStorefrontTryOnProductDto;
}

export class ShopifyStorefrontCreditSummaryDto {
  @ApiProperty()
  availableCredits!: number;

  @ApiPropertyOptional()
  subscription!: {
    id: string;
    status: string;
    channels: string[];
    includedCredits: number;
    trialCredits: number;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    pricingPlan: {
      id: string;
      code: string;
      name: string;
      currency: string;
      monthlyPriceCents: number;
      includedCredits: number;
      storeLocationLimit: number | null;
      extraCreditPriceCents: number | null;
      kioskMonthlyRentCents: number | null;
      kioskDeviceLimit: number | null;
      channels: string[];
    } | null;
  } | null;
}

export class ShopifyStorefrontUsagePeriodDto {
  @ApiProperty()
  start!: string;

  @ApiProperty()
  end!: string;

  @ApiProperty()
  tryOns!: number;

  @ApiProperty()
  completedTryOns!: number;

  @ApiProperty()
  failedTryOns!: number;

  @ApiProperty()
  generatedImages!: number;

  @ApiProperty()
  creditsConsumed!: number;
}

export class ShopifyStorefrontUsageProductDto {
  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productName!: string;

  @ApiPropertyOptional()
  productSlug?: string;

  @ApiPropertyOptional()
  imageUrl?: string;

  @ApiProperty()
  tryOns!: number;
}

export class ShopifyStorefrontUsageSummaryDto {
  @ApiProperty()
  totalTryOns!: number;

  @ApiProperty({ type: ShopifyStorefrontUsagePeriodDto })
  thisMonth!: ShopifyStorefrontUsagePeriodDto;

  @ApiProperty({ type: [ShopifyStorefrontUsageProductDto] })
  topProducts!: ShopifyStorefrontUsageProductDto[];
}

export class ShopifyStorefrontPricingPlanDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    enum: ["SHOPIFY", "WOOCOMMERCE", "KIOSK", "PUBLIC_API"],
    isArray: true,
  })
  channels!: string[];

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  monthlyPriceCents!: number;

  @ApiProperty()
  includedCredits!: number;

  @ApiProperty()
  trialCredits!: number;

  @ApiPropertyOptional({ nullable: true })
  storeLocationLimit!: number | null;

  @ApiPropertyOptional({ nullable: true })
  extraCreditPriceCents!: number | null;

  @ApiPropertyOptional({ nullable: true })
  kioskMonthlyRentCents!: number | null;

  @ApiPropertyOptional({ nullable: true })
  kioskDeviceLimit!: number | null;

  @ApiProperty({ type: [String] })
  featureKeys!: string[];
}

export class ShopifyStorefrontPricingPlansDto {
  @ApiProperty({ type: [ShopifyStorefrontPricingPlanDto] })
  data!: ShopifyStorefrontPricingPlanDto[];
}

export class ShopifyStorefrontTryOnPersonUploadDto {
  @ApiProperty()
  session!: string;

  @ApiProperty()
  personAssetId!: string;

  @ApiProperty()
  expiresAt!: string;
}

export class ShopifyStorefrontTryOnResultDto {
  @ApiProperty()
  assetId!: string;

  @ApiProperty()
  readUrl!: string;

  @ApiPropertyOptional()
  downloadUrl?: string;

  @ApiPropertyOptional()
  contentType?: string;

  @ApiProperty()
  expiresAt!: string;
}

export class ShopifyStorefrontTryOnRunDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"] })
  status!: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";

  @ApiProperty()
  session!: string;

  @ApiProperty({ type: ShopifyStorefrontTryOnProductDto })
  product!: ShopifyStorefrontTryOnProductDto;

  @ApiPropertyOptional({ type: ShopifyStorefrontTryOnResultDto })
  result?: ShopifyStorefrontTryOnResultDto;

  @ApiPropertyOptional()
  errorCode?: string;

  @ApiPropertyOptional()
  errorMessage?: string;
}

export class ShopifyStorefrontTryOnSessionParamDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  session!: string;
}

export class ShopifyStorefrontTryOnRunParamDto extends ShopifyStorefrontTryOnSessionParamDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  runId!: string;
}
