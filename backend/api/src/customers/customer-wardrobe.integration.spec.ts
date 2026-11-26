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
import sharp from "sharp";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import multipart from "@fastify/multipart";
import type { JwtService } from "@nestjs/jwt";
import { PasswordService } from "../auth/password.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { TryOnSessionService } from "../try-on/try-on-session.service.js";
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
import {
  CustomerWardrobeService,
  normalizeWardrobePhoto,
} from "./customer-wardrobe.service.js";
import { CustomerWardrobeController } from "./customer-wardrobe.controller.js";

const url = process.env.WARDROBE_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/wardrobe_test")
)
  throw new Error("Use only disposable localhost wardrobe_test.");
const metadata = {
  name: "Navy shirt",
  category: "TOPS" as const,
  colour: "Navy",
  notes: "Owned garment",
};
const photo = (colour = "#345678", width = 700, height = 1000) =>
  sharp({ create: { width, height, channels: 3, background: colour } })
    .png()
    .toBuffer();
describe("Wardrobe image validation", () => {
  it("preserves framing, normalizes JPEG, and strips metadata", async () => {
    const bytes = await normalizeWardrobePhoto(await photo(), "image/png");
    expect(await sharp(bytes).metadata()).toMatchObject({
      width: 700,
      height: 1000,
      format: "jpeg",
    });
    expect((await sharp(bytes).metadata()).exif).toBeUndefined();
  });
  it("rejects corrupt, mismatched, too-small and oversized files", async () => {
    for (const [bytes, mime] of [
      [Buffer.from("bad"), "image/png"],
      [await photo(), "image/jpeg"],
      [await photo("#123456", 100, 300), "image/png"],
      [Buffer.alloc(16 * 1024 * 1024 + 1), "image/png"],
    ] as const) {
      await expect(normalizeWardrobePhoto(bytes, mime)).rejects.toMatchObject({
        status: 400,
      });
    }
  });
});

describe.skipIf(!url)("Private wardrobe on disposable PostgreSQL", () => {
  const db = new PrismaClient({
    datasourceUrl: url ?? "postgresql://unused@localhost/wardrobe_test",
  });
  const objects = new Map<string, Buffer>();
  const storage = {
    putObject: vi.fn(async (input: { key: string; body: Buffer }) => {
      objects.set(input.key, input.body);
    }),
    readObject: vi.fn(async (key: string) => {
      const data = objects.get(key);
      if (!data) throw new Error("Missing synthetic object");
      return data;
    }),
    deleteObject: vi.fn(async (key: string) => {
      objects.delete(key);
    }),
    createReadUrl: vi.fn(
      ({ key }: { key: string }) => `https://private.invalid/${key}`,
    ),
  };
  const principal = { requireCustomer: vi.fn(), limitExperience: vi.fn() };
  let wardrobe: CustomerWardrobeService,
    experience: CustomerExperienceService,
    sessions: TryOnSessionService;
  let owner: Awaited<ReturnType<typeof newCustomer>>,
    other: Awaited<ReturnType<typeof newCustomer>>;
  let app: NestFastifyApplication, bytes: Buffer;
  async function newCustomer() {
    return db.customer.create({
      data: {
        id: createSelfxId(),
        email: `${createSelfxId()}@synthetic.invalid`,
        displayName: "Synthetic owner",
        status: "ACTIVE",
        termsVersion: "2026-10-26",
        termsAcceptedAt: new Date(),
      },
    });
  }
  async function add(customer = owner, input = metadata) {
    const id = createSelfxId();
    await wardrobe.create(customer, id, input);
    await wardrobe.upload(customer, id, bytes, "image/png");
    return id;
  }
  beforeAll(async () => {
    vi.stubEnv("SELFX_CUSTOMER_AUTH_ENABLED", "false");
    await db.$connect();
    bytes = await photo();
    wardrobe = new CustomerWardrobeService(
      db as unknown as PrismaService,
      storage as unknown as ObjectStorageService,
    );
    sessions = new TryOnSessionService(db as unknown as PrismaService);
    experience = new CustomerExperienceService(
      db as unknown as PrismaService,
      sessions,
      {} as TryOnExecutionService,
      storage as unknown as ObjectStorageService,
      {} as EntitlementsService,
      {} as CatalogService,
    );
    @Module({
      controllers: [CustomerWardrobeController],
      providers: [
        { provide: CustomerAuthService, useValue: principal },
        { provide: CustomerWardrobeService, useValue: wardrobe },
        { provide: CustomerExperienceService, useValue: experience },
      ],
    })
    class TestModule {}
    app = await NestFactory.create<NestFastifyApplication>(
      TestModule,
      new FastifyAdapter(),
      { logger: false },
    );
    await app.register(multipart);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 60000);
  beforeEach(async () => {
    vi.clearAllMocks();
    objects.clear();
    await db.tryOnAsset.deleteMany();
    await db.tryOnSession.deleteMany();
    await db.customerPhotoConsent.deleteMany();
    await db.customerWardrobeItem.deleteMany();
    await db.customerIdentity.deleteMany();
    await db.customerSession.deleteMany();
    await db.customer.deleteMany();
    owner = await newCustomer();
    other = await newCustomer();
    principal.requireCustomer.mockImplementation(async () => ({
      customer: owner,
    }));
  });
  afterAll(async () => {
    await app?.close();
    await db.$disconnect();
    vi.unstubAllEnvs();
  });

  it("persists private items beyond seven days with account-policy provenance", async () => {
    const id = await add();
    await db.customerWardrobeItem.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 20 * 86400000) },
    });
    await wardrobe.cleanup();
    const row = await db.customerWardrobeItem.findUniqueOrThrow({
      where: { id },
    });
    expect(row.termsAcceptedAt).toEqual(owner.termsAcceptedAt);
    expect(row.retentionVersion).toBe("2026-11-26-wardrobe");
    expect(row.deletedAt).toBeNull();
    expect(await wardrobe.content(owner.id, id)).toBeInstanceOf(Buffer);
    const result = await wardrobe.list(owner.id, {});
    expect(result.items[0]).toMatchObject({ id, ...metadata, ready: true });
    expect(result.items[0]).not.toHaveProperty("storageKey");
  });
  it("keeps create and image retries idempotent and rejects changed requests", async () => {
    const id = await add();
    await wardrobe.create(owner, id, metadata);
    await wardrobe.upload(owner, id, bytes, "image/png");
    expect(await db.customerWardrobeItem.count()).toBe(1);
    expect(storage.putObject).toHaveBeenCalledTimes(1);
    await expect(
      wardrobe.create(owner, id, { ...metadata, name: "Different" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      wardrobe.upload(owner, id, await photo("#ff0000"), "image/png"),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("isolates reads, updates, deletion and request identities between owners", async () => {
    const id = await add();
    expect((await wardrobe.list(other.id, {})).items).toEqual([]);
    await expect(wardrobe.content(other.id, id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(wardrobe.update(other, id, metadata)).rejects.toMatchObject({
      status: 404,
    });
    await expect(wardrobe.remove(other, id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(wardrobe.create(other, id, metadata)).rejects.toMatchObject({
      status: 404,
    });
    expect((await wardrobe.list(owner.id, {})).items).toHaveLength(1);
  });
  it("hides drafts and rejects a revoked principal before storage upload", async () => {
    const id = createSelfxId();
    await wardrobe.create(owner, id, metadata);
    expect((await wardrobe.list(owner.id, {})).items).toHaveLength(0);
    await db.customer.update({
      where: { id: owner.id },
      data: { securityVersion: 1 },
    });
    await expect(
      wardrobe.upload(owner, id, bytes, "image/png"),
    ).rejects.toMatchObject({ status: 401 });
    expect(storage.putObject).not.toHaveBeenCalled();
  });
  it("supports name/category filtering and deterministic bounded pagination", async () => {
    for (let i = 0; i < 25; i++) {
      const id = createSelfxId();
      await db.customerWardrobeItem.create({
        data: {
          id,
          customerId: owner.id,
          ...metadata,
          name: `Shirt ${i}`,
          storageKey: `synthetic/${id}`,
          requestHash: "a".repeat(64),
          termsVersion: owner.termsVersion,
          termsAcceptedAt: owner.termsAcceptedAt,
          retentionVersion: "test",
          retentionStatement: "test",
          readyAt: new Date(),
          createdAt: new Date(Date.now() + i),
        },
      });
    }
    const first = await wardrobe.list(owner.id, {}),
      second = await wardrobe.list(owner.id, { page: 2 });
    expect(first.items).toHaveLength(24);
    expect(first.hasMore).toBe(true);
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(
      new Set([...first.items, ...second.items].map((item) => item.id)).size,
    ).toBe(25);
    expect(
      (await wardrobe.list(owner.id, { category: "DRESSES" })).items,
    ).toHaveLength(0);
    expect(
      (await wardrobe.list(owner.id, { search: "SHIRT 24", category: "TOPS" }))
        .items,
    ).toHaveLength(1);
  });
  it("updates item metadata and immediately hides a deleted item", async () => {
    const id = await add();
    expect(
      (
        await wardrobe.update(owner, id, {
          ...metadata,
          name: "Edited",
          category: "JACKETS",
        })
      ).item,
    ).toMatchObject({ name: "Edited", category: "JACKETS" });
    await wardrobe.remove(owner, id);
    await expect(wardrobe.content(owner.id, id)).rejects.toMatchObject({
      status: 404,
    });
    const row = await db.customerWardrobeItem.findUniqueOrThrow({
      where: { id },
    });
    expect(row.storageDeletedAt).not.toBeNull();
    expect(row.notes).toBeNull();
    expect(objects.has(row.storageKey)).toBe(false);
  });
  it("retries failed object deletion without restoring logical access", async () => {
    const id = await add();
    storage.deleteObject.mockRejectedValueOnce(new Error("Synthetic outage"));
    await wardrobe.remove(owner, id);
    await expect(wardrobe.content(owner.id, id)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      (await db.customerWardrobeItem.findUniqueOrThrow({ where: { id } }))
        .storageDeletedAt,
    ).toBeNull();
    await wardrobe.cleanup();
    expect(objects.size).toBe(0);
  });
  it("cleans a late completed object upload after concurrent deletion", async () => {
    const id = createSelfxId();
    await wardrobe.create(owner, id, metadata);
    let started!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    storage.putObject.mockImplementationOnce(async ({ key, body }) => {
      started();
      await gate;
      objects.set(key, body);
    });
    const uploading = wardrobe.upload(owner, id, bytes, "image/png");
    const rejected = expect(uploading).rejects.toMatchObject({ status: 404 });
    await entered;
    await wardrobe.remove(owner, id);
    release();
    await rejected;
    expect(
      (await db.customerWardrobeItem.findUniqueOrThrow({ where: { id } }))
        .storageDeletedAt,
    ).toBeNull();
    await wardrobe.cleanup();
    expect(objects.size).toBe(0);
  });
  it("cleans abandoned drafts without deleting saved wardrobe items", async () => {
    await add();
    const id = createSelfxId();
    await wardrobe.create(owner, id, metadata);
    await db.customerWardrobeItem.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 10 * 60000) },
    });
    await wardrobe.cleanup();
    expect((await wardrobe.list(owner.id, {})).items).toHaveLength(1);
    expect(
      (await db.customerWardrobeItem.findUniqueOrThrow({ where: { id } }))
        .deletedAt,
    ).not.toBeNull();
  });
  it("does not erase a draft that became ready after cleanup selected it", async () => {
    const id = createSelfxId();
    await wardrobe.create(owner, id, metadata);
    await db.customerWardrobeItem.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 10 * 60000) },
    });
    const candidate = await db.customerWardrobeItem.findUniqueOrThrow({
      where: { id },
    });
    await wardrobe.upload(owner, id, bytes, "image/png");
    vi.spyOn(db.customerWardrobeItem, "findMany").mockResolvedValueOnce([
      candidate,
    ]);
    await wardrobe.cleanup();
    expect((await wardrobe.list(owner.id, {})).items).toHaveLength(1);
    expect(objects.size).toBe(1);
  });
  it("copies a private garment through the canonical seven-day Try-On input path", async () => {
    const id = await add();
    const consent = await db.customerPhotoConsent.create({
      data: {
        id: createSelfxId(),
        customerId: owner.id,
        version: "test",
        statement: "Synthetic consent",
      },
    });
    const session = await sessions.createSession({
      customerId: owner.id,
      customerConsentId: consent.id,
      assignmentScope: "PLATFORM",
      organizationId: null,
      storeId: null,
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/customer/try-on/sessions/${session.id}/wardrobe`,
      payload: { itemId: id },
    });
    expect(response.statusCode).toBe(201);
    const asset = await db.tryOnAsset.findUniqueOrThrow({
      where: { id: response.json().id },
    });
    expect(asset.purpose).toBe("GARMENT");
    expect(asset.sessionId).toBe(session.id);
    expect(asset.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      6.9 * 86400000,
    );
    expect(asset.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
      7 * 86400000,
    );
    principal.requireCustomer.mockResolvedValueOnce({ customer: other });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/customer/try-on/sessions/${session.id}/wardrobe`,
          payload: { itemId: id },
        })
      ).statusCode,
    ).toBe(404);
  });
  it("includes wardrobe originals in Delete my photos without exposing them while cleanup retries", async () => {
    const id = await add();
    await experience.eraseCustomerPhotos(owner.id);
    expect((await wardrobe.list(owner.id, {})).items).toHaveLength(0);
    await expect(wardrobe.content(owner.id, id)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      (await db.customerWardrobeItem.findUniqueOrThrow({ where: { id } }))
        .notes,
    ).toBeNull();
    await wardrobe.cleanup();
    expect(objects.size).toBe(0);
  });
  it("includes wardrobe originals and metadata in actual customer account deletion", async () => {
    const id = await add(),
      passwords = new PasswordService();
    await db.customerIdentity.create({
      data: {
        id: createSelfxId(),
        customerId: owner.id,
        provider: "EMAIL_PASSWORD",
        providerSubject: owner.email!,
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
    expect(
      (await db.customer.findUniqueOrThrow({ where: { id: owner.id } })).status,
    ).toBe("DELETED");
    expect(
      (await db.customerWardrobeItem.findUniqueOrThrow({ where: { id } }))
        .notes,
    ).toBeNull();
    await wardrobe.cleanup();
    expect(objects.size).toBe(0);
  });
  it("validates HTTP metadata, UUIDv7 identities and pagination and requires customer auth", async () => {
    for (const payload of [
      { id: createSelfxId(), ...metadata, customerId: other.id },
      { id: createSelfxId(), ...metadata, name: " " },
      { id: createSelfxId(), ...metadata, category: "UNKNOWN" },
      { id: "not-an-id", ...metadata },
    ]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/customer/wardrobe",
            payload,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/customer/wardrobe?page=0",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/customer/wardrobe?search=" + "a".repeat(121),
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
      (await app.inject({ method: "GET", url: "/api/v1/customer/wardrobe" }))
        .statusCode,
    ).toBe(401);
    expect(await db.customerWardrobeItem.count()).toBe(0);
  });
  it("creates and uploads an item through the real multipart HTTP endpoint", async () => {
    const id = createSelfxId();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/customer/wardrobe",
      payload: { id, ...metadata },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().item.ready).toBe(false);
    const boundary = "selfx-synthetic-boundary";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="synthetic.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const uploaded = await app.inject({
      method: "POST",
      url: `/api/v1/customer/wardrobe/${id}/photo`,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(uploaded.statusCode).toBe(201);
    expect(uploaded.json().item).toMatchObject({
      id,
      ready: true,
      ...metadata,
    });
    expect((await wardrobe.list(owner.id, {})).items).toHaveLength(1);
  });
  it("rejects JSON pretending to be a photo and streams owned photos privately", async () => {
    const id = await add();
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/customer/wardrobe/${id}/photo`,
          payload: { image: "fake" },
        })
      ).statusCode,
    ).toBe(400);
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/customer/wardrobe/${id}/content`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["content-type"]).toContain("image/jpeg");
    principal.requireCustomer.mockResolvedValueOnce({ customer: other });
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/customer/wardrobe/${id}/content`,
        })
      ).statusCode,
    ).toBe(404);
  });
});
