import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsUUID, Length, Matches, MaxLength } from "class-validator";

export class StartShopifyOauthDto {
  @ApiProperty()
  @IsUUID()
  storeId!: string;

  @ApiProperty({ example: "merchant-store.myshopify.com" })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i)
  @MaxLength(180)
  shop!: string;
}

export class ShopifyOauthCallbackDto {
  @IsString()
  @Length(1, 1024)
  code!: string;

  @IsString()
  @Length(64, 64)
  hmac!: string;

  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i)
  @MaxLength(180)
  shop!: string;

  @IsString()
  @Length(32, 256)
  state!: string;

  @IsString()
  @Matches(/^\d{10,13}$/)
  timestamp!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1024)
  host?: string;
}

export class ShopifyOauthStartResponseDto {
  @ApiProperty()
  authorizationUrl!: string;

  @ApiProperty()
  expiresAt!: string;
}
