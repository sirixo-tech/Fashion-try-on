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
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";

import { AuthService } from "../auth/auth.service.js";
import { ApiErrorResponseDto } from "../auth/dto/auth-response.dto.js";
import { ApiErrorException } from "../common/api-error.exception.js";
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
import { PublicApiWebhookService } from "./public-api-webhook.service.js";

@ApiTags("Developer API")
@ApiBearerAuth()
@Controller("api/v1/admin/developer")
export class DeveloperApiConsoleController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformAuthorization: PlatformAuthorizationService,
    private readonly rbac: StoreRbacService,
    private readonly apiKeys: DeveloperApiKeyService,
    private readonly console: DeveloperApiConsoleService,
    private readonly webhooks: PublicApiWebhookService,
  ) {}

  @Get("usage")
  @ApiOperation({ summary: "Read Developer API usage summary" })
  @ApiOkResponse({ type: AdminDeveloperApiUsageResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async usage(
    @Req() request: FastifyRequest,
    @Query() query: AdminDeveloperApiUsageQueryDto,
  ): Promise<AdminDeveloperApiUsageResponseDto> {
    const apiKeyStoreId = query.apiKeyId
      ? await this.apiKeys.storeIdForKey(query.apiKeyId)
      : undefined;
    if (query.storeId && apiKeyStoreId && query.storeId !== apiKeyStoreId) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        "DEVELOPER_API_SCOPE_MISMATCH",
        "API key does not belong to the selected Store.",
      );
    }
    const storeId = query.storeId ?? apiKeyStoreId;
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      [
        PLATFORM_PERMISSIONS.developerApiView,
        PLATFORM_PERMISSIONS.developerApiManage,
      ],
      STORE_PERMISSION_CODES.developerApiView,
    );
    return this.console.usageSummary(query);
  }

  @Get("webhooks")
  @ApiOperation({ summary: "List Developer API webhook endpoints" })
  @ApiOkResponse({ type: AdminDeveloperWebhookEndpointListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async listWebhooks(
    @Req() request: FastifyRequest,
    @Query() query: AdminDeveloperWebhookListQueryDto,
  ): Promise<AdminDeveloperWebhookEndpointListResponseDto> {
    await this.requirePlatformOrStorePermission(
      request,
      query.storeId,
      [
        PLATFORM_PERMISSIONS.developerApiView,
        PLATFORM_PERMISSIONS.developerApiManage,
      ],
      STORE_PERMISSION_CODES.developerApiView,
    );
    return this.console.listWebhookEndpoints(query);
  }

  @Post("webhooks")
  @ApiOperation({ summary: "Create a Developer API webhook endpoint" })
  @ApiCreatedResponse({ type: CreateAdminDeveloperWebhookEndpointResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async createWebhook(
    @Req() request: FastifyRequest,
    @Body() dto: CreateAdminDeveloperWebhookEndpointDto,
  ): Promise<CreateAdminDeveloperWebhookEndpointResponseDto> {
    await this.requirePlatformOrStorePermission(
      request,
      dto.storeId,
      [PLATFORM_PERMISSIONS.developerApiManage],
      STORE_PERMISSION_CODES.developerApiManage,
    );
    const credential = await this.console.credentialForStore(dto.storeId);
    const created = await this.webhooks.createEndpoint(credential, dto);
    const endpoint = await this.console.webhookEndpoint(created.id);
    return { ...endpoint, secret: created.secret };
  }

  @Patch("webhooks/:endpointId")
  @ApiOperation({ summary: "Update a Developer API webhook endpoint" })
  @ApiOkResponse({ type: AdminDeveloperWebhookEndpointDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async updateWebhook(
    @Req() request: FastifyRequest,
    @Param("endpointId", SelfxUuidParamPipe) endpointId: string,
    @Body() dto: UpdateAdminDeveloperWebhookEndpointDto,
  ): Promise<AdminDeveloperWebhookEndpointDto> {
    const storeId = await this.console.storeIdForWebhookEndpoint(endpointId);
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      [PLATFORM_PERMISSIONS.developerApiManage],
      STORE_PERMISSION_CODES.developerApiManage,
    );
    const credential = await this.console.credentialForStore(storeId);
    await this.webhooks.updateEndpoint(credential, endpointId, dto);
    return this.console.webhookEndpoint(endpointId);
  }

  @Delete("webhooks/:endpointId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Disable a Developer API webhook endpoint" })
  @ApiNoContentResponse()
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async disableWebhook(
    @Req() request: FastifyRequest,
    @Param("endpointId", SelfxUuidParamPipe) endpointId: string,
  ): Promise<void> {
    const storeId = await this.console.storeIdForWebhookEndpoint(endpointId);
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      [PLATFORM_PERMISSIONS.developerApiManage],
      STORE_PERMISSION_CODES.developerApiManage,
    );
    const credential = await this.console.credentialForStore(storeId);
    await this.webhooks.disableEndpoint(credential, endpointId);
  }

  @Get("webhook-deliveries")
  @ApiOperation({ summary: "List recent Developer API webhook deliveries" })
  @ApiOkResponse({ type: AdminDeveloperWebhookDeliveryListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async listWebhookDeliveries(
    @Req() request: FastifyRequest,
    @Query() query: AdminDeveloperWebhookDeliveryListQueryDto,
  ): Promise<AdminDeveloperWebhookDeliveryListResponseDto> {
    const endpointStoreId =
      query.endpointId !== undefined
        ? await this.console.storeIdForWebhookEndpoint(query.endpointId)
        : undefined;
    if (query.storeId && endpointStoreId && query.storeId !== endpointStoreId) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        "DEVELOPER_API_SCOPE_MISMATCH",
        "Webhook endpoint does not belong to the selected Store.",
      );
    }
    const storeId = query.storeId ?? endpointStoreId;
    await this.requirePlatformOrStorePermission(
      request,
      storeId,
      [
        PLATFORM_PERMISSIONS.developerApiView,
        PLATFORM_PERMISSIONS.developerApiManage,
      ],
      STORE_PERMISSION_CODES.developerApiView,
    );
    return this.console.listWebhookDeliveries(query);
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
