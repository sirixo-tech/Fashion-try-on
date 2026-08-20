import { Body, Controller, Get, HttpStatus, Put, Req } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";

import { AuthService } from "../auth/auth.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { ACCESS_CONTROL_ERROR_CODES } from "./access-control.service.js";
import { PLATFORM_PERMISSIONS } from "./platform-permissions.js";
import { PlatformAuthorizationService } from "./platform-authorization.service.js";
import {
  GarmentPreviewPlatformSettingsResponseDto,
  UpdateGarmentPreviewSettingsDto,
} from "../try-on/dto/garment-preview-settings.dto.js";
import { GarmentPreviewSettingsService } from "../try-on/garment-preview-settings.service.js";

@ApiTags("Platform Settings")
@ApiBearerAuth()
@Controller("api/v1/admin/platform-settings")
export class PlatformSettingsController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformAuthorization: PlatformAuthorizationService,
    private readonly garmentPreviewSettings: GarmentPreviewSettingsService,
  ) {}

  @Get("virtual-try-on")
  @ApiOperation({ summary: "Read Platform Virtual Try-On settings" })
  @ApiOkResponse({ type: GarmentPreviewPlatformSettingsResponseDto })
  async getVirtualTryOnSettings(
    @Req() request: FastifyRequest,
  ): Promise<GarmentPreviewPlatformSettingsResponseDto> {
    await this.requireAccessManager(request);
    return this.garmentPreviewSettings.getPlatformSettings();
  }

  @Put("virtual-try-on")
  @ApiOperation({ summary: "Update Platform Virtual Try-On settings" })
  @ApiOkResponse({ type: GarmentPreviewPlatformSettingsResponseDto })
  async updateVirtualTryOnSettings(
    @Req() request: FastifyRequest,
    @Body() dto: UpdateGarmentPreviewSettingsDto,
  ): Promise<GarmentPreviewPlatformSettingsResponseDto> {
    const user = await this.requireAccessManager(request);
    if (!(await this.platformAuthorization.isSuperadmin(user.id))) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        ACCESS_CONTROL_ERROR_CODES.protectedSuperadmin,
        "Only the protected SelfX Superadmin can change Platform settings.",
      );
    }
    return this.garmentPreviewSettings.updatePlatformSettings(
      dto.garmentPreviewEnabled,
    );
  }

  private async requireAccessManager(request: FastifyRequest) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.permissionsManage,
    );
    return user;
  }
}

