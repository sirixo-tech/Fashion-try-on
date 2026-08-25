import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { AuthModule } from "../auth/auth.module.js";
import { CatalogService } from "../catalog/catalog.service.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { MediaUploadSettingsService } from "../platform/media-upload-settings.service.js";
import { TryOnModule } from "../try-on/try-on.module.js";
import { GarmentPreviewProviderRegistry } from "../ai/garment-preview/garment-preview.registry.js";
import { GarmentPreviewService } from "../ai/garment-preview/garment-preview.service.js";
import { FashnGarmentPreviewProvider } from "../ai/garment-preview/providers/fashn-garment-preview.provider.js";
import { OpenAiGarmentPreviewProvider } from "../ai/garment-preview/providers/openai-garment-preview.provider.js";
import { GarmentIntentClassifierService } from "../ai/garment-intent/garment-intent-classifier.service.js";
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
import {
  KioskTryOnController,
  KioskTryOnSessionController,
} from "./kiosk-try-on.controller.js";
import {
  KioskTryOnShareController,
  PublicTryOnShareController,
} from "./kiosk-try-on-share.controller.js";
import { KioskTryOnShareService } from "./kiosk-try-on-share.service.js";
import { KioskTryOnService } from "./kiosk-try-on.service.js";
import { KioskService } from "./kiosk.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import {
  AdminKioskConfigurationController,
  KioskConfigurationController,
} from "./kiosk-configuration.controller.js";
import { KioskConfigurationService } from "./kiosk-configuration.service.js";
import { KioskGarmentExtractionController } from "./kiosk-garment-extraction.controller.js";
import { KioskGarmentExtractionService } from "./kiosk-garment-extraction.service.js";

@Module({
  imports: [AuthModule, DatabaseModule, JwtModule.register({}), TryOnModule],
  controllers: [
    AdminKiosksController,
    KioskProvisioningController,
    KioskSessionController,
    KioskDeviceSessionController,
    KioskHeartbeatController,
    KioskTryOnSessionController,
    KioskTryOnController,
    KioskTryOnShareController,
    PublicTryOnShareController,
    KioskGarmentExtractionController,
    KioskCustomerUploadDeviceController,
    CustomerUploadCapabilityController,
    AdminKioskConfigurationController,
    KioskConfigurationController,
  ],
  providers: [
    KioskService,
    KioskCustomerUploadService,
    KioskTryOnService,
    KioskTryOnShareService,
    CatalogService,
    KioskGarmentExtractionService,
    GarmentIntentClassifierService,
    GarmentPreviewService,
    GarmentPreviewProviderRegistry,
    FashnGarmentPreviewProvider,
    OpenAiGarmentPreviewProvider,
    KioskConfigurationService,
    MediaUploadSettingsService,
    ObjectStorageService,
    PlatformAuthorizationService,
    { provide: KIOSK_CONFIG, useFactory: () => loadKioskConfig() },
  ],
  exports: [KioskService, KioskConfigurationService],
})
export class KioskModule {}
