import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { AdminPricingController } from "./admin-pricing.controller.js";
import { EntitlementsService } from "./entitlements.service.js";
import { PricingControlService } from "./pricing-control.service.js";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AdminPricingController],
  providers: [
    EntitlementsService,
    PricingControlService,
    PlatformAuthorizationService,
  ],
  exports: [EntitlementsService, PricingControlService],
})
export class EntitlementsModule {}
