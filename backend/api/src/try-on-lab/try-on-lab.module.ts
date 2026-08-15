import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { TryOnModule } from "../try-on/try-on.module.js";
import { TryOnLabController } from "./try-on-lab.controller.js";
import { TryOnLabRunRegistryService } from "./try-on-lab-run-registry.service.js";
import { TryOnLabService } from "./try-on-lab.service.js";

@Module({
  imports: [AuthModule, TryOnModule],
  controllers: [TryOnLabController],
  providers: [TryOnLabRunRegistryService, TryOnLabService],
})
export class TryOnLabModule {}
