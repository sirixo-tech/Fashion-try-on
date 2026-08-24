import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { KioskModule } from "../kiosks/kiosk.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { AdminCatalogController } from "./admin-catalog.controller.js";
import { AdminCatalogService } from "./admin-catalog.service.js";
import { CatalogService } from "./catalog.service.js";
import { KioskCatalogController } from "./kiosk-catalog.controller.js";

@Module({
  imports: [AuthModule, DatabaseModule, KioskModule],
  controllers: [AdminCatalogController, KioskCatalogController],
  providers: [
    AdminCatalogService,
    CatalogService,
    ObjectStorageService,
    PlatformAuthorizationService,
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
