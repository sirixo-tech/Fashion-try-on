import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  Optional,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { type FastifyReply, type FastifyRequest } from "fastify";

import { AuthService } from "../auth/auth.service.js";
import { ApiErrorResponseDto } from "../auth/dto/auth-response.dto.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import {
  PLATFORM_PERMISSIONS,
  type PlatformPermission,
} from "../platform/platform-permissions.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import {
  STORE_PERMISSION_CODES,
  type StorePermissionCode,
} from "../rbac/store-permissions.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import {
  CreateIntegrationCredentialDto,
  CreateIntegrationCredentialResponseDto,
  IntegrationCredentialDto,
  IntegrationDto,
  IntegrationListQueryDto,
  IntegrationListResponseDto,
  UpsertIntegrationDto,
} from "./dto/integration.dto.js";
import { IntegrationsService } from "./integrations.service.js";
import {
  ShopifyOauthCallbackDto,
  ShopifyOauthStartResponseDto,
  StartShopifyOauthDto,
} from "./dto/shopify-oauth.dto.js";
import { ShopifyOauthService } from "./shopify-oauth.service.js";

@ApiTags("Integrations")
@ApiBearerAuth()
@Controller("api/v1/admin/integrations")
export class IntegrationsController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformAuthorization: PlatformAuthorizationService,
    private readonly rbac: StoreRbacService,
    private readonly integrations: IntegrationsService,
    private readonly shopifyOauth: ShopifyOauthService,
    @Optional() private readonly entitlements?: EntitlementsService,
  ) {}

  @Post("shopify/oauth/start")
  @ApiOperation({ summary: "Start the read-only Shopify install flow" })
  @ApiOkResponse({ type: ShopifyOauthStartResponseDto })
  async startShopifyOauth(
    @Req() request: FastifyRequest,
    @Body() dto: StartShopifyOauthDto,
  ): Promise<ShopifyOauthStartResponseDto> {
    const user = await this.requirePlatformOrStorePermission(
      request,
      dto.storeId,
      [PLATFORM_PERMISSIONS.integrationsManage],
      STORE_PERMISSION_CODES.integrationsManage,
      "SHOPIFY_INTEGRATION",
    );
    await this.rbac.requireStoreResourcePermission(
      user.id,
      dto.storeId,
      STORE_PERMISSION_CODES.productsManage,
    );
    await this.entitlements?.assertStoreHasFeature(
      dto.storeId,
      "SHOPIFY_INTEGRATION",
    );
    return this.shopifyOauth.start(user.id, dto.storeId, dto.shop);
  }

  @Get("shopify/oauth/callback")
  @ApiOperation({ summary: "Complete the Shopify install callback" })
  async completeShopifyOauth(
    @Query() query: ShopifyOauthCallbackDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const result = await this.shopifyOauth.complete(query);
    const destination = this.shopifyOauth.successRedirect(
      result.storeId,
      result.syncStatus,
    );
    // Show a useful result even when an embedded browser does not follow the
    // callback's navigation. The link only targets our configured web origin.
    const safeDestination = escapeHtmlAttribute(destination);
    const message =
      result.syncStatus === "COMPLETED"
        ? "Shopify catalog access is connected. Return to SelfX to review the Store link."
        : "Shopify catalog access is connected, but the first sync needs a retry.";
    reply.header("Cache-Control", "no-store");
    reply.type("text/html; charset=utf-8").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="2;url=${safeDestination}"><title>Shopify connection · SelfX</title></head>
<body><main><h1>Shopify connection saved</h1><p>${message}</p>
<p><a href="${safeDestination}">Continue to SelfX</a></p></main></body></html>`);
  }

  @Post(":integrationId/shopify/sync")
  @ApiOperation({ summary: "Run a read-only Shopify catalog sync" })
  async syncShopify(
    @Req() request: FastifyRequest,
    @Param("integrationId", SelfxUuidParamPipe) integrationId: string,
  ) {
    const storeId = await this.integrations.integrationStoreId(integrationId);
    const user = await this.requirePlatformOrStorePermission(
      request,
      storeId,
      [PLATFORM_PERMISSIONS.integrationsManage],
      STORE_PERMISSION_CODES.integrationsManage,
      "SHOPIFY_INTEGRATION",
    );
    await this.rbac.requireStoreResourcePermission(
      user.id,
      storeId,
      STORE_PERMISSION_CODES.productsManage,
    );
    await this.entitlements?.assertStoreHasFeature(
      storeId,
      "SHOPIFY_INTEGRATION",
    );
    return this.shopifyOauth.sync(user.id, integrationId);
  }

  @Get()
  @ApiOperation({ summary: "List Store integrations" })
  @ApiOkResponse({ type: IntegrationListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async list(
    @Req() request: FastifyRequest,
    @Query() query: IntegrationListQueryDto,
  ): Promise<IntegrationListResponseDto> {
    await this.requirePlatformOrStorePermission(
      request,
      query.storeId,
      [
        PLATFORM_PERMISSIONS.integrationsView,
        PLATFORM_PERMISSIONS.integrationsManage,
      ],
      STORE_PERMISSION_CODES.integrationsView,
    );
    return this.integrations.listIntegrations(query);
  }

  @Post()
  @ApiOperation({ summary: "Register or reconnect a Store integration" })
  @ApiCreatedResponse({ type: IntegrationDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async upsert(
    @Req() request: FastifyRequest,
    @Body() dto: UpsertIntegrationDto,
  ): Promise<IntegrationDto> {
    const user = await this.requirePlatformOrStorePermission(
      request,
      dto.storeId,
      [PLATFORM_PERMISSIONS.integrationsManage],
      STORE_PERMISSION_CODES.integrationsManage,
      featureKeyForIntegration(dto.type),
    );
    return this.integrations.upsertIntegration(user.id, dto);
  }

  @Post(":integrationId/disconnect")
  @ApiOperation({ summary: "Disconnect a Store integration" })
  @ApiOkResponse({ type: IntegrationDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async disconnect(
    @Req() request: FastifyRequest,
    @Param("integrationId", SelfxUuidParamPipe) integrationId: string,
  ): Promise<IntegrationDto> {
    const storeId = await this.integrations.integrationStoreId(integrationId);
    const user = await this.requirePlatformOrStorePermission(
      request,
      storeId,
      [PLATFORM_PERMISSIONS.integrationsManage],
      STORE_PERMISSION_CODES.integrationsManage,
    );
    return this.integrations.disconnectIntegration(user.id, integrationId);
  }

  @Post(":integrationId/credentials")
  @ApiOperation({ summary: "Create a one-time plugin credential" })
  @ApiCreatedResponse({ type: CreateIntegrationCredentialResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async createCredential(
    @Req() request: FastifyRequest,
    @Param("integrationId", SelfxUuidParamPipe) integrationId: string,
    @Body() dto: CreateIntegrationCredentialDto,
  ): Promise<CreateIntegrationCredentialResponseDto> {
    const storeId = await this.integrations.integrationStoreId(integrationId);
    const user = await this.requirePlatformOrStorePermission(
      request,
      storeId,
      [PLATFORM_PERMISSIONS.integrationsManage],
      STORE_PERMISSION_CODES.integrationsManage,
    );
    return this.integrations.createCredential(user.id, integrationId, dto);
  }

  @Post("credentials/:credentialId/revoke")
  @ApiOperation({ summary: "Revoke a plugin credential" })
  @ApiOkResponse({ type: IntegrationCredentialDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async revokeCredential(
    @Req() request: FastifyRequest,
    @Param("credentialId", SelfxUuidParamPipe) credentialId: string,
  ): Promise<IntegrationCredentialDto> {
    const storeId = await this.integrations.credentialStoreId(credentialId);
    const user = await this.requirePlatformOrStorePermission(
      request,
      storeId,
      [PLATFORM_PERMISSIONS.integrationsManage],
      STORE_PERMISSION_CODES.integrationsManage,
    );
    return this.integrations.revokeCredential(user.id, credentialId);
  }

  private async requirePlatformOrStorePermission(
    request: FastifyRequest,
    storeId: string | undefined,
    platformPermissions: readonly PlatformPermission[],
    storePermission: StorePermissionCode,
    featureKey?: string,
  ) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    for (const permission of platformPermissions) {
      if (await this.platformAuthorization.hasPermission(user.id, permission)) {
        return user;
      }
    }
    if (storeId) {
      await this.rbac.requireStorePermission(user.id, storeId, storePermission);
      if (featureKey) {
        await this.entitlements?.assertStoreHasFeature(storeId, featureKey);
      }
      return user;
    }
    const fallbackPermission = platformPermissions[0];
    if (!fallbackPermission) {
      throw new Error("At least one platform permission is required.");
    }
    await this.platformAuthorization.requirePermission(
      user.id,
      fallbackPermission,
    );
    return user;
  }
}

function featureKeyForIntegration(type: "SHOPIFY" | "WOOCOMMERCE"): string {
  return type === "SHOPIFY" ? "SHOPIFY_INTEGRATION" : "WOOCOMMERCE_INTEGRATION";
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
