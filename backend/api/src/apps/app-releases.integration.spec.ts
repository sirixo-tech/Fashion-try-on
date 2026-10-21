import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { AppReleasesService } from "./app-releases.service.js";
import { RegionalSettingsController } from "../account/regional-settings.controller.js";
const url = process.env.APP_RELEASE_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test"))
)
  throw new Error("Disposable localhost test database required.");
describe.skipIf(!url)("app releases and preferences with PostgreSQL", () => {
  const db = new PrismaService({
    datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
  });
  const id = createSelfxId();
  const signer = "a".repeat(64);
  const storage = {
    putObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    createReadUrl: vi
      .fn()
      .mockReturnValue("https://example.invalid/signed-apk"),
  };
  const metadata = {
    packageName: "com.selfx.kiosk",
    versionName: "1.0",
    versionCode: 100,
    architecture: "ARM64",
    minSdk: 24,
    signerSha256: signer,
  };
  const validator = {
    configuration: () => ({ signer }),
    inspect: vi.fn().mockResolvedValue(metadata),
  };
  const service = new AppReleasesService(
    db,
    storage as never,
    validator as never,
  );
  let first: string, second: string;
  beforeAll(async () => {
    await db.$connect();
    await db.user.create({ data: { id, email: `apps-${id}@selfx.invalid` } });
  });
  afterAll(async () => {
    await db.appRelease.deleteMany({ where: { uploadedById: id } });
    await db.auditLog.deleteMany({ where: { actorUserId: id } });
    await db.user.delete({ where: { id } });
    await db.$disconnect();
  });
  it("uploads a draft and makes retries idempotent by checksum", async () => {
    const file = Buffer.from("PK\x03\x04fixture-one");
    const release = await service.upload(id, file, "First release");
    first = release.id;
    expect(release.status).toBe("DRAFT");
    expect((await service.upload(id, file, "retry")).id).toBe(first);
    expect(storage.putObject).toHaveBeenCalledTimes(1);
    await expect(service.download(first, true)).rejects.toThrow();
    const listing = await service.list(false);
    expect(JSON.stringify(listing)).not.toContain("objectKey");
    expect(listing.data.find((row) => row.id === first)).toHaveProperty(
      "uploadedBy",
    );
  });
  it("publishes, rejects stale actions and exposes only published metadata", async () => {
    await service.change(id, first, "publish", 0);
    await expect(service.change(id, first, "retire", 0)).rejects.toThrow();
    const listing = await service.list(true);
    expect(listing.data.some((row) => row.id === first)).toBe(true);
    expect(listing.data.find((row) => row.id === first)).not.toHaveProperty(
      "uploadedBy",
    );
    expect((await service.download(first, true)).expiresInSeconds).toBe(60);
    await service.change(id, first, "recommend", 1);
  });
  it("atomically replaces the recommended architecture release", async () => {
    validator.inspect.mockResolvedValue({ ...metadata, versionCode: 101 });
    second = (
      await service.upload(id, Buffer.from("PK\x03\x04fixture-two"), "Second")
    ).id;
    await service.change(id, second, "publish", 0);
    await service.change(id, second, "recommend", 1);
    expect(
      (await db.appRelease.findUniqueOrThrow({ where: { id: first } }))
        .recommended,
    ).toBe(false);
    expect(
      await db.appRelease.count({
        where: { recommended: true, architecture: "ARM64" },
      }),
    ).toBe(1);
    await service.change(id, second, "retire", 2);
    await expect(service.download(second, true)).rejects.toThrow();
  });
  it("rejects version collisions and cleans orphaned object writes", async () => {
    validator.inspect.mockResolvedValue(metadata);
    await expect(
      service.upload(id, Buffer.from("PK\x03\x04conflicting-bytes"), ""),
    ).rejects.toThrow();
    expect(storage.deleteObject).toHaveBeenCalled();
  });
  it("persists account preferences and resolves them on a new controller", async () => {
    const auth = { requireAccessUser: vi.fn().mockResolvedValue({ id }) };
    const settings = {
      timezone: "Asia/Kolkata",
      dateFormat: "DMY",
      timeFormat: "H24",
    };
    const request = { headers: { authorization: "Bearer fixture" } };
    await new RegionalSettingsController(auth as never, db).save(
      request as never,
      settings,
    );
    expect(
      await new RegionalSettingsController(auth as never, db).get(
        request as never,
      ),
    ).toEqual(settings);
    expect(
      await db.auditLog.count({
        where: { actorUserId: id, resourceType: "app_release" },
      }),
    ).toBeGreaterThanOrEqual(5);
  });
});
