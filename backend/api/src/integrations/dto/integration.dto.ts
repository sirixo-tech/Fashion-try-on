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

export const integrationTypeOptions = ["SHOPIFY", "WOOCOMMERCE"] as const;
export type IntegrationTypeDto = (typeof integrationTypeOptions)[number];

export const integrationCredentialScopeOptions = [
  "catalog:sync",
  "products:read",
  "tryon:create",
  "tryon:read",
  "webhooks:receive",
] as const;
export type IntegrationCredentialScopeDto =
  (typeof integrationCredentialScopeOptions)[number];

export class IntegrationListQueryDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsIn(integrationTypeOptions)
  type?: IntegrationTypeDto;

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

export class UpsertIntegrationDto {
  @ApiProperty()
  @IsUUID()
  storeId!: string;

  @ApiProperty({ enum: integrationTypeOptions })
  @IsIn(integrationTypeOptions)
  type!: IntegrationTypeDto;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  externalAccountId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  externalAccountName?: string | null;
}

export class CreateIntegrationCredentialDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    enum: integrationCredentialScopeOptions,
    isArray: true,
  })
  @IsArray()
  @ArrayMaxSize(integrationCredentialScopeOptions.length)
  @IsIn(integrationCredentialScopeOptions, { each: true })
  scopes!: IntegrationCredentialScopeDto[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;
}

export class IntegrationCredentialDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  integrationId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  tokenPrefix!: string;

  @ApiProperty({ enum: integrationCredentialScopeOptions, isArray: true })
  scopes!: IntegrationCredentialScopeDto[];

  @ApiProperty()
  status!: "ACTIVE" | "REVOKED";

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

export class IntegrationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  storeId!: string;

  @ApiProperty()
  storeName!: string;

  @ApiProperty({ enum: integrationTypeOptions })
  type!: IntegrationTypeDto;

  @ApiProperty()
  status!: "ACTIVE" | "DISCONNECTED" | "ERROR";

  @ApiPropertyOptional({ nullable: true })
  externalAccountId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  externalAccountName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  connectedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  disconnectedAt!: string | null;

  @ApiProperty({ type: [IntegrationCredentialDto] })
  credentials!: IntegrationCredentialDto[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class CreateIntegrationCredentialResponseDto {
  @ApiProperty({ type: IntegrationCredentialDto })
  credential!: IntegrationCredentialDto;

  @ApiProperty()
  secret!: string;
}

export class IntegrationListResponseDto {
  @ApiProperty({ type: [IntegrationDto] })
  data!: IntegrationDto[];

  @ApiProperty()
  pagination!: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}
