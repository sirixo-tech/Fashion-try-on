import "reflect-metadata";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import {
  applyCatalogTransfer,
  previewCatalogTransfer,
  inspectTransferImages,
  type CatalogTransferPlan,
  type TransferDatabase,
} from "./platform-catalog-transfer.js";

const url = process.env.CATALOG_TRANSFER_TEST_DATABASE_URL;
if (
  url &&
  (!["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test"))
)
  throw new Error("A disposable local test database is required.");
const env = {
  RAILWAY_PROJECT_ID: "fixture-project",
  RAILWAY_ENVIRONMENT_ID: "fixture-production",
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

describe.skipIf(!url)(
  "Platform catalog transfer — real PostgreSQL, simulated storage",
  () => {
    const db = new PrismaClient({
      datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
    });
    let targetId: string, otherId: string, actorId: string;
    let storage: ReturnType<typeof fakeStorage>;
    const stores: string[] = [],
      actors: string[] = [],
      productIds: string[] = [],
      categoryIds: string[] = [];
    beforeAll(() => db.$connect());
    beforeEach(async () => {
      // This dedicated disposable database contains only this suite's fixtures.
      await cleanup();
      targetId = createSelfxId();
      otherId = createSelfxId();
      actorId = createSelfxId();
      stores.push(targetId, otherId);
      actors.push(actorId);
      await db.organization.createMany({
        data: [
          {
            id: targetId,
            slug: "avinash-stores",
            name: "Avinash stores",
            status: "ACTIVE",
          },
          { id: otherId, slug: otherId, name: "Other Store", status: "ACTIVE" },
        ],
      });
      await db.user.create({
        data: {
          id: actorId,
          email: "operator@transfer.invalid",
          passwordHash: "fixture-not-a-login",
        },
      });
      await db.platformRoleAssignment.create({
        data: {
          id: createSelfxId(),
          userId: actorId,
          role: "SELFX_SUPER_ADMIN",
          status: "ACTIVE",
        },
      });
      storage = fakeStorage();
    });
    afterAll(async () => {
      await cleanup();
      await db.$disconnect();
    });
    async function cleanup() {
      await db.auditLog.deleteMany({ where: { actorUserId: { in: actors } } });
      await db.kioskTryOnRun.deleteMany({
        where: { productId: { in: productIds } },
      });
      await db.tryOnSession.deleteMany({
        where: { organizationId: { in: stores } },
      });
      await db.kioskDevice.deleteMany({
        where: { organizationId: { in: stores } },
      });
      await db.product.deleteMany({ where: { id: { in: productIds } } });
      await db.productCategory.deleteMany({
        where: { id: { in: categoryIds } },
      });
      await db.platformRoleAssignment.deleteMany({
        where: { userId: { in: actors } },
      });
      await db.user.deleteMany({ where: { id: { in: actors } } });
      await db.organization.deleteMany({ where: { id: { in: stores } } });
    }
    async function category(
      audience = "MEN",
      scope: "STORE" | "PLATFORM_DEFAULT" = "PLATFORM_DEFAULT",
      slug = "shirts",
    ) {
      const id = createSelfxId();
      categoryIds.push(id);
      return db.productCategory.create({
        data: {
          id,
          catalogKey: `${scope}:${id}`,
          name: "Shirts",
          slug,
          audience,
          scope,
          organizationId: scope === "STORE" ? targetId : null,
        },
      });
    }
    async function product(
      categoryId: string,
      input: Partial<Prisma.ProductUncheckedCreateInput> = {},
    ) {
      const id = createSelfxId();
      productIds.push(id);
      const key = `catalog/platform/${id}.png`;
      storage.objects.set(key, png);
      return db.product.create({
        data: {
          id,
          catalogKey: `platform:product:${id}`,
          categoryId,
          name: "White shirt",
          slug: "white-shirt",
          scope: "PLATFORM_DEFAULT",
          audience: "MEN",
          garmentIntent: "TOP",
          garmentCategory: "TOP",
          garmentPhotoType: "FLAT_LAY",
          imageStorageKey: key,
          imageContentType: "image/png",
          imageWidth: 1,
          imageHeight: 1,
          vtoEnabled: true,
          priceAmountCents: 2500,
          priceCurrency: "INR",
          ...input,
        },
      });
    }
    const preview = () => previewCatalogTransfer(db, "avinash-stores", env);
    function apply(
      plan: CatalogTransferPlan,
      overrides: Partial<Parameters<typeof applyCatalogTransfer>[0]> = {},
    ) {
      return applyCatalogTransfer({
        db,
        storage,
        plan,
        expectedStoreId: targetId,
        expectedHash: plan.hash,
        actorEmail: "operator@transfer.invalid",
        writeBackup: vi.fn().mockResolvedValue(undefined),
        env,
        ...overrides,
      });
    }

    it("dry run is read-only and reports source records, image copies and deterministic slug conflicts", async () => {
      const men = await category(),
        women = await category("WOMEN");
      const first = await product(men.id),
        second = await product(women.id, { audience: "WOMEN", active: false });
      const destinationCategory = await category("MEN", "STORE");
      await product(destinationCategory.id, {
        scope: "STORE",
        organizationId: targetId,
        catalogKey: `store:${targetId}:product:white-shirt`,
      });
      const before = await db.product.findMany({ orderBy: { id: "asc" } });
      const plan = await preview();
      await inspectTransferImages(plan, storage);
      expect(plan.target.id).toBe(targetId);
      expect(plan.products).toHaveLength(2);
      expect(plan.categories).toHaveLength(2);
      expect(new Set(plan.products.map((row) => row.slug)).size).toBe(2);
      expect(plan.products.every((row) => row.slug !== "white-shirt")).toBe(
        true,
      );
      expect(plan.products.map((row) => row.before.id)).toEqual([
        first.id,
        second.id,
      ]);
      expect(
        plan.products.every((row) =>
          row.imageStorageKey?.startsWith(`catalog/stores/${targetId}/`),
        ),
      ).toBe(true);
      expect(await db.product.findMany({ orderBy: { id: "asc" } })).toEqual(
        before,
      );
      expect(await db.auditLog.count({ where: { actorUserId: actorId } })).toBe(
        0,
      );
      expect(storage.putObject).not.toHaveBeenCalled();
    });

    it("moves IDs intact, copies stored images, preserves history/other Stores, invalidates catalog versions, and is idempotent", async () => {
      const cat = await category();
      const garment = await product(cat.id, {
        imageUrl: "https://catalog.invalid/original.png",
      });
      const jewel = await product(cat.id, {
        slug: "ring",
        productVertical: "JEWELLERY",
        jewelleryType: "RING",
        active: false,
      });
      const device = await db.kioskDevice.create({
        data: {
          id: createSelfxId(),
          displayName: "Other Store kiosk",
          organizationId: otherId,
          assignmentScope: "ORGANIZATION",
          configuration: { create: { id: createSelfxId(), version: 7 } },
        },
      });
      const historical = await db.kioskTryOnRun.create({
        data: {
          id: createSelfxId(),
          clientRequestId: "historic",
          productId: garment.id,
          status: "COMPLETED",
          organizationId: otherId,
          assignmentScope: "ORGANIZATION",
          provider: "fixture",
          providerDisplayName: "Fixture",
          providerModel: "fixture",
          garmentSource: "SELFX_CATALOG",
          garmentIntent: "TOP",
          garmentCategory: "TOP",
          garmentPhotoType: "FLAT_LAY",
          generationProfile: "BALANCED",
          expiresAt: new Date(),
        },
      });
      const session = await db.tryOnSession.create({
        data: {
          id: createSelfxId(),
          organizationId: otherId,
          assignmentScope: "ORGANIZATION",
          expiresAt: new Date(),
        },
      });
      const personId = createSelfxId(),
        resultId = createSelfxId();
      await db.tryOnAsset.createMany({
        data: [
          {
            id: personId,
            sessionId: session.id,
            purpose: "PERSON",
            storageKey: `customer/${personId}`,
            organizationId: otherId,
            assignmentScope: "ORGANIZATION",
            expiresAt: new Date(),
          },
          {
            id: resultId,
            sessionId: session.id,
            purpose: "RESULT",
            storageKey: `result/${resultId}`,
            organizationId: otherId,
            assignmentScope: "ORGANIZATION",
            expiresAt: new Date(),
          },
        ],
      });
      const look = await db.tryOnLook.create({
        data: {
          id: createSelfxId(),
          sessionId: session.id,
          kioskTryOnRunId: historical.id,
          productId: garment.id,
          personAssetId: personId,
          resultAssetId: resultId,
          organizationId: otherId,
          assignmentScope: "ORGANIZATION",
          expiresAt: new Date(),
        },
      });
      const assetsBefore = await db.tryOnAsset.findMany({
        where: { sessionId: session.id },
        orderBy: { id: "asc" },
      });
      const otherCategory = await db.productCategory.create({
        data: {
          id: createSelfxId(),
          catalogKey: createSelfxId(),
          scope: "STORE",
          organizationId: otherId,
          name: "Other",
          slug: "other",
        },
      });
      categoryIds.push(otherCategory.id);
      const untouched = await product(otherCategory.id, {
        scope: "STORE",
        organizationId: otherId,
        catalogKey: createSelfxId(),
      });
      const plan = await preview();
      const backup = vi.fn().mockResolvedValue(undefined);
      expect(await apply(plan, { writeBackup: backup })).toMatchObject({
        status: "APPLIED",
        products: 2,
      });
      expect(backup).toHaveBeenCalledWith(plan);
      expect(
        await db.product.count({ where: { scope: "PLATFORM_DEFAULT" } }),
      ).toBe(0);
      expect(
        await db.product.findUniqueOrThrow({ where: { id: garment.id } }),
      ).toMatchObject({
        id: garment.id,
        organizationId: targetId,
        scope: "STORE",
        categoryId: cat.id,
        priceAmountCents: 2500,
        imageUrl: null,
        imageStorageKey: plan.products[0]!.imageStorageKey,
      });
      expect(
        await db.product.findUniqueOrThrow({ where: { id: jewel.id } }),
      ).toMatchObject({
        productVertical: "JEWELLERY",
        jewelleryType: "RING",
        active: false,
      });
      expect(
        await db.productCategory.findUniqueOrThrow({ where: { id: cat.id } }),
      ).toMatchObject({ organizationId: targetId, scope: "STORE" });
      expect(
        await db.kioskTryOnRun.findUniqueOrThrow({
          where: { id: historical.id },
        }),
      ).toEqual(historical);
      expect(
        await db.tryOnLook.findUniqueOrThrow({ where: { id: look.id } }),
      ).toEqual(look);
      expect(
        await db.tryOnAsset.findMany({
          where: { sessionId: session.id },
          orderBy: { id: "asc" },
        }),
      ).toEqual(assetsBefore);
      expect(
        await db.product.findUniqueOrThrow({ where: { id: untouched.id } }),
      ).toEqual(untouched);
      expect(
        (
          await db.kioskDevice.findUniqueOrThrow({
            where: { id: device.id },
            include: { configuration: true },
          })
        ).organizationId,
      ).toBe(otherId);
      expect(
        (
          await db.kioskDeviceConfiguration.findUniqueOrThrow({
            where: { kioskDeviceId: device.id },
          })
        ).version,
      ).toBe(8);
      expect(await db.productStockSettings.count()).toBe(0);
      expect(storage.objects.has(garment.imageStorageKey!)).toBe(true);
      const writes = storage.putObject.mock.calls.length;
      expect(await apply(plan)).toMatchObject({ status: "ALREADY_APPLIED" });
      expect(storage.putObject).toHaveBeenCalledTimes(writes);
      const audit = await db.auditLog.findFirstOrThrow({
        where: { resourceId: plan.id },
      });
      expect(audit.actorUserId).toBe(actorId);
      expect(audit.organizationId).toBe(targetId);
      expect(audit.metadata).toMatchObject({
        planHash: plan.hash,
        inverseManifest: {
          products: [
            { before: { scope: "PLATFORM_DEFAULT" } },
            { before: { scope: "PLATFORM_DEFAULT" } },
          ],
        },
      });
      expect((await preview()).products).toHaveLength(0);
    });

    it("rejects wrong Store IDs, hashes, changed source/destination data and Railway environment without mutation", async () => {
      const cat = await category(),
        original = await product(cat.id);
      const plan = await preview();
      await expect(apply(plan, { expectedStoreId: otherId })).rejects.toThrow(
        "Store ID",
      );
      await expect(
        apply(plan, { expectedHash: "0".repeat(64) }),
      ).rejects.toThrow("hash");
      await expect(
        apply(plan, { env: { ...env, RAILWAY_ENVIRONMENT_ID: "other" } }),
      ).rejects.toThrow("changed");
      await db.product.update({
        where: { id: original.id },
        data: { priceAmountCents: 3000 },
      });
      await expect(apply(plan)).rejects.toThrow("changed");
      const fresh = await preview();
      await category("WOMEN", "STORE", "new-destination-category");
      await expect(apply(fresh)).rejects.toThrow("changed");
      expect(storage.putObject).not.toHaveBeenCalled();
      expect(
        (await db.product.findUniqueOrThrow({ where: { id: original.id } }))
          .scope,
      ).toBe("PLATFORM_DEFAULT");
    });

    it("refuses a merchant-only or inactive actor without changing role/permission records", async () => {
      await product((await category()).id);
      const plan = await preview();
      await db.platformRoleAssignment.deleteMany({
        where: { userId: actorId },
      });
      await expect(apply(plan)).rejects.toThrow("permissions");
      await db.user.update({
        where: { id: actorId },
        data: { status: "DISABLED" },
      });
      await expect(apply(plan)).rejects.toThrow("ACTIVE platform");
      expect(storage.putObject).not.toHaveBeenCalled();
    });

    it("requires backup success and readable valid images before committing ownership", async () => {
      const item = await product((await category()).id);
      const plan = await preview();
      await expect(
        apply(plan, {
          writeBackup: async () => {
            throw new Error("disk full");
          },
        }),
      ).rejects.toThrow("disk full");
      expect(storage.putObject).not.toHaveBeenCalled();
      storage.objects.delete(item.imageStorageKey!);
      await expect(inspectTransferImages(plan, storage)).rejects.toThrow(
        "missing",
      );
      storage.objects.set(item.imageStorageKey!, Buffer.from("corrupt image"));
      await expect(apply(plan)).rejects.toThrow("Image copy failed");
      expect(
        (await db.product.findUniqueOrThrow({ where: { id: item.id } })).scope,
      ).toBe("PLATFORM_DEFAULT");
    });

    it("keeps ownership unchanged when copying images fails", async () => {
      const item = await product((await category()).id);
      const plan = await preview();
      storage.putObject.mockRejectedValueOnce(new Error("storage offline"));
      await expect(apply(plan)).rejects.toThrow("Image copy failed");
      expect(
        (await db.product.findUniqueOrThrow({ where: { id: item.id } }))
          .organizationId,
      ).toBeNull();
      expect(await db.auditLog.count({ where: { resourceId: plan.id } })).toBe(
        0,
      );
    });

    it("rolls back category/product ownership and cache versions if the audit commit fails", async () => {
      const cat = await category(),
        item = await product(cat.id),
        plan = await preview();
      const failing: TransferDatabase = {
        $queryRaw: db.$queryRaw.bind(db),
        $executeRaw: db.$executeRaw.bind(db),
        $transaction: (callback, options) =>
          db.$transaction(
            (tx) =>
              callback(
                new Proxy(tx, {
                  get(target, property) {
                    if (property === "auditLog")
                      return {
                        ...target.auditLog,
                        create: async () => {
                          throw new Error("simulated audit failure");
                        },
                      };
                    return Reflect.get(target, property);
                  },
                }),
              ),
            options,
          ),
      };
      await expect(apply(plan, { db: failing })).rejects.toThrow(
        "simulated audit failure",
      );
      expect(
        await db.product.findUniqueOrThrow({ where: { id: item.id } }),
      ).toEqual(item);
      expect(
        await db.productCategory.findUniqueOrThrow({ where: { id: cat.id } }),
      ).toEqual(cat);
      expect(storage.objects.has(item.imageStorageKey!)).toBe(true);
    });

    it("blocks pending Try-Ons, shared categories and inactive or missing destination Stores", async () => {
      const cat = await category(),
        item = await product(cat.id);
      const pending = await db.kioskTryOnRun.create({
        data: {
          id: createSelfxId(),
          clientRequestId: "pending",
          productId: item.id,
          status: "PROCESSING",
          assignmentScope: "PLATFORM",
          provider: "fixture",
          providerDisplayName: "Fixture",
          providerModel: "fixture",
          garmentSource: "SELFX_CATALOG",
          garmentIntent: "TOP",
          garmentCategory: "TOP",
          garmentPhotoType: "FLAT_LAY",
          generationProfile: "BALANCED",
          expiresAt: new Date(),
        },
      });
      await expect(preview()).rejects.toThrow("queued/processing");
      await db.kioskTryOnRun.delete({ where: { id: pending.id } });
      await product(cat.id, {
        scope: "STORE",
        organizationId: otherId,
        catalogKey: createSelfxId(),
      });
      await expect(preview()).rejects.toThrow("outside this transfer");
      await db.organization.update({
        where: { id: targetId },
        data: { status: "SUSPENDED" },
      });
      await expect(preview()).rejects.toThrow("ACTIVE Store");
      await expect(previewCatalogTransfer(db, "missing", env)).rejects.toThrow(
        "ACTIVE Store",
      );
    });

    it("preserves URL-only references without any external fetch or image write", async () => {
      const cat = await category();
      const item = await product(cat.id, {
        imageStorageKey: null,
        imageUrl: "https://external.invalid/shirt.png",
      });
      const plan = await preview();
      await apply(plan);
      expect(storage.putObject).not.toHaveBeenCalled();
      expect(
        await db.product.findUniqueOrThrow({ where: { id: item.id } }),
      ).toMatchObject({ imageUrl: item.imageUrl, imageStorageKey: null });
      expect(plan.warnings.some((text) => text.startsWith("URL-only"))).toBe(
        true,
      );
    });
  },
);

function fakeStorage() {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    headObject: vi.fn(async (key: string) => {
      const data = objects.get(key);
      if (!data) throw new Error("missing");
      return { sizeBytes: data.length, contentType: "image/png" };
    }),
    readObject: vi.fn(async (key: string) => {
      const data = objects.get(key);
      if (!data) throw new Error("missing");
      return data;
    }),
    putObject: vi.fn(
      async ({
        key,
        body,
      }: {
        key: string;
        body: Buffer;
        contentType: string;
      }) => {
        objects.set(key, Buffer.from(body));
      },
    ),
  };
}
