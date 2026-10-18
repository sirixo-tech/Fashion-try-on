import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class UsersQueryDto {
  @IsOptional()
  @IsIn(["active", "only", "all"])
  deleted?: "active" | "only" | "all";
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
  @IsOptional()
  @IsIn(["ACTIVE", "SUSPENDED", "DISABLED"])
  status?: "ACTIVE" | "SUSPENDED" | "DISABLED";
  @IsOptional()
  @IsUUID()
  storeId?: string;
  @IsOptional()
  @IsIn(["platform", "store", "unlinked", "superadmin"])
  access?: "platform" | "store" | "unlinked" | "superadmin";
  @IsOptional()
  @IsString()
  @MaxLength(80)
  role?: string;
}

export class UserMembershipInputDto {
  @IsUUID() storeId!: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  membershipId?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsISO8601()
  updatedAt?: string;
  @IsIn(["ACTIVE", "SUSPENDED", "REVOKED"])
  status!: "ACTIVE" | "SUSPENDED" | "REVOKED";
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  roleIds!: string[];
}

export class UpdateUserDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  version!: string;
  @IsString()
  @Length(1, 160)
  @Matches(/\S/)
  displayName!: string;
  @IsEmail()
  @MaxLength(320)
  email!: string;
  @IsIn(["ACTIVE", "SUSPENDED", "DISABLED"])
  status!: "ACTIVE" | "SUSPENDED" | "DISABLED";
  @ValidateIf((_object, value) => value !== undefined && value !== "")
  @IsString()
  @Length(12, 256)
  newPassword?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  platformRoleIds?: string[];
  // Only changed memberships are submitted; omitted links remain untouched.
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => UserMembershipInputDto)
  memberships!: UserMembershipInputDto[];
}

export class AssignFirstOwnerDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) version!: string;
  @IsUUID() storeId!: string;
  @IsString() @Length(1, 200) confirmStoreName!: string;
}

export class StoreAdminEmailDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) version!: string;
  @IsUUID() storeId!: string;
  @IsEmail() @MaxLength(320) email!: string;
}

export class CreateStoreAdminDto {
  @IsUUID() storeId!: string;
  @IsString() @Length(1, 200) confirmStoreName!: string;
  @IsString() @Length(1, 160) @Matches(/\S/) displayName!: string;
  @IsEmail() @MaxLength(320) email!: string;
  @IsString() @Length(12, 256) @Matches(/\S/) password!: string;
}

export class DeleteUserDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) version!: string;
  @IsEmail() @MaxLength(320) confirmEmail!: string;
}

export class DeleteStoreMemberDto {
  @IsISO8601() updatedAt!: string;
  @IsEmail() @MaxLength(320) confirmEmail!: string;
}
