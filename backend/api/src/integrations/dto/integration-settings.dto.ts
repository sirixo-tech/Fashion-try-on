import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

export const shopifyTryOnModes = ["GARMENT", "JEWELLERY", "BOTH"] as const;
export type ShopifyTryOnMode = (typeof shopifyTryOnModes)[number];

export class UpdateIntegrationShopifySettingsDto {
  @ApiProperty({ enum: shopifyTryOnModes })
  @IsIn(shopifyTryOnModes)
  tryOnMode!: ShopifyTryOnMode;
}

export class IntegrationShopifySettingsDto {
  @ApiProperty({ enum: shopifyTryOnModes })
  tryOnMode!: ShopifyTryOnMode;
}
