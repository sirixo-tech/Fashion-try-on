import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";

import { AuthService } from "../auth/auth.service.js";
import { ApiErrorResponseDto } from "../auth/dto/auth-response.dto.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import {
  PLATFORM_PERMISSIONS,
  type PlatformPermission,
} from "../platform/platform-permissions.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { DeveloperApiKeyService } from "./developer-api-key.service.js";
import {
  CreateDeveloperApiKeyDto,
  CreateDeveloperApiKeyResponseDto,
  DeveloperApiKeyDto,
  DeveloperApiKeyListQueryDto,
  DeveloperApiKeyListResponseDto,
} from "./dto/developer-api-key.dto.js";

@ApiTags("Developer API")
@ApiBearerAuth()
@Controller("api/v1/admin/developer/api-keys")
export class DeveloperApiKeyController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformAuthorization: PlatformAuthorizationService,
    private readonly apiKeys: DeveloperApiKeyService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List Developer API keys" })
  @ApiOkResponse({ type: DeveloperApiKeyListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async list(
    @Req() request: FastifyRequest,
    @Query() query: DeveloperApiKeyListQueryDto,
  ): Promise<DeveloperApiKeyListResponseDto> {
    await this.requireDeveloperPermission(request, [
      PLATFORM_PERMISSIONS.developerApiView,
      PLATFORM_PERMISSIONS.developerApiManage,
    ]);
    return this.apiKeys.listKeys(query);
  }

  @Post()
  @ApiOperation({ summary: "Create a Developer API key" })
  @ApiCreatedResponse({ type: CreateDeveloperApiKeyResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async create(
    @Req() request: FastifyRequest,
    @Body() dto: CreateDeveloperApiKeyDto,
  ): Promise<CreateDeveloperApiKeyResponseDto> {
    const user = await this.requireDeveloperPermission(request, [
      PLATFORM_PERMISSIONS.developerApiManage,
    ]);
    return this.apiKeys.createKey(user.id, dto);
  }

  @Post(":keyId/revoke")
  @ApiOperation({ summary: "Revoke a Developer API key" })
  @ApiOkResponse({ type: DeveloperApiKeyDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async revoke(
    @Req() request: FastifyRequest,
    @Param("keyId", SelfxUuidParamPipe) keyId: string,
  ): Promise<DeveloperApiKeyDto> {
    const user = await this.requireDeveloperPermission(request, [
      PLATFORM_PERMISSIONS.developerApiManage,
    ]);
    return this.apiKeys.revokeKey(user.id, keyId);
  }

  private async requireDeveloperPermission(
    request: FastifyRequest,
    platformPermissions: readonly PlatformPermission[],
  ) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    for (const permission of platformPermissions) {
      if (await this.platformAuthorization.hasPermission(user.id, permission)) {
        return user;
      }
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
