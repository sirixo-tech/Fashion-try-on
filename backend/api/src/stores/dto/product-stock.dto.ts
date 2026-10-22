import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export const STOCK_OPTION_MODES = [
  "SINGLE",
  "SIZE",
  "COLOR",
  "SIZE_COLOR",
] as const;
export const STOCK_PRICING_MODES = ["CONSTANT", "VARIANT"] as const;
export type StockOptionMode = (typeof STOCK_OPTION_MODES)[number];
export type StockPricingMode = (typeof STOCK_PRICING_MODES)[number];

export class ProductStockVariantInputDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  size?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  color?: string | null;

  @ApiProperty({ minimum: 0, maximum: 1000000 })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stockQuantity!: number;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 100000000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  priceOverrideAmountCents?: number | null;
}

export class UpdateProductStockDto {
  @ApiPropertyOptional({ type: () => [ProductColorImageDto], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductColorImageDto)
  colorImages?: ProductColorImageDto[];
  @ApiPropertyOptional({
    nullable: true,
    description:
      "Override Store default tax rate; null inherits. 100 basis points = 1%.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  taxRateBasisPoints?: number | null;
  @ApiProperty({ description: "Version returned by GET; 0 for initial setup." })
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  expectedVersion!: number;

  @ApiProperty({ enum: STOCK_OPTION_MODES })
  @IsIn(STOCK_OPTION_MODES)
  optionMode!: StockOptionMode;

  @ApiProperty({ enum: STOCK_PRICING_MODES })
  @IsIn(STOCK_PRICING_MODES)
  pricingMode!: StockPricingMode;

  @ApiProperty({ type: [ProductStockVariantInputDto], maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductStockVariantInputDto)
  variants!: ProductStockVariantInputDto[];

  @ApiProperty({
    description: "Staff explanation retained in the audit record.",
  })
  @IsString()
  @MaxLength(300)
  @Matches(/\S/)
  reason!: string;
}

export class ProductColorImageDto {
  @ApiProperty() @IsString() @MaxLength(80) color!: string;
  @ApiProperty() @IsString() @MaxLength(512) storageKey!: string;
  @ApiProperty()
  @IsIn(["image/jpeg", "image/png", "image/webp"])
  contentType!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(10000) width!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(10000) height!: number;
}

export class ProductColorImageResponseDto extends ProductColorImageDto {
  @ApiProperty({ nullable: true, type: String }) url!: string | null;
}

export class ProductStockVariantDto {
  @ApiProperty() reservedStockQuantity!: number;
  @ApiProperty() availableStockQuantity!: number;
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) size!: string | null;
  @ApiProperty({ nullable: true }) color!: string | null;
  @ApiProperty() stockQuantity!: number;
  @ApiProperty({ nullable: true }) priceOverrideAmountCents!: number | null;
  @ApiProperty({ nullable: true }) effectivePriceAmountCents!: number | null;
}

export class ProductStockDto {
  @ApiProperty() productName!: string;
  @ApiProperty({ nullable: true }) imageUrl!: string | null;
  @ApiPropertyOptional() storeName?: string;
  @ApiProperty({ type: [ProductColorImageResponseDto] })
  colorImages!: ProductColorImageResponseDto[];
  @ApiProperty({ nullable: true }) taxRateBasisPoints!: number | null;
  @ApiProperty() totalReservedStockQuantity!: number;
  @ApiProperty() totalAvailableStockQuantity!: number;
  @ApiProperty() productId!: string;
  @ApiProperty() configured!: boolean;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: STOCK_OPTION_MODES }) optionMode!: StockOptionMode;
  @ApiProperty({ enum: STOCK_PRICING_MODES }) pricingMode!: StockPricingMode;
  @ApiProperty({ nullable: true }) basePriceAmountCents!: number | null;
  @ApiProperty({ nullable: true }) priceCurrency!: string | null;
  @ApiProperty() totalStockQuantity!: number;
  @ApiProperty({ type: [ProductStockVariantDto] })
  variants!: ProductStockVariantDto[];
}
