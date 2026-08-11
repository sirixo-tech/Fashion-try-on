import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module.js";
import { HealthController } from "./health.controller.js";
import { OrganizationsModule } from "./organizations/organizations.module.js";

@Module({
  imports: [AuthModule, OrganizationsModule],
  controllers: [HealthController],
})
export class AppModule {}
