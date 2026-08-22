import { Controller, Get, Param, Post, Req } from "@nestjs/common";
import {
  ApiBearerAuth,
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
  KioskTryOnShareResponseDto,
  PublicTryOnShareResponseDto,
} from "./dto/kiosk-try-on.dto.js";
import { KioskTryOnShareService } from "./kiosk-try-on-share.service.js";
import { KioskService } from "./kiosk.service.js";

@ApiTags("Kiosk Try-On Shares")
@ApiBearerAuth()
@Controller("api/v1/kiosk/try-on/sessions")
export class KioskTryOnShareController {
  constructor(
    private readonly kiosks: KioskService,
    private readonly shares: KioskTryOnShareService,
  ) {}

  @Post(":sessionId/share")
  @ApiOperation({ summary: "Create a temporary share link for session Looks" })
  @ApiCreatedResponse({ type: KioskTryOnShareResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async create(
    @Req() request: FastifyRequest,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
  ): Promise<KioskTryOnShareResponseDto> {
    const device = await this.kiosks.requireDevice(request.headers.authorization);
    return this.shares.createForDevice(device, sessionId);
  }
}

@ApiTags("Public Try-On Shares")
@Controller("api/v1/public/try-on-shares")
export class PublicTryOnShareController {
  constructor(private readonly shares: KioskTryOnShareService) {}

  @Get(":capability")
  @ApiOperation({ summary: "Return generated Looks for a temporary share link" })
  @ApiOkResponse({ type: PublicTryOnShareResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  @ApiResponse({ status: 410, type: ApiErrorResponseDto })
  async get(
    @Req() request: FastifyRequest,
    @Param("capability") capability: string,
  ): Promise<PublicTryOnShareResponseDto> {
    return this.shares.publicLooks(capability, request.ip);
  }
}
