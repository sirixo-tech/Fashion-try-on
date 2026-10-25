import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  type IntegrationHealthDto,
  integrationHealthOptions,
} from "./integration.dto.js";

export class WooCommerceOverviewQueryDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(integrationHealthOptions)
  health?: IntegrationHealthDto;

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
}

export type WooCommerceOverviewRow = {
  id: string;
  storeId: string;
  storeName: string;
  website: string | null;
  externalAccountName: string | null;
  health: IntegrationHealthDto;
  healthReasons: string[];
  productCount: number;
  successfulTryOns: number;
  lastCatalogSyncAt: string | null;
};

export type WooCommerceOverviewResponse = {
  data: WooCommerceOverviewRow[];
  summary: {
    total: number;
    connected: number;
    needsAttention: number;
    disconnected: number;
    successfulTryOns: number;
  };
  period: { from: string; to: string; days: 30 };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
};
