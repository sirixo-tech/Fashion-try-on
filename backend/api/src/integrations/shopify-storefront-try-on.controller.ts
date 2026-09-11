import { Body, Controller, Get, Headers, Param, Post, Req } from "@nestjs/common";
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";

import { parsePublicApiUploadMultipartRequest } from "../developer-api/public-api-upload.multipart.js";
import { SHOPIFY_APP_SERVICE_TOKEN_HEADER } from "./shopify-link.controller.js";
import { ShopifyAppServiceAuthService } from "./shopify-app-service-auth.service.js";
import {
  CreateShopifyStorefrontTryOnRunDto,
  CreateShopifyStorefrontTryOnSessionDto,
  ShopifyStorefrontTryOnPersonUploadDto,
  ShopifyStorefrontTryOnRunDto,
  ShopifyStorefrontTryOnRunParamDto,
  ShopifyStorefrontTryOnSessionDto,
  ShopifyStorefrontTryOnSessionParamDto,
} from "./dto/shopify-storefront-try-on.dto.js";
import { ShopifyStorefrontTryOnService } from "./shopify-storefront-try-on.service.js";

@ApiTags("Shopify Storefront Try-On")
@Controller("api/v1/public/integrations/shopify/try-on-sessions")
export class ShopifyStorefrontTryOnController {
  constructor(
    private readonly serviceAuth: ShopifyAppServiceAuthService,
    private readonly tryOns: ShopifyStorefrontTryOnService,
  ) {}

  @Post()
  @ApiOperation({
    summary: "Create a Shopify storefront Try-On launch session",
    description:
      "Requires Shopify app service authentication. Resolves a connected Shopify product from the synced catalog and stores the product image as the garment input. The shopper still supplies only their own person image.",
  })
  @ApiConsumes("application/json")
  @ApiBody({ type: CreateShopifyStorefrontTryOnSessionDto })
  @ApiCreatedResponse({ type: ShopifyStorefrontTryOnSessionDto })
  createSession(
    @Headers(SHOPIFY_APP_SERVICE_TOKEN_HEADER) serviceToken: string | undefined,
    @Body() body: CreateShopifyStorefrontTryOnSessionDto,
  ): Promise<ShopifyStorefrontTryOnSessionDto> {
    this.serviceAuth.requireServiceToken(serviceToken);
    return this.tryOns.createSession(body);
  }

  @Get(":session")
  @ApiOperation({
    summary: "Read a public Shopify storefront Try-On session",
  })
  @ApiOkResponse({ type: ShopifyStorefrontTryOnSessionDto })
  getSession(
    @Param() params: ShopifyStorefrontTryOnSessionParamDto,
  ): Promise<ShopifyStorefrontTryOnSessionDto> {
    return this.tryOns.getSession(params.session);
  }

  @Post(":session/person-image")
  @ApiOperation({
    summary: "Upload the shopper person image for a Shopify Try-On session",
  })
  @ApiConsumes("multipart/form-data")
  @ApiCreatedResponse({ type: ShopifyStorefrontTryOnPersonUploadDto })
  async uploadPersonImage(
    @Param() params: ShopifyStorefrontTryOnSessionParamDto,
    @Req() request: FastifyRequest,
  ): Promise<ShopifyStorefrontTryOnPersonUploadDto> {
    const payload = await parsePublicApiUploadMultipartRequest(request);
    return this.tryOns.uploadPersonImage(params.session, payload);
  }

  @Post(":session/runs")
  @ApiOperation({
    summary: "Start a public Shopify storefront Try-On run",
  })
  @ApiBody({ type: CreateShopifyStorefrontTryOnRunDto })
  @ApiCreatedResponse({ type: ShopifyStorefrontTryOnRunDto })
  createRun(
    @Param() params: ShopifyStorefrontTryOnSessionParamDto,
    @Body() body: CreateShopifyStorefrontTryOnRunDto,
  ): Promise<ShopifyStorefrontTryOnRunDto> {
    return this.tryOns.createRun(params.session, body);
  }

  @Get(":session/runs/:runId")
  @ApiOperation({
    summary: "Read a public Shopify storefront Try-On run",
  })
  @ApiOkResponse({ type: ShopifyStorefrontTryOnRunDto })
  getRun(
    @Param() params: ShopifyStorefrontTryOnRunParamDto,
  ): Promise<ShopifyStorefrontTryOnRunDto> {
    return this.tryOns.getRun(params.session, params.runId);
  }
}
