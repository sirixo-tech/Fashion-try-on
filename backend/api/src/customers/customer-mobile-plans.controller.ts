import { Controller, Get, Header, Req } from "@nestjs/common";
import { CustomCreditChannel, PricingPlanStatus } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { MobilePlansService } from "../entitlements/mobile-plans.service.js";
import {
  CustomCreditPlansService,
  MOBILE_CUSTOM_CREDIT_LIMIT,
} from "../entitlements/custom-credit-plans.service.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { CustomerMobilePaymentsService } from "./customer-mobile-payments.service.js";

@Controller("api/v1/customer/mobile-plans")
export class CustomerMobilePlansController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly plans: MobilePlansService,
    private readonly payments: CustomerMobilePaymentsService,
    private readonly customPlans: CustomCreditPlansService,
  ) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async list(@Req() request: FastifyRequest) {
    await this.auth.requireCustomer(request.headers.authorization);
    const [customPlan, plans, paymentsAvailable] = await Promise.all([
      this.customPlans.current(CustomCreditChannel.MOBILE),
      this.plans.listActive(),
      this.payments.available(),
    ]);
    const customAvailable =
      customPlan?.status === PricingPlanStatus.ACTIVE &&
      customPlan.currency === "INR";
    return {
      data: plans,
      purchasingAvailable: paymentsAvailable,
      customPurchasingAvailable: customAvailable && paymentsAvailable,
      unitPriceCents: customAvailable ? customPlan.unitPriceCents : null,
      customPlanId: customAvailable ? customPlan.id : null,
      currency: "INR",
      customMaxCredits: MOBILE_CUSTOM_CREDIT_LIMIT,
    };
  }
}
