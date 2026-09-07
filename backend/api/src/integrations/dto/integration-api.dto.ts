import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import {
  type IntegrationCredentialScopeDto,
  type IntegrationTypeDto,
  integrationCredentialScopeOptions,
  integrationTypeOptions,
} from "./integration.dto.js";

export class IntegrationApiStoreContextDto {
  @ApiProperty({ example: "0198a9b3-d0bc-7000-8000-000000000001" })
  id!: string;

  @ApiProperty({ example: "Demo Store" })
  name!: string;
}

export class IntegrationApiMeResponseDto {
  @ApiProperty({ example: true })
  authenticated!: true;

  @ApiProperty({ example: "selfx_shopify_abcd1234" })
  tokenPrefix!: string;

  @ApiProperty({ example: "0198a9b3-d0bc-7000-8000-000000000111" })
  integrationId!: string;

  @ApiProperty({ enum: integrationTypeOptions, example: "SHOPIFY" })
  integrationType!: IntegrationTypeDto;

  @ApiPropertyOptional({ nullable: true, example: "demo.myshopify.com" })
  externalAccountId!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "Demo Shop" })
  externalAccountName!: string | null;

  @ApiProperty({
    enum: integrationCredentialScopeOptions,
    isArray: true,
    example: ["catalog:sync", "tryon:create", "tryon:read"],
  })
  scopes!: IntegrationCredentialScopeDto[];

  @ApiProperty({ type: IntegrationApiStoreContextDto })
  store!: IntegrationApiStoreContextDto;

  @ApiProperty({ example: "2026-09-07T12:00:00.000Z" })
  serverTime!: string;
}
