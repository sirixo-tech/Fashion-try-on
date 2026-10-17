import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSelfxId } from "@selfx/database";
import { CreditLedgerChannel, Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";
import { TryOnSessionService } from "../try-on/try-on-session.service.js";
import { KioskTryOnService } from "../kiosks/kiosk-try-on.service.js";
import type { TryOnExecutionService } from "../try-on/try-on-execution.service.js";
import type { CreateKioskTryOnRunPayload } from "../kiosks/kiosk-try-on.multipart.js";
import { EntitlementsService } from "./entitlements.service.js";
import { PricingControlService } from "./pricing-control.service.js";
import {
  ensurePostpaidCycle,
  getPostpaidSummary,
  prepareRunBilling,
  recordSuccessfulGeneration,
} from "./postpaid-billing.js";

const url = process.env.POSTPAID_TEST_DATABASE_URL;
if (
  url &&
  (!["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test"))
) {
  throw new Error("A disposable local test database is required.");
}

describe.skipIf(!url)("PAYG-1 real PostgreSQL billing", () => {
  const db = new PrismaService({
    datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
  });
  const entitlements = new EntitlementsService(db);
  const pricing = new PricingControlService(db);
  const sessions = new TryOnSessionService(db);
  const stores: string[] = [];
  const plans: string[] = [];
  const actors: string[] = [];
  beforeAll(() => db.$connect());
  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { actorUserId: { in: actors } } });
    await db.billableGeneration.deleteMany({
      where: { organizationId: { in: stores } },
    });
    await db.usageEvent.deleteMany({
      where: { organizationId: { in: stores } },
    });
    await db.kioskTryOnRun.deleteMany({
      where: { organizationId: { in: stores } },
    });
    await db.tryOnSession.deleteMany({
      where: { organizationId: { in: stores } },
    });
    await db.kioskDevice.deleteMany({
      where: { organizationId: { in: stores } },
    });
    await db.storeBillingCycle.deleteMany({
      where: { organizationId: { in: stores } },
    });
    await db.creditLedgerEntry.deleteMany({
      where: { organizationId: { in: stores } },
    });
    await db.storeSubscription.deleteMany({
      where: { organizationId: { in: stores } },
    });
    await db.organization.deleteMany({ where: { id: { in: stores } } });
    await db.pricingPlanRate.deleteMany({
      where: { pricingPlanId: { in: plans } },
    });
    await db.pricingPlan.deleteMany({ where: { id: { in: plans } } });
    await db.user.deleteMany({ where: { id: { in: actors } } });
    await db.$disconnect();
  });

  async function plan(price = 75) {
    const result = await pricing.createPlan({
      code: `payg-${createSelfxId()}`,
      name: "Postpaid test",
      channels: ["KIOSK", "PUBLIC_API", "SHOPIFY"],
      currency: "INR",
      billingMode: "POSTPAID_PAYG",
      creditUnitPriceCents: price,
      monthlyPriceCents: 0,
      includedCredits: 0,
      trialCredits: 0,
    });
    plans.push(result.id);
    return result;
  }
  async function store() {
    const id = createSelfxId();
    stores.push(id);
    await db.organization.create({
      data: { id, slug: id, name: "Billing fixture", status: "ACTIVE" },
    });
    return id;
  }
  async function run(
    organizationId: string,
    fields: Partial<Prisma.KioskTryOnRunUncheckedCreateInput> = {},
  ) {
    return db.kioskTryOnRun.create({
      data: {
        id: createSelfxId(),
        organizationId,
        assignmentScope: "ORGANIZATION",
        clientRequestId: createSelfxId(),
        status: "COMPLETED",
        completedAt: new Date(),
        provider: "fixture",
        providerDisplayName: "Fixture",
        providerModel: "fixture",
        garmentSource: "DIRECT_UPLOAD",
        garmentIntent: "TOP",
        garmentCategory: "TOP",
        garmentPhotoType: "PRODUCT",
        generationProfile: "BALANCED",
        expiresAt: new Date(Date.now() + 60_000),
        ...fields,
      },
    });
  }
  async function prepare(
    organizationId: string,
    channel: CreditLedgerChannel = "KIOSK",
  ) {
    return prepareRunBilling(db, {
      organizationId,
      assignmentScope: "ORGANIZATION",
      channel,
    });
  }

  it("creates a postpaid Store without granting or requiring advance credits; active/channel gates still apply", async () => {
    const id = await store(),
      payg = await plan();
    const summary = await entitlements.activatePlanForStore({
      organizationId: id,
      pricingPlanId: payg.id,
    });
    expect(summary.availableCredits).toBe(0);
    expect(summary.postpaid).toMatchObject({
      billableCredits: 0,
      creditUnitPriceCents: 75,
      estimatedAmountCents: "0",
      timezone: "UTC",
    });
    expect(
      await db.creditLedgerEntry.count({ where: { organizationId: id } }),
    ).toBe(0);
    await expect(
      entitlements.assertCanGenerateTryOn({ organizationId: id }),
    ).resolves.toEqual({ availableCredits: 0 });
    const admission = await entitlements.consumeTryOnCredit({
      organizationId: id,
      channel: "SHOPIFY",
      idempotencyKey: `fixture:${id}`,
    });
    expect(admission.entry).toBeNull();
    expect(admission.billingCycleId).toBeTruthy();
    await expect(prepare(id, "WOOCOMMERCE")).rejects.toMatchObject({
      status: 402,
    });
    await expect(
      entitlements.topUpStoreCredits({ organizationId: id, quantity: 10 }),
    ).rejects.toMatchObject({ status: 409 });
    await db.storeSubscription.update({
      where: { organizationId: id },
      data: { status: "PAST_DUE" },
    });
    await expect(prepare(id)).rejects.toMatchObject({ status: 402 });
  });

  it("bills only a saved result, once across callbacks/retries, and keeps usage after run/image cleanup", async () => {
    const id = await store(),
      payg = await plan();
    await entitlements.activatePlanForStore({
      organizationId: id,
      pricingPlanId: payg.id,
    });
    const session = await sessions.createSession({
      assignmentScope: "ORGANIZATION",
      organizationId: id,
      storeId: null,
    });
    const person = await sessions.attachPersonAsset({
      sessionId: session.id,
      organizationId: id,
      storageKey: "fixture/person.jpg",
    });
    const queued = await run(id, {
      ...(await prepare(id, "PUBLIC_API")),
      status: "QUEUED",
      completedAt: null,
      tryOnSessionId: session.id,
      personAssetId: person.id,
    });
    const input = {
      sessionId: session.id,
      organizationId: id,
      kioskTryOnRunId: queued.id,
      personAssetId: person.id,
      resultAsset: { storageKey: "fixture/result.jpg" },
    };
    await expect(sessions.recordLook(input)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      (await entitlements.getStoreCreditSummary(id)).postpaid?.billableCredits,
    ).toBe(0);
    const completed = await db.kioskTryOnRun.update({
      where: { id: queued.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await sessions.recordLook(input);
    await sessions.recordLook(input);
    await Promise.all(
      Array.from({ length: 8 }, () =>
        db.$transaction((tx) => recordSuccessfulGeneration(tx, completed)),
      ),
    );
    const failed = await run(id, { ...(await prepare(id)), status: "FAILED" });
    await db.$transaction((tx) => recordSuccessfulGeneration(tx, failed));
    expect(
      (await entitlements.getStoreCreditSummary(id)).postpaid,
    ).toMatchObject({ billableCredits: 1, estimatedAmountCents: "75" });
    const row = await db.billableGeneration.findUniqueOrThrow({
      where: { runId: completed.id },
    });
    expect(row.channel).toBe("PUBLIC_API");
    await db.kioskTryOnRun.delete({ where: { id: completed.id } });
    await db.tryOnSession.delete({ where: { id: session.id } });
    expect(
      (await entitlements.getStoreCreditSummary(id)).postpaid?.billableCredits,
    ).toBe(1);
  });

  it("rolls back the result and financial row together when result persistence fails", async () => {
    const id = await store(),
      payg = await plan();
    await entitlements.activatePlanForStore({
      organizationId: id,
      pricingPlanId: payg.id,
    });
    const completed = await run(id, await prepare(id));
    await expect(
      db.$transaction(async (tx) => {
        await recordSuccessfulGeneration(tx, completed);
        throw new Error("simulated result commit failure");
      }),
    ).rejects.toThrow("simulated result commit failure");
    expect(
      await db.billableGeneration.count({ where: { organizationId: id } }),
    ).toBe(0);
  });

  it.each(["GARMENT", "JEWELLERY"] as const)(
    "meters the real %s kiosk callback path without charging processing, failures or duplicate completions",
    async (vertical) => {
      const id = await store(),
        payg = await plan(30);
      await entitlements.activatePlanForStore({
        organizationId: id,
        pricingPlanId: payg.id,
      });
      const device = await db.kioskDevice.create({
        data: {
          id: createSelfxId(),
          displayName: "Fixture",
          organizationId: id,
          assignmentScope: "ORGANIZATION",
        },
      });
      const observers: Array<Parameters<TryOnExecutionService["process"]>[1]> =
        [];
      const metadata = {
        provider: "fixture",
        providerDisplayName: "Fixture",
        model: "fixture",
      };
      const execution = {
        metadata: () => metadata,
        assertConfigured: () => undefined,
        process: vi.fn(
          async (
            _payload: unknown,
            observer: Parameters<TryOnExecutionService["process"]>[1],
          ) => {
            observers.push(observer);
          },
        ),
      };
      const foundation = {
        prepareRunFoundation: async () => ({
          jewelleryType: "RING",
          provider: metadata,
        }),
      };
      const service = new KioskTryOnService(
        db,
        execution as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        foundation as never,
        execution as never,
      );
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      );
      const image = {
        filename: "fixture.png",
        buffer: png,
        dataUri: `data:image/png;base64,${png.toString("base64")}`,
        mimeType: "image/png" as const,
        sizeBytes: png.length,
        width: 1,
        height: 1,
      };
      const payload: CreateKioskTryOnRunPayload = {
        clientRequestId: createSelfxId(),
        tryOnVertical: vertical,
        personImage: { ...image, fieldName: "personImage" },
        garmentImage: { ...image, fieldName: "garmentImage" },
        jewelleryImage: { ...image, fieldName: "jewelleryImage" },
        jewelleryType: "RING",
        garmentSource: "DIRECT_UPLOAD",
        garmentIntent: "TOP",
        category: "TOP",
        garmentPhotoType: "FLAT_LAY",
        generationProfile: "BALANCED",
        categoryResolutionSource: "AUTO_FALLBACK",
        photoTypeResolutionSource: "AUTO_FALLBACK",
        profileResolutionSource: "PLATFORM_DEFAULT",
        disambiguationRequired: false,
        disambiguationResolved: false,
        garmentAnalysisReasonCodes: [],
        qualityWarningCodes: [],
        qualityOverrideAccepted: false,
      };
      const created = await service.createRun(device, payload);
      expect(
        (
          await db.kioskTryOnRun.findUniqueOrThrow({
            where: { id: created.id },
          })
        ).billingCycleId,
      ).toBeTruthy();
      await observers[0]!.onStatus({ status: "PROCESSING" });
      expect(
        (await entitlements.getStoreCreditSummary(id)).postpaid
          ?.billableCredits,
      ).toBe(0);
      await observers[0]!.onStatus({
        status: "COMPLETED",
        resultImage: image.dataUri,
        completedAt: new Date(),
      });
      await observers[0]!.onStatus({
        status: "COMPLETED",
        resultImage: image.dataUri,
        completedAt: new Date(),
      });
      await service.createRun(device, {
        ...payload,
        clientRequestId: createSelfxId(),
      });
      await observers[1]!.onStatus({
        status: "FAILED",
        completedAt: new Date(),
      });
      await service.createRun(device, {
        ...payload,
        clientRequestId: createSelfxId(),
      });
      await observers[2]!.onTimedOut(new Date());
      expect(
        (await entitlements.getStoreCreditSummary(id)).postpaid,
      ).toMatchObject({ billableCredits: 1, estimatedAmountCents: "30" });
    },
  );

  it("imports current-cycle verified successes, excludes prepaid/old/failed/other-Store usage, and deduplicates retained runs plus events", async () => {
    const id = await store(),
      other = await store(),
      payg = await plan(120);
    await entitlements.ensureTrialCredits(id);
    const now = new Date(),
      anchor = new Date(now);
    anchor.setUTCDate(1);
    const inCycle = new Date(anchor.getTime() + 1000);
    await db.storeSubscription.update({
      where: { organizationId: id },
      data: { trialStartedAt: anchor, createdAt: anchor },
    });
    const unpaid = await run(id, {
      resultImage: "data:image/png;base64,verified-fixture",
      completedAt: inCycle,
    });
    const paid = await run(id, {
      resultImage: "data:image/png;base64,verified-fixture",
      completedAt: inCycle,
    });
    const shopifySession = await sessions.createSession({
      assignmentScope: "ORGANIZATION",
      organizationId: id,
      storeId: null,
    });
    const shopifyPerson = await sessions.attachPersonAsset({
      sessionId: shopifySession.id,
      organizationId: id,
      storageKey: "fixture/shopify-person.jpg",
    });
    const paidShopify = await run(id, {
      tryOnSessionId: shopifySession.id,
      personAssetId: shopifyPerson.id,
      catalogSource: "SHOPIFY",
      completedAt: inCycle,
    });
    await db.creditLedgerEntry.createMany({
      data: [paid, paidShopify].map((item) => ({
        id: createSelfxId(),
        organizationId: id,
        entryType: "CREDIT_CONSUMED",
        quantity: -1,
        channel: "SHOPIFY",
        kioskTryOnRunId: item.id === paid.id ? item.id : null,
        idempotencyKey:
          item.id === paid.id
            ? `covered:${item.id}`
            : `tryon:shopify:${item.tryOnSessionId}:${item.clientRequestId}`,
      })),
    });
    await sessions.recordLook({
      sessionId: shopifySession.id,
      organizationId: id,
      kioskTryOnRunId: paidShopify.id,
      personAssetId: shopifyPerson.id,
      resultAsset: { storageKey: "fixture/shopify-result.jpg" },
    });
    await run(id, {
      resultImage: "data:image/png;base64,old",
      completedAt: new Date(anchor.getTime() - 1000),
    });
    await run(id, {
      resultImage: "data:image/png;base64,failed",
      completedAt: inCycle,
      status: "FAILED",
    });
    await run(id, { completedAt: inCycle, resultImage: null });
    await run(other, {
      resultImage: "data:image/png;base64,other",
      completedAt: inCycle,
    });
    const deletedRunId = createSelfxId();
    await db.usageEvent.createMany({
      data: [unpaid.id, deletedRunId].map((runId) => ({
        id: createSelfxId(),
        organizationId: id,
        assignmentScope: "ORGANIZATION",
        channel: "KIOSK",
        eventName: "KIOSK_TRY_ON_GENERATED",
        idempotencyKey: `event:${runId}`,
        kioskTryOnRunId: runId,
        status: "COMPLETED",
        occurredAt: inCycle,
      })),
    });
    const first = await entitlements.activatePlanForStore({
      organizationId: id,
      pricingPlanId: payg.id,
    });
    expect(first.postpaid).toMatchObject({
      billableCredits: 2,
      historicalCredits: 2,
      estimatedAmountCents: "240",
    });
    await entitlements.activatePlanForStore({
      organizationId: id,
      pricingPlanId: payg.id,
    });
    expect(
      (await entitlements.getStoreCreditSummary(id)).postpaid?.billableCredits,
    ).toBe(2);
    expect(
      await db.billableGeneration.count({ where: { organizationId: other } }),
    ).toBe(0);
  });

  it("freezes this cycle's rate and uses historical rate versions for later cycles, including skipped months", async () => {
    const id = await store(),
      payg = await plan(50);
    const anchor = new Date("2026-01-31T10:00:00Z");
    await db.pricingPlanRate.updateMany({
      where: { pricingPlanId: payg.id },
      data: { effectiveAt: anchor },
    });
    await entitlements.activatePlanForStore({
      organizationId: id,
      pricingPlanId: payg.id,
    });
    await db.storeSubscription.update({
      where: { organizationId: id },
      data: { billingAnchorAt: anchor },
    });
    let sub = await db.storeSubscription.findUniqueOrThrow({
      where: { organizationId: id },
      include: { pricingPlan: true },
    });
    const feb = await db.$transaction((tx) =>
      ensurePostpaidCycle(tx, sub, new Date("2026-02-28T10:00:00Z")),
    );
    await pricing.updatePlan(payg.id, { creditUnitPriceCents: 90 });
    const rate = await db.pricingPlanRate.findFirstOrThrow({
      where: { pricingPlanId: payg.id, creditUnitPriceCents: 90 },
    });
    await db.pricingPlanRate.update({
      where: { id: rate.id },
      data: { effectiveAt: new Date("2026-03-15T00:00:00Z") },
    });
    sub = await db.storeSubscription.findUniqueOrThrow({
      where: { organizationId: id },
      include: { pricingPlan: true },
    });
    const march = await db.$transaction((tx) =>
      ensurePostpaidCycle(tx, sub, new Date("2026-03-31T10:00:00Z")),
    );
    const febAgain = await db.$transaction((tx) =>
      ensurePostpaidCycle(tx, sub, new Date("2026-03-01T00:00:00Z")),
    );
    expect(feb.creditUnitPriceCents).toBe(50);
    expect(febAgain.creditUnitPriceCents).toBe(50);
    expect(march.creditUnitPriceCents).toBe(90);
    expect(march.periodEnd.toISOString()).toBe("2026-04-30T10:00:00.000Z");
    await expect(
      pricing.updatePlan(payg.id, { billingMode: "CREDIT_LIMITED" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("keeps admitted terms through plan changes and enforces tenant ownership in the database", async () => {
    const id = await store(),
      other = await store(),
      payg = await plan();
    await entitlements.activatePlanForStore({
      organizationId: id,
      pricingPlanId: payg.id,
    });
    await entitlements.activatePlanForStore({
      organizationId: other,
      pricingPlanId: payg.id,
    });
    const billing = await prepare(id);
    const accepted = await run(id, {
      ...billing,
      status: "PROCESSING",
      completedAt: null,
    });
    const starter = (await pricing.listPlans()).find(
      (item) => item.code === "selfx-default-starter",
    )!;
    await entitlements.activatePlanForStore({
      organizationId: id,
      pricingPlanId: starter.id,
    });
    const completed = await db.kioskTryOnRun.update({
      where: { id: accepted.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await db.$transaction((tx) => recordSuccessfulGeneration(tx, completed));
    expect(
      await db.billableGeneration.findUniqueOrThrow({
        where: { runId: accepted.id },
      }),
    ).toMatchObject({
      coverage: "POSTPAID",
      billingCycleId: billing.billingCycleId,
    });
    await expect(run(other, billing)).rejects.toMatchObject({ code: "P2003" });
    await expect(
      db.billableGeneration.create({
        data: {
          id: createSelfxId(),
          organizationId: other,
          runId: createSelfxId(),
          billingCycleId: billing.billingCycleId,
          coverage: "POSTPAID",
          channel: "KIOSK",
          completedAt: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    const sub = await db.storeSubscription.findUniqueOrThrow({
      where: { organizationId: other },
      include: { pricingPlan: true },
    });
    expect((await getPostpaidSummary(db, sub))?.billableCredits).toBe(0);
    expect(
      await prepareRunBilling(db, {
        organizationId: null,
        assignmentScope: "PLATFORM",
        channel: "KIOSK",
      }),
    ).toEqual({ billingChannel: "KIOSK" });
  });

  it("preserves an existing active cycle anchor and counts an uncharged run that finishes after the switch", async () => {
    const id = await store(),
      payg = await plan(100);
    await entitlements.ensureTrialCredits(id);
    const anchor = new Date();
    anchor.setUTCDate(2);
    anchor.setUTCHours(8, 10, 0, 0);
    await db.storeSubscription.update({
      where: { organizationId: id },
      data: {
        status: "ACTIVE",
        currentPeriodStart: anchor,
        currentPeriodEnd: new Date(anchor.getTime() + 31 * 86400_000),
        trialStartedAt: new Date(anchor.getTime() - 86400_000),
      },
    });
    const processing = await run(id, {
      status: "PROCESSING",
      completedAt: null,
    });
    const summary = await entitlements.activatePlanForStore({
      organizationId: id,
      pricingPlanId: payg.id,
    });
    expect(summary.postpaid?.periodStart).toBe(anchor.toISOString());
    expect(summary.postpaid?.billableCredits).toBe(0);
    const completed = await db.kioskTryOnRun.update({
      where: { id: processing.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await db.$transaction((tx) => recordSuccessfulGeneration(tx, completed));
    expect(
      (await entitlements.getStoreCreditSummary(id)).postpaid,
    ).toMatchObject({ billableCredits: 1, estimatedAmountCents: "100" });
  });

  it("attributes plan pricing and Store assignment to the acting platform user", async () => {
    const actor = createSelfxId();
    actors.push(actor);
    await db.user.create({
      data: {
        id: actor,
        email: `${actor}@billing.invalid`,
        passwordHash: "fixture-not-a-login",
      },
    });
    const id = await store();
    const payg = await pricing.createPlan(
      {
        code: `payg-${createSelfxId()}`,
        name: "Audited postpaid",
        channels: ["KIOSK"],
        currency: "INR",
        billingMode: "POSTPAID_PAYG",
        creditUnitPriceCents: 50,
        monthlyPriceCents: 0,
        includedCredits: 0,
        trialCredits: 0,
      },
      actor,
    );
    plans.push(payg.id);
    await entitlements.activatePlanForStore({
      organizationId: id,
      pricingPlanId: payg.id,
      actorUserId: actor,
    });
    await pricing.updatePlan(payg.id, { creditUnitPriceCents: 75 }, actor);
    const events = await db.auditLog.findMany({
      where: { actorUserId: actor },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => event.action)).toEqual([
      "PRICING_PLAN_CREATED",
      "STORE_PLAN_ASSIGNED",
      "PRICING_PLAN_UPDATED",
    ]);
    expect(events[1]?.organizationId).toBe(id);
    expect(events[1]?.metadata).toMatchObject({
      postpaid: { estimatedAmountCents: "0", creditUnitPriceCents: 50 },
    });
    expect(
      (await entitlements.getStoreCreditSummary(id)).postpaid
        ?.creditUnitPriceCents,
    ).toBe(50);
  });

  it("rejects invalid plan terms through both API service and database constraints", async () => {
    const payg = await plan();
    await expect(
      pricing.updatePlan(payg.id, { creditUnitPriceCents: null }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      pricing.updatePlan(payg.id, { includedCredits: 10 }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      db.pricingPlan.update({
        where: { id: payg.id },
        data: { creditUnitPriceCents: null },
      }),
    ).rejects.toBeTruthy();
    await expect(
      db.pricingPlan.update({
        where: { id: payg.id },
        data: { monthlyPriceCents: 10 },
      }),
    ).rejects.toBeTruthy();
  });
});
