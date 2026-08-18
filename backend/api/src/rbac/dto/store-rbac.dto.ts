import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MembershipStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class StoreRbacListQueryDto {
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
}

export class StoreUsersQueryDto extends StoreRbacListQueryDto {
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;
}

export class CreateStoreRoleDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissionCodes?: string[];
}

export class UpdateStoreRoleDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReplaceStoreRolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissionCodes!: string[];
}

export class AddStoreUserDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  roleIds?: string[];
}

export class ReplaceStoreUserRolesDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  roleIds!: string[];
}

export class UpdateStoreUserStatusDto {
  @IsIn(["ACTIVE", "SUSPENDED"])
  status!: "ACTIVE" | "SUSPENDED";
}

export class StorePermissionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  module!: string;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  label!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  isSystem!: boolean;

  @ApiProperty()
  applicability!: string;

  @ApiProperty()
  granted!: boolean;
}

export class StoreRoleResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true })
  systemCode!: string | null;

  @ApiProperty()
  isSystem!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  permissionsCount!: number;

  @ApiProperty()
  assignedUsersCount!: number;

  @ApiProperty({ type: [StorePermissionDto] })
  permissions!: StorePermissionDto[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

class StoreRbacPaginationDto {
  page!: number;
  pageSize!: number;
  total!: number;
  totalPages!: number;
  hasMore!: boolean;
}

export class StoreRoleListResponseDto {
  @ApiProperty({ type: [StoreRoleResponseDto] })
  data!: StoreRoleResponseDto[];

  @ApiProperty()
  pagination!: StoreRbacPaginationDto;
}

export class StoreUserResponseDto {
  @ApiProperty()
  membershipId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;

  @ApiProperty({ enum: MembershipStatus })
  status!: MembershipStatus;

  @ApiProperty({ type: [StoreRoleResponseDto] })
  roles!: StoreRoleResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  joinedAt!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class StoreUserListResponseDto {
  @ApiProperty({ type: [StoreUserResponseDto] })
  data!: StoreUserResponseDto[];

  @ApiProperty()
  pagination!: StoreRbacPaginationDto;
}

export class EffectiveStorePermissionsResponseDto {
  @ApiProperty()
  storeId!: string;

  @ApiProperty({ type: [String] })
  permissions!: string[];

  @ApiProperty()
  platformBypass!: boolean;

  @ApiPropertyOptional({ nullable: true })
  membershipId!: string | null;
}
