import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health.controller.js";
import { KioskModule } from "./kiosks/kiosk.module.js";
import { OrganizationsModule } from "./organizations/organizations.module.js";
import { TryOnLabModule } from "./try-on-lab/try-on-lab.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    OrganizationsModule,
    TryOnLabModule,
    KioskModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
