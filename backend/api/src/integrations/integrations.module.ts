import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { IntegrationApiController } from "./integration-api.controller.js";
import { IntegrationCatalogSyncService } from "./integration-catalog-sync.service.js";
import { IntegrationTokenAuthService } from "./integration-token-auth.service.js";
import { IntegrationTokenGuard } from "./integration-token.guard.js";
import { IntegrationsController } from "./integrations.controller.js";
import { IntegrationsService } from "./integrations.service.js";
import { ShopifyOauthService } from "./shopify-oauth.service.js";
import { ShopifyWebhookController } from "./shopify-webhook.controller.js";
import { ShopifyWebhookService } from "./shopify-webhook.service.js";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [
    IntegrationsController,
    IntegrationApiController,
    ShopifyWebhookController,
  ],
  providers: [
    IntegrationsService,
    IntegrationCatalogSyncService,
    IntegrationTokenAuthService,
    IntegrationTokenGuard,
    PlatformAuthorizationService,
    StoreRbacService,
    ShopifyOauthService,
    ShopifyWebhookService,
  ],
  exports: [
    IntegrationsService,
    IntegrationCatalogSyncService,
    IntegrationTokenAuthService,
    IntegrationTokenGuard,
  ],
})
export class IntegrationsModule {}
