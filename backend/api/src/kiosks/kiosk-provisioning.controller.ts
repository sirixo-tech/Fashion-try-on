import { Body, Controller, Get, Headers, Param, Post, Req } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";

import { ApiErrorResponseDto } from "../auth/dto/auth-response.dto.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import {
  CreateKioskPairingSessionDto,
  ExchangeKioskProvisioningDto,
  KioskDeviceAuthResponseDto,
  KioskPairingSessionResponseDto,
  KioskPairingStatusResponseDto,
} from "./dto/kiosk.dto.js";
import { KioskService } from "./kiosk.service.js";

@ApiTags("Kiosk Provisioning")
@Controller("api/v1/kiosk/provisioning/sessions")
export class KioskProvisioningController {
  constructor(private readonly kiosks: KioskService) {}

  @Post()
  @ApiOperation({ summary: "Create a kiosk pairing session" })
  @ApiCreatedResponse({ type: KioskPairingSessionResponseDto })
  @ApiResponse({ status: 429, type: ApiErrorResponseDto })
  async create(
    @Req() request: FastifyRequest,
    @Body() dto: CreateKioskPairingSessionDto,
  ): Promise<KioskPairingSessionResponseDto> {
    return this.kiosks.createPairingSession(dto, request.ip);
  }

  @Get(":sessionId")
  @ApiOperation({ summary: "Get kiosk pairing session status" })
  @ApiOkResponse({ type: KioskPairingStatusResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async get(
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
    @Headers("x-selfx-provisioning-secret") provisioningSecret?: string,
  ): Promise<KioskPairingStatusResponseDto> {
    return this.kiosks.getPairingStatus(sessionId, provisioningSecret);
  }
}

@ApiTags("Kiosk Device Session")
@Controller("api/v1/kiosk/session")
export class KioskSessionController {
  constructor(private readonly kiosks: KioskService) {}

  @Post("exchange")
  @ApiOperation({ summary: "Exchange one-time kiosk provisioning grant" })
  @ApiOkResponse({ type: KioskDeviceAuthResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto })
  async exchange(
    @Body() dto: ExchangeKioskProvisioningDto,
  ): Promise<KioskDeviceAuthResponseDto> {
    return this.kiosks.exchangeProvisioningGrant(dto);
  }
}
