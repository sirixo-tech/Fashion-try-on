import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { TryOnModule } from "../try-on/try-on.module.js";
import { UsageModule } from "../usage/usage.module.js";
import { DeveloperApiKeyController } from "./developer-api-key.controller.js";
import { DeveloperApiKeyService } from "./developer-api-key.service.js";
import { PublicApiController } from "./public-api.controller.js";
import { PublicApiKeyGuard } from "./public-api-key.guard.js";
import { PublicApiKeyAuthService } from "./public-api-key-auth.service.js";
import { PublicApiTryOnService } from "./public-api-try-on.service.js";
import { PublicApiUsageService } from "./public-api-usage.service.js";
import { PublicApiUploadService } from "./public-api-upload.service.js";
import { PublicApiWebhookService } from "./public-api-webhook.service.js";

@Module({
  imports: [AuthModule, DatabaseModule, TryOnModule, UsageModule],
  controllers: [DeveloperApiKeyController, PublicApiController],
  providers: [
    DeveloperApiKeyService,
    PublicApiKeyAuthService,
    PublicApiKeyGuard,
    PublicApiTryOnService,
    PublicApiUsageService,
    PublicApiUploadService,
    PublicApiWebhookService,
    ObjectStorageService,
    PlatformAuthorizationService,
    StoreRbacService,
  ],
  exports: [
    DeveloperApiKeyService,
    PublicApiKeyAuthService,
    PublicApiKeyGuard,
    PublicApiWebhookService,
  ],
})
export class DeveloperApiModule {}
