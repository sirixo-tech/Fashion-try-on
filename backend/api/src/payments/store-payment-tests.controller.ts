import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PaymentGatewayTestsService } from "./payment-gateway-tests.service.js";
import {
  PlatformPaymentTestDetailDto,
  PlatformPaymentTestWorkspaceDto,
  StartPlatformPaymentTestDto,
} from "./platform-payment-tests.dto.js";
import { PhonePeCallbackDto } from "./payment-execution.dto.js";

@ApiTags("Store payment testing")
@ApiBearerAuth()
@Controller("api/v1/admin/stores/:storeId/payments/phonepe/testing")
export class StorePaymentTestsController {
  constructor(
    private readonly auth: AuthService,
    private readonly rbac: StoreRbacService,
    private readonly impersonation: StoreImpersonationService,
    private readonly tests: PaymentGatewayTestsService,
  ) {}

  private async authorize(
    request: FastifyRequest,
    storeId: string,
    managing: boolean,
  ) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    const context = await this.impersonation.resolveStoreContext(
      user.id,
      storeId,
    );
    if (managing && context.impersonationSession)
      throw new ApiErrorException(
        403,
        "PAYMENT_IMPERSONATION_RESTRICTED",
        "Exit Store impersonation to configure or test a payment account.",
      );
    await this.rbac.requireStorePaymentPermission(user.id, storeId, managing);
    return user;
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: PlatformPaymentTestWorkspaceDto })
  async workspace(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ) {
    await this.authorize(request, storeId, false);
    return this.tests.workspace(storeId);
  }
  @Post("tests")
  @Header("Cache-Control", "private, no-store")
  @HttpCode(200)
  @ApiOkResponse({ type: PlatformPaymentTestDetailDto })
  async start(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Body() input: StartPlatformPaymentTestDto,
  ) {
    const user = await this.authorize(request, storeId, true);
    return this.tests.start(user.id, input, storeId);
  }
  @Get("tests/:testId")
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: PlatformPaymentTestDetailDto })
  async detail(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("testId", SelfxUuidParamPipe) testId: string,
  ) {
    await this.authorize(request, storeId, true);
    return this.tests.detail(testId, storeId);
  }
  @Post("tests/:testId/check")
  @Header("Cache-Control", "private, no-store")
  @HttpCode(200)
  @ApiOkResponse({ type: PlatformPaymentTestDetailDto })
  async check(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("testId", SelfxUuidParamPipe) testId: string,
  ) {
    const user = await this.authorize(request, storeId, true);
    return this.tests.check(testId, user.id, storeId);
  }
}

@ApiTags("Store payment test notifications")
@Controller("api/v1/payments/phonepe/stores/:storeId/tests")
export class StorePaymentTestCallbacksController {
  constructor(private readonly tests: PaymentGatewayTestsService) {}
  @Post(":testId/callback")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async callback(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("testId", SelfxUuidParamPipe) testId: string,
    @Body() input: PhonePeCallbackDto,
  ) {
    const signature = request.headers["x-verify"];
    return this.tests.callback(
      testId,
      input.response,
      typeof signature === "string" ? signature : "",
      request.ip,
      storeId,
    );
  }
}
