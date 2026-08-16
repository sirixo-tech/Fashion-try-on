import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";

import { AuthService } from "../auth/auth.service.js";
import { ApiErrorResponseDto } from "../auth/dto/auth-response.dto.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import {
  CreateKioskConfigurationAssetUploadDto,
  KioskConfigurationDto,
  KioskConfigurationAssetUploadIntentDto,
  UpdateKioskConfigurationDto,
} from "./dto/kiosk.dto.js";
import { KioskConfigurationService } from "./kiosk-configuration.service.js";

@ApiTags("Platform Kiosk Configuration")
@ApiBearerAuth()
@Controller("api/v1/admin/kiosks")
export class AdminKioskConfigurationController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformAuthorization: PlatformAuthorizationService,
    private readonly configurations: KioskConfigurationService,
  ) {}

  @Get(":deviceId/configuration")
  @ApiOperation({ summary: "Return an individual kiosk runtime configuration" })
  @ApiOkResponse({ type: KioskConfigurationDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async get(
    @Req() request: FastifyRequest,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
  ): Promise<KioskConfigurationDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.kiosksConfigure,
    );
    return this.configurations.getAdminConfiguration(deviceId);
  }

  @Put(":deviceId/configuration")
  @ApiOperation({ summary: "Update an individual kiosk runtime configuration" })
  @ApiOkResponse({ type: KioskConfigurationDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async update(
    @Req() request: FastifyRequest,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
    @Body() dto: UpdateKioskConfigurationDto,
  ): Promise<KioskConfigurationDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.kiosksConfigure,
    );
    return this.configurations.updateAdminConfiguration(user.id, deviceId, dto);
  }

  @Post(":deviceId/configuration/assets/upload-intent")
  @ApiOperation({
    summary: "Create a signed kiosk presentation asset upload URL",
  })
  @ApiOkResponse({ type: KioskConfigurationAssetUploadIntentDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async createAssetUploadIntent(
    @Req() request: FastifyRequest,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
    @Body() dto: CreateKioskConfigurationAssetUploadDto,
  ): Promise<KioskConfigurationAssetUploadIntentDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.kiosksConfigure,
    );
    return this.configurations.createAdminAssetUploadIntent(deviceId, dto);
  }
}

@ApiTags("Kiosk Configuration")
@Controller("api/v1/kiosk")
export class KioskConfigurationController {
  constructor(private readonly configurations: KioskConfigurationService) {}

  @Get("configuration")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Return current device-authenticated kiosk configuration",
  })
  @ApiOkResponse({ type: KioskConfigurationDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async get(
    @Headers("authorization") authorization: string | undefined,
  ): Promise<KioskConfigurationDto> {
    return this.configurations.getDeviceConfiguration(authorization);
  }
}
