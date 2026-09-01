import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { SELFX_CATALOG_SOURCES, type SelfxCatalogSource } from "@selfx/shared";

import {
  PublicApiCatalogSourceUsageRowDto,
  PublicApiProviderUsageRowDto,
  PublicApiProductUsageRowDto,
  PublicApiUsageRangeDto,
  PublicApiUsageTotalsDto,
} from "./public-api-usage.dto.js";
import {
  publicApiWebhookEventOptions,
  type PublicApiWebhookEvent,
  type PublicApiWebhookStatus,
} from "./public-api-webhook.dto.js";

export class AdminDeveloperApiUsageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  apiKeyId?: string;

  @ApiPropertyOptional({
    enum: ["today", "7d", "30d", "90d", "custom"],
    example: "7d",
  })
  @IsOptional()
  @IsIn(["today", "7d", "30d", "90d", "custom"])
  range?: "today" | "7d" | "30d" | "90d" | "custom";

  @ApiPropertyOptional({ example: "2026-08-22T12:00:00.000Z" })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: "2026-08-29T12:00:00.000Z" })
  @IsOptional()
  @IsString()
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

export class AdminDeveloperApiUsageScopeDto {
  @ApiPropertyOptional({ nullable: true })
  storeId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  storeName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  apiKeyId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  keyPrefix!: string | null;
}

export class AdminDeveloperApiUsageResponseDto {
  @ApiProperty({ type: PublicApiUsageRangeDto })
  range!: PublicApiUsageRangeDto;

  @ApiProperty({ type: AdminDeveloperApiUsageScopeDto })
  scope!: AdminDeveloperApiUsageScopeDto;

  @ApiProperty({ type: PublicApiUsageTotalsDto })
  totals!: PublicApiUsageTotalsDto;

  @ApiProperty({ type: [PublicApiProviderUsageRowDto] })
  providerUsage!: PublicApiProviderUsageRowDto[];

  @ApiProperty({ type: [PublicApiCatalogSourceUsageRowDto] })
  catalogSourceUsage!: PublicApiCatalogSourceUsageRowDto[];

  @ApiProperty({ type: [PublicApiProductUsageRowDto] })
  productUsage!: PublicApiProductUsageRowDto[];
}

export class AdminDeveloperWebhookListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  storeId?: string;
}

export class CreateAdminDeveloperWebhookEndpointDto {
  @ApiProperty()
  @IsUUID()
  storeId!: string;

  @ApiProperty({
    example: "https://merchant.example.com/selfx/webhooks",
  })
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ["https"], require_protocol: true })
  url!: string;

  @ApiPropertyOptional({
    enum: publicApiWebhookEventOptions,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(publicApiWebhookEventOptions.length)
  @IsIn(publicApiWebhookEventOptions, { each: true })
  subscribedEvents?: PublicApiWebhookEvent[];
}

export class UpdateAdminDeveloperWebhookEndpointDto {
  @ApiPropertyOptional({
    example: "https://merchant.example.com/selfx/webhooks",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ["https"], require_protocol: true })
  url?: string;

  @ApiPropertyOptional({
    enum: publicApiWebhookEventOptions,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(publicApiWebhookEventOptions.length)
  @IsIn(publicApiWebhookEventOptions, { each: true })
  subscribedEvents?: PublicApiWebhookEvent[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class AdminDeveloperWebhookDeliveryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  webhookEndpointId!: string;

  @ApiProperty()
  endpointUrl!: string;

  @ApiProperty()
  eventId!: string;

  @ApiProperty()
  eventType!: string;

  @ApiProperty()
  attemptNumber!: number;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  httpStatus!: number | null;

  @ApiPropertyOptional({ nullable: true })
  errorMessage!: string | null;

  @ApiPropertyOptional({ nullable: true })
  nextRetryAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  deliveredAt!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class AdminDeveloperWebhookEndpointDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  storeId!: string;

  @ApiProperty()
  storeName!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  status!: PublicApiWebhookStatus;

  @ApiProperty({ enum: publicApiWebhookEventOptions, isArray: true })
  subscribedEvents!: PublicApiWebhookEvent[];

  @ApiPropertyOptional({
    type: AdminDeveloperWebhookDeliveryDto,
    nullable: true,
  })
  latestDelivery!: AdminDeveloperWebhookDeliveryDto | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class CreateAdminDeveloperWebhookEndpointResponseDto extends AdminDeveloperWebhookEndpointDto {
  @ApiProperty()
  secret!: string;
}

export class AdminDeveloperWebhookEndpointListResponseDto {
  @ApiProperty({ type: [AdminDeveloperWebhookEndpointDto] })
  data!: AdminDeveloperWebhookEndpointDto[];
}

export class AdminDeveloperWebhookDeliveryListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  endpointId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AdminDeveloperWebhookDeliveryListResponseDto {
  @ApiProperty({ type: [AdminDeveloperWebhookDeliveryDto] })
  data!: AdminDeveloperWebhookDeliveryDto[];
}
