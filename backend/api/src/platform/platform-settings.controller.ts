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
import {
  LoginPageSettingsResponseDto,
  UpdateLoginPageSettingsDto,
} from "./dto/login-page-settings.dto.js";
import { LoginPageSettingsService } from "./login-page-settings.service.js";
import {
  MediaUploadSettingsResponseDto,
  UpdateMediaUploadSettingsDto,
} from "./dto/media-upload-settings.dto.js";
import { MediaUploadSettingsService } from "./media-upload-settings.service.js";
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
    private readonly loginPageSettings: LoginPageSettingsService,
    private readonly mediaUploadSettings: MediaUploadSettingsService,
  ) {}

  @Get("login-page/public")
  @ApiOperation({ summary: "Read public login page settings" })
  @ApiOkResponse({ type: LoginPageSettingsResponseDto })
  async getPublicLoginPageSettings(): Promise<LoginPageSettingsResponseDto> {
    return this.loginPageSettings.getSettings();
  }

  @Get("login-page")
  @ApiOperation({ summary: "Read Platform login page settings" })
  @ApiOkResponse({ type: LoginPageSettingsResponseDto })
  async getLoginPageSettings(
    @Req() request: FastifyRequest,
  ): Promise<LoginPageSettingsResponseDto> {
    await this.requireAccessManager(request);
    return this.loginPageSettings.getSettings();
  }

  @Put("login-page")
  @ApiOperation({ summary: "Update Platform login page settings" })
  @ApiOkResponse({ type: LoginPageSettingsResponseDto })
  async updateLoginPageSettings(
    @Req() request: FastifyRequest,
    @Body() dto: UpdateLoginPageSettingsDto,
  ): Promise<LoginPageSettingsResponseDto> {
    const user = await this.requireAccessManager(request);
    if (!(await this.platformAuthorization.isSuperadmin(user.id))) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        ACCESS_CONTROL_ERROR_CODES.protectedSuperadmin,
        "Only the protected SelfX Superadmin can change Platform settings.",
      );
    }
    return this.loginPageSettings.updateSettings(dto);
  }

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
      dto.defaultCurrency,
    );
  }

  @Get("media-uploads")
  @ApiOperation({ summary: "Read Platform media upload limits" })
  @ApiOkResponse({ type: MediaUploadSettingsResponseDto })
  async getMediaUploadSettings(
    @Req() request: FastifyRequest,
  ): Promise<MediaUploadSettingsResponseDto> {
    await this.requireAccessManager(request);
    return this.mediaUploadSettings.getSettings();
  }

  @Put("media-uploads")
  @ApiOperation({ summary: "Update Platform media upload limits" })
  @ApiOkResponse({ type: MediaUploadSettingsResponseDto })
  async updateMediaUploadSettings(
    @Req() request: FastifyRequest,
    @Body() dto: UpdateMediaUploadSettingsDto,
  ): Promise<MediaUploadSettingsResponseDto> {
    const user = await this.requireAccessManager(request);
    if (!(await this.platformAuthorization.isSuperadmin(user.id))) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        ACCESS_CONTROL_ERROR_CODES.protectedSuperadmin,
        "Only the protected SelfX Superadmin can change Platform settings.",
      );
    }
    return this.mediaUploadSettings.updateSettings(dto);
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
