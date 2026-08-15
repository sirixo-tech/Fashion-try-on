import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
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
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import {
  KioskAssignmentOptionsResponseDto,
  KioskDeviceListResponseDto,
  KioskDeviceResponseDto,
  KioskProvisioningPairResponseDto,
  PairKioskDto,
} from "./dto/kiosk.dto.js";
import { KioskService } from "./kiosk.service.js";

@ApiTags("Platform Kiosks")
@ApiBearerAuth()
@Controller("api/v1/admin/kiosks")
export class AdminKiosksController {
  constructor(
    private readonly auth: AuthService,
    private readonly platformAuthorization: PlatformAuthorizationService,
    private readonly kiosks: KioskService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List platform kiosk fleet devices" })
  @ApiOkResponse({ type: KioskDeviceListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async list(@Req() request: FastifyRequest): Promise<KioskDeviceListResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.kiosksView,
    );
    return this.kiosks.listDevices();
  }

  @Get("assignment-options")
  @ApiOperation({ summary: "List organization/store options for kiosk pairing" })
  @ApiOkResponse({ type: KioskAssignmentOptionsResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async assignmentOptions(
    @Req() request: FastifyRequest,
  ): Promise<KioskAssignmentOptionsResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.kiosksAssign,
    );
    return this.kiosks.assignmentOptions();
  }

  @Post("pair")
  @ApiOperation({ summary: "Pair a physical kiosk using its six-digit code" })
  @ApiCreatedResponse({ type: KioskProvisioningPairResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async pair(
    @Req() request: FastifyRequest,
    @Body() dto: PairKioskDto,
  ): Promise<KioskProvisioningPairResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.kiosksPair,
    );
    return { device: await this.kiosks.pairKiosk(user.id, dto) };
  }

  @Post(":deviceId/revoke")
  @ApiOperation({ summary: "Revoke/unpair a kiosk device" })
  @ApiOkResponse({ type: KioskDeviceResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async revoke(
    @Req() request: FastifyRequest,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
  ): Promise<KioskDeviceResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.kiosksRevoke,
    );
    return this.kiosks.revokeDevice(user.id, deviceId);
  }

  @Post(":deviceId/activate")
  @ApiOperation({ summary: "Activate an inactive kiosk device" })
  @ApiOkResponse({ type: KioskDeviceResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async activate(
    @Req() request: FastifyRequest,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
  ): Promise<KioskDeviceResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.kiosksUpdate,
    );
    return this.kiosks.activateDevice(user.id, deviceId);
  }

  @Post(":deviceId/deactivate")
  @ApiOperation({ summary: "Deactivate a kiosk device" })
  @ApiOkResponse({ type: KioskDeviceResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async deactivate(
    @Req() request: FastifyRequest,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
  ): Promise<KioskDeviceResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.kiosksUpdate,
    );
    return this.kiosks.deactivateDevice(user.id, deviceId);
  }

  @Delete(":deviceId")
  @ApiOperation({ summary: "Soft-delete a kiosk device from the fleet list" })
  @ApiOkResponse({ type: KioskDeviceResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async delete(
    @Req() request: FastifyRequest,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
  ): Promise<KioskDeviceResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.platformAuthorization.requirePermission(
      user.id,
      PLATFORM_PERMISSIONS.kiosksDelete,
    );
    return this.kiosks.deleteDevice(user.id, deviceId);
  }
}
