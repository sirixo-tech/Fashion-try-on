import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { ApiErrorResponseDto } from "../auth/dto/auth-response.dto.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import { PhonePeCallbackDto } from "./payment-execution.dto.js";
import {
  PlatformPaymentTestDetailDto,
  PlatformPaymentTestWorkspaceDto,
  SavePlatformPhonePeTestDto,
  StartPlatformPaymentTestDto,
} from "./platform-payment-tests.dto.js";
import { PlatformPaymentTestsService } from "./platform-payment-tests.service.js";

@ApiTags("Platform payment testing")
@ApiBearerAuth()
@ApiResponse({ status: 403, type: ApiErrorResponseDto })
@Controller("api/v1/admin/payment-gateways/PHONEPE/testing")
export class PlatformPaymentTestsController {
  constructor(
    private readonly auth: AuthService,
    private readonly platform: PlatformAuthorizationService,
    private readonly impersonation: StoreImpersonationService,
    private readonly tests: PlatformPaymentTestsService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: PlatformPaymentTestWorkspaceDto })
  @ApiOperation({
    summary: "Read platform UAT setup metadata and safe test history",
  })
  async workspace(@Req() request: FastifyRequest) {
    await this.authorize(request, false);
    return this.tests.workspace();
  }

  @Put("connection")
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: PlatformPaymentTestWorkspaceDto })
  @ApiOperation({
    summary:
      "Replace isolated platform UAT credentials; never used by Store checkout",
  })
  async save(
    @Req() request: FastifyRequest,
    @Body() input: SavePlatformPhonePeTestDto,
  ) {
    const user = await this.authorize(request, true);
    return this.tests.save(user.id, input);
  }

  @Post("tests")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: PlatformPaymentTestDetailDto })
  @ApiOperation({
    summary: "Create or replay a platform-only INR 1.00 UAT test QR",
  })
  async start(
    @Req() request: FastifyRequest,
    @Body() input: StartPlatformPaymentTestDto,
  ) {
    const user = await this.authorize(request, true);
    return this.tests.start(user.id, input);
  }

  @Get("tests/:testId")
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: PlatformPaymentTestDetailDto })
  @ApiOperation({
    summary:
      "Read an isolated test and its unexpired QR; requires integration management",
  })
  async detail(
    @Req() request: FastifyRequest,
    @Param("testId", SelfxUuidParamPipe) id: string,
  ) {
    await this.authorize(request, true);
    return this.tests.detail(id);
  }

  @Post("tests/:testId/check")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: PlatformPaymentTestDetailDto })
  @ApiOperation({
    summary:
      "Verify platform test status with PhonePe; cannot manually mark success",
  })
  async check(
    @Req() request: FastifyRequest,
    @Param("testId", SelfxUuidParamPipe) id: string,
  ) {
    const user = await this.authorize(request, true);
    return this.tests.check(id, user.id);
  }

  private async authorize(request: FastifyRequest, managing: boolean) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    if ((await this.impersonation.currentSession(user.id)).session)
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        "PAYMENT_IMPERSONATION_RESTRICTED",
        "Exit Store impersonation to access platform payment testing.",
      );
    if (
      !(await this.platform.hasPermission(
        user.id,
        managing
          ? PLATFORM_PERMISSIONS.integrationsManage
          : PLATFORM_PERMISSIONS.integrationsView,
      ))
    )
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        "PLATFORM_PERMISSION_DENIED",
        "Platform payment testing access is not permitted.",
      );
    return user;
  }
}

@ApiTags("Platform payment test notifications")
@Controller("api/v1/payments/phonepe/platform-tests")
export class PlatformPaymentTestCallbacksController {
  constructor(private readonly tests: PlatformPaymentTestsService) {}
  @Post(":testId/callback")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "Accept an authenticated UAT test notification for independent status verification",
  })
  @ApiOkResponse({
    schema: { type: "object", properties: { accepted: { type: "boolean" } } },
  })
  async callback(
    @Req() request: FastifyRequest,
    @Param("testId", SelfxUuidParamPipe) id: string,
    @Body() input: PhonePeCallbackDto,
  ) {
    const signature = request.headers["x-verify"];
    return this.tests.callback(
      id,
      input.response,
      typeof signature === "string" ? signature : "",
      request.ip,
    );
  }
}
