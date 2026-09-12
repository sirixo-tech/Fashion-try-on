import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export const integrationProductTryOnStatuses = [
  "READY",
  "DISABLED",
  "INACTIVE",
  "MISSING_IMAGE",
  "NOT_GARMENT",
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
  summary!: {
    total: number;
    ready: number;
    disabled: number;
    needsAttention: number;
  };
}
