import { Controller, Post, Req } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";

import { ApiErrorResponseDto } from "../auth/dto/auth-response.dto.js";
import { KioskGarmentExtractionResponseDto } from "./dto/kiosk-garment-extraction.dto.js";
import { parseKioskGarmentExtractionMultipartRequest } from "./kiosk-garment-extraction.multipart.js";
import { KioskGarmentExtractionService } from "./kiosk-garment-extraction.service.js";
import { KioskService } from "./kiosk.service.js";

@ApiTags("Kiosk Garment Extraction")
@ApiBearerAuth()
@Controller("api/v1/kiosk/garment-extractions")
export class KioskGarmentExtractionController {
  constructor(
    private readonly kiosks: KioskService,
    private readonly extraction: KioskGarmentExtractionService,
  ) {}

  @Post()
  @ApiOperation({
    summary: "Create a garment-only preview for kiosk review",
    description:
      "Device-authenticated kiosk endpoint. The kiosk uploads the garment reference to SelfX, and SelfX performs provider-backed extraction server-side.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["garmentImage"],
      properties: {
        garmentImage: { type: "string", format: "binary" },
        garmentIntent: {
          type: "string",
          enum: ["AUTO", "TOP", "BOTTOM", "ONE_PIECE", "FULL_OUTFIT"],
        },
      },
    },
  })
  @ApiCreatedResponse({ type: KioskGarmentExtractionResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 502, type: ApiErrorResponseDto })
  @ApiResponse({ status: 503, type: ApiErrorResponseDto })
  async create(
    @Req() request: FastifyRequest,
  ): Promise<KioskGarmentExtractionResponseDto> {
    const device = await this.kiosks.requireDevice(request.headers.authorization);
    const payload = await parseKioskGarmentExtractionMultipartRequest(request);
    return this.extraction.extract(device, payload);
  }
}
