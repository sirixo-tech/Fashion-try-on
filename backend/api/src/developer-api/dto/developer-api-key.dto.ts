import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export const apiKeyEnvironmentOptions = ["TEST", "LIVE"] as const;
export type ApiKeyEnvironment = (typeof apiKeyEnvironmentOptions)[number];

export const apiKeyScopeOptions = [
  "tryon:create",
  "tryon:read",
  "usage:read",
  "webhooks:manage",
] as const;
export type ApiKeyScope = (typeof apiKeyScopeOptions)[number];

export class DeveloperApiKeyListQueryDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize?: number;
}

export class CreateDeveloperApiKeyDto {
  @ApiProperty()
  @IsUUID()
  storeId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: apiKeyEnvironmentOptions })
  @IsIn(apiKeyEnvironmentOptions)
  environment!: ApiKeyEnvironment;

  @ApiProperty({ enum: apiKeyScopeOptions, isArray: true })
  @IsArray()
  @ArrayMaxSize(apiKeyScopeOptions.length)
  @IsIn(apiKeyScopeOptions, { each: true })
  scopes!: ApiKeyScope[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;
}

export class DeveloperApiKeyDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  storeId!: string;

  @ApiProperty()
  storeName!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  keyPrefix!: string;

  @ApiProperty({ enum: apiKeyEnvironmentOptions })
  environment!: ApiKeyEnvironment;

  @ApiProperty()
  status!: "ACTIVE" | "REVOKED";

  @ApiProperty({ enum: apiKeyScopeOptions, isArray: true })
  scopes!: ApiKeyScope[];

  @ApiPropertyOptional({ nullable: true })
  expiresAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastUsedAt!: string | null;

  @ApiProperty()
  createdByEmail!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({ nullable: true })
  revokedAt!: string | null;
}

export class CreateDeveloperApiKeyResponseDto {
  @ApiProperty({ type: DeveloperApiKeyDto })
  apiKey!: DeveloperApiKeyDto;

  @ApiProperty()
  secret!: string;
}

export class DeveloperApiKeyListResponseDto {
  @ApiProperty({ type: [DeveloperApiKeyDto] })
  data!: DeveloperApiKeyDto[];

  @ApiProperty()
  pagination!: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}
