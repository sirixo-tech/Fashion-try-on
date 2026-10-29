import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from "@nestjs/common";
import { createSelfxId } from "@selfx/database";
import { CustomCreditChannel, PricingPlanStatus } from "@prisma/client";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  customCreditTotal,
  MOBILE_CUSTOM_CREDIT_LIMIT,
} from "../entitlements/custom-credit-plans.service.js";
import { encryptProviderSecret } from "../integrations/provider-secret-cipher.js";
import { decryptPaymentSnapshot } from "../payments/payment-snapshots.js";
import { paymentEncryptionKey } from "../payments/payment-settings.service.js";
import { paymentCallbackOrigin } from "../payments/payment-execution-utils.js";
import { phonePeProductionBase } from "../payments/phonepe-endpoints.js";
import { PhonePeDqrAdapter, type PhonePeDqrCredentials } from "../payments/phonepe-dqr.adapter.js";
import { PhonePeTransport } from "../payments/phonepe.transport.js";
import {
  createMobileCheckout,
  mobileCheckoutStatus,
  type MobilePhonePeCredentials,
} from "../payments/phonepe-mobile-checkout.js";

const connectionId = "PHONEPE";
type MobileDqrCredentials = PhonePeDqrCredentials & { mode: "DQR" };
type SavedCredentials = MobileDqrCredentials | MobilePhonePeCredentials;
function isDqr(value: SavedCredentials): value is MobileDqrCredentials {
  return "mode" in value && value.mode === "DQR";
}
function fail(code: string, message: string, status = 409): never {
  throw new ApiErrorException(status, code, message);
}
function publicPurchase(row: {
  id: string;
  planId: string | null;
  status: string;
  amountMinor: number;
  currency: string;
  credits: number;
  billingPeriod: string;
  checkoutUrl: string | null;
  expiresAt: Date;
}) {
  return {
    id: row.id,
    planId: row.planId,
    status: row.status,
    amountMinor: row.amountMinor,
    currency: row.currency,
    credits: row.credits,
    billingPeriod: row.billingPeriod,
    checkoutUrl: row.checkoutUrl,
    expiresAt: row.expiresAt.toISOString(),
  };
}

@Injectable()
export class CustomerMobilePaymentsService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CustomerMobilePaymentsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private readonly transport = new PhonePeTransport();
  constructor(private readonly db: PrismaService) {}

  onModuleInit() {
    if (process.env.SELFX_MOBILE_PHONEPE_ENABLED !== "true") return;
    this.timer = setInterval(
      () =>
        void this.reconcilePending().catch(() =>
          this.logger.warn("Mobile payment reconciliation retry required"),
        ),
      60000,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async adminSettings() {
    const row = await this.db.mobilePaymentConnection.findUnique({
      where: { id: connectionId },
    });
    return {
      provider: connectionId,
      configured: !!row,
      enabled: row?.enabled ?? false,
      environment: row?.environment ?? null,
      executionEnabled: process.env.SELFX_MOBILE_PHONEPE_ENABLED === "true",
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  async saveAdmin(
    actorId: string,
    input: {
      environment: "UAT" | "PRODUCTION";
      merchantId: string;
      providerId?: string;
      providerStoreId?: string;
      saltIndex: string;
      saltKey: string;
      enabled: boolean;
    },
  ) {
    if (
      !/^[A-Za-z0-9_-]{1,100}$/.test(input.merchantId) ||
      (input.providerId && !/^[A-Za-z0-9_-]{1,100}$/.test(input.providerId)) ||
      (input.providerStoreId && !/^[A-Za-z0-9_-]{1,37}$/.test(input.providerStoreId)) ||
      !/^[0-9]{1,10}$/.test(input.saltIndex) ||
      !/^\S{16,256}$/.test(input.saltKey) ||
      !["UAT", "PRODUCTION"].includes(input.environment)
    )
      fail(
        "MOBILE_PAYMENT_CONFIGURATION_INVALID",
        "Enter valid PhonePe Dynamic QR credentials.",
        400,
      );
    const credentials: MobileDqrCredentials = {
      mode: "DQR",
      environment: input.environment,
      merchantId: input.merchantId,
      providerId: input.providerId || undefined,
      providerStoreId: input.providerStoreId || "SELFXMOBILE",
      saltIndex: input.saltIndex,
      saltKey: input.saltKey,
      ...(input.environment === "PRODUCTION" ? { apiBaseUrl: phonePeProductionBase() } : {}),
    };
    const { key, version } = paymentEncryptionKey();
    const encrypted = encryptProviderSecret(credentials, key);
    await this.db.$transaction(async (tx) => {
      await tx.mobilePaymentConnection.upsert({
        where: { id: connectionId },
        create: {
          id: connectionId,
          environment: input.environment,
          enabled: input.enabled && input.environment === "PRODUCTION",
          ...encrypted,
          keyVersion: version,
        },
        update: {
          environment: input.environment,
          enabled: input.enabled && input.environment === "PRODUCTION",
          ...encrypted,
          keyVersion: version,
        },
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId: actorId,
          organizationId: null,
          action: "MOBILE_PAYMENT_CONFIGURATION_SAVED",
          resourceType: "mobile_payment_configuration",
          resourceId: null,
          metadata: {
            provider: connectionId,
            environment: input.environment,
            enabled: input.enabled && input.environment === "PRODUCTION",
          },
        },
      });
    });
    return this.adminSettings();
  }

  async available() {
    if (process.env.SELFX_MOBILE_PHONEPE_ENABLED !== "true") return false;
    const row = await this.db.mobilePaymentConnection.findUnique({
      where: { id: connectionId },
    });
    return row?.enabled === true && row.environment === "PRODUCTION";
  }

  async start(
    customerId: string,
    choice: { planId?: string; credits?: number },
    requestId: string,
  ) {
    if (!/^[0-9a-f-]{36}$/i.test(requestId))
      fail("MOBILE_PAYMENT_REQUEST_INVALID", "Start this purchase again.", 400);
    if (!(await this.available()))
      fail(
        "MOBILE_PAYMENTS_UNAVAILABLE",
        "Mobile payments are not configured yet.",
        503,
      );
    const custom = choice.credits !== undefined;
    if (
      custom === (choice.planId !== undefined) ||
      (custom &&
        (!Number.isInteger(choice.credits) ||
          choice.credits! < 1 ||
          choice.credits! > MOBILE_CUSTOM_CREDIT_LIMIT))
    )
      fail(
        "MOBILE_PAYMENT_SELECTION_INVALID",
        "Choose a plan or 1 to 1,000 custom credits.",
        400,
      );
    const requestKey = `${customerId}:${requestId}`;
    const purchase = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId}::uuid FOR UPDATE`;
      const existing = await tx.customerMobilePurchase.findUnique({
        where: { requestKey },
      });
      if (existing) {
        if (
          existing.planId !== (choice.planId ?? null) ||
          (custom && existing.credits !== choice.credits)
        )
          fail(
            "MOBILE_PAYMENT_REQUEST_CONFLICT",
            "This purchase request belongs to another plan.",
          );
        return existing;
      }
      const open = await tx.customerMobilePurchase.findFirst({
        where: {
          customerId,
          status: { in: ["INITIALIZING", "INITIATING", "PENDING", "UNKNOWN"] },
          expiresAt: { gt: new Date(Date.now() - 5 * 60000) },
        },
      });
      if (open)
        fail(
          "MOBILE_PAYMENT_ALREADY_PENDING",
          "Finish or check your current payment first.",
        );
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
      });
      if (customer?.status !== "ACTIVE")
        fail("CUSTOMER_SESSION_INVALID", "Sign in again to continue.", 401);
      const [plan, connection, customPlan] = await Promise.all([
        choice.planId
          ? tx.mobilePlan.findFirst({
              where: { id: choice.planId, status: "ACTIVE" },
            })
          : Promise.resolve(null),
        tx.mobilePaymentConnection.findUnique({ where: { id: connectionId } }),
        custom
          ? tx.customCreditPlan.findUnique({
              where: { channel: CustomCreditChannel.MOBILE },
            })
          : Promise.resolve(null),
      ]);
      if (
        choice.planId &&
        (!plan || plan.currency !== "INR" || plan.includedCredits < 1)
      )
        fail(
          "MOBILE_PLAN_UNAVAILABLE",
          "This plan is not available for purchase.",
        );
      if (
        custom &&
        (!customPlan ||
          customPlan.status !== PricingPlanStatus.ACTIVE ||
          customPlan.currency !== "INR")
      )
        fail(
          "CUSTOM_CREDIT_PLAN_UNAVAILABLE",
          "Mobile custom credits are not available yet.",
          503,
        );
      const credits = plan?.includedCredits ?? choice.credits!;
      const amountMinor = custom
        ? customCreditTotal(
            CustomCreditChannel.MOBILE,
            credits,
            customPlan!.unitPriceCents,
          )
        : plan!.priceCents;
      if (
        !Number.isSafeInteger(amountMinor) ||
        amountMinor < 100 ||
        amountMinor > 2_000_000_000
      )
        fail(
          "MOBILE_PLAN_PRICE_INVALID",
          "This purchase exceeds the supported checkout amount.",
          400,
        );
      if (!connection?.enabled || connection.environment !== "PRODUCTION")
        fail(
          "MOBILE_PAYMENTS_UNAVAILABLE",
          "Production mobile payments are not configured yet.",
          503,
        );
      const id = createSelfxId();
      return tx.customerMobilePurchase.create({
        data: {
          id,
          customerId,
          planId: plan?.id ?? null,
          customCreditPlanId: customPlan?.id ?? null,
          requestKey,
          merchantOrderId: `SX${id.replaceAll("-", "")}`,
          status: "INITIALIZING",
          environment: connection.environment,
          amountMinor,
          currency: "INR",
          credits,
          bonusCredits: plan?.trialCredits ?? 0,
          billingPeriod: plan?.billingPeriod ?? "ONE_TIME",
          expiresAt: new Date(Date.now() + 5 * 60000),
          encryptedPayload: connection.encryptedPayload,
          initializationVector: connection.initializationVector,
          authenticationTag: connection.authenticationTag,
          keyVersion: connection.keyVersion,
        },
      });
    });
    if (purchase.status !== "INITIALIZING") return publicPurchase(purchase);
    const claimed = await this.db.customerMobilePurchase.updateMany({
      where: { id: purchase.id, status: "INITIALIZING" },
      data: { status: "INITIATING" },
    });
    if (!claimed.count) {
      const current = await this.db.customerMobilePurchase.findUniqueOrThrow({
        where: { id: purchase.id },
      });
      return publicPurchase(current);
    }
    const credentials = decryptPaymentSnapshot<SavedCredentials>(purchase);
    if (credentials.environment !== purchase.environment)
      fail(
        "MOBILE_PAYMENT_CONFIGURATION_INVALID",
        "Payment settings changed. Contact support.",
        503,
      );
    try {
      const checkout = isDqr(credentials)
        ? await this.createDqrPurchase(credentials, purchase)
        : await createMobileCheckout(
            credentials,
            purchase.merchantOrderId,
            purchase.amountMinor,
          );
      await this.db.customerMobilePurchase.updateMany({
        where: { id: purchase.id, status: { in: ["INITIATING", "PENDING"] } },
        data: {
          providerOrderId: checkout.providerOrderId,
          checkoutUrl: checkout.checkoutUrl,
          status: "PENDING",
        },
      });
      const updated = await this.db.customerMobilePurchase.findUniqueOrThrow({
        where: { id: purchase.id },
      });
      return publicPurchase(updated);
    } catch (error) {
      await this.db.customerMobilePurchase.updateMany({
        where: { id: purchase.id, status: "INITIATING" },
        data: { status: "UNKNOWN" },
      });
      throw error;
    }
  }

  private async createDqrPurchase(
    credentials: MobileDqrCredentials,
    purchase: { id: string; merchantOrderId: string; amountMinor: number; expiresAt: Date },
  ) {
    const adapter = new PhonePeDqrAdapter(credentials);
    const expected = {
      transactionId: purchase.merchantOrderId,
      amountMinor: purchase.amountMinor,
      currency: "INR" as const,
    };
    const remaining = Math.floor((purchase.expiresAt.getTime() - Date.now()) / 1000);
    if (remaining < 1) fail("MOBILE_PAYMENT_EXPIRED", "Start this purchase again.");
    const response = await this.transport.send(
      adapter.createRequest(
        expected,
        `${paymentCallbackOrigin()}/api/v1/customer/mobile-payments/${purchase.id}/callback`,
        Math.min(remaining, 300),
      ),
      { purpose: "MOBILE", environment: "PRODUCTION", productionBase: credentials.apiBaseUrl },
    );
    return { providerOrderId: purchase.merchantOrderId, checkoutUrl: adapter.parseQr(response, expected).qrString };
  }

  async status(customerId: string, id: string, verify = true) {
    const purchase = await this.db.customerMobilePurchase.findFirst({
      where: { id, customerId },
    });
    if (!purchase) fail("MOBILE_PAYMENT_NOT_FOUND", "Payment not found.", 404);
    if (
      verify &&
      ["INITIALIZING", "INITIATING", "PENDING", "UNKNOWN"].includes(
        purchase.status,
      )
    )
      await this.verify(purchase.id);
    const latest = await this.db.customerMobilePurchase.findUniqueOrThrow({
      where: { id },
    });
    return publicPurchase(latest);
  }

  async latest(customerId: string) {
    const purchase = await this.db.customerMobilePurchase.findFirst({
      where: {
        customerId,
        status: { in: ["INITIALIZING", "INITIATING", "PENDING", "UNKNOWN"] },
      },
      orderBy: { createdAt: "desc" },
    });
    return purchase ? publicPurchase(purchase) : null;
  }

  async checkoutUrlForQr(customerId: string, id: string) {
    const purchase = await this.db.customerMobilePurchase.findFirst({
      where: {
        id,
        customerId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      select: { checkoutUrl: true },
    });
    if (!purchase?.checkoutUrl)
      fail(
        "MOBILE_PAYMENT_QR_UNAVAILABLE",
        "The payment QR is no longer available.",
        404,
      );
    return purchase.checkoutUrl;
  }

  async callback(id: string, encoded: string, signature: string) {
    const purchase = await this.db.customerMobilePurchase.findUnique({ where: { id } });
    if (!purchase) fail("MOBILE_PAYMENT_NOT_FOUND", "Payment not found.", 404);
    try {
      const credentials = decryptPaymentSnapshot<SavedCredentials>(purchase);
      if (!isDqr(credentials) || signature.length > 128) throw new Error();
      new PhonePeDqrAdapter(credentials).verifyCallback(
        encoded,
        signature,
        { transactionId: purchase.merchantOrderId, amountMinor: purchase.amountMinor, currency: "INR" },
      );
    } catch {
      fail("MOBILE_PAYMENT_CALLBACK_INVALID", "Payment notification could not be verified.", 401);
    }
    // A signed notification is only a signal: fulfillment still queries PhonePe.
    await this.verify(id).catch(() => undefined);
    return { accepted: true };
  }

  async verify(id: string) {
    const purchase = await this.db.customerMobilePurchase.findUnique({
      where: { id },
    });
    if (
      !purchase ||
      !["INITIALIZING", "INITIATING", "PENDING", "UNKNOWN"].includes(
        purchase.status,
      )
    )
      return;
    const credentials = decryptPaymentSnapshot<SavedCredentials>(purchase);
    if (credentials.environment !== purchase.environment) return;
    const result = isDqr(credentials)
      ? await this.dqrStatus(credentials, purchase)
      : await mobileCheckoutStatus(
          credentials,
          purchase.merchantOrderId,
          purchase.amountMinor,
        );
    if (
      purchase.providerOrderId &&
      result.providerOrderId !== purchase.providerOrderId
    )
      return;
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${purchase.customerId}::uuid FOR UPDATE`;
      const current = await tx.customerMobilePurchase.findUniqueOrThrow({
        where: { id },
      });
      if (
        !["INITIALIZING", "INITIATING", "PENDING", "UNKNOWN"].includes(
          current.status,
        )
      )
        return;
      if (result.status === "COMPLETED") {
        const paidAt = new Date();
        const previousPaid = await tx.customerMobilePurchase.count({
          where: {
            customerId: current.customerId,
            status: "PAID",
            id: { not: id },
          },
        });
        const expiresAt =
          current.billingPeriod === "MONTHLY" ? new Date(paidAt) : null;
        if (expiresAt) expiresAt.setUTCMonth(expiresAt.getUTCMonth() + 1);
        await tx.customerMobilePurchase.update({
          where: { id },
          data: {
            status: "PAID",
            paidAt,
            checkedAt: paidAt,
            providerOrderId: result.providerOrderId,
          },
        });
        await tx.customerPaidCreditGrant.create({
          data: {
            id: createSelfxId(),
            customerId: current.customerId,
            purchaseId: id,
            credits:
              current.credits + (previousPaid === 0 ? current.bonusCredits : 0),
            expiresAt,
          },
        });
      } else {
        await tx.customerMobilePurchase.update({
          where: { id },
          data: {
            status: result.status === "FAILED" ? "FAILED" : "PENDING",
            checkedAt: new Date(),
            providerOrderId: result.providerOrderId,
          },
        });
      }
    });
  }

  private async dqrStatus(
    credentials: MobileDqrCredentials,
    purchase: { merchantOrderId: string; amountMinor: number },
  ) {
    const adapter = new PhonePeDqrAdapter(credentials);
    const expected = {
      transactionId: purchase.merchantOrderId,
      amountMinor: purchase.amountMinor,
      currency: "INR" as const,
    };
    const response = await this.transport.send(adapter.statusRequest(expected), {
      purpose: "MOBILE",
      environment: "PRODUCTION",
      productionBase: credentials.apiBaseUrl,
    });
    const status = adapter.parseStatus(response, expected);
    return {
      status: status.status === "SUCCEEDED" ? "COMPLETED" as const
        : status.status === "FAILED" ? "FAILED" as const : "PENDING" as const,
      providerOrderId: purchase.merchantOrderId,
    };
  }

  async reconcilePending() {
    const rows = await this.db.customerMobilePurchase.findMany({
      where: {
        status: { in: ["INITIALIZING", "INITIATING", "PENDING", "UNKNOWN"] },
        OR: [
          { checkedAt: null },
          { checkedAt: { lt: new Date(Date.now() - 60000) } },
        ],
      },
      select: { id: true },
      take: 25,
      orderBy: { createdAt: "asc" },
    });
    for (const row of rows) {
      await this.verify(row.id).catch(async () => {
        await this.db.customerMobilePurchase.updateMany({
          where: {
            id: row.id,
            status: {
              in: ["INITIALIZING", "INITIATING", "PENDING", "UNKNOWN"],
            },
          },
          data: { checkedAt: new Date() },
        });
      });
    }
  }
}
