import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateShopifyStorefrontTryOnSessionDto {
  @ApiProperty({ example: "shopify" })
  @IsIn(["shopify"])
  source!: "shopify";

  @ApiProperty({ example: "merchant-store.myshopify.com" })
  @IsString()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)
  shop!: string;

  @ApiPropertyOptional({ example: "gid://shopify/Product/1001" })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  externalProductId?: string;

  @ApiPropertyOptional({ example: "linen-shirt" })
  @IsOptional()
  @IsString()
  @MaxLength(220)
  productHandle?: string;
}

export class CreateShopifyStorefrontTryOnRunDto {
  @ApiPropertyOptional({ example: "shopify-look-0198a9b3-d0bc" })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  clientRequestId?: string;
}

export class ShopifyStorefrontTryOnProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  handle?: string;

  @ApiPropertyOptional()
  externalProductId?: string;

  @ApiPropertyOptional()
  imageUrl?: string;
}

export class ShopifyStorefrontTryOnSessionDto {
  @ApiProperty()
  session!: string;

  @ApiProperty()
  garmentAssetId!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiProperty({ type: ShopifyStorefrontTryOnProductDto })
  product!: ShopifyStorefrontTryOnProductDto;
}

export class ShopifyStorefrontTryOnPersonUploadDto {
  @ApiProperty()
  session!: string;

  @ApiProperty()
  personAssetId!: string;

  @ApiProperty()
  expiresAt!: string;
}

export class ShopifyStorefrontTryOnResultDto {
  @ApiProperty()
  assetId!: string;

  @ApiProperty()
  readUrl!: string;

  @ApiPropertyOptional()
  downloadUrl?: string;

  @ApiPropertyOptional()
  contentType?: string;

  @ApiProperty()
  expiresAt!: string;
}

export class ShopifyStorefrontTryOnRunDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"] })
  status!: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";

  @ApiProperty()
  session!: string;

  @ApiProperty({ type: ShopifyStorefrontTryOnProductDto })
  product!: ShopifyStorefrontTryOnProductDto;

  @ApiPropertyOptional({ type: ShopifyStorefrontTryOnResultDto })
  result?: ShopifyStorefrontTryOnResultDto;

  @ApiPropertyOptional()
  errorCode?: string;

  @ApiPropertyOptional()
  errorMessage?: string;
}

export class ShopifyStorefrontTryOnSessionParamDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  session!: string;
}

export class ShopifyStorefrontTryOnRunParamDto extends ShopifyStorefrontTryOnSessionParamDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  runId!: string;
}
