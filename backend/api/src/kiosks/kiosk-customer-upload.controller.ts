import { Body, Controller, Get, Headers, Param, Post, Req } from "@nestjs/common";
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
  CustomerUploadCompleteResponseDto,
  CustomerUploadIntentDto,
  CustomerUploadIntentResponseDto,
  CustomerUploadPublicStatusDto,
  KioskCustomerUploadSessionResponseDto,
  KioskCustomerUploadSessionStatusDto,
} from "./dto/kiosk.dto.js";
import { KioskCustomerUploadService } from "./kiosk-customer-upload.service.js";
import { KioskService } from "./kiosk.service.js";

@ApiTags("Kiosk Customer Upload Sessions")
@ApiBearerAuth()
@Controller("api/v1/kiosk/customer-upload-sessions")
export class KioskCustomerUploadDeviceController {
  constructor(
    private readonly kiosks: KioskService,
    private readonly uploads: KioskCustomerUploadService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Create a customer mobile photo upload session" })
  @ApiCreatedResponse({ type: KioskCustomerUploadSessionResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async create(
    @Headers("authorization") authorization: string | undefined,
  ): Promise<KioskCustomerUploadSessionResponseDto> {
    const device = await this.kiosks.requireDevice(authorization);
    return this.uploads.createForDevice(device);
  }

  @Get(":sessionId")
  @ApiOperation({ summary: "Poll customer mobile photo upload session status" })
  @ApiOkResponse({ type: KioskCustomerUploadSessionStatusDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async get(
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
  ): Promise<KioskCustomerUploadSessionStatusDto> {
    const device = await this.kiosks.requireDevice(authorization);
    return this.uploads.getForDevice(device, sessionId);
  }

  @Post(":sessionId/cancel")
  @ApiOperation({ summary: "Cancel a customer mobile photo upload session" })
  @ApiOkResponse({ type: KioskCustomerUploadSessionStatusDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async cancel(
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
  ): Promise<KioskCustomerUploadSessionStatusDto> {
    const device = await this.kiosks.requireDevice(authorization);
    return this.uploads.cancelForDevice(device, sessionId);
  }

  @Post(":sessionId/consume")
  @ApiOperation({ summary: "Mark a ready customer upload as selected by kiosk" })
  @ApiOkResponse({ type: KioskCustomerUploadSessionStatusDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async consume(
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
  ): Promise<KioskCustomerUploadSessionStatusDto> {
    const device = await this.kiosks.requireDevice(authorization);
    return this.uploads.consumeForDevice(device, sessionId);
  }
}

@ApiTags("Customer Mobile Upload")
@Controller("api/v1/customer-uploads/:capability")
export class CustomerUploadCapabilityController {
  constructor(private readonly uploads: KioskCustomerUploadService) {}

  @Get("status")
  @ApiOperation({ summary: "Return safe public customer upload status" })
  @ApiOkResponse({ type: CustomerUploadPublicStatusDto })
  async status(
    @Req() request: FastifyRequest,
    @Param("capability") capability: string,
  ): Promise<CustomerUploadPublicStatusDto> {
    return this.uploads.publicStatus(capability, request.ip);
  }

  @Post("upload-intent")
  @ApiOperation({ summary: "Create a short-lived signed customer upload URL" })
  @ApiOkResponse({ type: CustomerUploadIntentResponseDto })
  async uploadIntent(
    @Req() request: FastifyRequest,
    @Param("capability") capability: string,
    @Body() dto: CustomerUploadIntentDto,
  ): Promise<CustomerUploadIntentResponseDto> {
    return this.uploads.createUploadIntent(capability, dto, request.ip);
  }

  @Post("complete")
  @ApiOperation({ summary: "Validate a completed customer object upload" })
  @ApiOkResponse({ type: CustomerUploadCompleteResponseDto })
  async complete(
    @Req() request: FastifyRequest,
    @Param("capability") capability: string,
  ): Promise<CustomerUploadCompleteResponseDto> {
    return this.uploads.completeUpload(capability, request.ip);
  }
}
