import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { AdminKiosksController } from "./admin-kiosks.controller.js";
import {
  CustomerUploadCapabilityController,
  KioskCustomerUploadDeviceController,
} from "./kiosk-customer-upload.controller.js";
import { KioskCustomerUploadService } from "./kiosk-customer-upload.service.js";
import {
  KioskDeviceSessionController,
  KioskHeartbeatController,
} from "./kiosk-device.controller.js";
import {
  KioskProvisioningController,
  KioskSessionController,
} from "./kiosk-provisioning.controller.js";
import { KIOSK_CONFIG } from "./kiosk.constants.js";
import { loadKioskConfig } from "./kiosk.config.js";
import { KioskService } from "./kiosk.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";

@Module({
  imports: [AuthModule, DatabaseModule, JwtModule.register({})],
  controllers: [
    AdminKiosksController,
    KioskProvisioningController,
    KioskSessionController,
    KioskDeviceSessionController,
    KioskHeartbeatController,
    KioskCustomerUploadDeviceController,
    CustomerUploadCapabilityController,
  ],
  providers: [
    KioskService,
    KioskCustomerUploadService,
    ObjectStorageService,
    PlatformAuthorizationService,
    { provide: KIOSK_CONFIG, useFactory: () => loadKioskConfig() },
  ],
})
export class KioskModule {}
