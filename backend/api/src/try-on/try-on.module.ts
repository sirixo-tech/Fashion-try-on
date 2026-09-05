import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { GarmentPreviewSettingsService } from "./garment-preview-settings.service.js";
import { JewelleryCaptureRequirementsService } from "./jewellery/jewellery-capture-requirements.service.js";
import { JewelleryPersonImageValidatorService } from "./jewellery/jewellery-person-image-validator.service.js";
import { JewelleryTryOnExecutionService } from "./jewellery/jewellery-try-on-execution.service.js";
import { JewelleryTryOnProviderRegistry } from "./jewellery/jewellery-try-on.registry.js";
import { JewelleryTryOnService } from "./jewellery/jewellery-try-on.service.js";
import { PerfectCorpJewelleryTryOnProvider } from "./jewellery/perfect-corp-jewellery-try-on.provider.js";
import { FashnVirtualTryOnProvider } from "./providers/fashn-virtual-try-on.provider.js";
import { GoogleVirtualTryOnProvider } from "./providers/google-virtual-try-on.provider.js";
import { VirtualTryOnProviderRegistry } from "./providers/virtual-try-on.registry.js";
import {
  JEWELLERY_TRY_ON_PROVIDER,
  TRY_ON_PROVIDER,
} from "./try-on.constants.js";
import { TryOnExecutionService } from "./try-on-execution.service.js";
import { TryOnSessionService } from "./try-on-session.service.js";

@Module({
  imports: [DatabaseModule],
  providers: [
    FashnVirtualTryOnProvider,
    GoogleVirtualTryOnProvider,
    VirtualTryOnProviderRegistry,
    PerfectCorpJewelleryTryOnProvider,
    JewelleryTryOnProviderRegistry,
    JewelleryCaptureRequirementsService,
    JewelleryPersonImageValidatorService,
    JewelleryTryOnExecutionService,
    JewelleryTryOnService,
    TryOnExecutionService,
    TryOnSessionService,
    GarmentPreviewSettingsService,
    ObjectStorageService,
    {
      provide: TRY_ON_PROVIDER,
      useFactory: (registry: VirtualTryOnProviderRegistry) =>
        registry.resolve(),
      inject: [VirtualTryOnProviderRegistry],
    },
    {
      provide: JEWELLERY_TRY_ON_PROVIDER,
      useFactory: (registry: JewelleryTryOnProviderRegistry) =>
        registry.resolve(),
      inject: [JewelleryTryOnProviderRegistry],
    },
  ],
  exports: [
    TryOnExecutionService,
    TryOnSessionService,
    GarmentPreviewSettingsService,
    JewelleryCaptureRequirementsService,
    JewelleryPersonImageValidatorService,
    JewelleryTryOnExecutionService,
    JewelleryTryOnService,
  ],
})
export class TryOnModule {}
