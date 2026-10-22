import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { TryOnErrorFilter } from "./common/try-on-error.filter.js";

import { AuthModule } from "./auth/auth.module.js";
import { AppsModule } from "./apps/apps.module.js";
import { CatalogModule } from "./catalog/catalog.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { DeveloperApiModule } from "./developer-api/developer-api.module.js";
import { EntitlementsModule } from "./entitlements/entitlements.module.js";
import { HealthController } from "./health.controller.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";
import { KioskModule } from "./kiosks/kiosk.module.js";
import { OrganizationsModule } from "./organizations/organizations.module.js";
import { RbacModule } from "./rbac/rbac.module.js";
import { StoresModule } from "./stores/stores.module.js";
import { TryOnLabModule } from "./try-on-lab/try-on-lab.module.js";
import { UsageModule } from "./usage/usage.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AppsModule,
    OrganizationsModule,
    RbacModule,
    StoresModule,
    CatalogModule,
    TryOnLabModule,
    KioskModule,
    UsageModule,
    EntitlementsModule,
    DeveloperApiModule,
    IntegrationsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: TryOnErrorFilter }],
})
export class AppModule {}
