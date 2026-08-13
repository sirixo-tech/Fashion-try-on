import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { FashnTryOnProvider } from "./providers/fashn-try-on.provider.js";
import { TRY_ON_LAB_PROVIDER } from "./try-on-lab.constants.js";
import { TryOnLabController } from "./try-on-lab.controller.js";
import { TryOnLabRunRegistryService } from "./try-on-lab-run-registry.service.js";
import { TryOnLabService } from "./try-on-lab.service.js";

@Module({
  imports: [AuthModule],
  controllers: [TryOnLabController],
  providers: [
    FashnTryOnProvider,
    TryOnLabRunRegistryService,
    TryOnLabService,
    {
      provide: TRY_ON_LAB_PROVIDER,
      useExisting: FashnTryOnProvider,
    },
  ],
})
export class TryOnLabModule {}
