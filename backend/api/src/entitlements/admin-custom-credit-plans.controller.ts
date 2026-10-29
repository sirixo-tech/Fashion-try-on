import { Body, Controller, Get, Header, Param, Put, Req } from "@nestjs/common";
import { CustomCreditChannel, PricingPlanStatus } from "@prisma/client";
import {
  IsIn,
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import { CustomCreditPlansService } from "./custom-credit-plans.service.js";

class SaveCustomCreditPlanDto {
  @IsString() @Length(2, 160) name!: string;
  @IsIn([PricingPlanStatus.ACTIVE, PricingPlanStatus.INACTIVE])
  status!: PricingPlanStatus;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsInt() @Min(1) @Max(2_000_000) unitPriceCents!: number;
  @IsInt() @Min(0) expectedVersion!: number;
}

@Controller("api/v1/admin/custom-credit-plans")
export class AdminCustomCreditPlansController {
  constructor(
    private readonly auth: AuthService,
    private readonly platform: PlatformAuthorizationService,
    private readonly impersonation: StoreImpersonationService,
    private readonly plans: CustomCreditPlansService,
  ) {}

  private channel(value: string): CustomCreditChannel {
    if (value !== CustomCreditChannel.MOBILE)
      throw new ApiErrorException(
        400,
        "CUSTOM_CREDIT_CHANNEL_INVALID",
        "Only Mobile custom credits are available.",
      );
    return value;
  }

  private async actor(request: FastifyRequest, write: boolean) {
    const actor = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    if ((await this.impersonation.currentSession(actor.id)).session)
      throw new ApiErrorException(
        403,
        "PRICING_IMPERSONATION_RESTRICTED",
        "Exit impersonation to manage pricing.",
      );
    await this.platform.requirePermission(
      actor.id,
      write
        ? PLATFORM_PERMISSIONS.pricingManage
        : PLATFORM_PERMISSIONS.pricingView,
    );
    return actor;
  }

  @Get(":channel")
  @Header("Cache-Control", "no-store")
  async get(@Req() request: FastifyRequest, @Param("channel") channel: string) {
    await this.actor(request, false);
    return this.plans.current(this.channel(channel));
  }

  @Put(":channel")
  @Header("Cache-Control", "no-store")
  async save(
    @Req() request: FastifyRequest,
    @Param("channel") channel: string,
    @Body() input: SaveCustomCreditPlanDto,
  ) {
    const actor = await this.actor(request, true);
    return this.plans.save(this.channel(channel), actor.id, input);
  }
}
