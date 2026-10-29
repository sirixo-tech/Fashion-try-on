import { Controller, Get, Header, Param, Query, Req } from "@nestjs/common";
import { CustomCreditChannel } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { CustomCreditPlansService } from "../entitlements/custom-credit-plans.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { StoreImpersonationService } from "./store-impersonation.service.js";

@Controller("api/v1/admin/stores/:storeId/custom-credits")
export class StoreCustomCreditQuoteController {
  constructor(
    private readonly auth: AuthService,
    private readonly rbac: StoreRbacService,
    private readonly impersonation: StoreImpersonationService,
    private readonly plans: CustomCreditPlansService,
  ) {}

  @Get("quote")
  @Header("Cache-Control", "private, no-store")
  async quote(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Query("quantity") rawQuantity: string,
  ) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.impersonation.resolveStoreContext(user.id, storeId);
    await this.rbac.requireStoreResourcePermission(
      user.id,
      storeId,
      "stores.view",
    );
    const quantity = /^\d+$/.test(rawQuantity ?? "")
      ? Number(rawQuantity)
      : NaN;
    const quote = await this.plans.quote(CustomCreditChannel.STORE, quantity);
    return { ...quote, storeId, checkoutAvailable: false };
  }
}
