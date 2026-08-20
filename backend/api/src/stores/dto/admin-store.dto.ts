import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { KioskAssignmentScope } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsEmail,
  IsEnum,
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

export enum AdminStoreStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
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

export class PairStoreKioskDto {
  @IsString()
  @Matches(/^\d{6}$/)
  pairingCode!: string;

  @IsString()
  @Length(1, 160)
  displayName!: string;
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

export class AdminStoreDetailResponseDto extends AdminStoreResponseDto {
  @ApiProperty({ type: KioskDeviceListResponseDto })
  kiosks!: KioskDeviceListResponseDto;
}

export class StoreKioskPairResponseDto extends KioskProvisioningPairResponseDto {}

export class StoreKioskDeviceResponseDto extends KioskDeviceResponseDto {}

export class StoreKioskConfigurationResponseDto extends KioskConfigurationDto {}

export class UpdateStoreVirtualTryOnSettingsDto {
  @IsBoolean()
  garmentPreviewEnabled!: boolean;
}

export class StoreVirtualTryOnSettingsResponseDto {
  platformGarmentPreviewEnabled!: boolean;
  storeHasGarmentPreviewPermission!: boolean;
  storeGarmentPreviewEnabled!: boolean;
  effectiveGarmentPreviewEnabled!: boolean;
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
