import { Controller, Get, Header, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { MobilePlansService } from "../entitlements/mobile-plans.service.js";
import { SharedCreditPriceService, CUSTOM_CREDIT_LIMIT } from "../entitlements/shared-credit-price.service.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { CustomerMobilePaymentsService } from "./customer-mobile-payments.service.js";

@Controller("api/v1/customer/mobile-plans")
export class CustomerMobilePlansController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly plans: MobilePlansService,
    private readonly payments: CustomerMobilePaymentsService,
    private readonly sharedPrice: SharedCreditPriceService,
  ) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async list(@Req() request: FastifyRequest) {
    await this.auth.requireCustomer(request.headers.authorization);
    const [rate, plans, paymentsAvailable] = await Promise.all([
      this.sharedPrice.current(), this.plans.listActive(), this.payments.available(),
    ]);
    return { data: plans, purchasingAvailable: !!rate && paymentsAvailable,
      unitPriceCents: rate?.unitPriceCents ?? null, currency: "INR",
      customMaxCredits: CUSTOM_CREDIT_LIMIT };
  }
}
