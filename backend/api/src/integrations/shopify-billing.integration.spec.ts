import "reflect-metadata";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { DEFAULT_TRIAL_FEATURE_KEYS } from "../entitlements/default-trial.js";
import {
  prepareRunBilling,
  recordSuccessfulGeneration,
} from "../entitlements/postpaid-billing.js";
import {
  ShopifyBillingService,
  shopifyUsageTerms,
} from "./shopify-billing.service.js";
import type { VerifyShopifyBillingDto } from "./dto/shopify-billing.dto.js";
import type { Prisma } from "@prisma/client";
import { StorePurgeService } from "../stores/store-purge.service.js";

const url = process.env.WOOCOMMERCE_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/woocommerce_catalog_test")
)
  throw new Error("Dedicated localhost woocommerce_catalog_test required.");
describe.skipIf(!url)(
  "Shopify billing approvals and usage reservations (PostgreSQL)",
  () => {
    const db = new PrismaService({
      datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
    });
    const entitlements = new EntitlementsService(db);
    const billing = new ShopifyBillingService(db, entitlements);
    const stores: string[] = [],
      plans: string[] = [];
    let externalCounter = 0;
    beforeAll(() => db.$connect());
    afterEach(() => {
      vi.unstubAllEnvs();
    });
    afterAll(async () => {
      const scope = { organizationId: { in: stores } };
      await db.auditLog.deleteMany({ where: scope });
      await db.kioskTryOnRun.deleteMany({ where: scope });
      await db.shopifyUsageCharge.deleteMany({ where: { agreement: scope } });
      await db.shopifyUsageReservation.deleteMany({
        where: { agreement: scope },
      });
      await db.billableGeneration.deleteMany({ where: scope });
      await db.creditLedgerEntry.deleteMany({ where: scope });
      await db.storeBillingCycle.deleteMany({ where: scope });
      await db.shopifyBillingAgreement.deleteMany({ where: scope });
      await db.storeSubscription.deleteMany({ where: scope });
      await db.integration.deleteMany({ where: scope });
      await db.organization.deleteMany({ where: { id: { in: stores } } });
      await db.pricingPlanRate.deleteMany({
        where: { pricingPlanId: { in: plans } },
      });
      await db.pricingPlan.deleteMany({ where: { id: { in: plans } } });
      await db.$disconnect();
    });
    async function plan(payg = false, credits = 20, currency = "USD") {
      const id = createSelfxId();
      plans.push(id);
      return db.pricingPlan.create({
        data: {
          id,
          code: id,
          name: "Approved test plan",
          channels: ["SHOPIFY", "KIOSK", "PUBLIC_API"],
          currency,
          monthlyPriceCents: payg ? 0 : 1000,
          includedCredits: payg ? 0 : credits,
          trialCredits: payg ? 0 : 10,
          billingMode: payg ? "POSTPAID_PAYG" : "CREDIT_LIMITED",
          creditUnitPriceCents: payg ? 25 : null,
          metadata: { featureKeys: [...DEFAULT_TRIAL_FEATURE_KEYS] },
        },
      });
    }
    async function fixture(payg = false) {
      vi.stubEnv("SHOPIFY_BILLING_ENABLED", "true");
      vi.stubEnv("SHOPIFY_BILLING_TEST_MODE", "true");
      const store = createSelfxId(),
        integration = createSelfxId(),
        shop = `billing-${store}.myshopify.com`;
      stores.push(store);
      await db.organization.create({
        data: {
          id: store,
          name: "Shopify billing test",
          slug: store,
          status: "ACTIVE",
        },
      });
      await entitlements.getStoreCreditSummary(store);
      await db.integration.create({
        data: {
          id: integration,
          organizationId: store,
          type: "SHOPIFY",
          externalAccountId: shop,
          metadata: { shopDomain: shop },
        },
      });
      const price = await plan(payg);
      async function approval(planId = price.id, cap = payg ? 50 : undefined) {
        const prepared = await billing.prepare({
          shop,
          planId,
          ...(cap ? { usageCapCents: cap } : {}),
        });
        const subscriptionId = `gid://shopify/AppSubscription/${Date.now()}${++externalCounter}`;
        await billing.attach(prepared.id, shop, subscriptionId);
        const body: VerifyShopifyBillingDto = {
          shop,
          subscriptionId,
          status: "ACTIVE",
          test: true,
          currency: prepared.plan.currency,
          recurringAmountCents: prepared.plan.monthlyPriceCents,
          periodEnd: new Date(Date.now() + 30 * 86400_000).toISOString(),
          ...(prepared.plan.billingMode === "POSTPAID_PAYG"
            ? {
                usageCapCents: cap,
                usageLineItemId: `gid://shopify/AppSubscriptionLineItem/${Date.now()}?v=1&index=0`,
                usageTerms: prepared.usageTerms!,
              }
            : {}),
        };
        return { prepared, body };
      }
      return { store, integration, shop, price, approval };
    }
    it("requires verified matching approval and activates the frozen plan once", async () => {
      const f = await fixture(),
        approved = await f.approval();
      expect(
        (await entitlements.getStoreCreditSummary(f.store)).subscription
          ?.pricingPlan?.id,
      ).not.toBe(f.price.id);
      await expect(
        billing.confirm(approved.prepared.id, {
          ...approved.body,
          shop: "other.myshopify.com",
        }),
      ).rejects.toThrow();
      await expect(
        billing.confirm(approved.prepared.id, {
          ...approved.body,
          recurringAmountCents: 1,
        }),
      ).rejects.toThrow();
      await expect(
        billing.confirm(approved.prepared.id, {
          ...approved.body,
          test: false,
        }),
      ).rejects.toThrow();
      await db.pricingPlan.update({
        where: { id: f.price.id },
        data: { includedCredits: 999, monthlyPriceCents: 9000 },
      });
      await billing.confirm(approved.prepared.id, approved.body);
      await billing.confirm(approved.prepared.id, approved.body);
      const summary = await entitlements.getStoreCreditSummary(f.store);
      expect(summary.subscription?.includedCredits).toBe(20);
      expect(summary.subscription?.pricingPlan?.monthlyPriceCents).toBe(1000);
      expect(
        await db.creditLedgerEntry.count({
          where: { organizationId: f.store, entryType: "PLAN_GRANTED" },
        }),
      ).toBe(1);
      expect(
        await db.shopifyUsageCharge.count({
          where: { agreement: { organizationId: f.store } },
        }),
      ).toBe(0);
    });
    it("defers a plan change until renewal and grants its allowance only once when due", async () => {
      const f = await fixture(),
        first = await f.approval();
      await billing.confirm(first.prepared.id, first.body);
      const nextPlan = await plan(false, 50),
        next = await f.approval(nextPlan.id);
      expect(await billing.confirm(next.prepared.id, next.body)).toMatchObject({
        active: false,
        scheduled: true,
      });
      expect(
        (await entitlements.getStoreCreditSummary(f.store)).subscription
          ?.pricingPlan?.id,
      ).toBe(f.price.id);
      const queued = await db.shopifyBillingAgreement.findUniqueOrThrow({
        where: { id: next.prepared.id },
      });
      expect(queued.approvedAt).not.toBeNull();
      await db.shopifyBillingAgreement.update({
        where: { id: next.prepared.id },
        data: { effectiveAfter: new Date(Date.now() - 1000) },
      });
      await billing.confirm(next.prepared.id, next.body);
      await billing.confirm(next.prepared.id, next.body);
      expect(
        (await entitlements.getStoreCreditSummary(f.store)).subscription
          ?.pricingPlan?.id,
      ).toBe(nextPlan.id);
      expect(
        await db.creditLedgerEntry.count({
          where: { organizationId: f.store, entryType: "PLAN_GRANTED" },
        }),
      ).toBe(2);
    });
    it("refuses a currency switch that Shopify would apply immediately", async () => {
      const f = await fixture(),
        approved = await f.approval();
      await billing.confirm(approved.prepared.id, approved.body);
      const other = await plan(false, 50, "INR");
      await expect(
        billing.prepare({ shop: f.shop, planId: other.id }),
      ).rejects.toMatchObject({
        response: { error: { message: expect.stringContaining("currency") } },
      });
    });
    it("stops admission after cancellation and cannot reactivate a terminal subscription", async () => {
      const f = await fixture(),
        approved = await f.approval();
      await billing.confirm(approved.prepared.id, approved.body);
      await billing.confirm(approved.prepared.id, {
        ...approved.body,
        status: "CANCELLED",
      });
      await expect(
        prepareRunBilling(db, {
          organizationId: f.store,
          assignmentScope: "ORGANIZATION",
          channel: "KIOSK",
          requestKey: "cancelled-request",
        }),
      ).rejects.toMatchObject({
        response: { error: { code: "SHOPIFY_BILLING_APPROVAL_REQUIRED" } },
      });
      await expect(
        billing.confirm(approved.prepared.id, approved.body),
      ).rejects.toMatchObject({
        response: {
          error: { message: expect.stringContaining("no longer active") },
        },
      });
      await expect(
        billing.confirm(approved.prepared.id, {
          ...approved.body,
          status: "ACCEPTED",
        }),
      ).rejects.toThrow();
    });
    it("rejects attaching a payable approval after a concurrent disconnect", async () => {
      const f = await fixture();
      const pending = await billing.prepare({
        shop: f.shop,
        planId: f.price.id,
      });
      await db.integration.update({
        where: { id: f.integration },
        data: { status: "DISCONNECTED" },
      });
      await expect(
        billing.attach(
          pending.id,
          f.shop,
          "gid://shopify/AppSubscription/1999",
        ),
      ).rejects.toThrow();
      expect(
        (
          await db.shopifyBillingAgreement.findUniqueOrThrow({
            where: { id: pending.id },
          })
        ).externalSubscriptionId,
      ).toBeNull();
    });
    it("requires Shopify-managed plan changes and preserves its frozen usage rate", async () => {
      const f = await fixture(true),
        approved = await f.approval();
      await billing.confirm(approved.prepared.id, approved.body);
      await db.pricingPlan.update({
        where: { id: f.price.id },
        data: { creditUnitPriceCents: 100 },
      });
      await db.pricingPlanRate.create({
        data: {
          id: createSelfxId(),
          pricingPlanId: f.price.id,
          currency: "USD",
          creditUnitPriceCents: 100,
          effectiveAt: new Date(0),
        },
      });
      const admitted = await prepareRunBilling(db, {
        organizationId: f.store,
        assignmentScope: "ORGANIZATION",
        channel: "KIOSK",
        requestKey: "frozen-rate",
      });
      const cycle = await db.storeBillingCycle.findUniqueOrThrow({
        where: { id: admitted.billingCycleId! },
      });
      expect(cycle.creditUnitPriceCents).toBe(25);
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(
          new Date(new Date(approved.body.periodEnd!).getTime() + 1000),
        );
        await billing.confirm(approved.prepared.id, {
          ...approved.body,
          periodEnd: new Date(
            new Date(approved.body.periodEnd!).getTime() + 30 * 86400_000,
          ).toISOString(),
        });
        const renewed = await prepareRunBilling(db, {
          organizationId: f.store,
          assignmentScope: "ORGANIZATION",
          channel: "PUBLIC_API",
          requestKey: "frozen-renewal",
        });
        expect(renewed.billingCycleId).not.toBe(cycle.id);
        expect(
          (
            await db.storeBillingCycle.findUniqueOrThrow({
              where: { id: renewed.billingCycleId! },
            })
          ).creditUnitPriceCents,
        ).toBe(25);
      } finally {
        vi.useRealTimers();
      }
      const other = await plan();
      await expect(
        entitlements.activatePlanForStore({
          organizationId: f.store,
          pricingPlanId: other.id,
        }),
      ).rejects.toMatchObject({
        response: { error: { code: "SHOPIFY_BILLING_MANAGED" } },
      });
    });
    async function run(
      store: string,
      fields: Awaited<ReturnType<typeof prepareRunBilling>>,
      status = "COMPLETED",
    ) {
      return db.kioskTryOnRun.create({
        data: {
          id: createSelfxId(),
          organizationId: store,
          assignmentScope: "ORGANIZATION",
          clientRequestId: createSelfxId(),
          status,
          provider: "fixture",
          providerDisplayName: "Fixture",
          providerModel: "fixture",
          garmentSource: "DIRECT_UPLOAD",
          garmentIntent: "TOP",
          garmentCategory: "TOP",
          garmentPhotoType: "PRODUCT",
          generationProfile: "BALANCED",
          expiresAt: new Date(Date.now() + 60_000),
          completedAt: status === "COMPLETED" ? new Date() : null,
          ...fields,
        },
      });
    }
    it("reserves a shared cap atomically across channels and charges only completed results", async () => {
      const f = await fixture(true),
        approved = await f.approval();
      await billing.confirm(approved.prepared.id, approved.body);
      const one = await prepareRunBilling(db, {
        organizationId: f.store,
        assignmentScope: "ORGANIZATION",
        channel: "KIOSK",
        requestKey: "one",
      });
      const two = await prepareRunBilling(db, {
        organizationId: f.store,
        assignmentScope: "ORGANIZATION",
        channel: "PUBLIC_API",
        requestKey: "two",
      });
      await expect(
        prepareRunBilling(db, {
          organizationId: f.store,
          assignmentScope: "ORGANIZATION",
          channel: "KIOSK",
          requestKey: "third",
        }),
      ).rejects.toMatchObject({
        response: { error: { code: "SHOPIFY_USAGE_CAP_REACHED" } },
      });
      const completed = await run(f.store, one);
      await run(f.store, two, "FAILED");
      await db.$transaction((tx) => recordSuccessfulGeneration(tx, completed));
      await db.$transaction((tx) => recordSuccessfulGeneration(tx, completed));
      const pending = await billing.pendingUsage(f.shop);
      expect(pending).toHaveLength(1);
      expect(pending[0]?.amountCents).toBe(25);
      const recovered = await prepareRunBilling(db, {
        organizationId: f.store,
        assignmentScope: "ORGANIZATION",
        channel: "KIOSK",
        requestKey: "third",
      });
      expect(recovered.shopifyReservationId).toBeTruthy();
      await billing.acknowledgeUsage(
        pending[0]!.id,
        f.shop,
        "gid://shopify/AppUsageRecord/123",
      );
      await billing.acknowledgeUsage(
        pending[0]!.id,
        f.shop,
        "gid://shopify/AppUsageRecord/123",
      );
      expect(await billing.pendingUsage(f.shop)).toHaveLength(0);
      await expect(
        billing.acknowledgeUsage(
          pending[0]!.id,
          "other.myshopify.com",
          "gid://shopify/AppUsageRecord/123",
        ),
      ).rejects.toThrow();
    });
    it("purges the new financial dependencies without crossing Stores", async () => {
      const f = await fixture(true),
        other = await fixture(),
        approved = await f.approval();
      await billing.confirm(approved.prepared.id, approved.body);
      const admission = await prepareRunBilling(db, {
        organizationId: f.store,
        assignmentScope: "ORGANIZATION",
        channel: "KIOSK",
        requestKey: "purge-fixture",
      });
      const completed = await run(f.store, admission);
      await db.$transaction((tx) => recordSuccessfulGeneration(tx, completed));
      const purge = new StorePurgeService(db, {
        deleteObject: vi.fn(),
      } as never) as unknown as {
        deleteResources(
          tx: Prisma.TransactionClient,
          store: string,
          devices: string[],
        ): Promise<unknown>;
      };
      await db.$transaction((tx) => purge.deleteResources(tx, f.store, []), {
        timeout: 60_000,
      });
      expect(
        await db.shopifyBillingAgreement.count({
          where: { organizationId: f.store },
        }),
      ).toBe(0);
      expect(
        await db.integration.count({ where: { id: other.integration } }),
      ).toBe(1);
    });
    it("admits just one simultaneous request for the final shared spending slot", async () => {
      const f = await fixture(true),
        approved = await f.approval(f.price.id, 25);
      await billing.confirm(approved.prepared.id, approved.body);
      const results = await Promise.allSettled([
        prepareRunBilling(db, {
          organizationId: f.store,
          assignmentScope: "ORGANIZATION",
          channel: "KIOSK",
          requestKey: "one",
        }),
        prepareRunBilling(db, {
          organizationId: f.store,
          assignmentScope: "ORGANIZATION",
          channel: "PUBLIC_API",
          requestKey: "two",
        }),
      ]);
      expect(
        results.filter((item) => item.status === "fulfilled"),
      ).toHaveLength(1);
      expect(results.find((item) => item.status === "rejected")).toMatchObject({
        reason: { response: { error: { code: "SHOPIFY_USAGE_CAP_REACHED" } } },
      });
      expect(shopifyUsageTerms(25, "USD")).toContain("0.25");
    });
  },
);
