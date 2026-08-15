import { Module } from "@nestjs/common";

import { FashnTryOnProvider } from "../try-on-lab/providers/fashn-try-on.provider.js";
import { TRY_ON_PROVIDER } from "./try-on.constants.js";
import { TryOnExecutionService } from "./try-on-execution.service.js";

@Module({
  providers: [
    FashnTryOnProvider,
    TryOnExecutionService,
    {
      provide: TRY_ON_PROVIDER,
      useExisting: FashnTryOnProvider,
    },
  ],
  exports: [TryOnExecutionService],
})
export class TryOnModule {}
