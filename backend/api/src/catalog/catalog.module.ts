import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { KioskModule } from "../kiosks/kiosk.module.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { CatalogService } from "./catalog.service.js";
import { KioskCatalogController } from "./kiosk-catalog.controller.js";

@Module({
  imports: [DatabaseModule, KioskModule],
  controllers: [KioskCatalogController],
  providers: [CatalogService, ObjectStorageService],
  exports: [CatalogService],
})
export class CatalogModule {}
