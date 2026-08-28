import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module.js";
import { CatalogModule } from "./catalog/catalog.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { DeveloperApiModule } from "./developer-api/developer-api.module.js";
import { HealthController } from "./health.controller.js";
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
    OrganizationsModule,
    RbacModule,
    StoresModule,
    CatalogModule,
    TryOnLabModule,
    KioskModule,
    UsageModule,
    DeveloperApiModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
