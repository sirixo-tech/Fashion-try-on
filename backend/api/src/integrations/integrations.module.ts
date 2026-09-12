import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { EntitlementsModule } from "../entitlements/entitlements.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { TryOnModule } from "../try-on/try-on.module.js";
import { AdminShopifyLinkController } from "./admin-shopify-link.controller.js";
import { IntegrationApiController } from "./integration-api.controller.js";
import { IntegrationCatalogSyncService } from "./integration-catalog-sync.service.js";
import { IntegrationTokenAuthService } from "./integration-token-auth.service.js";
import { IntegrationTokenGuard } from "./integration-token.guard.js";
import { IntegrationsController } from "./integrations.controller.js";
import { IntegrationsService } from "./integrations.service.js";
import { ShopifyOauthService } from "./shopify-oauth.service.js";
import { ShopifyAppServiceAuthService } from "./shopify-app-service-auth.service.js";
import { ShopifyLinkController } from "./shopify-link.controller.js";
import { ShopifyLinkService } from "./shopify-link.service.js";
import { ShopifyStorefrontTryOnController } from "./shopify-storefront-try-on.controller.js";
import { ShopifyStorefrontTryOnService } from "./shopify-storefront-try-on.service.js";
import { ShopifyWebhookController } from "./shopify-webhook.controller.js";
import { ShopifyWebhookService } from "./shopify-webhook.service.js";

@Module({
  imports: [AuthModule, DatabaseModule, EntitlementsModule, TryOnModule],
  controllers: [
    IntegrationsController,
    IntegrationApiController,
    ShopifyWebhookController,
    ShopifyLinkController,
    AdminShopifyLinkController,
    ShopifyStorefrontTryOnController,
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
    ShopifyAppServiceAuthService,
    ShopifyLinkService,
    ShopifyStorefrontTryOnService,
    ObjectStorageService,
  ],
  exports: [
    IntegrationsService,
    IntegrationCatalogSyncService,
    IntegrationTokenAuthService,
    IntegrationTokenGuard,
  ],
})
export class IntegrationsModule {}
