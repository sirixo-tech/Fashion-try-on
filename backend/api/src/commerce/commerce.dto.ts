import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export const TAX_MODES = ["OFF", "INCLUSIVE", "EXCLUSIVE"] as const;
export type TaxMode = (typeof TAX_MODES)[number];
export const ORDER_STATUSES = [
  "AWAITING_PAYMENT",
  "PAYMENT_PENDING",
  "PAID",
  "PAID_REVIEW",
  "CANCELLED",
  "EXPIRED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export class UpdateStoreTaxDto {
  @ApiProperty() @IsInt() @Min(0) @Max(2_000_000_000) expectedVersion!: number;
  @ApiProperty({ enum: TAX_MODES }) @IsIn(TAX_MODES) mode!: TaxMode;
  @ApiProperty({ description: "100 basis points = 1%; allowed range 0–100%." })
  @IsInt()
  @Min(0)
  @Max(10000)
  rateBasisPoints!: number;
}
export class ShoppingCartItemInputDto {
  @ApiProperty() @IsUUID() variantId!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(1_000_000) quantity!: number;
}
export class UpdateShoppingCartDto {
  @ApiProperty() @IsInt() @Min(0) @Max(2_000_000_000) expectedVersion!: number;
  @ApiProperty({ type: [ShoppingCartItemInputDto], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ShoppingCartItemInputDto)
  items!: ShoppingCartItemInputDto[];
}
export class CheckoutShoppingCartDto {
  @ApiProperty() @IsInt() @Min(1) @Max(2_000_000_000) expectedVersion!: number;
  @ApiProperty() @Matches(/^[a-f0-9]{64}$/) quoteFingerprint!: string;
  @ApiProperty({
    description:
      "Retry with the same key and identical request after a network interruption.",
  })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,100}$/)
  idempotencyKey!: string;
}
export class CancelShoppingOrderDto {
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(300) reason!: string;
}
export class ShoppingOrderListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
