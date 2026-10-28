import "reflect-metadata";
import { randomUUID } from "node:crypto";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import {
  CustomerProfilePhotoService,
  normalizeProfilePhoto,
  PROFILE_PHOTO_CONSENT,
  PROFILE_PHOTO_VERSION,
  LEGACY_PROFILE_PHOTO_VERSION,
  AVATAR_PHOTO_VERSION,
  AVATAR_PHOTO_CONSENT,
  normalizeAvatarPhoto,
} from "./customer-profile-photo.service.js";

const url = process.env.CUSTOMER_MOBILE_TEST_DATABASE_URL;
if (
  url &&
  (!["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/customer_mobile_test")
)
  throw new Error("Use only disposable localhost customer_mobile_test.");
async function image(width = 768, height = 1024) {
  return sharp({
    create: { width, height, channels: 3, background: "#c4b197" },
  })
    .png()
    .toBuffer();
}
describe("Profile photo input", () => {
  it("keeps avatar framing and strips metadata instead of applying the profile crop", async () => {
    const result = await normalizeAvatarPhoto(
      await image(768, 1536),
      "image/png",
    );
    expect(await sharp(result).metadata()).toMatchObject({
      format: "jpeg",
      width: 768,
      height: 1536,
    });
    await expect(
      normalizeAvatarPhoto(Buffer.from("bad"), "image/png"),
    ).rejects.toThrow();
  });
  it("decodes, squares, compresses and strips metadata; rejects invalid content and size", async () => {
    const result = await normalizeProfilePhoto(await image(), "image/png");
    const meta = await sharp(result).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 512, height: 512 });
    expect(meta.exif).toBeUndefined();
    for (const [bytes, mime] of [
      [Buffer.from("bad"), "image/png"],
      [await image(128, 256), "image/png"],
      [await image(), "image/jpeg"],
      [Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"],
    ] as const)
      await expect(normalizeProfilePhoto(bytes, mime)).rejects.toThrow();
  });
});
describe.skipIf(!url)("Private profile photos on disposable PostgreSQL", () => {
  const db = new PrismaClient({
    datasourceUrl: url ?? "postgresql://unused@localhost/customer_mobile_test",
  });
  const objects = new Map<string, Buffer>();
  const storage = {
    putObject: vi.fn(async ({ key, body }: { key: string; body: Buffer }) => {
      objects.set(key, body);
    }),
    deleteObject: vi.fn(async (key: string) => {
      objects.delete(key);
    }),
    readObject: vi.fn(async (key: string) => {
      if (!objects.has(key)) throw new Error("missing");
      return objects.get(key)!;
    }),
  };
  const service = new CustomerProfilePhotoService(
    db as PrismaService,
    storage as unknown as ObjectStorageService,
  );
  let owner: { id: string; securityVersion: number },
    other: typeof owner,
    photo: Buffer;
  beforeAll(async () => {
    await db.$connect();
    photo = await image();
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      "TRUNCATE TABLE customers, organizations, pricing_plans CASCADE",
    );
    objects.clear();
    vi.clearAllMocks();
    const create = () =>
      db.customer.create({
        data: {
          id: randomUUID(),
          displayName: "Synthetic",
          status: "ACTIVE",
          termsVersion: "test",
          termsAcceptedAt: new Date(),
        },
      });
    owner = await create();
    other = await create();
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  it("isolates avatar kinds, owners and profile pictures; replacing/removing a kind leaves the others intact", async () => {
    const profile = await service.upload(owner, photo, "image/png", "en");
    const selfie = await service.upload(
      owner,
      photo,
      "image/png",
      "en",
      AVATAR_PHOTO_VERSION,
      "SELFIE",
    );
    const body = await service.upload(
      owner,
      photo,
      "image/png",
      "en",
      AVATAR_PHOTO_VERSION,
      "FULL_BODY",
    );
    expect(body.photo.expiresAt).toBeNull();
    const row = await db.customerProfilePhoto.findUniqueOrThrow({
      where: { id: body.photo.id },
    });
    expect(row.consentStatement).toBe(AVATAR_PHOTO_CONSENT);
    expect(row.storageKey).toContain("customer-mobile/avatar/");
    await expect(
      service.content(other.id, body.photo.id, "FULL_BODY"),
    ).rejects.toThrow();
    await expect(service.content(owner.id, body.photo.id)).rejects.toThrow();
    await expect(
      service.content(owner.id, selfie.photo.id, "FULL_BODY"),
    ).rejects.toThrow();
    await expect(
      service.upload(
        owner,
        photo,
        "image/png",
        "en",
        PROFILE_PHOTO_VERSION,
        "FULL_BODY",
      ),
    ).rejects.toThrow();
    const replacement = await service.upload(
      owner,
      photo,
      "image/png",
      "en",
      AVATAR_PHOTO_VERSION,
      "FULL_BODY",
    );
    await expect(
      service.content(owner.id, body.photo.id, "FULL_BODY"),
    ).rejects.toThrow();
    expect((await service.get(owner.id)).photo?.id).toBe(profile.photo.id);
    expect((await service.get(owner.id, "SELFIE")).photo?.id).toBe(
      selfie.photo.id,
    );
    expect((await service.get(owner.id, "FULL_BODY")).photo?.id).toBe(
      replacement.photo.id,
    );
    await service.remove(owner, "SELFIE");
    expect((await service.get(owner.id, "FULL_BODY")).photo?.id).toBe(
      replacement.photo.id,
    );
    await db.customerProfilePhoto.update({
      where: { id: replacement.photo.id },
      data: { createdAt: new Date(Date.now() - 60 * 86400000) },
    });
    await service.cleanup();
    expect((await service.get(owner.id, "FULL_BODY")).photo?.id).toBe(
      replacement.photo.id,
    );
    await db.customer.update({
      where: { id: owner.id },
      data: { status: "DELETED" },
    });
    await service.cleanup();
    expect(objects.size).toBe(0);
  });
  it("keeps photo reads customer-owned and private, records consent, and retains persistent photos beyond seven days", async () => {
    const uploaded = await service.upload(owner, photo, "image/png", "te");
    expect(uploaded.photo.expiresAt).toBeNull();
    expect(await service.get(other.id)).toEqual({ photo: null });
    await expect(
      service.content(other.id, uploaded.photo.id),
    ).rejects.toThrow();
    expect(await service.content(owner.id, uploaded.photo.id)).toEqual(
      [...objects.values()][0],
    );
    const row = await db.customerProfilePhoto.findUniqueOrThrow({
      where: { id: uploaded.photo.id },
    });
    expect(row.consentStatement).toBe(PROFILE_PHOTO_CONSENT);
    expect(row.consentVersion).toBe(PROFILE_PHOTO_VERSION);
    expect(row.consentLanguage).toBe("te");
    expect(JSON.stringify(await service.get(owner.id))).not.toContain(
      "storageKey",
    );
    await db.customerProfilePhoto.update({
      where: { id: row.id },
      data: { createdAt: new Date(Date.now() - 30 * 86400000) },
    });
    await service.cleanup();
    expect((await service.get(owner.id)).photo?.id).toBe(row.id);
    expect(await service.content(owner.id, row.id)).toBeDefined();
    expect(objects.size).toBe(1);
  });
  it("honors the original retention for uploads from older app versions", async () => {
    const uploaded = await service.upload(
      owner,
      photo,
      "image/png",
      "en",
      LEGACY_PROFILE_PHOTO_VERSION,
    );
    expect(
      Date.parse(uploaded.photo.expiresAt!) - Date.now(),
    ).toBeLessThanOrEqual(7 * 86400000);
    await db.customerProfilePhoto.update({
      where: { id: uploaded.photo.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect(await service.get(owner.id)).toEqual({ photo: null });
    await expect(
      service.content(owner.id, uploaded.photo.id),
    ).rejects.toThrow();
    await service.cleanup();
    expect(objects.size).toBe(0);
  });
  it("replaces and removes photos without changing credits or leaking another customer's photo", async () => {
    const first = await service.upload(owner, photo, "image/png", "en");
    const second = await service.upload(owner, photo, "image/png", "en");
    await expect(service.content(owner.id, first.photo.id)).rejects.toThrow();
    expect((await service.get(owner.id)).photo?.id).toBe(second.photo.id);
    await service.cleanup();
    expect(objects.size).toBe(1);
    await service.remove(other);
    expect(objects.size).toBe(1);
    await service.remove(owner);
    expect(objects.size).toBe(0);
    expect(await service.get(owner.id)).toEqual({ photo: null });
    expect(await db.customerCreditAccount.count()).toBe(0);
  });
  it("does not resurrect a photo removed while its upload was in flight", async () => {
    let finish!: () => void, started!: () => void;
    const signal = new Promise<void>((r) => {
      started = r;
    });
    const wait = new Promise<void>((r) => {
      finish = r;
    });
    storage.putObject.mockImplementationOnce(async ({ key, body }) => {
      started();
      await wait;
      objects.set(key, body);
    });
    const pending = service.upload(owner, photo, "image/png", "en");
    await signal;
    await service.remove(owner);
    finish();
    await expect(pending).rejects.toThrow();
    expect(await service.get(owner.id)).toEqual({ photo: null });
    await service.cleanup();
    expect(objects.size).toBe(0);
  });
  it("denies stale sessions and purges photos after account deletion", async () => {
    await service.upload(owner, photo, "image/png", "en");
    await db.customer.update({
      where: { id: owner.id },
      data: { securityVersion: 1 },
    });
    await expect(
      service.upload(owner, photo, "image/png", "en"),
    ).rejects.toThrow();
    await db.customer.update({
      where: { id: owner.id },
      data: { status: "DELETED" },
    });
    expect(await service.get(owner.id)).toEqual({ photo: null });
    await service.cleanup();
    expect(objects.size).toBe(0);
  });
});
