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
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { KioskService } from "../kiosks/kiosk.service.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { STORE_PERMISSION_CODES } from "../rbac/store-permissions.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import { ShoppingOrderDto } from "../commerce/commerce-response.dto.js";
import {
  DeviceOrderPaymentDto,
  PhonePeCallbackDto,
  StartOrderPaymentDto,
} from "./payment-execution.dto.js";
import { OrderPaymentsService } from "./order-payments.service.js";

@ApiTags("Kiosk order payments")
@ApiBearerAuth()
@Controller(
  "api/v1/kiosk/try-on/sessions/:sessionId/shopping/orders/:orderId/payments",
)
export class KioskOrderPaymentsController {
  constructor(
    private readonly kiosks: KioskService,
    private readonly payments: OrderPaymentsService,
  ) {}
  @Post()
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: DeviceOrderPaymentDto })
  @ApiOperation({
    summary:
      "Create or replay an order payment using the Store's selected, enabled account",
  })
  async start(
    @Req() request: FastifyRequest,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
    @Param("orderId", SelfxUuidParamPipe) orderId: string,
    @Body() input: StartOrderPaymentDto,
  ) {
    return this.payments.start(
      await this.kiosks.requireDevice(request.headers.authorization),
      sessionId,
      orderId,
      input.idempotencyKey,
    );
  }
  @Get(":attemptId")
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: DeviceOrderPaymentDto })
  async get(
    @Req() request: FastifyRequest,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
    @Param("orderId", SelfxUuidParamPipe) orderId: string,
    @Param("attemptId", SelfxUuidParamPipe) attemptId: string,
  ) {
    return this.payments.deviceAttempt(
      await this.kiosks.requireDevice(request.headers.authorization),
      sessionId,
      orderId,
      attemptId,
    );
  }
  @Post(":attemptId/check")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: DeviceOrderPaymentDto })
  async check(
    @Req() request: FastifyRequest,
    @Param("sessionId", SelfxUuidParamPipe) sessionId: string,
    @Param("orderId", SelfxUuidParamPipe) orderId: string,
    @Param("attemptId", SelfxUuidParamPipe) attemptId: string,
  ) {
    return this.payments.deviceAttempt(
      await this.kiosks.requireDevice(request.headers.authorization),
      sessionId,
      orderId,
      attemptId,
      true,
    );
  }
}

@ApiTags("Store order payments")
@ApiBearerAuth()
@Controller("api/v1/admin/stores/:storeId/shopping/orders/:orderId")
export class StoreOrderPaymentsController {
  constructor(
    private readonly auth: AuthService,
    private readonly platform: PlatformAuthorizationService,
    private readonly rbac: StoreRbacService,
    private readonly impersonation: StoreImpersonationService,
    private readonly payments: OrderPaymentsService,
  ) {}
  @Post("payments/:attemptId/check")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: ShoppingOrderDto })
  async check(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("orderId", SelfxUuidParamPipe) orderId: string,
    @Param("attemptId", SelfxUuidParamPipe) attemptId: string,
  ) {
    const user = await this.authorize(request, storeId);
    return this.payments.checkStaff(storeId, orderId, attemptId, user.id);
  }
  @Post("recover-stock")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ type: ShoppingOrderDto })
  async recover(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("orderId", SelfxUuidParamPipe) orderId: string,
  ) {
    const user = await this.authorize(request, storeId);
    return this.payments.retryAllocation(storeId, orderId, user.id);
  }
  private async authorize(request: FastifyRequest, storeId: string) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.impersonation.resolveStoreContext(user.id, storeId);
    if (
      !(await this.platform.hasPermission(
        user.id,
        PLATFORM_PERMISSIONS.storesUpdate,
      ))
    )
      await this.rbac.requireStorePermission(
        user.id,
        storeId,
        STORE_PERMISSION_CODES.storesUpdate,
      );
    return user;
  }
}

@ApiTags("Payment notifications")
@Controller("api/v1/payments/phonepe")
export class PhonePeCallbacksController {
  constructor(private readonly payments: OrderPaymentsService) {}
  @Post(":attemptId/callback")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "Accept a signed PhonePe notification for durable status verification",
  })
  @ApiOkResponse({
    schema: { type: "object", properties: { accepted: { type: "boolean" } } },
  })
  async callback(
    @Req() request: FastifyRequest,
    @Param("attemptId", SelfxUuidParamPipe) attemptId: string,
    @Body() input: PhonePeCallbackDto,
  ) {
    const signature = request.headers["x-verify"];
    return this.payments.callback(
      attemptId,
      input.response,
      typeof signature === "string" ? signature : "",
      request.ip,
    );
  }
}
