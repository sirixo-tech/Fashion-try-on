import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ApiTags } from "@nestjs/swagger";
import { parsePublicApiUploadMultipartRequest } from "../developer-api/public-api-upload.multipart.js";
import { CommerceStorefrontTryOnService } from "./commerce-storefront-try-on.service.js";
import {
  IntegrationCredential,
  RequireIntegrationScopes,
} from "./integration-token.decorators.js";
import type { IntegrationCredentialContext } from "./integration-token-auth.service.js";
import {
  WooCommerceLaunchDto,
  WooCommerceAvailabilityDto,
  StorefrontConsentDto,
} from "./dto/commerce-storefront.dto.js";
import {
  CreateShopifyStorefrontTryOnRunDto,
  ShopifyStorefrontTryOnSessionParamDto,
  ShopifyStorefrontTryOnRunParamDto,
} from "./dto/shopify-storefront-try-on.dto.js";

@ApiTags("Commerce storefront")
@Controller("api/v1/integrations/storefront")
export class WooCommerceStorefrontController {
  constructor(private readonly storefront: CommerceStorefrontTryOnService) {}
  @Get("availability")
  @RequireIntegrationScopes("tryon:create")
  availability(
    @IntegrationCredential() credential: IntegrationCredentialContext,
    @Query() query: WooCommerceAvailabilityDto,
  ) {
    return this.storefront.wooAvailability(credential, query.externalProductId);
  }
  @Post("try-on-sessions")
  @RequireIntegrationScopes("tryon:create")
  async launch(
    @IntegrationCredential() credential: IntegrationCredentialContext,
    @Body() input: WooCommerceLaunchDto,
  ) {
    const base = new URL(process.env.SELFX_WEB_BASE_URL ?? "");
    if (
      base.username ||
      base.password ||
      (base.protocol !== "https:" &&
        !(
          base.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(base.hostname)
        ))
    )
      throw new Error("SELFX_WEB_BASE_URL must be a trusted HTTPS web origin.");
    const session = await this.storefront.createWooCommerceSession(
      credential,
      input,
    );
    const launch = new URL("/try-on/commerce", base);
    launch.hash = new URLSearchParams({ session: session.session }).toString();
    return { launchUrl: launch.href, expiresAt: session.expiresAt };
  }
}

@ApiTags("Commerce storefront")
@Controller("api/v1/public/integrations/commerce/try-on-sessions")
export class CommerceStorefrontController {
  constructor(private readonly storefront: CommerceStorefrontTryOnService) {}
  @Get(":session")
  session(@Param() input: ShopifyStorefrontTryOnSessionParamDto) {
    return this.storefront.getSession(input.session);
  }
  @Post(":session/consent")
  consent(
    @Param() input: ShopifyStorefrontTryOnSessionParamDto,
    @Body() _consent: StorefrontConsentDto,
  ) {
    // ValidationPipe validates the explicit consent body before this handler.
    void _consent;
    return this.storefront.acceptPhotoConsent(input.session);
  }
  @Post(":session/person-image")
  async upload(
    @Param() input: ShopifyStorefrontTryOnSessionParamDto,
    @Req() request: FastifyRequest,
  ) {
    await this.storefront.requirePhotoConsent(input.session);
    return this.storefront.uploadPersonImage(
      input.session,
      await parsePublicApiUploadMultipartRequest(request),
    );
  }
  @Post(":session/runs")
  run(
    @Param() input: ShopifyStorefrontTryOnSessionParamDto,
    @Body() body: CreateShopifyStorefrontTryOnRunDto,
  ) {
    return this.storefront.createRun(input.session, body);
  }
  @Get(":session/runs/:runId")
  result(@Param() input: ShopifyStorefrontTryOnRunParamDto) {
    return this.storefront.getRun(input.session, input.runId);
  }
}
