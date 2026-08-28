import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { DeveloperApiKeyController } from "./developer-api-key.controller.js";
import { DeveloperApiKeyService } from "./developer-api-key.service.js";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [DeveloperApiKeyController],
  providers: [
    DeveloperApiKeyService,
    PlatformAuthorizationService,
    StoreRbacService,
  ],
  exports: [DeveloperApiKeyService],
})
export class DeveloperApiModule {}
