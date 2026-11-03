import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";

import { AuthService } from "../auth/auth.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { TenantManagementService } from "../organizations/tenant-management.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { DeveloperApiKeyService } from "./developer-api-key.service.js";
import { DeveloperApiConsoleService } from "./developer-api-console.service.js";
import {
  AdminDeveloperApiUsageQueryDto,
  AdminDeveloperApiUsageResponseDto,
  AdminDeveloperWebhookDeliveryListQueryDto,
  AdminDeveloperWebhookDeliveryListResponseDto,
  AdminDeveloperWebhookEndpointDto,
  AdminDeveloperWebhookEndpointListResponseDto,
  AdminDeveloperWebhookListQueryDto,
  CreateAdminDeveloperWebhookEndpointDto,
  CreateAdminDeveloperWebhookEndpointResponseDto,
  UpdateAdminDeveloperWebhookEndpointDto,
} from "./dto/developer-api-console.dto.js";
import {
  CreateDeveloperApiKeyDto,
  CreateDeveloperApiKeyResponseDto,
  DeveloperApiKeyDto,
  DeveloperApiKeyListQueryDto,
  DeveloperApiKeyListResponseDto,
} from "./dto/developer-api-key.dto.js";
import { PublicApiWebhookService } from "./public-api-webhook.service.js";

@ApiTags("Store Developer API")
@ApiBearerAuth()
@Controller("api/v1/store/developer")
export class StoreDeveloperApiController {
  constructor(
    private readonly auth: AuthService,
    private readonly tenants: TenantManagementService,
    private readonly rbac: StoreRbacService,
    private readonly entitlements: EntitlementsService,
    private readonly apiKeys: DeveloperApiKeyService,
    private readonly console: DeveloperApiConsoleService,
    private readonly webhooks: PublicApiWebhookService,
  ) {}

  @Get("api-keys")
  @ApiOperation({ summary: "List API keys for the current Store" })
  @ApiOkResponse({ type: DeveloperApiKeyListResponseDto })
  async listKeys(
    @Req() req: FastifyRequest,
    @Query() query: DeveloperApiKeyListQueryDto,
  ) {
    const { storeId } = await this.authorize(req, "developer_api.view");
    return this.apiKeys.listKeys({ ...query, storeId });
  }

  @Post("api-keys")
  @ApiOperation({ summary: "Create an API key for the current Store" })
  @ApiCreatedResponse({ type: CreateDeveloperApiKeyResponseDto })
  async createKey(
    @Req() req: FastifyRequest,
    @Body() dto: CreateDeveloperApiKeyDto,
  ) {
    const { user, storeId } = await this.authorize(req, "developer_api.manage");
    return this.apiKeys.createKey(user.id, { ...dto, storeId });
  }

  @Post("api-keys/:keyId/revoke")
  @ApiOperation({ summary: "Revoke an API key owned by the current Store" })
  @ApiOkResponse({ type: DeveloperApiKeyDto })
  async revokeKey(
    @Req() req: FastifyRequest,
    @Param("keyId", SelfxUuidParamPipe) keyId: string,
  ) {
    const { user, storeId } = await this.authorize(req, "developer_api.manage");
    await this.assertResourceStore(
      await this.apiKeys.storeIdForKey(keyId),
      storeId,
    );
    return this.apiKeys.revokeKey(user.id, keyId);
  }

  @Get("usage")
  @ApiOperation({ summary: "Read Developer API usage for the current Store" })
  @ApiOkResponse({ type: AdminDeveloperApiUsageResponseDto })
  async usage(
    @Req() req: FastifyRequest,
    @Query() query: AdminDeveloperApiUsageQueryDto,
  ) {
    const { storeId } = await this.authorize(req, "developer_api.view");
    if (query.apiKeyId)
      await this.assertResourceStore(
        await this.apiKeys.storeIdForKey(query.apiKeyId),
        storeId,
      );
    return this.console.usageSummary({ ...query, storeId });
  }

  @Get("webhooks")
  @ApiOperation({ summary: "List webhook endpoints for the current Store" })
  @ApiOkResponse({ type: AdminDeveloperWebhookEndpointListResponseDto })
  async listWebhooks(
    @Req() req: FastifyRequest,
    @Query() _query: AdminDeveloperWebhookListQueryDto,
  ) {
    const { storeId } = await this.authorize(req, "developer_api.view");
    return this.console.listWebhookEndpoints({ storeId });
  }

  @Post("webhooks")
  @ApiOperation({ summary: "Create a webhook endpoint for the current Store" })
  @ApiCreatedResponse({ type: CreateAdminDeveloperWebhookEndpointResponseDto })
  async createWebhook(
    @Req() req: FastifyRequest,
    @Body() dto: CreateAdminDeveloperWebhookEndpointDto,
  ) {
    const { storeId } = await this.authorize(req, "developer_api.manage");
    const credential = await this.console.credentialForStore(storeId);
    const created = await this.webhooks.createEndpoint(credential, {
      url: dto.url,
      subscribedEvents: dto.subscribedEvents,
    });
    return {
      ...(await this.console.webhookEndpoint(created.id)),
      secret: created.secret,
    };
  }

  @Patch("webhooks/:endpointId")
  @ApiOperation({
    summary: "Update a webhook endpoint owned by the current Store",
  })
  @ApiOkResponse({ type: AdminDeveloperWebhookEndpointDto })
  async updateWebhook(
    @Req() req: FastifyRequest,
    @Param("endpointId", SelfxUuidParamPipe) endpointId: string,
    @Body() dto: UpdateAdminDeveloperWebhookEndpointDto,
  ) {
    const { storeId } = await this.authorize(req, "developer_api.manage");
    await this.assertResourceStore(
      await this.console.storeIdForWebhookEndpoint(endpointId),
      storeId,
    );
    await this.webhooks.updateEndpoint(
      await this.console.credentialForStore(storeId),
      endpointId,
      dto,
    );
    return this.console.webhookEndpoint(endpointId);
  }

  @Delete("webhooks/:endpointId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Disable a webhook endpoint owned by the current Store",
  })
  @ApiNoContentResponse()
  async disableWebhook(
    @Req() req: FastifyRequest,
    @Param("endpointId", SelfxUuidParamPipe) endpointId: string,
  ): Promise<void> {
    const { storeId } = await this.authorize(req, "developer_api.manage");
    await this.assertResourceStore(
      await this.console.storeIdForWebhookEndpoint(endpointId),
      storeId,
    );
    await this.webhooks.disableEndpoint(
      await this.console.credentialForStore(storeId),
      endpointId,
    );
  }

  @Get("webhook-deliveries")
  @ApiOperation({ summary: "List webhook deliveries for the current Store" })
  @ApiOkResponse({ type: AdminDeveloperWebhookDeliveryListResponseDto })
  async listDeliveries(
    @Req() req: FastifyRequest,
    @Query() query: AdminDeveloperWebhookDeliveryListQueryDto,
  ) {
    const { storeId } = await this.authorize(req, "developer_api.view");
    if (query.endpointId)
      await this.assertResourceStore(
        await this.console.storeIdForWebhookEndpoint(query.endpointId),
        storeId,
      );
    return this.console.listWebhookDeliveries({ ...query, storeId });
  }

  private async authorize(
    req: FastifyRequest,
    permission: "developer_api.view" | "developer_api.manage",
  ) {
    const user = await this.auth.requireAccessUser(req.headers.authorization);
    const current = await this.tenants.getCurrentStore(
      user.id,
      user.authSessionId,
    );
    if (!current.store) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        "STORE_REQUIRED",
        "An active Store is required.",
      );
    }
    const storeId = current.store.id;
    await this.entitlements.assertStoreHasFeature(storeId, "PUBLIC_API");
    await this.rbac.requireStoreResourcePermission(
      user.id,
      storeId,
      permission,
    );
    return { user, storeId };
  }

  private async assertResourceStore(
    resourceStoreId: string,
    currentStoreId: string,
  ) {
    if (resourceStoreId !== currentStoreId) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "DEVELOPER_API_RESOURCE_NOT_FOUND",
        "Developer API resource was not found.",
      );
    }
  }
}
