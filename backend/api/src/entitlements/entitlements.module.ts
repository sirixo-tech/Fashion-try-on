import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { AdminPricingFeaturesController } from "./admin-pricing-features.controller.js";
import { AdminPricingController } from "./admin-pricing.controller.js";
import { EntitlementsService } from "./entitlements.service.js";
import { PricingFeaturesService } from "./pricing-features.service.js";
import { PricingController } from "./pricing.controller.js";
import { PricingControlService } from "./pricing-control.service.js";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [
    AdminPricingController,
    AdminPricingFeaturesController,
    PricingController,
  ],
  providers: [
    EntitlementsService,
    PricingFeaturesService,
    PricingControlService,
    PlatformAuthorizationService,
  ],
  exports: [EntitlementsService, PricingFeaturesService, PricingControlService],
})
export class EntitlementsModule {}
