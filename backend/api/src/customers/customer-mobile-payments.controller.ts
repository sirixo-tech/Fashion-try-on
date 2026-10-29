import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Put,
  Req,
  StreamableFile,
} from "@nestjs/common";
import { toBuffer } from "qrcode";
import {
  IsBoolean,
  IsIn,
  IsString,
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
  MinLength,
} from "class-validator";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { CustomerMobilePaymentsService } from "./customer-mobile-payments.service.js";

class StartMobilePurchaseDto {
  @IsOptional() @IsUUID() planId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) credits?: number;
  @IsUUID() requestId!: string;
}
class SaveMobilePaymentDto {
  @IsIn(["SANDBOX", "PRODUCTION"]) environment!: "SANDBOX" | "PRODUCTION";
  @IsString() @MinLength(1) @MaxLength(100) merchantId!: string;
  @IsString() @MinLength(1) @MaxLength(150) clientId!: string;
  @IsString() @MinLength(1) @MaxLength(40) clientVersion!: string;
  @IsString() @MinLength(8) @MaxLength(256) clientSecret!: string;
  @IsBoolean() enabled!: boolean;
}

@Controller("api/v1/customer/mobile-payments")
export class CustomerMobilePaymentsController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly payments: CustomerMobilePaymentsService,
  ) {}
  @Get()
  @Header("Cache-Control", "no-store")
  async latest(@Req() request: FastifyRequest) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    return { purchase: await this.payments.latest(customer.id) };
  }
  @Post()
  @Header("Cache-Control", "no-store")
  async start(
    @Req() request: FastifyRequest,
    @Body() input: StartMobilePurchaseDto,
  ) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    return this.payments.start(customer.id, { planId: input.planId, credits: input.credits }, input.requestId);
  }
  @Get(":id")
  @Header("Cache-Control", "no-store")
  async status(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    return this.payments.status(customer.id, id);
  }
  @Get(":id/qr")
  @Header("Cache-Control", "no-store")
  async qr(
    @Req() request: FastifyRequest,
    @Param("id", SelfxUuidParamPipe) id: string,
  ) {
    const { customer } = await this.auth.requireCustomer(
      request.headers.authorization,
    );
    const checkoutUrl = await this.payments.checkoutUrlForQr(customer.id, id);
    const png = await toBuffer(checkoutUrl, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    return new StreamableFile(png, { type: "image/png" });
  }
}

@Controller("api/v1/admin/mobile-payments")
export class AdminMobilePaymentsController {
  constructor(
    private readonly auth: AuthService,
    private readonly platform: PlatformAuthorizationService,
    private readonly impersonation: StoreImpersonationService,
    private readonly payments: CustomerMobilePaymentsService,
  ) {}
  private async actor(request: FastifyRequest, write: boolean) {
    const actor = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    if ((await this.impersonation.currentSession(actor.id)).session)
      throw new ApiErrorException(
        403,
        "PAYMENT_IMPERSONATION_RESTRICTED",
        "Exit impersonation to manage mobile payments.",
      );
    await this.platform.requirePermission(
      actor.id,
      write
        ? PLATFORM_PERMISSIONS.integrationsManage
        : PLATFORM_PERMISSIONS.integrationsView,
    );
    return actor;
  }
  @Get()
  @Header("Cache-Control", "no-store")
  async get(@Req() request: FastifyRequest) {
    await this.actor(request, false);
    return this.payments.adminSettings();
  }
  @Put()
  @Header("Cache-Control", "no-store")
  async save(
    @Req() request: FastifyRequest,
    @Body() input: SaveMobilePaymentDto,
  ) {
    const actor = await this.actor(request, true);
    return this.payments.saveAdmin(actor.id, input);
  }
}
