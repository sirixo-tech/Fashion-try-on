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
import { EntitlementsService } from "./entitlements.service.js";
import {
  prepareRunBilling,
  recordSuccessfulGeneration,
} from "./postpaid-billing.js";
import { disableStorePayg } from "./store-billing-policy.js";
const url = process.env.WOOCOMMERCE_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/woocommerce_catalog_test")
)
  throw new Error("Dedicated local wallet test database required");

describe.skipIf(!url)("shared non-expiring Store wallet (PostgreSQL)", () => {
  const db = new PrismaService({
      datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
    }),
    service = new EntitlementsService(db);
  const stores: string[] = [],
    plans: string[] = [];
  beforeAll(() => db.$connect());
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    const where = { organizationId: { in: stores } };
    await db.billableGeneration.deleteMany({ where });
    await db.kioskTryOnRun.deleteMany({ where });
    await db.storeCreditReservation.deleteMany({ where });
    await db.creditLedgerEntry.deleteMany({ where });
    await db.storeBillingCycle.deleteMany({ where });
    await db.storeSubscription.deleteMany({ where });
    await db.organization.deleteMany({ where: { id: { in: stores } } });
    await db.pricingPlan.deleteMany({ where: { id: { in: plans } } });
    await db.$disconnect();
  });
  async function fixture() {
    const store = createSelfxId();
    stores.push(store);
    await db.organization.create({
      data: {
        id: store,
        name: "Wallet fixture",
        slug: store,
        status: "ACTIVE",
      },
    });
    const planId = createSelfxId();
    plans.push(planId);
    const plan = await db.pricingPlan.create({
      data: {
        id: planId,
        code: planId,
        name: "One-time pack",
        currency: "INR",
        channels: ["KIOSK", "PUBLIC_API", "SHOPIFY", "WOOCOMMERCE", "MOBILE"],
        monthlyPriceCents: 1000,
        includedCredits: 2,
        trialCredits: 0,
        storeLocationLimit: 2,
        metadata: { featureKeys: ["TRY_ON_WIDGET", "SHOPIFY_INTEGRATION"] },
      },
    });
    await service.ensureTrialCredits(store);
    const balance = await service.getCreditBalance(store);
    await db.creditLedgerEntry.create({
      data: {
        id: createSelfxId(),
        organizationId: store,
        entryType: "MANUAL_ADJUSTMENT",
        quantity: -balance.availableCredits,
        idempotencyKey: `fixture:${store}`,
      },
    });
    const buy = (key: string) =>
      db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${store}::uuid FOR UPDATE`;
        await service.grantCreditPack(tx, {
          organizationId: store,
          plan,
          purchaseKey: key,
        });
      });
    return { store, plan, buy };
  }
  const admit = (
    store: string,
    key: string,
    channel: "KIOSK" | "PUBLIC_API" | "SHOPIFY" | "WOOCOMMERCE" = "KIOSK",
  ) =>
    prepareRunBilling(db, {
      organizationId: store,
      assignmentScope: "ORGANIZATION",
      channel,
      requestKey: key,
    });
  async function run(
    store: string,
    billing: Awaited<ReturnType<typeof prepareRunBilling>>,
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
        expiresAt: new Date(Date.now() + 60000),
        completedAt: status === "COMPLETED" ? new Date() : null,
        ...billing,
      },
    });
  }
  it("adds a purchase once, allows another pack, retains configured limits and carries credits beyond the month", async () => {
    const f = await fixture();
    const key = createSelfxId();
    await Promise.all([f.buy(key), f.buy(key)]);
    await f.buy(createSelfxId());
    expect((await service.getCreditBalance(f.store)).availableCredits).toBe(4);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 70 * 86400000);
    const summary = await service.getStoreCreditSummary(f.store);
    expect(summary.availableCredits).toBe(4);
    expect(summary.subscription?.currentPeriodEnd).toBeNull();
    expect(summary.subscription?.pricingPlan?.storeLocationLimit).toBe(2);
    expect(summary.subscription?.featureKeys).toContain("TRY_ON_WIDGET");
    expect(
      await db.creditLedgerEntry.count({
        where: { organizationId: f.store, entryType: "TRIAL_GRANTED" },
      }),
    ).toBe(1);
  });
  it("reserves the final credit once across channels and settles a successful run exactly once", async () => {
    const f = await fixture();
    await f.buy(createSelfxId());
    const first = await admit(f.store, "one", "SHOPIFY");
    const completed = await run(f.store, first);
    await db.$transaction((tx) => recordSuccessfulGeneration(tx, completed));
    const result = await Promise.allSettled([
      admit(f.store, "two", "KIOSK"),
      admit(f.store, "three", "PUBLIC_API"),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await service.getCreditBalance(f.store)).availableCredits).toBe(0);
    await db.$transaction((tx) => recordSuccessfulGeneration(tx, completed));
    expect(
      await db.creditLedgerEntry.count({
        where: { organizationId: f.store, entryType: "CREDIT_CONSUMED" },
      }),
    ).toBe(1);
  });
  it("releases a failed generation without consuming or granting credits", async () => {
    const f = await fixture();
    await f.buy(createSelfxId());
    const admission = await admit(f.store, "fails");
    const queued = await run(f.store, admission, "QUEUED");
    expect((await service.getCreditBalance(f.store)).availableCredits).toBe(1);
    await db.kioskTryOnRun.update({
      where: { id: queued.id },
      data: { status: "FAILED" },
    });
    expect((await service.getCreditBalance(f.store)).availableCredits).toBe(2);
    expect(
      await db.creditLedgerEntry.count({
        where: { organizationId: f.store, entryType: "CREDIT_CONSUMED" },
      }),
    ).toBe(0);
  });
  it("uses a later pack before PAYG without losing usage terms, then disabling PAYG preserves the pack", async () => {
    const f = await fixture();
    const usageId = createSelfxId();
    plans.push(usageId);
    await db.pricingPlan.create({
      data: {
        id: usageId,
        code: usageId,
        name: "Usage",
        billingMode: "POSTPAID_PAYG",
        creditUnitPriceCents: 75,
        currency: "INR",
        monthlyPriceCents: 0,
        includedCredits: 0,
        trialCredits: 0,
        channels: ["KIOSK", "SHOPIFY"],
      },
    });
    await service.activatePlanForStore({
      organizationId: f.store,
      pricingPlanId: usageId,
    });
    await f.buy(createSelfxId());
    const summary = await service.getStoreCreditSummary(f.store);
    expect(summary.subscription?.pricingPlan?.id).toBe(f.plan.id);
    expect(summary.postpaid?.creditUnitPriceCents).toBe(75);
    for (const key of ["first", "second"]) {
      const prepaid = await admit(f.store, key);
      expect(prepaid.billingCycleId).toBeUndefined();
      const completed = await run(f.store, prepaid);
      await db.$transaction((tx) => recordSuccessfulGeneration(tx, completed));
    }
    const usage = await admit(f.store, "third");
    expect(usage.billingCycleId).toBeTruthy();
    expect(usage.creditReservationId).toBeUndefined();
    await f.buy(createSelfxId());
    await db.$transaction((tx) => disableStorePayg(tx, f.store));
    const after = await service.getStoreCreditSummary(f.store);
    expect(after.postpaid).toBeNull();
    expect(after.availableCredits).toBe(2);
    expect(after.subscription?.pricingPlan?.id).toBe(f.plan.id);
  });
  it("enforces Store suspension and the reservation's tenant binding", async () => {
    const f = await fixture(),
      other = await fixture();
    await f.buy(createSelfxId());
    const admission = await admit(f.store, "scoped");
    await expect(run(other.store, admission)).rejects.toThrow();
    await db.organization.update({
      where: { id: f.store },
      data: { status: "SUSPENDED" },
    });
    await expect(admit(f.store, "suspended")).rejects.toMatchObject({
      status: 402,
    });
  });
  it("reclaims an unattached stale reservation without allowing its request fingerprint to change", async () => {
    const f = await fixture();
    await f.buy(createSelfxId());
    const first = await admit(f.store, "orphan");
    await db.storeCreditReservation.update({
      where: { id: first.creditReservationId },
      data: { createdAt: new Date(Date.now() - 20 * 60_000) },
    });
    expect((await service.getCreditBalance(f.store)).availableCredits).toBe(2);
    await expect(admit(f.store, "orphan", "PUBLIC_API")).rejects.toMatchObject({
      status: 409,
    });
    const recovered = await admit(f.store, "orphan");
    expect(recovered.creditReservationId).toBe(first.creditReservationId);
    expect((await service.getCreditBalance(f.store)).availableCredits).toBe(1);
  });
});
