import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { ApiErrorResponseDto } from "../auth/dto/auth-response.dto.js";
import {
  KioskDeviceAuthResponseDto,
  KioskDeviceResponseDto,
  KioskHeartbeatDto,
  RefreshKioskDeviceSessionDto,
} from "./dto/kiosk.dto.js";
import { KioskService } from "./kiosk.service.js";

@ApiTags("Kiosk Device Session")
@Controller("api/v1/kiosk/session")
export class KioskDeviceSessionController {
  constructor(private readonly kiosks: KioskService) {}

  @Post("refresh")
  @ApiOperation({ summary: "Rotate kiosk device refresh credential" })
  @ApiOkResponse({ type: KioskDeviceAuthResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async refresh(
    @Body() dto: RefreshKioskDeviceSessionDto,
  ): Promise<KioskDeviceAuthResponseDto> {
    return this.kiosks.refreshDeviceSession(dto);
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Return current kiosk device identity" })
  @ApiOkResponse({ type: KioskDeviceResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async me(
    @Headers("authorization") authorization?: string,
  ): Promise<KioskDeviceResponseDto> {
    return this.kiosks.me(authorization);
  }
}

@ApiTags("Kiosk Device")
@Controller("api/v1/kiosk")
export class KioskHeartbeatController {
  constructor(private readonly kiosks: KioskService) {}

  @Post("heartbeat")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update minimal kiosk heartbeat" })
  @ApiOkResponse({ type: KioskDeviceResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async heartbeat(
    @Headers("authorization") authorization: string | undefined,
    @Body() dto: KioskHeartbeatDto,
  ): Promise<KioskDeviceResponseDto> {
    return this.kiosks.heartbeat(authorization, dto);
  }
}
