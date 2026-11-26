import "reflect-metadata";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import type { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../database/prisma.service.js";
import { PasswordService } from "../auth/password.service.js";
import type { ObjectStorageService } from "../storage/object-storage.js";
import type { TryOnSessionService } from "../try-on/try-on-session.service.js";
import type { TryOnExecutionService } from "../try-on/try-on-execution.service.js";
import type { EntitlementsService } from "../entitlements/entitlements.service.js";
import type { CatalogService } from "../catalog/catalog.service.js";
import type { CustomerIdentityClient } from "./customer-identity.client.js";
import type { MailSettingsService } from "../mail/mail-settings.service.js";
import type { MailOutboxService } from "../mail/mail-outbox.service.js";
import type { MailCrypto } from "../mail/mail-crypto.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { CustomerExperienceService } from "./customer-experience.service.js";
import { CustomerOutfitSchedulesController } from "./customer-outfit-schedules.controller.js";
import {
  CustomerOutfitSchedulesService,
  parseOutfitDate,
} from "./customer-outfit-schedules.service.js";

const url = process.env.OUTFIT_PLANNER_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/outfit_planner_test")
)
  throw Error("Use only disposable localhost outfit_planner_test.");
describe("Calendar-only outfit dates", () => {
  it("round trips dates across leap years and daylight-saving boundaries", () => {
    for (const date of [
      "2028-02-29",
      "2026-03-08",
      "2026-11-01",
      "2026-12-31",
      "2027-01-01",
    ])
      expect(parseOutfitDate(date).toISOString()).toBe(date + "T00:00:00.000Z");
  });
  it("rejects impossible dates, timestamps and invalid formats", () => {
    for (const date of [
      "2026-02-29",
      "2026-04-31",
      "2026-13-01",
      "2026-00-01",
      "2026-1-1",
      "2026-11-26T00:00:00Z",
      "",
      "0000-01-01",
    ])
      expect(() => parseOutfitDate(date)).toThrow();
  });
});
describe.skipIf(!url)(
  "Private outfit schedules on disposable PostgreSQL",
  () => {
    const db = new PrismaClient({
      datasourceUrl: url ?? "postgresql://unused@localhost/outfit_planner_test",
    });
    const principal = { requireCustomer: vi.fn(), limitExperience: vi.fn() };
    let service: CustomerOutfitSchedulesService, app: NestFastifyApplication;
    let owner: Awaited<ReturnType<typeof customer>>,
      other: Awaited<ReturnType<typeof customer>>,
      garments: [string, string];
    const window = { from: "2026-11-26", to: "2026-12-02", day: "2026-11-26" };
    const metadata = () => ({
      date: "2026-11-26",
      occasion: "Dinner",
      notes: "Synthetic private note",
      garmentIds: garments,
    });
    async function customer() {
      return db.customer.create({
        data: {
          id: createSelfxId(),
          email: `${createSelfxId()}@synthetic.invalid`,
          displayName: "Synthetic customer",
          status: "ACTIVE",
          termsVersion: "test",
          termsAcceptedAt: new Date(),
        },
      });
    }
    async function garment(customerId = owner.id) {
      const id = createSelfxId();
      await db.customerWardrobeItem.create({
        data: {
          id,
          customerId,
          name: "Synthetic shirt",
          category: "TOPS",
          storageKey: `private-synthetic/${id}`,
          requestHash: "a".repeat(64),
          termsVersion: "test",
          termsAcceptedAt: new Date(),
          retentionVersion: "test",
          retentionStatement: "Synthetic fixture",
          readyAt: new Date(),
        },
      });
      return id;
    }
    async function create() {
      return (await service.create(owner, createSelfxId(), metadata())).item;
    }
    beforeAll(async () => {
      vi.stubEnv("SELFX_CUSTOMER_AUTH_ENABLED", "false");
      await db.$connect();
      service = new CustomerOutfitSchedulesService(
        db as unknown as PrismaService,
      );
      @Module({
        controllers: [CustomerOutfitSchedulesController],
        providers: [
          { provide: CustomerAuthService, useValue: principal },
          { provide: CustomerOutfitSchedulesService, useValue: service },
        ],
      })
      class TestModule {}
      app = await NestFactory.create<NestFastifyApplication>(
        TestModule,
        new FastifyAdapter(),
        { logger: false },
      );
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      );
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    }, 60000);
    beforeEach(async () => {
      vi.clearAllMocks();
      await db.customerOutfitSchedule.deleteMany();
      await db.customerWardrobeItem.deleteMany();
      await db.customerIdentity.deleteMany();
      await db.customerSession.deleteMany();
      await db.customerPhotoConsent.deleteMany();
      await db.customer.deleteMany();
      owner = await customer();
      other = await customer();
      garments = [await garment(), await garment()];
      principal.requireCustomer.mockResolvedValue({ customer: owner });
    });
    afterAll(async () => {
      await app?.close();
      await db.$disconnect();
      vi.unstubAllEnvs();
    });
    it("creates private multi-piece outfits over HTTP and marks all days in the requested week", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/customer/outfit-schedules",
        payload: { id: createSelfxId(), ...metadata() },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().item.pieces).toHaveLength(2);
      await service.create(owner, createSelfxId(), {
        ...metadata(),
        date: "2026-11-27",
      });
      const list = await service.list(owner.id, window);
      expect(list.items).toHaveLength(1);
      expect(list.hasWardrobeItems).toBe(true);
      expect(list.days).toEqual([
        { date: "2026-11-26", count: 1 },
        { date: "2026-11-27", count: 1 },
      ]);
      expect(JSON.stringify(list)).not.toContain("storageKey");
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/api/v1/customer/outfit-schedules?from=2026-11-26&to=2026-12-02&day=2026-11-26",
          })
        ).headers["cache-control"],
      ).toBe("no-store");
    });
    it("supports multiple occasions on one date and deterministic bounded pagination", async () => {
      for (let i = 0; i < 26; i++) await create();
      const first = await service.list(owner.id, window),
        second = await service.list(owner.id, { ...window, page: 2 });
      expect(first.items).toHaveLength(25);
      expect(first.hasMore).toBe(true);
      expect(second.items).toHaveLength(1);
      expect(second.hasMore).toBe(false);
      expect(first.days).toEqual([{ date: "2026-11-26", count: 26 }]);
      expect(
        new Set([...first.items, ...second.items].map((item) => item.id)).size,
      ).toBe(26);
    });
    it("isolates other accounts and rejects unowned, deleted or not-ready garments", async () => {
      const item = await create();
      expect((await service.list(other.id, window)).items).toHaveLength(0);
      await expect(
        service.update(other, item.id, 1, metadata()),
      ).rejects.toMatchObject({ status: 404 });
      await expect(service.remove(other, item.id)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        service.create(other, item.id, metadata()),
      ).rejects.toMatchObject({ status: 404 });
      for (const garmentId of [await garment(other.id), createSelfxId()])
        await expect(
          service.create(owner, createSelfxId(), {
            ...metadata(),
            garmentIds: [garmentId],
          }),
        ).rejects.toMatchObject({ status: 400 });
      await db.customerWardrobeItem.update({
        where: { id: garments[0] },
        data: { readyAt: null },
      });
      await expect(create()).rejects.toMatchObject({ status: 400 });
      await db.customerWardrobeItem.update({
        where: { id: garments[0] },
        data: { readyAt: new Date(), deletedAt: new Date() },
      });
      await expect(create()).rejects.toMatchObject({ status: 400 });
    });
    it("keeps concurrent create retries idempotent and rejects changed fingerprints", async () => {
      const id = createSelfxId();
      const results = await Promise.all([
        service.create(owner, id, metadata()),
        service.create(owner, id, metadata()),
      ]);
      expect(results[0].item.id).toBe(results[1].item.id);
      expect(await db.customerOutfitSchedule.count()).toBe(1);
      expect(await db.customerOutfitSchedulePiece.count()).toBe(2);
      await expect(
        service.create(owner, id, { ...metadata(), occasion: "Different" }),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("edits, reschedules and safely retries updates without duplicating pieces", async () => {
      const item = await create(),
        changed = {
          ...metadata(),
          date: "2026-11-28",
          occasion: "Office",
          garmentIds: [garments[1]],
        };
      const updated = await service.update(owner, item.id, 1, changed);
      expect(updated.item).toMatchObject({
        date: "2026-11-28",
        occasion: "Office",
        version: 2,
      });
      expect(updated.item.pieces).toHaveLength(1);
      expect(
        (await service.update(owner, item.id, 1, changed)).item.version,
      ).toBe(2);
      await expect(
        service.update(owner, item.id, 1, { ...changed, notes: "Stale edit" }),
      ).rejects.toMatchObject({ status: 409 });
      expect((await service.list(owner.id, window)).items).toHaveLength(0);
      expect(
        (await service.list(owner.id, { ...window, day: "2026-11-28" })).items,
      ).toHaveLength(1);
    });
    it("serializes concurrent edits with an optimistic version check", async () => {
      const item = await create();
      const results = await Promise.allSettled([
        service.update(owner, item.id, 1, { ...metadata(), occasion: "One" }),
        service.update(owner, item.id, 1, { ...metadata(), occasion: "Two" }),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(
        (
          await db.customerOutfitSchedule.findUniqueOrThrow({
            where: { id: item.id },
          })
        ).version,
      ).toBe(2);
    });
    it("shows removed garments as unavailable without leaking their old metadata or photos", async () => {
      await create();
      await db.customerWardrobeItem.update({
        where: { id: garments[0] },
        data: { deletedAt: new Date() },
      });
      let item = (await service.list(owner.id, window)).items[0]!;
      expect(item.pieces[0]!.garment).toBeNull();
      expect(item.pieces[1]!.garment?.id).toBe(garments[1]);
      await db.customerWardrobeItem.delete({ where: { id: garments[1] } });
      item = (await service.list(owner.id, window)).items[0]!;
      expect(item.pieces.every((piece) => piece.garment === null)).toBe(true);
      expect(JSON.stringify(item)).not.toContain("Synthetic shirt");
    });
    it("deletes schedule metadata and references without deleting wardrobe pieces or resurrecting retries", async () => {
      const item = await create();
      await service.remove(owner, item.id);
      expect((await service.list(owner.id, window)).items).toHaveLength(0);
      const row = await db.customerOutfitSchedule.findUniqueOrThrow({
        where: { id: item.id },
      });
      expect(row.occasion).toBeNull();
      expect(row.notes).toBeNull();
      expect(row.scheduledDate.toISOString().slice(0, 10)).toBe("1970-01-01");
      expect(row.createFingerprint).toBe("0".repeat(64));
      expect(await db.customerOutfitSchedulePiece.count()).toBe(0);
      expect(await db.customerWardrobeItem.count()).toBe(2);
      await service.remove(owner, item.id);
      await expect(
        service.create(owner, item.id, metadata()),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("blocks stale or deleted principals even if account state changed after authentication", async () => {
      await db.customer.update({
        where: { id: owner.id },
        data: { securityVersion: 1 },
      });
      await expect(create()).rejects.toMatchObject({ status: 401 });
      await db.customer.update({
        where: { id: owner.id },
        data: { status: "DELETED" },
      });
      expect((await service.list(owner.id, window)).items).toHaveLength(0);
      await expect(create()).rejects.toMatchObject({ status: 401 });
    });
    it("includes scheduled outfits in actual account deletion", async () => {
      await create();
      const passwords = new PasswordService();
      await db.customerIdentity.create({
        data: {
          id: createSelfxId(),
          customerId: owner.id,
          provider: "EMAIL_PASSWORD",
          providerSubject: owner.id,
          email: owner.email,
          passwordHash: await passwords.hashPassword("synthetic-password"),
        },
      });
      const auth = new CustomerAuthService(
        db as unknown as PrismaService,
        passwords,
        {} as JwtService,
        {} as CustomerIdentityClient,
        {} as MailSettingsService,
        {} as MailOutboxService,
        {} as MailCrypto,
      );
      vi.spyOn(auth, "rate").mockResolvedValue(true);
      vi.spyOn(auth, "requireCustomer").mockResolvedValue({
        customer: owner,
        sessionId: createSelfxId(),
      });
      await auth.deleteAccount(
        "Bearer synthetic",
        { confirmation: "DELETE", password: "synthetic-password" },
        "127.0.0.1",
      );
      expect(await db.customerOutfitSchedule.count()).toBe(0);
      expect(await db.customerOutfitSchedulePiece.count()).toBe(0);
    });
    it("honors Delete my photos without retaining extra garment metadata in schedules", async () => {
      await create();
      const experience = new CustomerExperienceService(
        db as unknown as PrismaService,
        {} as TryOnSessionService,
        {} as TryOnExecutionService,
        {} as ObjectStorageService,
        {} as EntitlementsService,
        {} as CatalogService,
      );
      await experience.eraseCustomerPhotos(owner.id);
      expect(
        (await service.list(owner.id, window)).items[0]!.pieces.every(
          (piece) => piece.garment === null,
        ),
      ).toBe(true);
      expect((await service.list(owner.id, window)).hasWardrobeItems).toBe(
        false,
      );
    });
    it("validates DTOs, calendar ranges, bounded lists and authentication", async () => {
      for (const payload of [
        { id: createSelfxId(), ...metadata(), customerId: other.id },
        { id: createSelfxId(), ...metadata(), garmentIds: [] },
        {
          id: createSelfxId(),
          ...metadata(),
          garmentIds: [garments[0], garments[0]],
        },
        {
          id: createSelfxId(),
          ...metadata(),
          garmentIds: Array.from({ length: 21 }, () => createSelfxId()),
        },
        { id: createSelfxId(), ...metadata(), date: "2026-02-29" },
        { id: createSelfxId(), ...metadata(), occasion: "x".repeat(81) },
      ])
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/api/v1/customer/outfit-schedules",
              payload,
            })
          ).statusCode,
        ).toBe(400);
      for (const query of [
        "from=2026-11-26&to=2026-12-30",
        "from=2026-11-26&to=2026-11-25",
        "from=2026-11-26&to=2026-12-02&day=2026-12-03",
        "from=2026-11-26&to=2026-12-02&page=0",
      ])
        expect(
          (
            await app.inject({
              method: "GET",
              url: "/api/v1/customer/outfit-schedules?" + query,
            })
          ).statusCode,
        ).toBe(400);
      principal.requireCustomer.mockRejectedValueOnce(
        new ApiErrorException(
          401,
          "CUSTOMER_UNAUTHORIZED",
          "Please sign in again.",
        ),
      );
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/api/v1/customer/outfit-schedules?from=2026-11-26&to=2026-12-02",
          })
        ).statusCode,
      ).toBe(401);
    });
  },
);
