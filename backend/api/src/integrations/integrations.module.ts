import { Module } from "@nestjs/common";
import {
  CommerceStorefrontController,
  WooCommerceStorefrontController,
} from "./commerce-storefront.controller.js";

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
import { IntegrationSettingsService } from "./integration-settings.service.js";
import { IntegrationsController } from "./integrations.controller.js";
import { IntegrationsService } from "./integrations.service.js";
import { ShopifyOauthService } from "./shopify-oauth.service.js";
import { ShopifyBillingController } from "./shopify-billing.controller.js";
import { ShopifyBillingService } from "./shopify-billing.service.js";
import { ShopifyReconciliationService } from "./shopify-reconciliation.service.js";
import { ShopifyAppServiceAuthService } from "./shopify-app-service-auth.service.js";
import { ShopifyLinkController } from "./shopify-link.controller.js";
import { ShopifyLinkService } from "./shopify-link.service.js";
import { ShopifyStorefrontTryOnController } from "./shopify-storefront-try-on.controller.js";
import { ShopifyStorefrontTryOnService } from "./shopify-storefront-try-on.service.js";
import { ShopifyWebhookController } from "./shopify-webhook.controller.js";
import { ShopifyWebhookService } from "./shopify-webhook.service.js";
import { ShopifyShopRedactionService } from "./shopify-shop-redaction.service.js";
import {
  AdminWooCommerceLinkController,
  WooCommerceLinkController,
} from "./woocommerce-link.controller.js";
import { WooCommerceLinkService } from "./woocommerce-link.service.js";

@Module({
  imports: [AuthModule, DatabaseModule, EntitlementsModule, TryOnModule],
  controllers: [
    ShopifyBillingController,
    CommerceStorefrontController,
    WooCommerceStorefrontController,
    IntegrationsController,
    IntegrationApiController,
    ShopifyWebhookController,
    ShopifyLinkController,
    AdminShopifyLinkController,
    ShopifyStorefrontTryOnController,
    WooCommerceLinkController,
    AdminWooCommerceLinkController,
  ],
  providers: [
    ShopifyBillingService,
    IntegrationsService,
    IntegrationCatalogSyncService,
    IntegrationTokenAuthService,
    IntegrationTokenGuard,
    IntegrationSettingsService,
    PlatformAuthorizationService,
    StoreRbacService,
    ShopifyOauthService,
    ShopifyReconciliationService,
    ShopifyWebhookService,
    ShopifyShopRedactionService,
    ShopifyAppServiceAuthService,
    ShopifyLinkService,
    ShopifyStorefrontTryOnService,
    WooCommerceLinkService,
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
