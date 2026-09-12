import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
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
import {
  IntegrationProductControlsQueryDto,
  IntegrationProductControlsResponseDto,
  UpdateIntegrationProductVtoDto,
  IntegrationProductControlsDto,
} from "./dto/integration-product-controls.dto.js";
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

  @Get("products")
  @RequireIntegrationScopes("catalog:sync")
  @ApiOperation({
    summary: "List commerce products controlled by this integration",
    description:
      "Returns only products imported by the authenticated integration credential. Intended for commerce app dashboards such as Shopify.",
  })
  @ApiHeader({
    name: "x-selfx-integration-token",
    required: false,
    description:
      "Preferred integration token header. Authorization: Bearer is also supported.",
  })
  @ApiOkResponse({ type: IntegrationProductControlsResponseDto })
  listProducts(
    @IntegrationCredential() credential: IntegrationCredentialContext,
    @Query() query: IntegrationProductControlsQueryDto,
  ): Promise<IntegrationProductControlsResponseDto> {
    return this.catalogSync.listProductControls(credential, query);
  }

  @Patch("products/vto")
  @RequireIntegrationScopes("catalog:sync")
  @ApiOperation({
    summary: "Enable or disable Try-On for one imported commerce product",
    description:
      "Updates only SelfX VTO eligibility for a product imported by the authenticated integration. This does not modify the commerce platform product.",
  })
  @ApiHeader({
    name: "x-selfx-integration-token",
    required: false,
    description:
      "Preferred integration token header. Authorization: Bearer is also supported.",
  })
  @ApiOkResponse({ type: IntegrationProductControlsDto })
  updateProductVto(
    @IntegrationCredential() credential: IntegrationCredentialContext,
    @Body() input: UpdateIntegrationProductVtoDto,
  ): Promise<IntegrationProductControlsDto> {
    return this.catalogSync.updateProductVto(credential, input);
  }
}
