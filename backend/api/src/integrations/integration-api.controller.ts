import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";

import {
  IntegrationCatalogSyncInputDto,
  IntegrationCatalogSyncResponseDto,
} from "./dto/integration-catalog-sync.dto.js";
import { IntegrationApiMeResponseDto } from "./dto/integration-api.dto.js";
import { IntegrationCatalogSyncService } from "./integration-catalog-sync.service.js";
import {
  IntegrationCredential,
  RequireIntegrationScopes,
} from "./integration-token.decorators.js";
import { type IntegrationCredentialContext } from "./integration-token-auth.service.js";

@ApiTags("Integrations")
@ApiSecurity("SelfXIntegrationToken")
@Controller("api/v1/integrations")
export class IntegrationApiController {
  constructor(private readonly catalogSync: IntegrationCatalogSyncService) {}

  @Get("me")
  @RequireIntegrationScopes()
  @ApiOperation({
    summary: "Inspect the current integration plugin credential",
    description:
      "Validates the supplied plugin token and returns its Store and integration context.",
  })
  @ApiHeader({
    name: "x-selfx-integration-token",
    required: false,
    description:
      "Preferred integration token header. Authorization: Bearer is also supported.",
  })
  @ApiOkResponse({ type: IntegrationApiMeResponseDto })
  me(
    @IntegrationCredential() credential: IntegrationCredentialContext,
  ): IntegrationApiMeResponseDto {
    return {
      authenticated: true,
      tokenPrefix: credential.tokenPrefix,
      integrationId: credential.integrationId,
      integrationType: credential.integrationType,
      externalAccountId: credential.externalAccountId,
      externalAccountName: credential.externalAccountName,
      scopes: credential.scopes,
      store: {
        id: credential.storeId,
        name: credential.storeName,
      },
      serverTime: new Date().toISOString(),
    };
  }

  @Post("catalog/sync")
  @HttpCode(HttpStatus.OK)
  @RequireIntegrationScopes("catalog:sync")
  @ApiOperation({
    summary: "Synchronize commerce products into SelfX",
    description:
      "One-way ingestion for Try-On. Shopify or WooCommerce remains authoritative; this endpoint cannot write back to the commerce platform.",
  })
  @ApiHeader({
    name: "x-selfx-integration-token",
    required: false,
    description:
      "Preferred integration token header. Authorization: Bearer is also supported.",
  })
  @ApiOkResponse({ type: IntegrationCatalogSyncResponseDto })
  syncCatalog(
    @IntegrationCredential() credential: IntegrationCredentialContext,
    @Body() input: IntegrationCatalogSyncInputDto,
  ): Promise<IntegrationCatalogSyncResponseDto> {
    return this.catalogSync.sync(credential, input);
  }
}
