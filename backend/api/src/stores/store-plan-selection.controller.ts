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
import { IsBoolean, IsISO8601, IsUUID } from "class-validator";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { StoreImpersonationService } from "./store-impersonation.service.js";
import { PhonePeCallbackDto } from "../payments/payment-execution.dto.js";
import { StorePlanSelectionService } from "./store-plan-selection.service.js";

export class ChooseStorePlanDto {
  @IsUUID() planId!: string;
  @IsISO8601() planUpdatedAt!: string;
  @IsUUID() clientRequestId!: string;
  @IsBoolean() acceptTerms!: boolean;
}

@Controller("api/v1/admin/stores/:storeId/plan-selection")
export class StorePlanSelectionController {
  constructor(
    private readonly auth: AuthService,
    private readonly rbac: StoreRbacService,
    private readonly impersonation: StoreImpersonationService,
    private readonly plans: StorePlanSelectionService,
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
      user.authSessionId,
    );
    if (managing && context.impersonationSession)
      throw new ApiErrorException(
        403,
        "PAYMENT_IMPERSONATION_RESTRICTED",
        "Exit Store impersonation before changing a subscription or paying a bill.",
      );
    await this.rbac.requireStorePaymentPermission(user.id, storeId, managing);
    return { ...user, impersonating: !!context.impersonationSession };
  }
  @Get()
  @Header("Cache-Control", "private, no-store")
  async workspace(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ) {
    const user = await this.authorize(request, storeId, false);
    const access = await this.rbac.effectivePermissions(
      user.id,
      storeId,
      false,
    );
    return {
      ...(await this.plans.workspace(storeId)),
      canManage: !user.impersonating && !!access.paymentAccess?.manage,
    };
  }
  @Post()
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async choose(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Body() input: ChooseStorePlanDto,
  ) {
    const user = await this.authorize(request, storeId, true);
    return this.plans.choose(storeId, user.id, input);
  }
  @Post("payments/:paymentId/check")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async check(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("paymentId", SelfxUuidParamPipe) paymentId: string,
  ) {
    await this.authorize(request, storeId, true);
    return this.plans.payment(storeId, paymentId);
  }
  @Post("payg/disable")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async disablePayg(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
  ) {
    const user = await this.authorize(request, storeId, true);
    return this.plans.disablePayg(storeId, user.id);
  }
  @Post("payments/:paymentId/pay")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async pay(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("paymentId", SelfxUuidParamPipe) paymentId: string,
  ) {
    const user = await this.authorize(request, storeId, true);
    return this.plans.payUsage(storeId, user.id, paymentId);
  }
  @Post("payments/:paymentId/cancel")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async cancel(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("paymentId", SelfxUuidParamPipe) paymentId: string,
  ) {
    await this.authorize(request, storeId, true);
    return this.plans.cancel(storeId, paymentId);
  }
}

@Controller("api/v1/store-plan-payments")
export class StorePlanPaymentCallbacksController {
  constructor(private readonly plans: StorePlanSelectionService) {}
  @Post(":paymentId/callback")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  callback(
    @Req() request: FastifyRequest,
    @Param("paymentId", SelfxUuidParamPipe) id: string,
    @Body() input: PhonePeCallbackDto,
  ) {
    const signature = request.headers["x-verify"];
    return this.plans.callback(
      id,
      input.response,
      typeof signature === "string" ? signature : "",
    );
  }
}
