import { Module } from "@nestjs/common";
import { StoreKiosksController } from "./store-kiosks.controller.js";
import {
  StorePaymentTestsController,
  StorePaymentTestCallbacksController,
} from "../payments/store-payment-tests.controller.js";
import { StorePurgeController } from "./store-purge.controller.js";
import { StorePurgeService } from "./store-purge.service.js";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { EntitlementsModule } from "../entitlements/entitlements.module.js";
import { KioskModule } from "../kiosks/kiosk.module.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { RbacModule } from "../rbac/rbac.module.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { TryOnModule } from "../try-on/try-on.module.js";
import { AdminStoresController } from "./admin-stores.controller.js";
import { AdminStoresService } from "./admin-stores.service.js";
import { StoreImpersonationController } from "./store-impersonation.controller.js";
import { StoreImpersonationService } from "./store-impersonation.service.js";
import { ProductStockService } from "./product-stock.service.js";
import { CommerceService } from "../commerce/commerce.service.js";
import { CommerceExpiryService } from "../commerce/commerce-expiry.service.js";
import { PaymentSettingsService } from "../payments/payment-settings.service.js";
import { OrderPaymentsService } from "../payments/order-payments.service.js";
import { PaymentReconciliationService } from "../payments/payment-reconciliation.service.js";
import { PhonePeTransport } from "../payments/phonepe.transport.js";
import { PlatformPaymentTestsService } from "../payments/platform-payment-tests.service.js";
import {
  PlatformPaymentTestsController,
  PlatformPaymentTestCallbacksController,
} from "../payments/platform-payment-tests.controller.js";
import {
  KioskOrderPaymentsController,
  StoreOrderPaymentsController,
  PhonePeCallbacksController,
} from "../payments/order-payments.controller.js";
import {
  PlatformPaymentGatewaysController,
  StorePaymentSettingsController,
} from "../payments/payment-settings.controller.js";
import {
  StoreCommerceController,
  KioskCommerceController,
} from "../commerce/commerce.controller.js";
import {
  ProductStockController,
  KioskProductStockController,
} from "./product-stock.controller.js";

@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    EntitlementsModule,
    KioskModule,
    RbacModule,
    TryOnModule,
  ],
  controllers: [
    StorePaymentTestsController,
    StorePaymentTestCallbacksController,
    StoreKiosksController,
    StorePurgeController,
    AdminStoresController,
    StoreImpersonationController,
    ProductStockController,
    KioskProductStockController,
    StoreCommerceController,
    KioskCommerceController,
    PlatformPaymentGatewaysController,
    StorePaymentSettingsController,
    KioskOrderPaymentsController,
    StoreOrderPaymentsController,
    PhonePeCallbacksController,
    PlatformPaymentTestsController,
    PlatformPaymentTestCallbacksController,
  ],
  providers: [
    StorePurgeService,
    AdminStoresService,
    ProductStockService,
    CommerceService,
    CommerceExpiryService,
    PaymentSettingsService,
    OrderPaymentsService,
    PaymentReconciliationService,
    PhonePeTransport,
    PlatformPaymentTestsService,
    StoreImpersonationService,
    PlatformAuthorizationService,
    ObjectStorageService,
  ],
})
export class StoresModule {}
