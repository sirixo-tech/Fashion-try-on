import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from "class-validator";

export class CreateShopifyLinkSessionDto {
  @ApiProperty({ example: "merchant-store.myshopify.com" })
  @IsString()
  @MaxLength(180)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)
  shopDomain!: string;

  @ApiProperty({ example: "gid://shopify/Shop/123456789" })
  @IsString()
  @MaxLength(180)
  @Matches(/^gid:\/\/shopify\/Shop\/\d+$/)
  externalAccountId!: string;

  @ApiPropertyOptional({ example: "Merchant Store" })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  externalAccountName?: string;
}

export class ApproveShopifyLinkSessionDto {
  @ApiProperty()
  @IsUUID()
  storeId!: string;
}

export class ShopifyLinkSessionCreatedDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({
    description:
      "One-time opaque link token. Keep it server-side after redirect construction.",
  })
  linkToken!: string;

  @ApiProperty()
  approvalUrl!: string;

  @ApiProperty()
  expiresAt!: string;
}

export class ShopifyLinkSessionDetailsDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ["PENDING", "APPROVED", "REDEEMED"] })
  status!: "PENDING" | "APPROVED" | "REDEEMED";

  @ApiProperty()
  shopDomain!: string;

  @ApiPropertyOptional()
  externalAccountName!: string | null;

  @ApiProperty()
  expiresAt!: string;
}

export class ShopifyLinkSessionApprovalDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ["APPROVED", "REDEEMED"] })
  status!: "APPROVED" | "REDEEMED";

  @ApiProperty()
  shopDomain!: string;

  @ApiProperty()
  storeId!: string;

  @ApiProperty()
  storeName!: string;

  @ApiProperty()
  approvedAt!: string;

  @ApiProperty()
  expiresAt!: string;
}

export class ShopifyLinkSessionRedeemedDto {
  @ApiProperty({ enum: ["LINKED"] })
  status!: "LINKED";

  @ApiProperty()
  shopDomain!: string;

  @ApiProperty()
  storeId!: string;

  @ApiProperty()
  storeName!: string;

  @ApiProperty()
  integrationId!: string;

  @ApiProperty()
  credentialId!: string;

  @ApiProperty({
    description:
      "One-time SelfX catalog credential returned only on successful redemption.",
  })
  integrationToken!: string;
}
