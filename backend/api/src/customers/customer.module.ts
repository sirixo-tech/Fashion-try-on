import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { DatabaseModule } from "../database/database.module.js";
import { MailModule } from "../mail/mail.module.js";
import { PasswordService } from "../auth/password.service.js";
import { CustomerAuthController } from "./customer-auth.controller.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { CustomerIdentityClient } from "./customer-identity.client.js";
import { AuthModule } from "../auth/auth.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { CustomerMetricsController } from "./customer-metrics.controller.js";
import { CustomerMetricsService } from "./customer-metrics.service.js";
import { CustomerExperienceService } from "./customer-experience.service.js";
import {
  CustomerExperienceController,
  CustomerStoreQrController,
} from "./customer-experience.controller.js";
import { TryOnModule } from "../try-on/try-on.module.js";
import { EntitlementsModule } from "../entitlements/entitlements.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { RbacModule } from "../rbac/rbac.module.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import { MailCrypto } from "../mail/mail-crypto.js";
import { AppsModule } from "../apps/apps.module.js";
import {
  CustomerAppController,
  CustomerNotificationsController,
} from "./customer-app.controller.js";
import { CustomerNotificationsService } from "./customer-notifications.service.js";
import { CustomerPushSender } from "./customer-push.sender.js";
@Module({
  imports: [
    DatabaseModule,
    MailModule,
    AuthModule,
    TryOnModule,
    EntitlementsModule,
    CatalogModule,
    RbacModule,
    AppsModule,
  ],
  controllers: [
    CustomerAuthController,
    CustomerMetricsController,
    CustomerExperienceController,
    CustomerStoreQrController,
    CustomerAppController,
    CustomerNotificationsController,
  ],
  providers: [
    CustomerAuthService,
    CustomerNotificationsService,
    CustomerPushSender,
    MailCrypto,
    CustomerExperienceService,
    ObjectStorageService,
    StoreImpersonationService,
    CustomerIdentityClient,
    CustomerMetricsService,
    PlatformAuthorizationService,
    PasswordService,
    JwtService,
  ],
  exports: [CustomerAuthService],
})
export class CustomerModule {}
