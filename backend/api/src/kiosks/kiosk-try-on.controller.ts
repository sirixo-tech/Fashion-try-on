import { Controller, Get, Param, Post, Req } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
  KioskTryOnAssetResponseDto,
  KioskTryOnLooksResponseDto,
  KioskTryOnRunResponseDto,
  KioskTryOnSessionResponseDto,
} from "./dto/kiosk-try-on.dto.js";
import {
  parseKioskPersonMultipartRequest,
  parseKioskTryOnRunMultipartRequest,
} from "./kiosk-try-on.multipart.js";
import { KioskTryOnService } from "./kiosk-try-on.service.js";
import { KioskService } from "./kiosk.service.js";

@ApiTags("Kiosk Try-On")
@ApiBearerAuth()
@Controller("api/v1/kiosk/try-on/runs")
export class KioskTryOnController {
  constructor(
    private readonly kiosks: KioskService,
    private readonly tryOn: KioskTryOnService,
  ) {}

  @Post()
  @ApiOperation({
    summary: "Create a production kiosk Try-On run",
    description:
      "Device-authenticated production kiosk Try-On endpoint. It uses the paired kiosk device token and does not depend on the internal Try-On Lab feature flag.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["clientRequestId", "personImage", "garmentImage"],
      properties: {
        clientRequestId: { type: "string" },
        personImage: { type: "string", format: "binary" },
        garmentImage: { type: "string", format: "binary" },
        garmentSource: { type: "string", enum: ["DIRECT_UPLOAD"] },
        garmentIntent: {
          type: "string",
          enum: ["AUTO", "TOP", "BOTTOM", "ONE_PIECE", "FULL_OUTFIT"],
        },
        category: {
          type: "string",
          enum: ["AUTO", "TOP", "BOTTOM", "ONE_PIECE"],
        },
        garmentPhotoType: {
          type: "string",
          enum: ["AUTO", "FLAT_LAY", "ON_MODEL"],
        },
        modelCoverage: {
          type: "string",
          enum: ["UPPER_BODY", "LOWER_BODY", "FULL_BODY", "UNKNOWN"],
        },
        generationProfile: {
          type: "string",
          enum: ["PERFORMANCE", "BALANCED", "QUALITY"],
        },
      },
    },
  })
  @ApiCreatedResponse({ type: KioskTryOnRunResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async create(
    @Req() request: FastifyRequest,
  ): Promise<KioskTryOnRunResponseDto> {
    const device = await this.kiosks.requireDevice(request.headers.authorization);
    const payload = await parseKioskTryOnRunMultipartRequest(request);
    return this.tryOn.createRun(device, payload);
  }

  @Get(":runId")
  @ApiOperation({ summary: "Get a production kiosk Try-On run" })
  @ApiOkResponse({ type: KioskTryOnRunResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async get(
    @Req() request: FastifyRequest,
    @Param("runId", SelfxUuidParamPipe) runId: string,
  ): Promise<KioskTryOnRunResponseDto> {
    const device = await this.kiosks.requireDevice(request.headers.authorization);
    return this.tryOn.getRun(device, runId);
  }
}

@ApiTags("Kiosk Try-On Sessions")
@ApiBearerAuth()
@Controller("api/v1/kiosk/try-on/sessions")
export class KioskTryOnSessionController {
  constructor(
    private readonly kiosks: KioskService,
    private readonly tryOn: KioskTryOnService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Create a kiosk customer Try-On session" })
  @ApiCreatedResponse({ type: KioskTryOnSessionResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async create(
    @Req() request: FastifyRequest,
  ): Promise<KioskTryOnSessionResponseDto> {
    const device = await this.kiosks.requireDevice(request.headers.authorization);
    return this.tryOn.createSession(device);
  }

  @Post(":sessionId/person")
  @ApiOperation({ summary: "Set the current person image for a Try-On session" })
  @ApiConsumes("multipart/form-data", "application/json")
  @ApiBody({
    schema: {
      oneOf: [
        {
          type: "object",
          required: ["personImage"],
          properties: {
            personImage: { type: "string", format: "binary" },
          },
        },
        {
          type: "object",
          required: ["customerUploadSessionId"],
          properties: {
            customerUploadSessionId: { type: "string" },
          },
        },
      ],
    },
  })
  @ApiCreatedResponse({ type: KioskTryOnAssetResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async setPerson(
    @Req() request: FastifyRequest,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
  ): Promise<KioskTryOnAssetResponseDto> {
    const device = await this.kiosks.requireDevice(request.headers.authorization);
    const payload = await parseKioskPersonMultipartRequest(request);
    return this.tryOn.setCurrentPerson(device, sessionId, payload);
  }

  @Get(":sessionId/looks")
  @ApiOperation({ summary: "List successful customer looks for a Try-On session" })
  @ApiOkResponse({ type: KioskTryOnLooksResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async looks(
    @Req() request: FastifyRequest,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
  ): Promise<KioskTryOnLooksResponseDto> {
    const device = await this.kiosks.requireDevice(request.headers.authorization);
    return this.tryOn.getSessionLooks(device, sessionId);
  }

  @Post(":sessionId/complete")
  @ApiOperation({ summary: "Complete a kiosk customer Try-On session" })
  @ApiOkResponse({ type: KioskTryOnSessionResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async complete(
    @Req() request: FastifyRequest,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
  ): Promise<KioskTryOnSessionResponseDto> {
    const device = await this.kiosks.requireDevice(request.headers.authorization);
    return this.tryOn.completeSession(device, sessionId);
  }
}
