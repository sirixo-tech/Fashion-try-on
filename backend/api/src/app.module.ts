import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module.js";
import { HealthController } from "./health.controller.js";
import { OrganizationsModule } from "./organizations/organizations.module.js";
import { TryOnLabModule } from "./try-on-lab/try-on-lab.module.js";

@Module({
  imports: [AuthModule, OrganizationsModule, TryOnLabModule],
  controllers: [HealthController],
})
export class AppModule {}
