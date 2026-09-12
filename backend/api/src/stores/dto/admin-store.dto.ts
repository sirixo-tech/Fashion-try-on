import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { KioskAssignmentScope } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  ArrayUnique,
  IsEmail,
  IsEnum,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import {
  KioskConfigurationDto,
  KioskDeviceListResponseDto,
  KioskDeviceResponseDto,
  KioskProvisioningPairResponseDto,
  PairKioskDto,
} from "../../kiosks/dto/kiosk.dto.js";
import {
  JEWELLERY_TYPES,
  PRODUCT_VERTICALS,
  type JewelleryType,
  type ProductVertical,
} from "../../catalog/product-kind.js";
import {
  STORE_TRY_ON_CAPABILITIES,
  type StoreTryOnCapability,
} from "../../try-on/store-try-on-capabilities.js";

export enum AdminStoreStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

export class RequestStoreCatalogSyncDto {
  @IsIn(PRODUCT_VERTICALS)
  productVertical!: ProductVertical;
}

export class BulkImportedProductVtoDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(PRODUCT_VERTICALS)
  productVertical!: ProductVertical;
}

export class AdminStoreListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(AdminStoreStatus)
  status?: AdminStoreStatus;

  @IsOptional()
  @IsIn(["createdDesc", "createdAsc", "nameAsc", "nameDesc"])
  sort?: "createdDesc" | "createdAsc" | "nameAsc" | "nameDesc";
}

export class CreateAdminStoreDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(3, 120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["https"] })
  @MaxLength(2048)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stateRegion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class UpdateAdminStoreDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(3, 120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["https"] })
  @MaxLength(2048)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stateRegion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsEnum(AdminStoreStatus)
  status?: AdminStoreStatus;
}

export class AssignStorePricingPlanDto {
  @IsString()
  pricingPlanId!: string;
}

export class ManualStoreCreditAdjustmentDto {
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}

export class PairStoreKioskDto {
  @IsString()
  @Matches(/^\d{6}$/)
  pairingCode!: string;

  @IsString()
  @Length(1, 160)
  displayName!: string;
}

export class StoreProductListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(["ALL", "ACTIVE", "INACTIVE", "VTO_ENABLED"])
  status?: "ALL" | "ACTIVE" | "INACTIVE" | "VTO_ENABLED";

  @IsOptional()
  @IsIn(PRODUCT_VERTICALS)
  productVertical?: ProductVertical;
}

export class StoreProductImageInputDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  storageKey?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["https", "http"] })
  @MaxLength(2048)
  url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contentType?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20000)
  width?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20000)
  height?: number | null;
}

export class CreateStoreProductDto {
  @IsString()
  @Length(1, 180)
  name!: string;

  @IsString()
  @Length(1, 120)
  categoryName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  audience?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  priceAmountCents?: number | null;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  priceCurrency?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["https", "http"] })
  @MaxLength(2048)
  productUrl?: string | null;

  @IsOptional()
  @IsIn(PRODUCT_VERTICALS)
  productVertical?: ProductVertical;

  @IsOptional()
  @IsIn(JEWELLERY_TYPES)
  jewelleryType?: JewelleryType | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  garmentIntent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  garmentCategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  garmentPhotoType?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  vtoEnabled?: boolean;

  @IsOptional()
  @Type(() => StoreProductImageInputDto)
  image?: StoreProductImageInputDto | null;
}

export class UpdateStoreProductDto {
  @IsOptional()
  @IsString()
  @Length(1, 180)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  categoryName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  audience?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  priceAmountCents?: number | null;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  priceCurrency?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["https", "http"] })
  @MaxLength(2048)
  productUrl?: string | null;

  @IsOptional()
  @IsIn(PRODUCT_VERTICALS)
  productVertical?: ProductVertical;

  @IsOptional()
  @IsIn(JEWELLERY_TYPES)
  jewelleryType?: JewelleryType | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  garmentIntent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  garmentCategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  garmentPhotoType?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  vtoEnabled?: boolean;

  @IsOptional()
  @Type(() => StoreProductImageInputDto)
  image?: StoreProductImageInputDto | null;
}

export class CreateStoreProductImageUploadDto {
  @IsString()
  @MaxLength(80)
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(12 * 1024 * 1024)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  fileName?: string;
}

export class AdminStoreResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ enum: AdminStoreStatus })
  status!: AdminStoreStatus;

  @ApiPropertyOptional({ nullable: true })
  contactEmail!: string | null;

  @ApiPropertyOptional({ nullable: true })
  contactPhone!: string | null;

  @ApiPropertyOptional({ nullable: true })
  website!: string | null;

  @ApiPropertyOptional({ nullable: true })
  address!: string | null;

  @ApiPropertyOptional({ nullable: true })
  city!: string | null;

  @ApiPropertyOptional({ nullable: true })
  stateRegion!: string | null;

  @ApiPropertyOptional({ nullable: true })
  postalCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  country!: string | null;

  @ApiProperty()
  timezone!: string;

  @ApiProperty()
  totalKiosks!: number;

  @ApiProperty()
  activeKiosks!: number;

  @ApiProperty()
  offlineKiosks!: number;

  @ApiPropertyOptional({ nullable: true })
  lastActivityAt!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty()
  internalLegacyModel!: "ORGANIZATION_AS_STORE";
}

export class StoreProductImageDto {
  @ApiPropertyOptional({ nullable: true })
  url!: string | null;

  @ApiPropertyOptional({ nullable: true })
  storageKey!: string | null;

  @ApiPropertyOptional({ nullable: true })
  contentType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  width!: number | null;

  @ApiPropertyOptional({ nullable: true })
  height!: number | null;
}

export class StoreProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  audience!: string;

  @ApiProperty()
  categoryId!: string;

  @ApiProperty()
  categoryName!: string;

  @ApiProperty()
  categorySlug!: string;

  @ApiProperty()
  active!: boolean;

  @ApiProperty()
  vtoEnabled!: boolean;

  @ApiPropertyOptional({ nullable: true })
  priceAmountCents!: number | null;

  @ApiPropertyOptional({ nullable: true })
  priceCurrency!: string | null;

  @ApiPropertyOptional({ nullable: true })
  productUrl!: string | null;

  @ApiProperty({ enum: PRODUCT_VERTICALS })
  productVertical!: ProductVertical;

  @ApiPropertyOptional({ enum: JEWELLERY_TYPES, nullable: true })
  jewelleryType!: JewelleryType | null;

  @ApiProperty()
  garmentIntent!: string;

  @ApiProperty()
  garmentCategory!: string;

  @ApiProperty()
  garmentPhotoType!: string;

  @ApiProperty()
  image!: StoreProductImageDto;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class StoreProductListResponseDto {
  @ApiProperty({ type: [StoreProductDto] })
  data!: StoreProductDto[];

  @ApiProperty()
  pagination!: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export class BulkImportedProductVtoResponseDto {
  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({ enum: PRODUCT_VERTICALS })
  productVertical!: ProductVertical;

  @ApiProperty()
  matchedImportedProducts!: number;

  @ApiProperty()
  eligibleProducts!: number;

  @ApiProperty()
  updatedProducts!: number;

  @ApiProperty()
  updatedDevices!: number;
}

export class StoreProductImageUploadIntentDto {
  storageKey!: string;
  uploadUrl!: string;
  method!: "PUT";
  expiresAt!: string;
  headers!: Record<string, string>;
  maxImageBytes!: number;
  supportedContentTypes!: string[];
}

export class AdminStoreListResponseDto {
  @ApiProperty({ type: [AdminStoreResponseDto] })
  data!: AdminStoreResponseDto[];

  @ApiProperty()
  pagination!: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export class StorePricingPlanSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  monthlyPriceCents!: number;

  @ApiProperty()
  includedCredits!: number;

  @ApiPropertyOptional()
  extraCreditPriceCents!: number | null;

  @ApiPropertyOptional()
  kioskMonthlyRentCents!: number | null;

  @ApiPropertyOptional()
  kioskDeviceLimit!: number | null;

  @ApiProperty({ type: [String] })
  channels!: string[];
}

export class StoreSubscriptionSummaryDto {
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
    pricingPlan: StorePricingPlanSummaryDto | null;
  } | null;
}

export class StoreCreditChannelUsageDto {
  @ApiProperty()
  channel!: string;

  @ApiProperty()
  consumedCredits!: number;

  @ApiProperty()
  runs!: number;
}

export class StoreCreditProductUsageDto {
  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  productSlug!: string;

  @ApiProperty()
  consumedCredits!: number;

  @ApiProperty()
  runs!: number;
}

export class StoreCreditLedgerEntryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  entryType!: string;

  @ApiPropertyOptional()
  channel!: string | null;

  @ApiProperty()
  quantity!: number;

  @ApiPropertyOptional()
  balanceAfter!: number | null;

  @ApiPropertyOptional()
  reason!: string | null;

  @ApiPropertyOptional()
  productId!: string | null;

  @ApiProperty()
  occurredAt!: string;
}

export class StoreCreditDiagnosticsDto {
  @ApiProperty()
  availableCredits!: number;

  @ApiProperty()
  totals!: {
    grantedCredits: number;
    consumedCredits: number;
    manualAdjustments: number;
    netCredits: number;
  };

  @ApiProperty({ type: [StoreCreditChannelUsageDto] })
  byChannel!: StoreCreditChannelUsageDto[];

  @ApiProperty({ type: [StoreCreditProductUsageDto] })
  topProducts!: StoreCreditProductUsageDto[];

  @ApiProperty({ type: [StoreCreditLedgerEntryDto] })
  recentLedgerEntries!: StoreCreditLedgerEntryDto[];
}

export class AdminStoreDetailResponseDto extends AdminStoreResponseDto {
  @ApiProperty({ type: KioskDeviceListResponseDto })
  kiosks!: KioskDeviceListResponseDto;

  @ApiProperty({ type: StoreSubscriptionSummaryDto })
  subscription!: StoreSubscriptionSummaryDto;
}

export class StoreKioskPairResponseDto extends KioskProvisioningPairResponseDto {}

export class StoreKioskDeviceResponseDto extends KioskDeviceResponseDto {}

export class StoreKioskConfigurationResponseDto extends KioskConfigurationDto {}

export class UpdateStoreVirtualTryOnSettingsDto {
  @IsOptional()
  @IsBoolean()
  garmentPreviewEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(STORE_TRY_ON_CAPABILITIES, { each: true })
  enabledTryOnCapabilities?: StoreTryOnCapability[];
}

export class StoreVirtualTryOnSettingsResponseDto {
  platformGarmentPreviewEnabled!: boolean;
  storeHasGarmentPreviewPermission!: boolean;
  storeGarmentPreviewEnabled!: boolean;
  effectiveGarmentPreviewEnabled!: boolean;
  enabledTryOnCapabilities!: StoreTryOnCapability[];
  garmentTryOnEnabled!: boolean;
  jewelleryTryOnEnabled!: boolean;
}

export function pairStoreKioskToPairKioskDto(
  input: PairStoreKioskDto,
  organizationId: string,
): PairKioskDto {
  return Object.assign(new PairKioskDto(), {
    pairingCode: input.pairingCode,
    displayName: input.displayName,
    assignmentScope: KioskAssignmentScope.ORGANIZATION,
    organizationId,
  });
}
