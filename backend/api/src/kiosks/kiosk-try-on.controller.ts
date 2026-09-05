import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Req,
} from "@nestjs/common";
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
import { ApiErrorException } from "../common/api-error.exception.js";
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
import { MediaUploadSettingsService } from "../platform/media-upload-settings.service.js";
import {
  KioskTryOnService,
  type KioskTryOnSessionCompletionReason,
} from "./kiosk-try-on.service.js";
import { KioskService } from "./kiosk.service.js";

interface CompleteKioskTryOnSessionBody {
  reason?: unknown;
}

@ApiTags("Kiosk Try-On")
@ApiBearerAuth()
@Controller("api/v1/kiosk/try-on/runs")
export class KioskTryOnController {
  constructor(
    private readonly kiosks: KioskService,
    private readonly tryOn: KioskTryOnService,
    private readonly mediaUploadSettings: MediaUploadSettingsService,
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
      required: ["clientRequestId"],
      properties: {
        clientRequestId: { type: "string" },
        sessionId: { type: "string", format: "uuid" },
        personAssetId: { type: "string", format: "uuid" },
        tryOnVertical: {
          type: "string",
          enum: ["GARMENT", "JEWELLERY"],
          default: "GARMENT",
        },
        personImage: { type: "string", format: "binary" },
        garmentImage: { type: "string", format: "binary" },
        jewelleryImage: { type: "string", format: "binary" },
        jewelleryType: {
          type: "string",
          enum: ["RING", "BRACELET", "NECKLACE", "EARRING"],
        },
        productId: { type: "string", format: "uuid" },
        garmentSource: {
          type: "string",
          enum: ["DIRECT_UPLOAD", "SELFX_CATALOG"],
        },
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
    const device = await this.kiosks.requireDevice(
      request.headers.authorization,
    );
    const maxImageBytes =
      await this.mediaUploadSettings.resolveCaptureImageMaxBytes();
    const payload = await parseKioskTryOnRunMultipartRequest(request, {
      maxImageBytes,
    });
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
    const device = await this.kiosks.requireDevice(
      request.headers.authorization,
    );
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
    private readonly mediaUploadSettings: MediaUploadSettingsService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Create a kiosk customer Try-On session" })
  @ApiCreatedResponse({ type: KioskTryOnSessionResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async create(
    @Req() request: FastifyRequest,
  ): Promise<KioskTryOnSessionResponseDto> {
    const device = await this.kiosks.requireDevice(
      request.headers.authorization,
    );
    return this.tryOn.createSession(device);
  }

  @Post(":sessionId/person")
  @ApiOperation({
    summary: "Set the current person image for a Try-On session",
  })
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
    const device = await this.kiosks.requireDevice(
      request.headers.authorization,
    );
    const maxImageBytes =
      await this.mediaUploadSettings.resolveCaptureImageMaxBytes();
    const payload = await parseKioskPersonMultipartRequest(request, {
      maxImageBytes,
    });
    return this.tryOn.setCurrentPerson(device, sessionId, payload);
  }

  @Get(":sessionId/looks")
  @ApiOperation({
    summary: "List successful customer looks for a Try-On session",
  })
  @ApiOkResponse({ type: KioskTryOnLooksResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async looks(
    @Req() request: FastifyRequest,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
  ): Promise<KioskTryOnLooksResponseDto> {
    const device = await this.kiosks.requireDevice(
      request.headers.authorization,
    );
    return this.tryOn.getSessionLooks(device, sessionId);
  }

  @Post(":sessionId/complete")
  @ApiOperation({ summary: "Complete a kiosk customer Try-On session" })
  @ApiBody({
    required: false,
    schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          enum: ["FINISHED", "IDLE_TIMEOUT"],
        },
      },
    },
  })
  @ApiOkResponse({ type: KioskTryOnSessionResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async complete(
    @Req() request: FastifyRequest,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
    @Body() body?: CompleteKioskTryOnSessionBody,
  ): Promise<KioskTryOnSessionResponseDto> {
    const device = await this.kiosks.requireDevice(
      request.headers.authorization,
    );
    return this.tryOn.completeSession(
      device,
      sessionId,
      parseCompletionReason(body),
    );
  }
}

function parseCompletionReason(
  body?: CompleteKioskTryOnSessionBody,
): KioskTryOnSessionCompletionReason {
  if (
    body?.reason === undefined ||
    body.reason === null ||
    body.reason === ""
  ) {
    return "FINISHED";
  }
  if (body.reason === "FINISHED" || body.reason === "IDLE_TIMEOUT") {
    return body.reason;
  }
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    "KIOSK_TRY_ON_SESSION_COMPLETION_REASON_INVALID",
    "Try-On session completion reason is invalid.",
  );
}
