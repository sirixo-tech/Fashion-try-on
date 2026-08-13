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

import { AuthService } from "../auth/auth.service.js";
import { ApiErrorResponseDto } from "../auth/dto/auth-response.dto.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { TryOnLabRunResponseDto } from "./dto/try-on-lab-response.dto.js";
import { parseTryOnLabMultipartRequest } from "./try-on-lab-multipart.js";
import { TryOnLabService } from "./try-on-lab.service.js";

@ApiTags("Try-On Lab")
@ApiBearerAuth()
@Controller("api/v1/try-on-lab/runs")
export class TryOnLabController {
  constructor(
    private readonly auth: AuthService,
    private readonly tryOnLab: TryOnLabService,
  ) {}

  @Post()
  @ApiOperation({
    summary: "Create an internal development Try-On Lab run",
    description:
      "Development-only VTO lab endpoint. It accepts validated multipart images, submits through the provider-neutral SelfX adapter, and returns an ephemeral SelfX run ID.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["personImage", "garmentImage"],
      properties: {
        personImage: { type: "string", format: "binary" },
        garmentImage: { type: "string", format: "binary" },
        garmentSource: {
          type: "string",
          enum: ["DIRECT_UPLOAD"],
          default: "DIRECT_UPLOAD",
        },
        garmentIntent: {
          type: "string",
          enum: ["AUTO", "TOP", "BOTTOM", "ONE_PIECE", "FULL_OUTFIT"],
          default: "AUTO",
        },
        category: {
          type: "string",
          enum: ["AUTO", "TOP", "BOTTOM", "ONE_PIECE"],
          default: "AUTO",
        },
        garmentPhotoType: {
          type: "string",
          enum: ["AUTO", "FLAT_LAY", "ON_MODEL"],
          default: "AUTO",
        },
        generationProfile: {
          type: "string",
          enum: ["PERFORMANCE", "BALANCED", "QUALITY"],
          default: "BALANCED",
        },
        categoryResolutionSource: {
          type: "string",
          description:
            "Provider-neutral resolution source such as BODY_COVERAGE_ANALYSIS, USER_DISAMBIGUATION, AUTO_FALLBACK or INTERNAL_LAB_OVERRIDE.",
        },
        photoTypeResolutionSource: {
          type: "string",
          description: "Provider-neutral garment photo type resolution source.",
        },
        profileResolutionSource: {
          type: "string",
          description: "Provider-neutral generation profile resolution source.",
        },
        analysisConfidence: {
          type: "string",
          description:
            "Optional 0-1 confidence from browser-side garment input analysis.",
        },
        disambiguationRequired: {
          type: "string",
          enum: ["true", "false"],
        },
        disambiguationResolved: {
          type: "string",
          enum: ["true", "false"],
        },
        garmentAnalysisBodyCoverage: {
          type: "string",
          enum: [
            "",
            "NO_PERSON",
            "UPPER_BODY_MODEL",
            "LOWER_BODY_MODEL",
            "FULL_BODY_MODEL",
            "UNKNOWN",
          ],
        },
        garmentAnalysisReasonCodes: {
          type: "string",
          description:
            "JSON array of provider-neutral garment input analysis reason codes.",
        },
        qualityWarningCodes: {
          type: "string",
          description:
            "JSON array of provider-neutral image quality warning codes from browser-side preflight.",
        },
        qualityOverrideAccepted: {
          type: "string",
          enum: ["true", "false"],
          description:
            "Whether the internal tester accepted advisory image quality warnings for this unchanged input state.",
        },
      },
    },
  })
  @ApiCreatedResponse({ type: TryOnLabRunResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async create(
    @Req() request: FastifyRequest,
  ): Promise<TryOnLabRunResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    const payload = await parseTryOnLabMultipartRequest(request);
    return this.tryOnLab.createRun(user.id, payload);
  }

  @Get(":runId")
  @ApiOperation({ summary: "Get an internal development Try-On Lab run" })
  @ApiOkResponse({ type: TryOnLabRunResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async get(
    @Req() request: FastifyRequest,
    @Param("runId", SelfxUuidParamPipe) runId: string,
  ): Promise<TryOnLabRunResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.tryOnLab.getRun(user.id, runId);
  }
}
