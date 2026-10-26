import "reflect-metadata";
import { randomUUID } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { TryOnSessionService } from "../try-on/try-on-session.service.js";
import {
  TryOnExecutionService,
  type TryOnExecutionObserver,
} from "../try-on/try-on-execution.service.js";
import { CatalogService } from "../catalog/catalog.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { DEFAULT_STARTER_PLAN_CODE } from "../entitlements/default-trial.js";
import {
  CustomerExperienceService,
  CUSTOMER_PHOTO_CONSENT_VERSION,
  parseStoreQr,
  personalTrialBalance,
} from "./customer-experience.service.js";
import { StorePurgeService } from "../stores/store-purge.service.js";
import type { Prisma } from "@prisma/client";
import { CustomerMetricsService } from "./customer-metrics.service.js";

const url = process.env.CUSTOMER_MOBILE_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/customer_mobile_test")
)
  throw new Error(
    "Use only the disposable localhost customer_mobile_test database.",
  );
const DAY = 86400000;
describe("Customer trial input contracts", () => {
  it("does not count reserved credits as available", () => {
    expect(
      personalTrialBalance({
        trialCredits: 10,
        usedCredits: 2,
        reservedCredits: 3,
      }),
    ).toEqual({ granted: 10, used: 2, reserved: 3, remaining: 5 });
  });
  it("accepts only SelfX Store QR payloads", () => {
    const token = "a".repeat(43);
    expect(parseStoreQr(`selfx://store?token=${token}`)).toBe(token);
    for (const bad of [
      "https://attacker.invalid/",
      "short",
      `selfx://other?token=${token}`,
      `selfx://store/extra?token=${token}`,
      `selfx://store?token=${token}#other`,
    ])
      expect(() => parseStoreQr(bad)).toThrow();
  });
});

describe.skipIf(!url)(
  "Customer mobile: disposable PostgreSQL, simulated provider and private storage",
  () => {
    const db = new PrismaClient({
      datasourceUrl:
        url ?? "postgresql://unused@localhost/customer_mobile_test",
    });
    const objects = new Map<string, Buffer>();
    const storage = {
      putObject: vi.fn(async (input: { key: string; body: Buffer }) => {
        objects.set(input.key, input.body);
      }),
      readObject: vi.fn(async (key: string) => {
        const data = objects.get(key);
        if (!data) throw new Error("Object not found");
        return data;
      }),
      deleteObject: vi.fn(async (key: string) => {
        objects.delete(key);
      }),
      createReadUrl: vi.fn(
        (input: { key: string; expiresInSeconds: number }) =>
          `https://private.invalid/${input.key}?ttl=${input.expiresInSeconds}`,
      ),
    };
    const observers: TryOnExecutionObserver[] = [];
    const execution = {
      assertConfigured: vi.fn(),
      metadata: () => ({
        provider: "simulated",
        providerDisplayName: "SelfX test provider",
        model: "simulated",
      }),
      process: vi.fn<TryOnExecutionService["process"]>(async (_, observer) => {
        observers.push(observer);
        await observer.onStarted(new Date());
        await observer.onSubmitted("private-prediction-id");
      }),
    };
    const catalog = {
      resolveKioskProductForTryOn: vi.fn(),
      listKioskProducts: vi.fn(),
    };
    let service: CustomerExperienceService,
      sessions: TryOnSessionService,
      entitlements: EntitlementsService;
    let photo: Buffer,
      customer: { id: string; securityVersion: number },
      other: { id: string; securityVersion: number };
    async function newCustomer() {
      return db.customer.create({
        data: {
          id: randomUUID(),
          displayName: "Synthetic customer",
          status: "ACTIVE",
          termsVersion: "test",
          termsAcceptedAt: new Date(),
        },
      });
    }
    async function inputs(owner = customer, storeVisitId?: string) {
      const session = await service.createSession(owner, {
        consentAccepted: true,
        consentVersion: CUSTOMER_PHOTO_CONSENT_VERSION,
        storeVisitId,
      });
      const person = await service.upload(
        owner,
        session.id,
        "PERSON",
        photo,
        "image/png",
      );
      const garment = storeVisitId
        ? null
        : await service.upload(
            owner,
            session.id,
            "GARMENT",
            photo,
            "image/png",
          );
      return {
        sessionId: session.id,
        clientRequestId: randomUUID(),
        personAssetId: person!.id,
        ...(garment ? { garmentAssetId: garment.id } : {}),
      };
    }
    async function complete(index = 0) {
      await vi.waitFor(() => expect(observers[index]).toBeDefined());
      await observers[index]!.onStatus({
        status: "COMPLETED",
        resultImage: `data:image/png;base64,${photo.toString("base64")}`,
      });
    }
    async function storeVisit(limit = 5) {
      const store = await db.organization.create({
        data: {
          id: randomUUID(),
          name: "Synthetic Store",
          slug: randomUUID(),
          status: "ACTIVE",
        },
      });
      await entitlements.ensureTrialCredits(store.id);
      const qr = await service.createQr(
        store.id,
        randomUUID(),
        "Store code",
        limit,
      );
      const visit = await service.joinStore(customer.id, qr.payload);
      return { store, qr, visit };
    }
    async function storeProduct(storeId: string) {
      const category = await db.productCategory.create({
        data: {
          id: randomUUID(),
          catalogKey: randomUUID(),
          scope: "STORE",
          organizationId: storeId,
          name: "Tops",
          slug: "tops",
        },
      });
      const product = await db.product.create({
        data: {
          id: randomUUID(),
          catalogKey: randomUUID(),
          scope: "STORE",
          organizationId: storeId,
          categoryId: category.id,
          name: "Synthetic shirt",
          slug: "shirt",
          audience: "ADULT",
          garmentIntent: "TOP",
          garmentCategory: "TOP",
          garmentPhotoType: "FLAT_LAY",
          vtoEnabled: true,
          imageUrl: "https://private.invalid/synthetic.png",
        },
      });
      catalog.resolveKioskProductForTryOn.mockResolvedValue({
        ...product,
        garmentImage: { buffer: photo, mimeType: "image/png" },
      });
      return product;
    }
    beforeAll(async () => {
      await db.$connect();
      photo = await sharp({
        create: {
          width: 768,
          height: 1024,
          channels: 3,
          background: "#d8d2ca",
        },
      })
        .png()
        .toBuffer();
    });
    beforeEach(async () => {
      await db.$executeRawUnsafe(
        "TRUNCATE TABLE customers, organizations, pricing_plans CASCADE",
      );
      objects.clear();
      observers.length = 0;
      execution.process.mockClear();
      storage.deleteObject.mockClear();
      storage.deleteObject.mockImplementation(async (key) => {
        objects.delete(key);
      });
      await db.pricingPlan.create({
        data: {
          id: randomUUID(),
          code: DEFAULT_STARTER_PLAN_CODE,
          name: "Starter",
          channels: ["MOBILE", "KIOSK"],
          trialCredits: 3,
        },
      });
      customer = await newCustomer();
      other = await newCustomer();
      sessions = new TryOnSessionService(
        db as PrismaService,
        storage as unknown as ObjectStorageService,
      );
      entitlements = new EntitlementsService(db as PrismaService);
      service = new CustomerExperienceService(
        db as PrismaService,
        sessions,
        execution as unknown as TryOnExecutionService,
        storage as unknown as ObjectStorageService,
        entitlements,
        catalog as unknown as CatalogService,
      );
      vi.spyOn(service, "available").mockResolvedValue(true);
    });
    afterAll(async () => {
      service?.onModuleDestroy();
      await db.$disconnect();
    });
    it("grants the configured free trial once, without creating a merchant Store", async () => {
      const initial = await service.summary(customer);
      expect(initial.trial.remaining).toBe(3);
      await db.pricingPlan.update({
        where: { code: DEFAULT_STARTER_PLAN_CODE },
        data: { trialCredits: 20 },
      });
      expect((await service.summary(customer)).trial.granted).toBe(3);
      expect((await service.summary(other)).trial.granted).toBe(20);
      expect(await db.organization.count()).toBe(0);
    });
    it("records the presentation language and exact translated photo consent durably", async () => {
      await service.createSession(customer, {
        consentAccepted: true,
        consentVersion: CUSTOMER_PHOTO_CONSENT_VERSION,
        consentLanguage: "ar",
      });
      const consent = await db.customerPhotoConsent.findFirstOrThrow({
        where: { customerId: customer.id },
      });
      expect(consent.statement).toContain("Presentation language: ar");
      expect(consent.statement).toContain("Translation version: 2026-10-27");
      expect(consent.statement).toContain("SelfX");
      expect(consent.statement).toMatch(/[\u0600-\u06ff]/);
      expect(consent.inputRetentionDays).toBe(7);
      expect(consent.resultRetentionDays).toBe(30);
    });
    it("requires durable current consent before upload and fences other accounts and legacy access", async () => {
      await expect(
        service.createSession(customer, {
          consentAccepted: false,
          consentVersion: CUSTOMER_PHOTO_CONSENT_VERSION,
        }),
      ).rejects.toThrow();
      const input = await inputs();
      expect(
        await db.customerPhotoConsent.count({
          where: { customerId: customer.id },
        }),
      ).toBe(1);
      await expect(
        service.getAsset(other.id, input.personAssetId),
      ).rejects.toThrow();
      await expect(
        service.upload(other, input.sessionId, "PERSON", photo, "image/png"),
      ).rejects.toThrow();
      await expect(
        sessions.getSessionLooks({ sessionId: input.sessionId }),
      ).rejects.toThrow();
      await expect(
        db.tryOnSession.update({
          where: { id: input.sessionId },
          data: { customerId: other.id },
        }),
      ).rejects.toThrow();
    });
    it("reserves once across simultaneous retries and releases a failed run once", async () => {
      const input = await inputs();
      const [a, b] = await Promise.all([
        service.createRun(customer, input),
        service.createRun(customer, input),
      ]);
      expect(a.id).toBe(b.id);
      expect(execution.process).toHaveBeenCalledTimes(1);
      expect((await service.summary(customer)).trial).toMatchObject({
        used: 0,
        reserved: 1,
        remaining: 2,
      });
      await expect(
        service.createRun(customer, { ...input, personAssetId: randomUUID() }),
      ).rejects.toThrow();
      await Promise.all([
        service.failRun(a.id, "TEST_FAILURE"),
        service.failRun(a.id, "TEST_FAILURE"),
      ]);
      expect((await service.summary(customer)).trial).toMatchObject({
        used: 0,
        reserved: 0,
        remaining: 3,
      });
    });
    it("admits only one simultaneous run and does not overspend the final credit", async () => {
      const input = await inputs();
      await service.summary(customer);
      await db.customerCreditAccount.update({
        where: { customerId: customer.id },
        data: { usedCredits: 2 },
      });
      const results = await Promise.allSettled([
        service.createRun(customer, input),
        service.createRun(customer, {
          ...input,
          clientRequestId: randomUUID(),
        }),
      ]);
      expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(
        1,
      );
      expect((await service.summary(customer)).trial).toMatchObject({
        remaining: 0,
        reserved: 1,
      });
    });
    it("saves a result for 30 days, charges one credit, and never resets usage on deletion", async () => {
      const input = await inputs(),
        run = await service.createRun(customer, input);
      await complete();
      await complete(); // A repeated provider completion cannot debit again.
      const summary = await service.summary(customer),
        saved = await service.saved(customer.id);
      expect(summary.trial).toMatchObject({
        used: 1,
        reserved: 0,
        remaining: 2,
      });
      expect(saved.data).toHaveLength(1);
      const result = saved.data[0]!;
      expect(new Date(result.expiresAt).getTime() - Date.now()).toBeGreaterThan(
        29 * DAY,
      );
      expect(
        new Date(result.person!.expiresAt).getTime() - Date.now(),
      ).toBeLessThanOrEqual(7 * DAY);
      expect(
        JSON.stringify(await service.getRun(customer.id, run.id)),
      ).not.toMatch(/private-prediction|providerPrediction|storageKey|base64/);
      expect(
        (await service.downloadResult(customer.id, result.result!.id)).body,
      ).toEqual(photo);
      await expect(
        service.downloadResult(other.id, result.result!.id),
      ).rejects.toThrow();
      await service.deleteLook(customer.id, result.id);
      expect((await service.saved(customer.id)).data).toHaveLength(0);
      expect((await service.summary(customer)).trial.used).toBe(1);
      await expect(
        service.getAsset(customer.id, result.result!.id),
      ).rejects.toThrow();
    });
    it("blocks exhausted and invalid-account trials on the server", async () => {
      const input = await inputs();
      await service.summary(customer);
      await db.customerCreditAccount.update({
        where: { customerId: customer.id },
        data: { usedCredits: 3 },
      });
      await expect(service.createRun(customer, input)).rejects.toThrow();
      expect(execution.process).not.toHaveBeenCalled();
      await db.customer.update({
        where: { id: customer.id },
        data: { status: "SUSPENDED" },
      });
      await expect(service.summary(customer)).rejects.toThrow();
    });
    it("cancels in-flight work and revokes photo access when all photos are deleted", async () => {
      const input = await inputs(),
        run = await service.createRun(customer, input);
      await service.eraseCustomerPhotos(customer.id);
      expect((await service.summary(customer)).trial).toMatchObject({
        reserved: 0,
        used: 0,
      });
      await complete();
      expect((await service.getRun(customer.id, run.id)).status).toBe("FAILED");
      await expect(
        service.getAsset(customer.id, input.personAssetId),
      ).rejects.toThrow();
      expect((await service.saved(customer.id)).data).toHaveLength(0);
      expect(objects.size).toBe(0);
    });
    it("retries physical expiry cleanup without restoring spent credits", async () => {
      const input = await inputs();
      await service.createRun(customer, input);
      await complete();
      const look = (await service.saved(customer.id)).data[0]!;
      await db.tryOnAsset.update({
        where: { id: look.result!.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      storage.deleteObject.mockRejectedValueOnce(
        new Error("Temporary storage outage"),
      );
      await service.cleanup();
      expect(
        (
          await db.tryOnAsset.findUniqueOrThrow({
            where: { id: look.result!.id },
          })
        ).storageDeletedAt,
      ).toBeNull();
      await service.cleanup();
      expect(
        (
          await db.tryOnAsset.findUniqueOrThrow({
            where: { id: look.result!.id },
          })
        ).storageDeletedAt,
      ).not.toBeNull();
      expect((await service.summary(customer)).trial.used).toBe(1);
    });
    it("recovers stale reservations after a server restart", async () => {
      const input = await inputs(),
        run = await service.createRun(customer, input);
      await db.kioskTryOnRun.update({
        where: { id: run.id },
        data: { createdAt: new Date(Date.now() - 13 * 60000) },
      });
      await service.cleanup();
      expect((await service.summary(customer)).trial).toMatchObject({
        reserved: 0,
        used: 0,
        remaining: 3,
      });
    });
    it("hashes QR tokens and enforces revocation and Store status", async () => {
      const { store, qr, visit } = await storeVisit();
      const stored = await db.customerStoreQr.findUniqueOrThrow({
        where: { id: qr.id },
      });
      expect(stored.tokenHash).not.toContain(parseStoreQr(qr.payload));
      expect(JSON.stringify(await service.listQrs(store.id))).not.toMatch(
        /tokenHash|payload|selfx:\/\//,
      );
      await expect(service.storeProducts(other.id, visit.id)).rejects.toThrow();
      await service.revokeQr(store.id, qr.id, randomUUID());
      await expect(
        service.joinStore(customer.id, qr.payload),
      ).rejects.toThrow();
      await expect(
        service.storeProducts(customer.id, visit.id),
      ).rejects.toThrow();
    });
    it("never allows arbitrary personal outfits or a different Store product to bill a Store", async () => {
      const { visit } = await storeVisit();
      const input = await inputs(customer, visit.id);
      await expect(
        service.upload(
          customer,
          input.sessionId,
          "GARMENT",
          photo,
          "image/png",
        ),
      ).rejects.toThrow();
      await expect(
        service.createRun(customer, { ...input, garmentAssetId: randomUUID() }),
      ).rejects.toThrow();
      catalog.resolveKioskProductForTryOn.mockRejectedValueOnce(
        new Error("Product not eligible for this Store"),
      );
      await expect(
        service.createRun(customer, { ...input, productId: randomUUID() }),
      ).rejects.toThrow();
      expect((await service.summary(customer)).trial).toMatchObject({
        used: 0,
        reserved: 0,
        remaining: 3,
      });
    });
    it("charges the Store only and refunds a failed Store generation exactly once", async () => {
      const { store, visit } = await storeVisit(),
        product = await storeProduct(store.id);
      const before = (await entitlements.getCreditBalance(store.id))
        .availableCredits;
      const input = await inputs(customer, visit.id);
      const run = await service.createRun(customer, {
        ...input,
        productId: product.id,
      });
      expect(run.payer).toBe("STORE");
      expect(
        (await entitlements.getCreditBalance(store.id)).availableCredits,
      ).toBe(before - 1);
      expect((await service.summary(customer)).trial).toMatchObject({
        used: 0,
        reserved: 0,
        remaining: 3,
      });
      await Promise.all([
        service.failRun(run.id, "TEST"),
        service.failRun(run.id, "TEST"),
      ]);
      expect(
        (await entitlements.getCreditBalance(store.id)).availableCredits,
      ).toBe(before);
      expect(
        await db.creditLedgerEntry.count({
          where: { kioskTryOnRunId: run.id, entryType: "CREDIT_REFUNDED" },
        }),
      ).toBe(1);
    });
    it("keeps the daily Store limit across QR rescans and never falls back to personal credits", async () => {
      const { store, qr, visit } = await storeVisit(1),
        product = await storeProduct(store.id);
      const input = await inputs(customer, visit.id);
      const run = await service.createRun(customer, {
        ...input,
        productId: product.id,
      });
      await complete();
      expect(
        await db.billableGeneration.count({
          where: { runId: run.id, channel: "MOBILE", coverage: "PREPAID" },
        }),
      ).toBe(1);
      const again = await service.joinStore(customer.id, qr.payload);
      const next = await inputs(customer, again.id);
      await expect(
        service.createRun(customer, { ...next, productId: product.id }),
      ).rejects.toThrow();
      expect(execution.process).toHaveBeenCalledTimes(1);
      expect((await service.summary(customer)).trial.remaining).toBe(3);
    });
    it("rejects Store QR generation when the Store plan omits this channel", async () => {
      const { store, visit } = await storeVisit(),
        product = await storeProduct(store.id);
      await db.storeSubscription.update({
        where: { organizationId: store.id },
        data: { channels: ["KIOSK"] },
      });
      const input = await inputs(customer, visit.id);
      await expect(
        service.createRun(customer, { ...input, productId: product.id }),
      ).rejects.toThrow();
      expect(execution.process).not.toHaveBeenCalled();
      expect((await service.summary(customer)).trial).toMatchObject({
        reserved: 0,
        used: 0,
        remaining: 3,
      });
    });
    it("counts successful Store postpaid results through the shared billing cycle", async () => {
      const { store, visit } = await storeVisit(),
        product = await storeProduct(store.id);
      const plan = await db.pricingPlan.create({
        data: {
          id: randomUUID(),
          code: randomUUID(),
          name: "Test postpaid",
          channels: ["MOBILE"],
          billingMode: "POSTPAID_PAYG",
          trialCredits: 0,
          creditUnitPriceCents: 25,
        },
      });
      await db.storeSubscription.update({
        where: { organizationId: store.id },
        data: {
          status: "ACTIVE",
          pricingPlanId: plan.id,
          channels: ["MOBILE"],
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * DAY),
        },
      });
      const input = await inputs(customer, visit.id),
        run = await service.createRun(customer, {
          ...input,
          productId: product.id,
        });
      await complete();
      expect(
        await db.billableGeneration.count({
          where: {
            runId: run.id,
            channel: "MOBILE",
            coverage: "POSTPAID",
            billingCycleId: { not: null },
          },
        }),
      ).toBe(1);
      expect((await service.summary(customer)).trial.used).toBe(0);
    });
    it("reports real mobile activity and trial counters without exposing customer data", async () => {
      const input = await inputs();
      await service.createRun(customer, input);
      await complete();
      const failed = await service.createRun(customer, {
        ...input,
        clientRequestId: randomUUID(),
      });
      await service.failRun(failed.id, "TEST_FAILURE");
      vi.stubEnv("SELFX_CUSTOMER_AUTH_ENABLED", "true");
      try {
        const metrics = await new CustomerMetricsService(
          db as PrismaService,
        ).summary({ range: "7d" });
        expect(metrics.experience).toMatchObject({
          attempts: 2,
          completed: 1,
          failed: 1,
          personalCompleted: 1,
          storeCompleted: 0,
          trialGranted: 3,
          trialUsed: 1,
          trialReserved: 0,
        });
        expect(metrics.unavailable).toEqual(["personalBilling"]);
        expect(JSON.stringify(metrics)).not.toMatch(
          /Synthetic customer|private-prediction|tokenHash|passwordHash/,
        );
      } finally {
        vi.unstubAllEnvs();
      }
    });
    it("preserves durable customer consent and the personal wallet when a Store is purged", async () => {
      const { store, visit } = await storeVisit(),
        product = await storeProduct(store.id);
      const input = await inputs(customer, visit.id);
      await service.createRun(customer, { ...input, productId: product.id });
      await complete();
      await service.summary(customer);
      const purge = new StorePurgeService(
        db as PrismaService,
        storage as unknown as ObjectStorageService,
      ) as unknown as {
        deleteResources(
          tx: Prisma.TransactionClient,
          storeId: string,
          deviceIds: string[],
        ): Promise<unknown>;
      };
      await db.$transaction(
        async (tx) => {
          await purge.deleteResources(tx, store.id, []);
          await tx.organization.delete({ where: { id: store.id } });
        },
        { timeout: 30000 },
      );
      const consent = await db.customerPhotoConsent.findFirstOrThrow({
        where: { customerId: customer.id },
      });
      expect(consent.sponsoringStoreId).toBe(store.id);
      expect(consent.storeVisitId).toBeNull();
      expect(consent.merchantResultAccess).toBe(true);
      expect(consent.withdrawnAt).not.toBeNull();
      expect((await service.summary(customer)).trial.remaining).toBe(3);
      expect(
        (await db.customer.findUniqueOrThrow({ where: { id: customer.id } }))
          .status,
      ).toBe("ACTIVE");
    });
  },
);
