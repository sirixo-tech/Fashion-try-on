import { Module } from "@nestjs/common";

import { FashnVirtualTryOnProvider } from "./providers/fashn-virtual-try-on.provider.js";
import { VirtualTryOnProviderRegistry } from "./providers/virtual-try-on.registry.js";
import { TRY_ON_PROVIDER } from "./try-on.constants.js";
import { TryOnExecutionService } from "./try-on-execution.service.js";

@Module({
  providers: [
    FashnVirtualTryOnProvider,
    VirtualTryOnProviderRegistry,
    TryOnExecutionService,
    {
      provide: TRY_ON_PROVIDER,
      useFactory: (registry: VirtualTryOnProviderRegistry) =>
        registry.resolve(),
      inject: [VirtualTryOnProviderRegistry],
    },
  ],
  exports: [TryOnExecutionService],
})
export class TryOnModule {}
