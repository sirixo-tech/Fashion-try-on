import { randomBytes } from "node:crypto";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  Patch,
} from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
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
  StorefrontLimitsDto,
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
  @Get("settings")
  @RequireIntegrationScopes("tryon:create")
  settings(@IntegrationCredential() credential: IntegrationCredentialContext) {
    return this.storefront.wooSettings(credential);
  }
  @Patch("settings")
  @RequireIntegrationScopes("tryon:create")
  saveSettings(
    @IntegrationCredential() credential: IntegrationCredentialContext,
    @Body() input: StorefrontLimitsDto,
  ) {
    return this.storefront.saveWooSettings(credential, input);
  }
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
  @Post(":session/visitor")
  async visitor(
    @Param() input: ShopifyStorefrontTryOnSessionParamDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const secure = process.env.NODE_ENV === "production";
    const name = secure
      ? "__Host-selfx_storefront_visitor"
      : "selfx_storefront_visitor";
    const existing = request.cookies[name];
    const token =
      existing && /^[A-Za-z0-9_-]{43}$/.test(existing)
        ? existing
        : randomBytes(32).toString("base64url");
    const result = await this.storefront.bindFirstPartyVisitor(
      input.session,
      token,
    );
    reply.header("Cache-Control", "no-store");
    if (result.cookieRequired && token !== existing)
      reply.setCookie(name, token, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
      });
    return { bound: true };
  }
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
