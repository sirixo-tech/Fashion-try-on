import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from "class-validator";

export class AccessPermissionDto {
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
  applicability!: string;

  @ApiProperty()
  isSystem!: boolean;
}

export class CreatePlatformRoleDto {
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

export class UpdatePlatformRoleDto {
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

export class ReplacePermissionCodesDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  permissionCodes!: string[];
}

export class PlatformRoleDto {
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

  @ApiProperty({ type: [AccessPermissionDto] })
  permissions!: AccessPermissionDto[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class PlatformUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  isProtectedSuperadmin!: boolean;

  @ApiProperty({ type: [PlatformRoleDto] })
  platformRoles!: PlatformRoleDto[];
}

export class AssignPlatformRolesDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  roleIds!: string[];
}

export class AddPlatformUserDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  roleIds?: string[];
}

export class StorePermissionGrantDto extends AccessPermissionDto {
  @ApiProperty()
  granted!: boolean;
}
