import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { GarmentPreviewSettingsService } from "./garment-preview-settings.service.js";
import { FashnVirtualTryOnProvider } from "./providers/fashn-virtual-try-on.provider.js";
import { VirtualTryOnProviderRegistry } from "./providers/virtual-try-on.registry.js";
import { TRY_ON_PROVIDER } from "./try-on.constants.js";
import { TryOnExecutionService } from "./try-on-execution.service.js";
import { TryOnSessionService } from "./try-on-session.service.js";

@Module({
  imports: [DatabaseModule],
  providers: [
    FashnVirtualTryOnProvider,
    VirtualTryOnProviderRegistry,
    TryOnExecutionService,
    TryOnSessionService,
    GarmentPreviewSettingsService,
    {
      provide: TRY_ON_PROVIDER,
      useFactory: (registry: VirtualTryOnProviderRegistry) =>
        registry.resolve(),
      inject: [VirtualTryOnProviderRegistry],
    },
  ],
  exports: [
    TryOnExecutionService,
    TryOnSessionService,
    GarmentPreviewSettingsService,
  ],
})
export class TryOnModule {}
