import { Body, Controller, Get, Header, Put, Req } from "@nestjs/common";
import { IsInt, Max, Min } from "class-validator";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import { SharedCreditPriceService } from "./shared-credit-price.service.js";

class SaveSharedCreditPriceDto {
  @IsInt() @Min(100) @Max(100_000) unitPriceCents!: number;
  @IsInt() @Min(0) expectedVersion!: number;
}

@Controller("api/v1/admin/shared-credit-price")
export class AdminSharedCreditPriceController {
  constructor(
    private readonly auth: AuthService,
    private readonly platform: PlatformAuthorizationService,
    private readonly impersonation: StoreImpersonationService,
    private readonly price: SharedCreditPriceService,
  ) {}
  private async actor(request: FastifyRequest, write: boolean) {
    const actor = await this.auth.requireAccessUser(request.headers.authorization);
    if ((await this.impersonation.currentSession(actor.id)).session)
      throw new ApiErrorException(403, "PRICING_IMPERSONATION_RESTRICTED", "Exit impersonation to manage shared pricing.");
    await this.platform.requirePermission(actor.id,
      write ? PLATFORM_PERMISSIONS.pricingManage : PLATFORM_PERMISSIONS.pricingView);
    return actor;
  }
  @Get() @Header("Cache-Control", "no-store")
  async get(@Req() request: FastifyRequest) {
    await this.actor(request, false);
    const rate = await this.price.current();
    return { currency: "INR", unitPriceCents: rate?.unitPriceCents ?? null,
      version: rate?.version ?? 0, customMaxCredits: 1000 };
  }
  @Put() @Header("Cache-Control", "no-store")
  async save(@Req() request: FastifyRequest, @Body() input: SaveSharedCreditPriceDto) {
    const actor = await this.actor(request, true);
    const rate = await this.price.save(actor.id, input.unitPriceCents, input.expectedVersion);
    return { currency: rate.currency, unitPriceCents: rate.unitPriceCents,
      version: rate.version, customMaxCredits: 1000 };
  }
}
