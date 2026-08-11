import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  MembershipStoreScopeMode,
  OrganizationMembershipRole,
  StoreStatus,
} from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayUnique,
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from "class-validator";

import { MAX_MEMBERSHIP_STORE_IDS } from "../organization-constraints.js";

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: "SelfX Demo Retail" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: "Asia/Kolkata" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class CreateStoreDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code?: string;

  @ApiPropertyOptional({ example: "Asia/Kolkata" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  addressJson?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class UpdateStoreDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code?: string;

  @ApiPropertyOptional({ enum: StoreStatus })
  @IsOptional()
  @IsEnum(StoreStatus)
  status?: StoreStatus;

  @ApiPropertyOptional({ example: "Asia/Kolkata" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  addressJson?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class CreateMembershipDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: OrganizationMembershipRole })
  @IsEnum(OrganizationMembershipRole)
  role!: OrganizationMembershipRole;

  @ApiProperty({ enum: MembershipStoreScopeMode })
  @IsEnum(MembershipStoreScopeMode)
  storeScopeMode!: MembershipStoreScopeMode;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MEMBERSHIP_STORE_IDS)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  @Type(() => String)
  storeIds?: string[];
}

export class UpdateMembershipDto {
  @ApiPropertyOptional({ enum: OrganizationMembershipRole })
  @IsOptional()
  @IsEnum(OrganizationMembershipRole)
  role?: OrganizationMembershipRole;

  @ApiPropertyOptional({ enum: MembershipStoreScopeMode })
  @IsOptional()
  @IsEnum(MembershipStoreScopeMode)
  storeScopeMode?: MembershipStoreScopeMode;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MEMBERSHIP_STORE_IDS)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  @Type(() => String)
  storeIds?: string[];
}
