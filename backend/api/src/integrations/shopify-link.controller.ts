import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import {
  CreateShopifyLinkSessionDto,
  ShopifyLinkSessionCreatedDto,
  ShopifyLinkSessionRedeemedDto,
} from "./dto/shopify-link.dto.js";
import { ShopifyAppServiceAuthService } from "./shopify-app-service-auth.service.js";
import { ShopifyLinkService } from "./shopify-link.service.js";

export const SHOPIFY_APP_SERVICE_TOKEN_HEADER = "x-selfx-shopify-service-token";

@ApiTags("Shopify Linking")
@Controller("api/v1/integrations/shopify/link-sessions")
export class ShopifyLinkController {
  constructor(
    private readonly serviceAuth: ShopifyAppServiceAuthService,
    private readonly links: ShopifyLinkService,
  ) {}

  @Post()
  @ApiOperation({
    summary: "Create a short-lived Shopify-to-SelfX link session",
  })
  @ApiHeader({ name: SHOPIFY_APP_SERVICE_TOKEN_HEADER, required: true })
  @ApiCreatedResponse({ type: ShopifyLinkSessionCreatedDto })
  create(
    @Headers(SHOPIFY_APP_SERVICE_TOKEN_HEADER) serviceToken: string | undefined,
    @Body() dto: CreateShopifyLinkSessionDto,
  ): Promise<ShopifyLinkSessionCreatedDto> {
    this.serviceAuth.requireServiceToken(serviceToken);
    return this.links.create(dto);
  }

  @Post(":linkToken/redeem")
  @ApiOperation({ summary: "Redeem an approved Shopify Store link once" })
  @ApiHeader({ name: SHOPIFY_APP_SERVICE_TOKEN_HEADER, required: true })
  @ApiOkResponse({ type: ShopifyLinkSessionRedeemedDto })
  redeem(
    @Headers(SHOPIFY_APP_SERVICE_TOKEN_HEADER) serviceToken: string | undefined,
    @Param("linkToken") linkToken: string,
  ): Promise<ShopifyLinkSessionRedeemedDto> {
    this.serviceAuth.requireServiceToken(serviceToken);
    return this.links.redeem(linkToken);
  }
}
