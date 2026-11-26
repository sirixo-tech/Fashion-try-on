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
import { StorePlanSelectionService } from "./store-plan-selection.service.js";
import { PhonePeTransport } from "../payments/phonepe.transport.js";
import { assertPhonePeUsageSettled } from "../entitlements/phonepe-store-billing.js";
import { prepareRunBilling } from "../entitlements/postpaid-billing.js";

vi.mock("../payments/payment-snapshots.js", () => ({
  decryptPaymentSnapshot: () => ({
    mode: "DQR",
    environment: "PRODUCTION",
    merchantId: "TESTSELFX",
    providerStoreId: "TESTSTORE",
    saltIndex: "1",
    saltKey: "test-only-salt-key-not-real",
    apiBaseUrl: "https://example.phonepe.com",
  }),
}));
const url = process.env.WOOCOMMERCE_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/woocommerce_catalog_test")
)
  throw new Error("Dedicated localhost test database required");

describe.skipIf(!url)("shared Store plan selection (PostgreSQL)", () => {
  const db = new PrismaService({
    datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
  });
  const entitlements = new EntitlementsService(db);
  const service = new StorePlanSelectionService(db, entitlements);
  const storeIds: string[] = [],
    planIds: string[] = [],
    userIds: string[] = [];
  const native = new Map<
    string,
    { amount: number; status: "PENDING" | "COMPLETED" | "FAILED" }
  >();
  let creates = 0;
  beforeAll(async () => {
    await db.$connect();
    await db.mobilePaymentConnection.create({
      data: {
        id: "PHONEPE",
        enabled: true,
        environment: "PRODUCTION",
        encryptedPayload: "fixture",
        initializationVector: "fixture",
        authenticationTag: "fixture",
        keyVersion: "v1",
      },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    const scope = { organizationId: { in: storeIds } };
    await db.storeBillingCycle.updateMany({
      where: scope,
      data: { phonepePurchaseId: null },
    });
    await db.auditLog.deleteMany({ where: scope });
    await db.storePlanPurchase.deleteMany({ where: scope });
    await db.kioskTryOnRun.deleteMany({ where: scope });
    await db.billableGeneration.deleteMany({ where: scope });
    await db.creditLedgerEntry.deleteMany({ where: scope });
    await db.storeBillingCycle.deleteMany({ where: scope });
    await db.storeSubscription.deleteMany({ where: scope });
    await db.shopifyBillingAgreement.deleteMany({ where: scope });
    await db.integration.deleteMany({ where: scope });
    await db.storeCreditReservation.deleteMany({ where: scope });
    await db.organization.deleteMany({ where: { id: { in: storeIds } } });
    await db.pricingPlan.deleteMany({ where: { id: { in: planIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.mobilePaymentConnection.delete({ where: { id: "PHONEPE" } });
    await db.$disconnect();
  });
  async function fixture(payg = false) {
    vi.stubEnv("SELFX_STORE_PHONEPE_ENABLED", "true");
    vi.stubEnv("SELFX_PAYMENT_CALLBACK_BASE_URL", "https://api.selfx.test");
    vi.stubEnv("SHOPIFY_APP_URL", "https://shopify.selfx.test");
    vi.spyOn(PhonePeTransport.prototype, "send").mockImplementation(
      async (request) => {
        if (request.url.endsWith("/v3/qr/init")) {
          creates++;
          const body = JSON.parse(
            Buffer.from(JSON.parse(request.body!).request, "base64").toString(),
          );
          native.set(body.transactionId, {
            amount: body.amount,
            status: "PENDING",
          });
          return {
            success: true,
            code: "SUCCESS",
            data: {
              merchantId: "TESTSELFX",
              transactionId: body.transactionId,
              amount: body.amount,
              qrString: `upi://pay?pa=fixture@test&tr=${body.transactionId}&am=${(body.amount / 100).toFixed(2)}`,
            },
          };
        }
        const id = request.url.split("/").at(-2)!;
        const state = native.get(id)!;
        return {
          success: state.status !== "FAILED",
          code:
            state.status === "COMPLETED"
              ? "PAYMENT_SUCCESS"
              : state.status === "FAILED"
                ? "PAYMENT_ERROR"
                : "PAYMENT_PENDING",
          data: {
            merchantId: "TESTSELFX",
            transactionId: id,
            amount: state.amount,
            paymentState: state.status,
          },
        };
      },
    );
    const storeId = createSelfxId(),
      actorId = createSelfxId(),
      planId = createSelfxId();
    storeIds.push(storeId);
    userIds.push(actorId);
    planIds.push(planId);
    await db.organization.create({
      data: {
        id: storeId,
        name: "Store billing fixture",
        slug: storeId,
        status: "ACTIVE",
      },
    });
    await db.user.create({
      data: {
        id: actorId,
        email: `${actorId}@plan.invalid`,
        passwordHash: "fixture-not-a-login",
      },
    });
    const plan = await db.pricingPlan.create({
      data: {
        id: planId,
        code: planId,
        name: "Fixture paid plan",
        currency: "INR",
        channels: ["SHOPIFY", "WOOCOMMERCE", "KIOSK"],
        monthlyPriceCents: payg ? 0 : 1000,
        billingMode: payg ? "POSTPAID_PAYG" : "CREDIT_LIMITED",
        creditUnitPriceCents: payg ? 25 : null,
        includedCredits: payg ? 0 : 30,
        trialCredits: payg ? 0 : 999,
      },
    });
    await entitlements.getStoreCreditSummary(storeId);
    if (payg) {
      const balance = await entitlements.getCreditBalance(storeId);
      await db.creditLedgerEntry.create({
        data: {
          id: createSelfxId(),
          organizationId: storeId,
          entryType: "MANUAL_ADJUSTMENT",
          quantity: -balance.availableCredits,
          idempotencyKey: `fixture-exhaust:${storeId}`,
        },
      });
    }
    const choose = (clientRequestId = createSelfxId(), selected = plan) =>
      service.choose(storeId, actorId, {
        planId: selected.id,
        planUpdatedAt: selected.updatedAt.toISOString(),
        clientRequestId,
        acceptTerms: true,
      });
    const pay = async (id: string) => {
      const row = await db.storePlanPurchase.findUniqueOrThrow({
        where: { id },
      });
      native.get(row.merchantOrderId)!.status = "COMPLETED";
      return service.payment(storeId, id);
    };
    return { storeId, actorId, plan, choose, pay };
  }
  it("serializes simultaneous retries, creates one payment and grants one allowance after verified payment", async () => {
    const f = await fixture();
    const request = createSelfxId();
    const before = creates;
    const results = await Promise.all([f.choose(request), f.choose(request)]);
    expect(results[0].id).toBe(results[1].id);
    expect(creates - before).toBe(1);
    expect(
      (await entitlements.getStoreCreditSummary(f.storeId)).subscription
        ?.pricingPlan?.id,
    ).not.toBe(f.plan.id);
    await Promise.all([f.pay(results[0].id), f.pay(results[0].id)]);
    const summary = await entitlements.getStoreCreditSummary(f.storeId);
    expect(summary.subscription?.pricingPlan?.id).toBe(f.plan.id);
    expect(
      await db.creditLedgerEntry.count({
        where: { organizationId: f.storeId, entryType: "PLAN_GRANTED" },
      }),
    ).toBe(1);
    expect(
      await db.creditLedgerEntry.count({
        where: { organizationId: f.storeId, entryType: "TRIAL_GRANTED" },
      }),
    ).toBe(1);
    expect(summary.availableCredits).toBe(40);
    const another = await f.choose();
    await f.pay(another.id);
    expect(
      (await entitlements.getStoreCreditSummary(f.storeId)).availableCredits,
    ).toBe(70);
  });
  it("rejects changed request fingerprints, stale quotes, trial selection and cross-Store payment reads", async () => {
    const f = await fixture();
    const request = createSelfxId();
    const payment = await f.choose(request);
    await expect(
      service.choose(f.storeId, f.actorId, {
        planId: createSelfxId(),
        planUpdatedAt: f.plan.updatedAt.toISOString(),
        clientRequestId: request,
        acceptTerms: true,
      }),
    ).rejects.toMatchObject({
      response: { error: { code: "PLAN_CHANGE_REQUEST_CONFLICT" } },
    });
    await expect(
      service.payment(createSelfxId(), payment.id),
    ).rejects.toMatchObject({
      response: { error: { code: "STORE_PAYMENT_NOT_FOUND" } },
    });
    const other = await fixture();
    await expect(
      service.choose(other.storeId, other.actorId, {
        planId: other.plan.id,
        planUpdatedAt: new Date(0).toISOString(),
        clientRequestId: createSelfxId(),
        acceptTerms: true,
      }),
    ).rejects.toMatchObject({
      response: { error: { code: "PLAN_QUOTE_CHANGED" } },
    });
    const starter = await db.pricingPlan.findUniqueOrThrow({
      where: { code: "selfx-default-starter" },
    });
    await expect(other.choose(createSelfxId(), starter)).rejects.toMatchObject({
      response: { error: { code: "PLAN_UNAVAILABLE" } },
    });
  });
  it("freezes approved pack terms, activates immediately and never resets the trial", async () => {
    const f = await fixture();
    const payment = await f.choose();
    await f.pay(payment.id);
    const nextId = createSelfxId();
    planIds.push(nextId);
    const next = await db.pricingPlan.create({
      data: {
        id: nextId,
        code: nextId,
        name: "Cheaper plan",
        currency: "INR",
        channels: ["SHOPIFY", "WOOCOMMERCE", "KIOSK"],
        monthlyPriceCents: 500,
        includedCredits: 15,
      },
    });
    const change = await f.choose(createSelfxId(), next);
    await db.pricingPlan.update({
      where: { id: next.id },
      data: { monthlyPriceCents: 9999, includedCredits: 1000 },
    });
    await f.pay(change.id);
    expect((await service.workspace(f.storeId)).scheduled).toBeNull();
    await Promise.all([
      service.activateDue(f.storeId),
      service.activateDue(f.storeId),
    ]);
    const summary = await entitlements.getStoreCreditSummary(f.storeId);
    expect(summary.subscription?.includedCredits).toBe(15);
    expect(summary.subscription?.pricingPlan?.monthlyPriceCents).toBe(500);
    expect(
      await db.creditLedgerEntry.count({
        where: { organizationId: f.storeId, entryType: "TRIAL_GRANTED" },
      }),
    ).toBe(1);
    expect(
      await db.creditLedgerEntry.count({
        where: { organizationId: f.storeId, entryType: "PLAN_GRANTED" },
      }),
    ).toBe(2);
  });
  it("routes Shopify-connected Stores to Shopify without creating a PhonePe charge", async () => {
    const f = await fixture();
    const before = creates;
    await db.integration.create({
      data: {
        id: createSelfxId(),
        organizationId: f.storeId,
        type: "SHOPIFY",
        externalAccountId: `${f.storeId}.myshopify.com`,
        metadata: { shopDomain: `${f.storeId}.myshopify.com` },
      },
    });
    expect(await service.workspace(f.storeId)).toMatchObject({
      billingOwner: "SHOPIFY",
      manageUrl: expect.stringContaining("panel=plans"),
    });
    await expect(f.choose()).rejects.toMatchObject({
      response: { error: { code: "SHOPIFY_BILLING_MANAGED" } },
    });
    expect(creates).toBe(before);
  });
  it("bills only completed PhonePe-managed usage once, pauses overdue usage, and resumes after settlement", async () => {
    const f = await fixture(true);
    const accepted = await f.choose();
    expect(accepted.status).toBe("ACTIVE");
    const cycle = await db.storeBillingCycle.findFirstOrThrow({
      where: { organizationId: f.storeId },
    });
    await db.billableGeneration.createMany({
      data: [0, 1].map(() => ({
        id: createSelfxId(),
        organizationId: f.storeId,
        runId: createSelfxId(),
        billingCycleId: cycle.id,
        coverage: "POSTPAID" as const,
        completedAt: new Date(),
      })),
    });
    const previousStart = new Date(Date.now() - 31 * 86400_000);
    const foreignStore = await fixture(true);
    const foreignPurchase = await foreignStore.choose();
    await expect(
      db.storeBillingCycle.update({
        where: { id: cycle.id },
        data: { phonepePurchaseId: foreignPurchase.id },
      }),
    ).rejects.toThrow();
    await db.storeBillingCycle.update({
      where: { id: cycle.id },
      data: {
        periodStart: previousStart,
        periodEnd: new Date(Date.now() - 1000),
      },
    });
    await db.storeSubscription.update({
      where: { organizationId: f.storeId },
      data: { billingAnchorAt: previousStart },
    });
    await expect(
      assertPhonePeUsageSettled(db, f.storeId),
    ).rejects.toMatchObject({
      response: { error: { code: "STORE_USAGE_PAYMENT_DUE" } },
    });
    const workspace = await service.workspace(f.storeId);
    await expect(
      prepareRunBilling(db, {
        organizationId: f.storeId,
        assignmentScope: "ORGANIZATION",
        channel: "SHOPIFY",
        requestKey: createSelfxId(),
      }),
    ).rejects.toMatchObject({
      response: { error: { code: "STORE_USAGE_PAYMENT_DUE" } },
    });
    const bill = workspace.payments.find((p) => p.purpose === "USAGE")!;
    expect(bill.amountMinor).toBe(50);
    await service.workspace(f.storeId);
    expect(
      await db.storePlanPurchase.count({ where: { billingCycleId: cycle.id } }),
    ).toBe(1);
    await expect(
      db.kioskTryOnRun.create({
        data: {
          id: createSelfxId(),
          organizationId: f.storeId,
          assignmentScope: "ORGANIZATION",
          billingCycleId: cycle.id,
          clientRequestId: createSelfxId(),
          status: "RUNNING",
          provider: "fixture",
          providerDisplayName: "Fixture",
          providerModel: "fixture",
          garmentSource: "DIRECT_UPLOAD",
          garmentIntent: "TOP",
          garmentCategory: "TOP",
          garmentPhotoType: "PRODUCT",
          generationProfile: "BALANCED",
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toThrow("finalized");
    await service.payUsage(f.storeId, f.actorId, bill.id);
    await f.pay(bill.id);
    await f.pay(bill.id);
    await expect(
      assertPhonePeUsageSettled(db, f.storeId),
    ).resolves.toBeUndefined();
    expect((await service.payment(f.storeId, bill.id)).status).toBe("PAID");
    await expect(
      prepareRunBilling(db, {
        organizationId: f.storeId,
        assignmentScope: "ORGANIZATION",
        channel: "KIOSK",
        requestKey: createSelfxId(),
      }),
    ).resolves.toMatchObject({
      billingChannel: "KIOSK",
      billingCycleId: expect.any(String),
    });
    // Historical/manual cycles are never imported into PhonePe billing.
    const manualId = createSelfxId();
    await db.storeBillingCycle.create({
      data: {
        id: manualId,
        organizationId: f.storeId,
        subscriptionId: cycle.subscriptionId,
        pricingPlanId: f.plan.id,
        periodStart: new Date(0),
        periodEnd: new Date(1),
        currency: "INR",
        creditUnitPriceCents: 25,
      },
    });
    await db.billableGeneration.create({
      data: {
        id: createSelfxId(),
        organizationId: f.storeId,
        runId: createSelfxId(),
        billingCycleId: manualId,
        coverage: "POSTPAID",
        completedAt: new Date(),
      },
    });
    await service.workspace(f.storeId);
    expect(
      await db.storePlanPurchase.count({ where: { billingCycleId: manualId } }),
    ).toBe(0);
  });
  it("does not activate a mismatched or uncertain payment and does not create another native order on retry", async () => {
    const f = await fixture();
    const request = createSelfxId();
    const payment = await f.choose(request);
    const row = await db.storePlanPurchase.findUniqueOrThrow({
      where: { id: payment.id },
    });
    native.get(row.merchantOrderId)!.amount = 1;
    await expect(service.payment(f.storeId, row.id)).rejects.toThrow();
    expect(
      (await entitlements.getStoreCreditSummary(f.storeId)).subscription
        ?.pricingPlan?.id,
    ).not.toBe(f.plan.id);
    const before = creates;
    await f.choose(request);
    expect(creates).toBe(before);
  });
});
