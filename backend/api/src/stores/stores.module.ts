import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { KioskModule } from "../kiosks/kiosk.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { RbacModule } from "../rbac/rbac.module.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { TryOnModule } from "../try-on/try-on.module.js";
import { AdminStoresController } from "./admin-stores.controller.js";
import { AdminStoresService } from "./admin-stores.service.js";

@Module({
  imports: [AuthModule, DatabaseModule, KioskModule, RbacModule, TryOnModule],
  controllers: [AdminStoresController],
  providers: [
    AdminStoresService,
    PlatformAuthorizationService,
    ObjectStorageService,
  ],
})
export class StoresModule {}
