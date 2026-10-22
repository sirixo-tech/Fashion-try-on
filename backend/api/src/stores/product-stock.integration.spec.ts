import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { CatalogService } from "../catalog/catalog.service.js";
import { ProductStockService } from "./product-stock.service.js";
import { type UpdateProductStockDto } from "./dto/product-stock.dto.js";
import { ApiErrorException } from "../common/api-error.exception.js";

async function expectApiCode(promise: Promise<unknown>, code: string) {
  await expect(
    promise.catch((error: ApiErrorException) => error.getResponse()),
  ).resolves.toMatchObject({ error: { code } });
}

// Use an explicitly selected disposable LOCAL database, never the app's .env.
const databaseUrl = process.env.STOCK_TEST_DATABASE_URL;
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (
    !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
    !parsed.pathname.endsWith("_test")
  ) {
    throw new Error(
      "Stock integration tests require a disposable localhost database ending in _test.",
    );
  }
}

describe.skipIf(!databaseUrl)("SHOPPING-1 PostgreSQL integration", () => {
  const prisma = new PrismaService({
    datasourceUrl: databaseUrl ?? "postgresql://unused@127.0.0.1/unused_test",
  });
  const stock = new ProductStockService(prisma);
  const storeId = createSelfxId();
  const otherStoreId = createSelfxId();
  const actorId = createSelfxId();
  const categoryId = createSelfxId();
  const productIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    for (const id of [storeId, otherStoreId]) {
      await prisma.organization.create({
        data: {
          id,
          name: "Stock test",
          slug: `stock-test-${id}`,
          status: "ACTIVE",
        },
      });
    }
    await prisma.user.create({
      data: {
        id: actorId,
        email: `${actorId}@stock-test.invalid`,
        passwordHash: "not-a-login",
      },
    });
    await prisma.productCategory.create({
      data: {
        id: categoryId,
        catalogKey: `stock-test-${categoryId}`,
        scope: "STORE",
        organizationId: storeId,
        name: "Tops",
        slug: "tops",
      },
    });
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { organizationId: { in: [storeId, otherStoreId] } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.productCategory.deleteMany({ where: { id: categoryId } });
    await prisma.organization.deleteMany({
      where: { id: { in: [storeId, otherStoreId] } },
    });
    await prisma.user.deleteMany({ where: { id: actorId } });
    await prisma.$disconnect();
  });
  async function product() {
    const id = createSelfxId();
    productIds.push(id);
    await prisma.product.create({
      data: {
        id,
        catalogKey: `stock-test-${id}`,
        scope: "STORE",
        organizationId: storeId,
        categoryId,
        name: "Shirt",
        slug: `shirt-${id}`,
        audience: "UNISEX",
        active: true,
        vtoEnabled: true,
        garmentIntent: "TOP",
        garmentCategory: "TOP",
        imageUrl: "https://example.com/shirt.jpg",
        priceAmountCents: 10000,
        priceCurrency: "INR",
      },
    });
    return id;
  }
  const input = (
    overrides: Partial<UpdateProductStockDto> = {},
  ): UpdateProductStockDto => ({
    expectedVersion: 0,
    optionMode: "SINGLE",
    pricingMode: "CONSTANT",
    reason: "Initial count",
    variants: [{ stockQuantity: 5 }],
    ...overrides,
  });

  it("shares optional colour images across sizes, preserves them for old clients and rejects another Store's assets", async () => {
    const id = await product();
    const storageKey =
      "catalog/stores/" + storeId + "/" + createSelfxId() + ".jpg";
    const image = {
      color: "Black",
      storageKey,
      contentType: "image/jpeg",
      width: 600,
      height: 800,
    };
    const variants = [
      { size: "M", color: "Black", stockQuantity: 2 },
      { size: "L", color: "Black", stockQuantity: 0 },
    ];
    const service = new ProductStockService(prisma, {
      createReadUrl: ({ key }: { key: string }) =>
        "https://assets.example.test/" + key,
    } as never);
    const configured = await service.update(
      storeId,
      id,
      actorId,
      input({ optionMode: "SIZE_COLOR", variants, colorImages: [image] }),
    );
    expect(configured.colorImages).toHaveLength(1);
    expect(configured.colorImages[0]).toMatchObject({
      ...image,
      url: "https://assets.example.test/" + storageKey,
    });
    expect((await service.getForKiosk(storeId, id)).storeName).toBe(
      "Stock test",
    );
    const preserved = await stock.update(
      storeId,
      id,
      actorId,
      input({ expectedVersion: 1, optionMode: "SIZE_COLOR", variants }),
    );
    expect(preserved.colorImages).toHaveLength(1);
    await expectApiCode(
      stock.update(
        storeId,
        id,
        actorId,
        input({
          expectedVersion: 2,
          optionMode: "SIZE_COLOR",
          variants,
          colorImages: [
            { ...image, storageKey: storageKey.replace(storeId, otherStoreId) },
          ],
        }),
      ),
      "PRODUCT_STOCK_INVALID",
    );
    expect((await stock.get(storeId, id)).version).toBe(2);
    await stock.update(
      storeId,
      id,
      actorId,
      input({
        expectedVersion: 2,
        optionMode: "SIZE_COLOR",
        variants,
        colorImages: [],
      }),
    );
    expect((await stock.get(storeId, id)).colorImages).toEqual([]);
    await expectApiCode(
      stock.getForKiosk(otherStoreId, id),
      "PRODUCT_NOT_FOUND",
    );
  });
  it("returns one catalog card with minimum variant price even when every variant is sold out", async () => {
    const id = await product();
    await stock.update(
      storeId,
      id,
      actorId,
      input({
        optionMode: "COLOR",
        pricingMode: "VARIANT",
        variants: [
          { color: "Red", stockQuantity: 0, priceOverrideAmountCents: 15000 },
          { color: "Blue", stockQuantity: 0, priceOverrideAmountCents: 12000 },
        ],
      }),
    );
    const result = await new CatalogService(
      prisma,
      {} as never,
      {} as never,
    ).listKioskProducts(storeId, {});
    const matches = result.data.filter((row) => row.id === id);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      minimumPriceAmountCents: 12000,
      hasVariablePrices: true,
    });
  });
  it("distinguishes unconfigured stock from zero and leaves zero-stock products in Try-On catalog", async () => {
    const id = await product();
    expect(await stock.get(storeId, id)).toMatchObject({
      configured: false,
      version: 0,
      variants: [],
    });
    await stock.update(
      storeId,
      id,
      actorId,
      input({ variants: [{ stockQuantity: 0 }] }),
    );
    expect(await stock.getForKiosk(storeId, id)).toMatchObject({
      configured: true,
      totalStockQuantity: 0,
    });
    const catalog = new CatalogService(prisma, {} as never, {} as never);
    const result = await catalog.listKioskProducts(storeId, {
      page: 1,
      pageSize: 100,
    });
    expect(result.data.some((item) => item.id === id)).toBe(true);
  });
  it("resolves variant overrides/inheritance, clears them under constant pricing and audits the actor", async () => {
    const id = await product();
    const first = await stock.update(
      storeId,
      id,
      actorId,
      input({
        optionMode: "SIZE_COLOR",
        pricingMode: "VARIANT",
        variants: [
          {
            size: "M",
            color: "Black",
            stockQuantity: 5,
            priceOverrideAmountCents: 12000,
          },
          { size: "L", color: "Black", stockQuantity: 0 },
        ],
      }),
    );
    expect(
      first.variants.map((v) => v.effectivePriceAmountCents).sort(),
    ).toEqual([10000, 12000]);
    const second = await stock.update(
      storeId,
      id,
      actorId,
      input({
        expectedVersion: 1,
        optionMode: "SIZE_COLOR",
        variants: [
          { size: "M", color: "Black", stockQuantity: 5 },
          { size: "L", color: "Black", stockQuantity: 0 },
        ],
      }),
    );
    expect(
      second.variants.every(
        (v) =>
          v.effectivePriceAmountCents === 10000 &&
          v.priceOverrideAmountCents === null,
      ),
    ).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { resourceId: id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.actorUserId).toBe(actorId);
    expect(audit.organizationId).toBe(storeId);
    expect(audit.metadata).toMatchObject({
      reason: "Initial count",
      before: { version: 1 },
      after: { version: 2 },
    });
  });
  it("allows exactly one of two simultaneous initial saves and rejects a stale retry without a second audit", async () => {
    const id = await product();
    const results = await Promise.allSettled([
      stock.update(storeId, id, actorId, input()),
      stock.update(storeId, id, actorId, input()),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(
      rejected?.status === "rejected" && rejected.reason.getResponse(),
    ).toMatchObject({ error: { code: "PRODUCT_STOCK_VERSION_CONFLICT" } });
    await expectApiCode(
      stock.update(storeId, id, actorId, input()),
      "PRODUCT_STOCK_VERSION_CONFLICT",
    );
    expect(await prisma.auditLog.count({ where: { resourceId: id } })).toBe(1);
    expect((await stock.get(storeId, id)).totalStockQuantity).toBe(5);
  });
  it("preserves option IDs when an option is removed and restored", async () => {
    const id = await product();
    const first = await stock.update(
      storeId,
      id,
      actorId,
      input({
        optionMode: "SIZE",
        variants: [{ size: "M", stockQuantity: 2 }],
      }),
    );
    await stock.update(
      storeId,
      id,
      actorId,
      input({
        expectedVersion: 1,
        optionMode: "SIZE",
        variants: [{ size: "L", stockQuantity: 3 }],
      }),
    );
    const restored = await stock.update(
      storeId,
      id,
      actorId,
      input({
        expectedVersion: 2,
        optionMode: "SIZE",
        variants: [{ size: "m", stockQuantity: 4 }],
      }),
    );
    expect(restored.variants[0]!.id).toBe(first.variants[0]!.id);
    expect(
      await prisma.productVariant.count({ where: { productId: id } }),
    ).toBe(2);
  });
  it("rejects cross-Store reads/writes and platform kiosk fallback", async () => {
    const id = await product();
    await expectApiCode(stock.get(otherStoreId, id), "PRODUCT_NOT_FOUND");
    await expectApiCode(
      stock.update(otherStoreId, id, actorId, input()),
      "PRODUCT_NOT_FOUND",
    );
    await expectApiCode(stock.getForKiosk(null, id), "PRODUCT_NOT_FOUND");
    expect(
      await prisma.productStockSettings.count({ where: { productId: id } }),
    ).toBe(0);
  });
  it("blocks writes and kiosk stock reads for suspended Stores", async () => {
    const id = await product();
    await prisma.organization.update({
      where: { id: storeId },
      data: { status: "SUSPENDED" },
    });
    try {
      await expectApiCode(
        stock.update(storeId, id, actorId, input()),
        "STORE_INACTIVE",
      );
      await expectApiCode(stock.getForKiosk(storeId, id), "STORE_INACTIVE");
    } finally {
      await prisma.organization.update({
        where: { id: storeId },
        data: { status: "ACTIVE" },
      });
    }
  });
  it("rolls back stock when audit persistence fails", async () => {
    const id = await product();
    await expect(
      stock.update(storeId, id, createSelfxId(), input()),
    ).rejects.toThrow();
    expect(
      await prisma.productStockSettings.count({ where: { productId: id } }),
    ).toBe(0);
    expect(
      await prisma.productVariant.count({ where: { productId: id } }),
    ).toBe(0);
  });
  it("does not allow monetary overrides without a product currency", async () => {
    const id = await product();
    await prisma.product.update({
      where: { id },
      data: { priceAmountCents: null, priceCurrency: null },
    });
    await expectApiCode(
      stock.update(
        storeId,
        id,
        actorId,
        input({
          pricingMode: "VARIANT",
          variants: [{ stockQuantity: 1, priceOverrideAmountCents: 200 }],
        }),
      ),
      "PRODUCT_STOCK_INVALID",
    );
    expect(
      await prisma.productStockSettings.count({ where: { productId: id } }),
    ).toBe(0);
  });

  it("rejects editing imported products even after their mapping is archived", async () => {
    const id = await product();
    const integrationId = createSelfxId();
    await prisma.integration.create({
      data: { id: integrationId, organizationId: storeId, type: "SHOPIFY" },
    });
    try {
      await prisma.externalProductMapping.create({
        data: {
          id: createSelfxId(),
          integrationId,
          organizationId: storeId,
          productId: id,
          externalProductId: "external-product",
          status: "ARCHIVED",
        },
      });
      await expectApiCode(
        stock.get(storeId, id),
        "PRODUCT_STOCK_EXTERNALLY_MANAGED",
      );
      await expectApiCode(
        stock.update(storeId, id, actorId, input()),
        "PRODUCT_STOCK_EXTERNALLY_MANAGED",
      );
      expect(
        await prisma.productStockSettings.count({ where: { productId: id } }),
      ).toBe(0);
    } finally {
      await prisma.integration.delete({ where: { id: integrationId } });
    }
  });

  it("enforces database quantity, duplicate-option and composite tenant constraints", async () => {
    const id = await product();
    const setup = await stock.update(storeId, id, actorId, input());
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: setup.variants[0]!.id },
    });
    await expect(
      prisma.productVariant.update({
        where: { id: variant.id },
        data: { stockQuantity: -1 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.productVariant.update({
        where: { id: variant.id },
        data: { priceOverrideAmountCents: -1 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.productVariant.create({
        data: { ...variant, id: createSelfxId() },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.productVariant.update({
        where: { id: variant.id },
        data: { organizationId: otherStoreId },
      }),
    ).rejects.toThrow();
    await prisma.product.delete({ where: { id } });
    expect(
      await prisma.productVariant.count({ where: { productId: id } }),
    ).toBe(0);
    expect(await prisma.auditLog.count({ where: { resourceId: id } })).toBe(1);
  });
});
