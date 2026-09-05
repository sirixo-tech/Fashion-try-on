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
import {
  JewelleryCaptureRequirementsParamsDto,
  JewelleryCaptureRequirementsResponseDto,
} from "../try-on/jewellery/dto/jewellery-capture-requirements.dto.js";
import { JewelleryCaptureRequirementsService } from "../try-on/jewellery/jewellery-capture-requirements.service.js";
import { JewelleryTryOnLabRunResponseDto } from "./dto/jewellery-try-on-lab-response.dto.js";
import { parseJewelleryTryOnLabMultipartRequest } from "./jewellery-try-on-lab-multipart.js";
import { JewelleryTryOnLabService } from "./jewellery-try-on-lab.service.js";

@ApiTags("Try-On Lab")
@ApiBearerAuth()
@Controller("api/v1/try-on-lab/jewellery")
export class JewelleryTryOnLabController {
  constructor(
    private readonly auth: AuthService,
    private readonly jewelleryLab: JewelleryTryOnLabService,
    private readonly captureRequirements: JewelleryCaptureRequirementsService,
  ) {}

  @Post("runs")
  @ApiOperation({
    summary: "Create an internal development Jewellery Try-On Lab run",
    description:
      "Development-only jewellery VTO lab endpoint. It accepts validated multipart images and submits through the provider-neutral SelfX jewellery adapter.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: [
        "personImage",
        "jewelleryImage",
        "jewelleryType",
        "personSemanticEvidence",
      ],
      properties: {
        personImage: { type: "string", format: "binary" },
        jewelleryImage: { type: "string", format: "binary" },
        jewelleryType: {
          type: "string",
          enum: ["RING", "BRACELET", "NECKLACE", "EARRING"],
        },
        personSemanticEvidence: {
          type: "string",
          description:
            "JSON-encoded provider-neutral semantic evidence. Raw landmarks must not be sent.",
        },
        productId: { type: "string" },
        productName: { type: "string" },
        sku: { type: "string" },
        clientRequestId: { type: "string" },
      },
    },
  })
  @ApiCreatedResponse({ type: JewelleryTryOnLabRunResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async create(
    @Req() request: FastifyRequest,
  ): Promise<JewelleryTryOnLabRunResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    const payload = await parseJewelleryTryOnLabMultipartRequest(request);
    return this.jewelleryLab.createRun(user.id, payload);
  }

  @Get("runs/:runId")
  @ApiOperation({ summary: "Get an internal Jewellery Try-On Lab run" })
  @ApiOkResponse({ type: JewelleryTryOnLabRunResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async get(
    @Req() request: FastifyRequest,
    @Param("runId", SelfxUuidParamPipe) runId: string,
  ): Promise<JewelleryTryOnLabRunResponseDto> {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.jewelleryLab.getRun(user.id, runId);
  }

  @Get("capture-requirements/:jewelleryType")
  @ApiOperation({
    summary: "Return person-image requirements for a jewellery type",
  })
  @ApiOkResponse({ type: JewelleryCaptureRequirementsResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async getCaptureRequirements(
    @Req() request: FastifyRequest,
    @Param() params: JewelleryCaptureRequirementsParamsDto,
  ): Promise<JewelleryCaptureRequirementsResponseDto> {
    await this.auth.requireAccessUser(request.headers.authorization);
    this.jewelleryLab.assertLabEnabled();
    return this.captureRequirements.resolve(params.jewelleryType, "TRY_ON_LAB");
  }
}
