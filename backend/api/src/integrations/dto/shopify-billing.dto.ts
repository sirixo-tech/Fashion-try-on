import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
export class ShopifyBillingShopDto {
  @Matches(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/) shop!: string;
}
export class PrepareShopifyBillingDto extends ShopifyBillingShopDto {
  @IsUUID() planId!: string;
  @IsOptional() @IsInt() @Min(1) @Max(100_000_000) usageCapCents?: number;
}
export class AttachShopifyBillingDto extends ShopifyBillingShopDto {
  @Matches(/^gid:\/\/shopify\/AppSubscription\/\d+$/) subscriptionId!: string;
}
export class VerifyShopifyBillingDto extends AttachShopifyBillingDto {
  @IsIn([
    "ACTIVE",
    "ACCEPTED",
    "PENDING",
    "CANCELLED",
    "DECLINED",
    "EXPIRED",
    "FROZEN",
  ])
  status!: string;
  @IsBoolean() test!: boolean;
  @IsOptional() @IsISO8601() periodEnd?: string;
  @IsString() @MaxLength(3) currency!: string;
  @IsInt() @Min(0) recurringAmountCents!: number;
  @IsOptional()
  @Matches(/^gid:\/\/shopify\/AppSubscriptionLineItem\/[^\s]{1,180}$/)
  usageLineItemId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100_000_000) usageCapCents?: number;
  @IsOptional() @IsString() @MaxLength(500) usageTerms?: string;
}
export class AcknowledgeShopifyUsageDto extends ShopifyBillingShopDto {
  @Matches(/^gid:\/\/shopify\/AppUsageRecord\/\d+$/) usageRecordId!: string;
}
