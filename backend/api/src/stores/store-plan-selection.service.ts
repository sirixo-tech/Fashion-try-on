import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import {
  Prisma,
  type PricingPlan,
  type StorePlanPurchase,
  type StoreSubscription,
} from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { assertPhonePeUsageSettled } from "../entitlements/phonepe-store-billing.js";
import { lockBillingSubscription } from "../entitlements/postpaid-billing.js";
import { monthlyBillingPeriod } from "../entitlements/billing-period.js";
import { decryptPaymentSnapshot } from "../payments/payment-snapshots.js";
import {
  PhonePeDqrAdapter,
  type PhonePeDqrCredentials,
} from "../payments/phonepe-dqr.adapter.js";
import { PhonePeTransport } from "../payments/phonepe.transport.js";
import { paymentCallbackOrigin } from "../payments/payment-execution-utils.js";
import {
  createMobileCheckout,
  mobileCheckoutStatus,
  type MobilePhonePeCredentials,
} from "../payments/phonepe-mobile-checkout.js";

const unresolved = ["INITIALIZING", "INITIATING", "PENDING", "UNKNOWN"];
const locked = [...unresolved, "SCHEDULED", "REVIEW_REQUIRED"];
type Credentials =
  (PhonePeDqrCredentials & { mode: "DQR" }) | MobilePhonePeCredentials;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function fail(code: string, message: string, status = 409): never {
  throw new ApiErrorException(status, code, message);
}
function base(subscription: StoreSubscription | null) {
  const metadata = subscription?.metadata;
  const managed =
    !!metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    metadata.billingProvider === "PHONEPE";
  return json({
    id: subscription?.id ?? null,
    planId: subscription?.pricingPlanId ?? null,
    status: subscription?.status ?? null,
    start: managed
      ? null
      : (subscription?.currentPeriodStart?.toISOString() ?? null),
    end: managed
      ? null
      : (subscription?.currentPeriodEnd?.toISOString() ?? null),
    metadata: subscription?.metadata ?? null,
  });
}
function publicPurchase(row: StorePlanPurchase) {
  const plan = row.pricingSnapshot as unknown as PricingPlan;
  return {
    id: row.id,
    planId: row.pricingPlanId,
    planName: plan.name,
    status: row.status,
    amountMinor: row.amountMinor,
    currency: row.currency,
    purpose: row.billingCycleId ? ("USAGE" as const) : ("PLAN" as const),
    checkoutUrl:
      row.status === "PENDING" && row.expiresAt > new Date()
        ? row.checkoutUrl
        : null,
    expiresAt: row.expiresAt.toISOString(),
    effectiveAfter: row.effectiveAfter?.toISOString() ?? null,
  };
}

@Injectable()
export class StorePlanSelectionService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly log = new Logger(StorePlanSelectionService.name);
  private readonly transport = new PhonePeTransport();
  constructor(
    private readonly db: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(
      () =>
        void this.reconcile().catch(() =>
          this.log.warn("Store plan reconciliation needs retry"),
        ),
      60_000,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async available() {
    if (process.env.SELFX_STORE_PHONEPE_ENABLED !== "true") return false;
    const connection = await this.db.mobilePaymentConnection.findUnique({
      where: { id: "PHONEPE" },
    });
    return (
      connection?.enabled === true && connection.environment === "PRODUCTION"
    );
  }
  private async activeStore(tx: Prisma.TransactionClient, storeId: string) {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${storeId}::uuid FOR UPDATE`;
    const store = await tx.organization.findUnique({ where: { id: storeId } });
    if (store?.status !== "ACTIVE")
      fail(
        "STORE_INACTIVE",
        "This Store must be active to change its plan.",
        403,
      );
    await lockBillingSubscription(tx, storeId);
  }
  private async shopify(
    tx: Pick<
      Prisma.TransactionClient,
      "integration" | "shopifyBillingAgreement"
    >,
    storeId: string,
  ) {
    const live = await tx.shopifyBillingAgreement.findFirst({
      where: {
        organizationId: storeId,
        status: { in: ["ACTIVE", "PENDING", "FROZEN"] },
      },
    });
    const integration = await tx.integration.findFirst({
      where: { organizationId: storeId, type: "SHOPIFY", status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    const domain =
      live?.shopDomain ??
      (integration?.metadata as { shopDomain?: string } | null)?.shopDomain;
    if (!live && !integration) return null;
    // Destinations are constructed from verified connection data, never a client return URL.
    if (!domain || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain))
      return { url: null };
    const appUrl = process.env.SHOPIFY_APP_URL;
    if (!appUrl) return { url: null };
    const target = new URL("/app?panel=plans", appUrl);
    if (
      target.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(target.hostname)
    )
      return { url: null };
    target.searchParams.set("shop", domain);
    return { url: target.toString() };
  }
  async workspace(storeId: string) {
    await this.entitlements.getStoreCreditSummary(storeId);
    await this.createUsageBills(storeId);
    await this.activateDue(storeId);
    const [summary, destination, payments, enabled] = await Promise.all([
      this.entitlements.getStoreCreditSummary(storeId),
      this.shopify(this.db, storeId),
      this.db.storePlanPurchase.findMany({
        where: { organizationId: storeId },
        // Open bills sort before history so a payable older bill cannot be hidden.
        orderBy: [
          { paidAt: { sort: "asc", nulls: "first" } },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        take: 25,
      }),
      this.available(),
    ]);
    const scheduledShopify = await this.db.shopifyBillingAgreement.findFirst({
      where: {
        organizationId: storeId,
        status: "PENDING",
        approvedAt: { not: null },
        effectiveAfter: { not: null },
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      summary,
      billingOwner: destination ? ("SHOPIFY" as const) : ("SELFX" as const),
      manageUrl: destination?.url ?? null,
      phonepeAvailable: enabled,
      scheduled: scheduledShopify
        ? {
            planName:
              (scheduledShopify.pricingSnapshot as { name?: string }).name ??
              "Selected plan",
            effectiveAfter: scheduledShopify.effectiveAfter!.toISOString(),
          }
        : payments.find((p) => p.status === "SCHEDULED")
          ? {
              planName: (
                payments.find((p) => p.status === "SCHEDULED")!
                  .pricingSnapshot as { name: string }
              ).name,
              effectiveAfter: payments
                .find((p) => p.status === "SCHEDULED")!
                .effectiveAfter!.toISOString(),
            }
          : null,
      payments: payments.map(publicPurchase),
    };
  }

  async choose(
    storeId: string,
    actorId: string,
    input: {
      planId: string;
      planUpdatedAt: string;
      clientRequestId: string;
      acceptTerms: boolean;
    },
  ) {
    if (!input.acceptTerms)
      fail(
        "PLAN_TERMS_REQUIRED",
        "Accept the displayed plan price, usage terms and start date.",
        400,
      );
    if (!(await this.available()))
      fail(
        "STORE_PAYMENTS_UNAVAILABLE",
        "SelfX Store payments are not enabled yet.",
        503,
      );
    await this.entitlements.getStoreCreditSummary(storeId);
    const row = await this.db.$transaction(async (tx) => {
      await this.activeStore(tx, storeId);
      const requestKey = hash(
        `${storeId}:${actorId}:plan:${input.clientRequestId}`,
      );
      const fingerprint = hash(`${input.planId}:${input.planUpdatedAt}`);
      const prior = await tx.storePlanPurchase.findUnique({
        where: { requestKey },
      });
      if (prior) {
        if (prior.requestFingerprint !== fingerprint)
          fail(
            "PLAN_CHANGE_REQUEST_CONFLICT",
            "This request was already used for another plan.",
          );
        return prior;
      }
      if (await this.shopify(tx, storeId))
        fail(
          "SHOPIFY_BILLING_MANAGED",
          "Choose this Store's plan in Shopify. Its shared subscription will update everywhere.",
        );
      await assertPhonePeUsageSettled(tx, storeId);
      if (
        await tx.storePlanPurchase.count({
          where: {
            organizationId: storeId,
            billingCycleId: null,
            status: { in: locked },
          },
        })
      )
        fail(
          "PLAN_CHANGE_PENDING",
          "Finish or check the existing plan change before choosing another.",
        );
      const plan = await tx.pricingPlan.findFirst({
        where: { id: input.planId, status: "ACTIVE" },
      });
      if (
        !plan ||
        plan.code === "selfx-default-starter" ||
        (plan.billingMode !== "POSTPAID_PAYG" && plan.monthlyPriceCents <= 0)
      )
        fail(
          "PLAN_UNAVAILABLE",
          "Choose a paid plan. Starter is a one-time trial and cannot be selected again.",
        );
      if (plan.updatedAt.toISOString() !== input.planUpdatedAt)
        fail(
          "PLAN_QUOTE_CHANGED",
          "This plan changed. Refresh the prices and choose it again.",
        );
      if (
        plan.currency !== "INR" ||
        (plan.billingMode === "POSTPAID_PAYG" &&
          (!plan.creditUnitPriceCents || plan.monthlyPriceCents > 0))
      )
        fail(
          "PLAN_PAYMENT_UNSUPPORTED",
          "PhonePe supports INR fixed-price plans and INR usage-only plans. This plan needs a supported billing configuration.",
        );
      const current = await tx.storeSubscription.findUnique({
        where: { organizationId: storeId },
      });
      if (
        current?.status === "ACTIVE" &&
        current.pricingPlanId === plan.id &&
        (!current.currentPeriodEnd || current.currentPeriodEnd > new Date())
      )
        fail(
          "PLAN_ALREADY_ACTIVE",
          "This plan is already active. Your allowance has not been reset.",
        );
      const connection = await tx.mobilePaymentConnection.findUniqueOrThrow({
        where: { id: "PHONEPE" },
      });
      if (!connection.enabled || connection.environment !== "PRODUCTION")
        fail(
          "STORE_PAYMENTS_UNAVAILABLE",
          "SelfX production payments are not configured.",
          503,
        );
      const id = createSelfxId();
      const effectiveAfter =
        current?.status === "ACTIVE" &&
        current.currentPeriodEnd &&
        current.currentPeriodEnd > new Date()
          ? current.currentPeriodEnd
          : null;
      const purchase = await tx.storePlanPurchase.create({
        data: {
          id,
          organizationId: storeId,
          actorUserId: actorId,
          pricingPlanId: plan.id,
          requestKey,
          requestFingerprint: fingerprint,
          merchantOrderId: `SP${id.replaceAll("-", "")}`,
          status: plan.monthlyPriceCents === 0 ? "SCHEDULED" : "INITIALIZING",
          amountMinor: plan.monthlyPriceCents,
          currency: plan.currency,
          pricingSnapshot: json(plan),
          baseSubscription: base(current),
          effectiveAfter,
          expiresAt: new Date(Date.now() + 5 * 60_000),
          encryptedPayload: connection.encryptedPayload,
          initializationVector: connection.initializationVector,
          authenticationTag: connection.authenticationTag,
          keyVersion: connection.keyVersion,
        },
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          organizationId: storeId,
          actorUserId: actorId,
          action: "STORE_PLAN_CHANGE_REQUESTED",
          resourceType: "STORE_PLAN_PURCHASE",
          resourceId: id,
          metadata: {
            planId: plan.id,
            amountMinor: plan.monthlyPriceCents,
            currency: plan.currency,
            billingMode: plan.billingMode,
            effectiveAfter: effectiveAfter?.toISOString() ?? null,
            acceptedUsageRate: plan.creditUnitPriceCents,
          },
        },
      });
      return purchase;
    });
    if (row.amountMinor === 0) {
      await this.activateDue(storeId);
      return this.payment(storeId, row.id, false);
    }
    return this.initiate(row);
  }

  private async initiate(row: StorePlanPurchase) {
    if (row.status !== "INITIALIZING") return publicPurchase(row);
    const claimed = await this.db.storePlanPurchase.updateMany({
      where: { id: row.id, status: "INITIALIZING" },
      data: { status: "INITIATING" },
    });
    if (!claimed.count) return this.payment(row.organizationId, row.id, false);
    try {
      const credentials = decryptPaymentSnapshot<Credentials>(row);
      if (credentials.environment !== "PRODUCTION")
        fail(
          "STORE_PAYMENT_CONFIGURATION_INVALID",
          "Production credentials are required.",
          503,
        );
      let checkout: { providerOrderId: string; checkoutUrl: string };
      if ("mode" in credentials && credentials.mode === "DQR") {
        const adapter = new PhonePeDqrAdapter(credentials);
        const expected = {
          transactionId: row.merchantOrderId,
          amountMinor: row.amountMinor,
          currency: "INR" as const,
        };
        const remaining = Math.floor(
          (row.expiresAt.getTime() - Date.now()) / 1000,
        );
        if (remaining < 1)
          fail(
            "STORE_PAYMENT_EXPIRED",
            "Check the expired payment before starting another.",
          );
        const result = await this.transport.send(
          adapter.createRequest(
            expected,
            `${paymentCallbackOrigin()}/api/v1/store-plan-payments/${row.id}/callback`,
            Math.min(300, remaining),
          ),
          {
            purpose: "STORE_PLAN",
            environment: "PRODUCTION",
            productionBase: credentials.apiBaseUrl,
          },
        );
        checkout = {
          providerOrderId: row.merchantOrderId,
          checkoutUrl: adapter.parseQr(result, expected).qrString,
        };
      } else
        checkout = await createMobileCheckout(
          credentials as MobilePhonePeCredentials,
          row.merchantOrderId,
          row.amountMinor,
        );
      await this.db.storePlanPurchase.updateMany({
        where: {
          id: row.id,
          status: { in: ["INITIATING", "PENDING", "UNKNOWN"] },
        },
        data: { status: "PENDING", ...checkout },
      });
      return this.payment(row.organizationId, row.id, false);
    } catch (error) {
      await this.db.storePlanPurchase.updateMany({
        where: { id: row.id, status: "INITIATING" },
        data: { status: "UNKNOWN" },
      });
      throw error;
    }
  }

  async payment(storeId: string, id: string, verify = true) {
    const row = await this.db.storePlanPurchase.findFirst({
      where: { id, organizationId: storeId },
    });
    if (!row) fail("STORE_PAYMENT_NOT_FOUND", "Store payment not found.", 404);
    if (verify && unresolved.includes(row.status)) await this.verify(row);
    await this.activateDue(storeId);
    return publicPurchase(
      await this.db.storePlanPurchase.findUniqueOrThrow({ where: { id } }),
    );
  }
  async payUsage(storeId: string, actorId: string, id: string) {
    if (!(await this.available()))
      fail(
        "STORE_PAYMENTS_UNAVAILABLE",
        "SelfX Store payments are not enabled yet.",
        503,
      );
    const bill = await this.db.storePlanPurchase.findFirst({
      where: { id, organizationId: storeId, billingCycleId: { not: null } },
    });
    if (!bill) fail("STORE_PAYMENT_NOT_FOUND", "Store bill not found.", 404);
    await this.db.$transaction(async (tx) => {
      await this.activeStore(tx, storeId);
      // A failed native order is terminal; a fresh attempt may use the same invoice with a new order identity.
      await tx.storePlanPurchase.updateMany({
        where: { id, status: { in: ["DUE", "FAILED"] } },
        data: {
          status: "INITIALIZING",
          actorUserId: actorId,
          merchantOrderId: `SI${createSelfxId().replaceAll("-", "")}`,
          providerOrderId: null,
          checkoutUrl: null,
          expiresAt: new Date(Date.now() + 5 * 60_000),
        },
      });
    });
    return this.initiate(
      await this.db.storePlanPurchase.findUniqueOrThrow({ where: { id } }),
    );
  }
  async callback(id: string, encoded: string, signature: string) {
    const row = await this.db.storePlanPurchase.findUnique({ where: { id } });
    if (!row) fail("STORE_PAYMENT_NOT_FOUND", "Store payment not found.", 404);
    try {
      const credentials = decryptPaymentSnapshot<Credentials>(row);
      if (
        !("mode" in credentials) ||
        credentials.mode !== "DQR" ||
        signature.length > 128
      )
        throw new Error();
      new PhonePeDqrAdapter(credentials).verifyCallback(encoded, signature, {
        transactionId: row.merchantOrderId,
        amountMinor: row.amountMinor,
        currency: "INR",
      });
    } catch {
      fail(
        "STORE_PAYMENT_CALLBACK_INVALID",
        "Payment notification could not be verified.",
        401,
      );
    }
    await this.verify(row);
    return { accepted: true };
  }
  async cancel(storeId: string, id: string) {
    const row = await this.db.storePlanPurchase.findFirst({
      where: { id, organizationId: storeId },
    });
    if (!row) fail("STORE_PAYMENT_NOT_FOUND", "Store payment not found.", 404);
    if (!unresolved.includes(row.status)) return publicPurchase(row);
    await this.verify(row);
    const latest = await this.db.storePlanPurchase.findUniqueOrThrow({
      where: { id },
    });
    if (latest.status !== "PENDING") return publicPurchase(latest);
    const credentials = decryptPaymentSnapshot<Credentials>(latest);
    if (!("mode" in credentials) || credentials.mode !== "DQR")
      fail(
        "STORE_PAYMENT_CANCEL_UNAVAILABLE",
        "Check this payment until the provider confirms its final status.",
      );
    const adapter = new PhonePeDqrAdapter(credentials);
    const expected = {
      transactionId: latest.merchantOrderId,
      amountMinor: latest.amountMinor,
      currency: "INR" as const,
    };
    const response = await this.transport.send(
      adapter.cancelRequest(expected),
      {
        purpose: "STORE_PLAN",
        environment: "PRODUCTION",
        productionBase: credentials.apiBaseUrl,
      },
    );
    if (adapter.parseCancel(response) === "ALREADY_COMPLETED")
      return this.payment(storeId, id);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${storeId}::uuid FOR UPDATE`;
      await tx.storePlanPurchase.updateMany({
        where: {
          id,
          organizationId: storeId,
          merchantOrderId: latest.merchantOrderId,
          status: "PENDING",
        },
        data: { status: "FAILED", checkedAt: new Date(), checkoutUrl: null },
      });
    });
    return this.payment(storeId, id, false);
  }
  private async verify(row: StorePlanPurchase) {
    if (!unresolved.includes(row.status)) return;
    const credentials = decryptPaymentSnapshot<Credentials>(row);
    if (credentials.environment !== "PRODUCTION")
      fail(
        "STORE_PAYMENT_CONFIGURATION_INVALID",
        "Production credentials are required.",
        503,
      );
    let result: {
      status: "COMPLETED" | "FAILED" | "PENDING";
      providerOrderId: string;
    };
    if ("mode" in credentials && credentials.mode === "DQR") {
      const adapter = new PhonePeDqrAdapter(credentials);
      const expected = {
        transactionId: row.merchantOrderId,
        amountMinor: row.amountMinor,
        currency: "INR" as const,
      };
      const response = await this.transport.send(
        adapter.statusRequest(expected),
        {
          purpose: "STORE_PLAN",
          environment: "PRODUCTION",
          productionBase: credentials.apiBaseUrl,
        },
      );
      const status = adapter.parseStatus(response, expected);
      result = {
        status:
          status.status === "SUCCEEDED"
            ? "COMPLETED"
            : status.status === "FAILED"
              ? "FAILED"
              : "PENDING",
        providerOrderId: row.merchantOrderId,
      };
    } else
      result = await mobileCheckoutStatus(
        credentials as MobilePhonePeCredentials,
        row.merchantOrderId,
        row.amountMinor,
      );
    if (row.providerOrderId && row.providerOrderId !== result.providerOrderId)
      fail(
        "STORE_PAYMENT_MISMATCH",
        "PhonePe returned another payment identity.",
      );
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${row.organizationId}::uuid FOR UPDATE`;
      const current = await tx.storePlanPurchase.findUniqueOrThrow({
        where: { id: row.id },
      });
      if (
        !unresolved.includes(current.status) ||
        current.merchantOrderId !== row.merchantOrderId
      )
        return;
      await tx.storePlanPurchase.update({
        where: { id: row.id },
        data: {
          status:
            result.status === "COMPLETED"
              ? row.billingCycleId
                ? "PAID"
                : "SCHEDULED"
              : result.status,
          paidAt: result.status === "COMPLETED" ? new Date() : null,
          checkedAt: new Date(),
          providerOrderId: result.providerOrderId,
        },
      });
    });
    await this.activateDue(row.organizationId);
  }
  async activateDue(storeId: string) {
    await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${storeId}::uuid FOR UPDATE`;
        await lockBillingSubscription(tx, storeId);
        const row = await tx.storePlanPurchase.findFirst({
          where: {
            organizationId: storeId,
            billingCycleId: null,
            status: "SCHEDULED",
            OR: [
              { effectiveAfter: null },
              { effectiveAfter: { lte: new Date() } },
            ],
          },
          orderBy: { createdAt: "asc" },
        });
        if (!row) return;
        const store = await tx.organization.findUnique({
          where: { id: storeId },
        });
        if (store?.status !== "ACTIVE") return;
        const current = await tx.storeSubscription.findUnique({
          where: { organizationId: storeId },
        });
        if (
          !isDeepStrictEqual(base(current), row.baseSubscription) ||
          (await this.shopify(tx, storeId))
        ) {
          await tx.storePlanPurchase.update({
            where: { id: row.id },
            data: { status: "REVIEW_REQUIRED" },
          });
          return;
        }
        try {
          await assertPhonePeUsageSettled(tx, storeId);
        } catch (error) {
          if (error instanceof ApiErrorException) return;
          throw error;
        }
        const plan = row.pricingSnapshot as unknown as PricingPlan;
        let start = row.effectiveAfter ?? row.paidAt ?? row.createdAt;
        let end = monthlyBillingPeriod(start, start).end;
        if (end <= new Date()) {
          start = new Date();
          end = monthlyBillingPeriod(start, start).end;
        }
        await this.entitlements.activatePlanForStore(
          {
            organizationId: storeId,
            pricingPlanId: row.pricingPlanId,
            billingProvider: "PHONEPE",
            phonepePurchaseId: row.id,
            approvedPlanSnapshot: plan,
            externalPeriod: { start, end },
          },
          tx,
        );
        await tx.storePlanPurchase.update({
          where: { id: row.id },
          data: { status: "ACTIVE", activatedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            id: createSelfxId(),
            organizationId: storeId,
            actorUserId: null,
            action: "STORE_PLAN_CHANGE_ACTIVATED",
            resourceType: "STORE_PLAN_PURCHASE",
            resourceId: row.id,
            metadata: {
              planId: row.pricingPlanId,
              requestedBy: row.actorUserId,
              periodStart: start.toISOString(),
              periodEnd: end.toISOString(),
            },
          },
        });
      },
      { timeout: 30_000 },
    );
  }
  private async createUsageBills(storeId: string) {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${storeId}::uuid FOR UPDATE`;
      await lockBillingSubscription(tx, storeId);
      const cycles = await tx.storeBillingCycle.findMany({
        where: {
          organizationId: storeId,
          billingProvider: "PHONEPE",
          periodEnd: { lte: new Date() },
          purchase: { is: null },
        },
        orderBy: { periodStart: "asc" },
        take: 25,
      });
      for (const cycle of cycles) {
        await tx.$queryRaw`SELECT id FROM store_billing_cycles WHERE id = ${cycle.id}::uuid FOR UPDATE`;
        if (
          await tx.kioskTryOnRun.count({
            where: {
              billingCycleId: cycle.id,
              status: { notIn: ["COMPLETED", "FAILED"] },
            },
          })
        )
          continue;
        const count = await tx.billableGeneration.count({
          where: { billingCycleId: cycle.id, coverage: "POSTPAID" },
        });
        if (!count) continue;
        const subscription = await tx.storeSubscription.findUniqueOrThrow({
          where: { organizationId: storeId },
        });
        const owner = cycle.phonepePurchaseId
          ? await tx.storePlanPurchase.findFirst({
              where: {
                id: cycle.phonepePurchaseId,
                organizationId: storeId,
                pricingPlanId: cycle.pricingPlanId,
              },
            })
          : null;
        if (!owner)
          fail(
            "STORE_BILLING_TERMS_UNAVAILABLE",
            "The Store's approved usage terms need review.",
          );
        const amount = count * cycle.creditUnitPriceCents;
        if (
          !Number.isSafeInteger(amount) ||
          amount < 1 ||
          amount > 2_000_000_000
        )
          fail(
            "STORE_BILLING_AMOUNT_INVALID",
            "This usage bill exceeds the supported amount.",
          );
        const id = createSelfxId();
        await tx.storePlanPurchase.create({
          data: {
            id,
            organizationId: storeId,
            pricingPlanId: cycle.pricingPlanId,
            actorUserId: owner.actorUserId,
            requestKey: hash(`usage:${cycle.id}`),
            requestFingerprint: hash(`${cycle.id}:${amount}`),
            merchantOrderId: `SI${id.replaceAll("-", "")}`,
            billingCycleId: cycle.id,
            status: "DUE",
            amountMinor: amount,
            currency: cycle.currency,
            pricingSnapshot: owner.pricingSnapshot as Prisma.InputJsonValue,
            baseSubscription: base(subscription),
            encryptedPayload: owner.encryptedPayload,
            initializationVector: owner.initializationVector,
            authenticationTag: owner.authenticationTag,
            keyVersion: owner.keyVersion,
            expiresAt: new Date(Date.now() + 5 * 60_000),
          },
        });
      }
    });
  }
  async reconcile() {
    if (this.running) return;
    this.running = true;
    try {
      // Request replay keys expire; financial identities and ledger receipts remain durable.
      const cutoff = new Date(Date.now() - 30 * 86400_000);
      await this.db.storePlanPurchase.updateMany({
        where: {
          requestKey: { not: null },
          createdAt: { lt: cutoff },
          status: { in: ["ACTIVE", "PAID", "FAILED"] },
        },
        data: { requestKey: null },
      });
      await this.db.shopifyBillingAgreement.updateMany({
        where: {
          requestKey: { not: null },
          createdAt: { lt: cutoff },
          status: {
            in: ["ACTIVE", "CANCELLED", "DECLINED", "EXPIRED", "REPLACED"],
          },
        },
        data: { requestKey: null },
      });
      const rows = await this.db.storePlanPurchase.findMany({
        where: { status: { in: [...unresolved, "SCHEDULED"] } },
        orderBy: [
          { checkedAt: { sort: "asc", nulls: "first" } },
          { createdAt: "asc" },
        ],
        take: 25,
      });
      for (const row of rows) {
        try {
          if (row.status === "SCHEDULED")
            await this.activateDue(row.organizationId);
          else await this.verify(row);
        } catch {
          this.log.warn("Store payment status needs retry");
        } finally {
          await this.db.storePlanPurchase.updateMany({
            where: { id: row.id },
            data: { checkedAt: new Date() },
          });
        }
      }
      const due = await this.db.storeBillingCycle.findMany({
        where: {
          billingProvider: "PHONEPE",
          periodEnd: { lte: new Date() },
          purchase: { is: null },
          generations: { some: { coverage: "POSTPAID" } },
        },
        distinct: ["organizationId"],
        select: { organizationId: true },
        orderBy: { periodEnd: "asc" },
        take: 25,
      });
      for (const store of due) {
        try {
          await this.createUsageBills(store.organizationId);
        } catch {
          this.log.warn("Store usage billing needs retry");
        }
      }
    } finally {
      this.running = false;
    }
  }
}
