import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { GarmentPreviewSettingsService } from "../try-on/garment-preview-settings.service.js";
import { AdminPricingFeaturesController } from "./admin-pricing-features.controller.js";
import { AdminPricingController } from "./admin-pricing.controller.js";
import { AdminMobilePlansController } from "./admin-mobile-plans.controller.js";
import { EntitlementsService } from "./entitlements.service.js";
import { PricingFeaturesService } from "./pricing-features.service.js";
import { PricingController } from "./pricing.controller.js";
import { PricingControlService } from "./pricing-control.service.js";
import { MobilePlansService } from "./mobile-plans.service.js";
import { CustomCreditPlansService } from "./custom-credit-plans.service.js";
import { AdminCustomCreditPlansController } from "./admin-custom-credit-plans.controller.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [
    AdminPricingController,
    AdminMobilePlansController,
    AdminCustomCreditPlansController,
    AdminPricingFeaturesController,
    PricingController,
  ],
  providers: [
    EntitlementsService,
    PricingFeaturesService,
    PricingControlService,
    MobilePlansService,
    CustomCreditPlansService,
    StoreImpersonationService,
    PlatformAuthorizationService,
    GarmentPreviewSettingsService,
  ],
  exports: [
    EntitlementsService,
    PricingFeaturesService,
    PricingControlService,
    MobilePlansService,
    CustomCreditPlansService,
  ],
})
export class EntitlementsModule {}
