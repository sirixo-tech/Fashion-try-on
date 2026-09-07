import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
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
    void reply.redirect(
      this.shopifyOauth.successRedirect(result.storeId, result.syncStatus),
    );
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
