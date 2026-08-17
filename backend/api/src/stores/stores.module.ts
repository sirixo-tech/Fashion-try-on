import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { KioskModule } from "../kiosks/kiosk.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { AdminStoresController } from "./admin-stores.controller.js";
import { AdminStoresService } from "./admin-stores.service.js";

@Module({
  imports: [AuthModule, DatabaseModule, KioskModule],
  controllers: [AdminStoresController],
  providers: [AdminStoresService, PlatformAuthorizationService],
})
export class StoresModule {}
