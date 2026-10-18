import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { KioskModule } from "../kiosks/kiosk.module.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { TryOnModule } from "../try-on/try-on.module.js";
import { CatalogService } from "./catalog.service.js";
import { KioskCatalogController } from "./kiosk-catalog.controller.js";

@Module({
  imports: [AuthModule, DatabaseModule, KioskModule, TryOnModule],
  controllers: [KioskCatalogController],
  providers: [CatalogService, ObjectStorageService],
  exports: [CatalogService],
})
export class CatalogModule {}
