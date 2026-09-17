import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  PRODUCT_VERTICALS,
  JEWELLERY_TYPES,
  type ProductVertical,
  type JewelleryType,
} from "../../catalog/product-kind.js";

export const integrationProductTryOnStatuses = [
  "READY",
  "DISABLED",
  "INACTIVE",
  "MISSING_IMAGE",
  "MISSING_JEWELLERY_TYPE",
  "NEEDS_CLASSIFICATION",
] as const;
export type IntegrationProductTryOnStatus =
  (typeof integrationProductTryOnStatuses)[number];

export class IntegrationProductControlsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  offset?: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  search?: string;
}

export class UpdateIntegrationProductKindDto {
  @IsString()
  @MaxLength(180)
  externalProductId!: string;

  @IsIn(PRODUCT_VERTICALS)
  productVertical!: ProductVertical;

  @IsOptional()
  @IsIn(JEWELLERY_TYPES)
  jewelleryType?: JewelleryType | null;
}

export class UpdateIntegrationProductVtoDto {
  @IsString()
  @MaxLength(180)
  externalProductId!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class IntegrationProductControlsDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  externalProductId!: string;

  @ApiPropertyOptional({ nullable: true })
  handle!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  active!: boolean;

  @ApiProperty()
  vtoEnabled!: boolean;

  @ApiProperty()
  productVertical!: string;

  @ApiPropertyOptional({ enum: JEWELLERY_TYPES, nullable: true })
  jewelleryType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ enum: integrationProductTryOnStatuses })
  tryOnStatus!: IntegrationProductTryOnStatus;

  @ApiProperty()
  updatedAt!: string;
}

export class IntegrationProductControlsResponseDto {
  @ApiProperty({ type: [IntegrationProductControlsDto] })
  data!: IntegrationProductControlsDto[];

  @ApiProperty()
  hasMore!: boolean;

  @ApiProperty()
  summary!: {
    total: number;
    ready: number;
    disabled: number;
    needsAttention: number;
  };
}
