import { ExternalProductMappingStatus, IntegrationType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  INTEGRATION_CATALOG_SYNC_ERROR_CODES,
  IntegrationCatalogSyncService,
} from "./integration-catalog-sync.service.js";
import { type IntegrationCredentialContext } from "./integration-token-auth.service.js";

const credential: IntegrationCredentialContext = {
  credentialId: "credential-1",
  integrationId: "integration-1",
  integrationType: IntegrationType.SHOPIFY,
  tokenPrefix: "selfx_shopify_abcdefghijklmnop",
  storeId: "store-1",
  storeName: "Store One",
  externalAccountId: "demo.myshopify.com",
  externalAccountName: "Demo Shop",
  scopes: ["catalog:sync"],
};

const productInput = {
  externalProductId: "shopify-product-1",
  title: "Black Tee",
  handle: "black-tee",
  description: "Commerce description",
  status: "ACTIVE" as const,
  productUrl: "https://shop.example/products/black-tee",
  featuredImageUrl: "https://cdn.example/black-tee.jpg",
  priceAmountCents: 2999,
  priceCurrency: "USD",
  sourceUpdatedAt: "2026-09-07T09:00:00.000Z",
  variants: [
    {
      externalVariantId: "variant-1",
      sku: "TEE-BLK-M",
      title: "Medium",
      priceAmountCents: 2999,
      priceCurrency: "USD",
      available: true,
    },
  ],
};

describe("IntegrationCatalogSyncService", () => {
  it("creates a Store-scoped, disabled SelfX snapshot and external mappings", async () => {
    const tx = createTransaction();
    tx.externalProductMapping.findFirst.mockResolvedValue(null);
    tx.externalProductMapping.findMany.mockResolvedValue([]);
    const service = createService(tx);

    const result = await service.sync(credential, {
      mode: "INCREMENTAL",
      products: [productInput],
    });

    expect(result).toMatchObject({
      direction: "COMMERCE_TO_SELFX",
      sourceOfTruth: "COMMERCE_PLATFORM",
      finalized: false,
      created: 1,
      updated: 0,
    });
    expect(tx.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: "STORE",
        organizationId: "store-1",
        name: "Black Tee",
        active: true,
        vtoEnabled: false,
        garmentIntent: "AUTO",
        garmentCategory: "AUTO",
        garmentPhotoType: "AUTO",
        productUrl: "https://shop.example/products/black-tee",
      }),
    });
    expect(tx.externalProductMapping.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        integrationId: "integration-1",
        organizationId: "store-1",
        externalProductId: "shopify-product-1",
        status: ExternalProductMappingStatus.ACTIVE,
      }),
    });
    expect(JSON.stringify(tx.product.create.mock.calls)).not.toContain(
      "myshopify.com",
    );
  });

  it("creates a VTO-enabled product when commerce explicitly marks it eligible", async () => {
    const tx = createTransaction();
    tx.externalProductMapping.findFirst.mockResolvedValue(null);
    tx.externalProductMapping.findMany.mockResolvedValue([]);
    const service = createService(tx);

    await service.sync(credential, {
      mode: "INCREMENTAL",
      products: [{ ...productInput, vtoEnabled: true }],
    });

    expect(tx.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vtoEnabled: true,
      }),
    });
  });

  it("updates commerce fields without changing SelfX-owned VTO settings", async () => {
    const tx = createTransaction();
    tx.externalProductMapping.findFirst.mockResolvedValue({
      id: "mapping-1",
      productId: "selfx-product-1",
      externalProductId: "shopify-product-1",
      externalUpdatedAt: new Date("2026-09-07T08:00:00.000Z"),
      lastSeenAt: new Date("2026-09-07T08:00:00.000Z"),
    });
    tx.externalProductMapping.findMany.mockResolvedValue([]);
    const service = createService(tx);

    await service.sync(credential, {
      mode: "INCREMENTAL",
      products: [productInput],
    });

    const updateData = tx.product.update.mock.calls[0]?.[0]?.data;
    expect(updateData).toMatchObject({
      name: "Black Tee",
      active: true,
      priceAmountCents: 2999,
      priceCurrency: "USD",
    });
    expect(updateData).not.toHaveProperty("vtoEnabled");
    expect(updateData).not.toHaveProperty("garmentIntent");
    expect(updateData).not.toHaveProperty("garmentCategory");
    expect(updateData).not.toHaveProperty("garmentPhotoType");
    expect(updateData).not.toHaveProperty("productVertical");
  });

  it("updates VTO eligibility when commerce sends an explicit eligibility signal", async () => {
    const tx = createTransaction();
    tx.externalProductMapping.findFirst.mockResolvedValue({
      id: "mapping-1",
      productId: "selfx-product-1",
      externalProductId: "shopify-product-1",
      externalUpdatedAt: new Date("2026-09-07T08:00:00.000Z"),
      lastSeenAt: new Date("2026-09-07T08:00:00.000Z"),
    });
    tx.externalProductMapping.findMany.mockResolvedValue([]);
    const service = createService(tx);

    await service.sync(credential, {
      mode: "INCREMENTAL",
      products: [{ ...productInput, vtoEnabled: true }],
    });

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: "selfx-product-1" },
      data: expect.objectContaining({
        vtoEnabled: true,
      }),
    });
  });

  it("skips a product without an image and continues importing the batch", async () => {
    const tx = createTransaction();
    tx.externalProductMapping.findFirst.mockResolvedValue(null);
    const service = createService(tx);

    const result = await service.sync(credential, {
      mode: "INCREMENTAL",
      products: [
        {
          ...productInput,
          externalProductId: "shopify-product-without-image",
          featuredImageUrl: null,
        },
        productInput,
      ],
    });

    expect(result).toMatchObject({
      created: 1,
      updated: 0,
      archived: 0,
      skippedWithoutImage: 1,
    });
    expect(tx.product.create).toHaveBeenCalledTimes(1);
    expect(tx.externalProductMapping.create).toHaveBeenCalledTimes(2);
    expect(
      JSON.stringify(tx.externalProductMapping.create.mock.calls),
    ).not.toContain("shopify-product-without-image");
  });

  it("archives an imported product when its commerce image is removed", async () => {
    const tx = createTransaction();
    tx.externalProductMapping.findFirst.mockResolvedValue({
      id: "mapping-1",
      productId: "selfx-product-1",
      externalProductId: "shopify-product-1",
      externalUpdatedAt: new Date("2026-09-07T08:00:00.000Z"),
      lastSeenAt: new Date("2026-09-07T08:00:00.000Z"),
    });
    const service = createService(tx);

    const result = await service.sync(credential, {
      mode: "INCREMENTAL",
      products: [{ ...productInput, featuredImageUrl: null }],
    });

    expect(result).toMatchObject({ archived: 1, skippedWithoutImage: 1 });
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: "selfx-product-1" },
      data: { active: false },
    });
  });

  it("ignores delayed source updates", async () => {
    const tx = createTransaction();
    tx.externalProductMapping.findFirst.mockResolvedValue({
      id: "mapping-1",
      productId: "selfx-product-1",
      externalProductId: "shopify-product-1",
      externalUpdatedAt: new Date("2026-09-07T10:00:00.000Z"),
      lastSeenAt: new Date("2026-09-07T08:00:00.000Z"),
    });
    const service = createService(tx);

    const result = await service.sync(credential, {
      mode: "INCREMENTAL",
      products: [productInput],
    });

    expect(result.ignoredAsStale).toBe(1);
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.externalProductMapping.update).toHaveBeenCalledWith({
      where: { id: "mapping-1" },
      data: { lastSeenAt: expect.any(Date) },
    });
  });

  it("still applies explicit VTO eligibility on stale product snapshots", async () => {
    const tx = createTransaction();
    tx.externalProductMapping.findFirst.mockResolvedValue({
      id: "mapping-1",
      productId: "selfx-product-1",
      externalProductId: "shopify-product-1",
      externalUpdatedAt: new Date("2026-09-07T10:00:00.000Z"),
      lastSeenAt: new Date("2026-09-07T08:00:00.000Z"),
    });
    const service = createService(tx);

    const result = await service.sync(credential, {
      mode: "INCREMENTAL",
      products: [{ ...productInput, vtoEnabled: true }],
    });

    expect(result.ignoredAsStale).toBe(1);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: "selfx-product-1" },
      data: { vtoEnabled: true },
    });
    expect(tx.externalProductMapping.update).toHaveBeenCalledWith({
      where: { id: "mapping-1" },
      data: { lastSeenAt: expect.any(Date) },
    });
  });

  it("archives the SelfX snapshot when commerce archives a product", async () => {
    const tx = createTransaction();
    tx.externalProductMapping.findFirst.mockResolvedValue({
      id: "mapping-1",
      productId: "selfx-product-1",
      externalProductId: "shopify-product-1",
      externalUpdatedAt: new Date("2026-09-07T08:00:00.000Z"),
      lastSeenAt: new Date("2026-09-07T08:00:00.000Z"),
    });
    const service = createService(tx);

    const result = await service.sync(credential, {
      mode: "INCREMENTAL",
      products: [{ ...productInput, status: "ARCHIVED" }],
    });

    expect(result.archived).toBe(1);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: "selfx-product-1" },
      data: { active: false },
    });
    expect(tx.externalProductMapping.updateMany).toHaveBeenCalledWith({
      where: {
        integrationId: "integration-1",
        externalProductId: "shopify-product-1",
      },
      data: {
        status: ExternalProductMappingStatus.ARCHIVED,
        externalUpdatedAt: new Date("2026-09-07T09:00:00.000Z"),
        lastSeenAt: expect.any(Date),
      },
    });
  });

  it("archives local products missing from a full commerce snapshot", async () => {
    const tx = createTransaction();
    tx.externalProductMapping.findMany.mockResolvedValue([
      {
        id: "mapping-1",
        productId: "selfx-product-1",
        externalProductId: "missing-product",
        externalUpdatedAt: new Date("2026-09-07T08:00:00.000Z"),
        lastSeenAt: new Date("2026-09-07T08:00:00.000Z"),
      },
    ]);
    const service = createService(tx);

    const result = await service.sync(credential, {
      mode: "FULL",
      sourceSnapshotAt: "2026-09-07T09:00:00.000Z",
      finalize: true,
      products: [],
    });

    expect(result.finalized).toBe(true);
    expect(result.archived).toBe(1);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: "selfx-product-1" },
      data: { active: false },
    });
  });

  it("does not archive products already seen in a newer full snapshot", async () => {
    const tx = createTransaction();
    tx.externalProductMapping.findMany.mockResolvedValue([
      {
        id: "mapping-1",
        productId: "selfx-product-1",
        externalProductId: "newer-product",
        externalUpdatedAt: new Date("2026-09-07T10:00:00.000Z"),
        lastSeenAt: new Date("2026-09-07T10:00:00.000Z"),
      },
    ]);
    const service = createService(tx);

    const result = await service.sync(credential, {
      mode: "FULL",
      sourceSnapshotAt: "2026-09-07T09:00:00.000Z",
      finalize: true,
      products: [],
    });

    expect(result.archived).toBe(0);
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it("does not reconcile missing products before the final full-sync batch", async () => {
    const tx = createTransaction();
    tx.externalProductMapping.findMany.mockResolvedValue([
      {
        id: "mapping-1",
        productId: "selfx-product-1",
        externalProductId: "missing-product",
        externalUpdatedAt: new Date("2026-09-07T08:00:00.000Z"),
        lastSeenAt: new Date("2026-09-07T08:00:00.000Z"),
      },
    ]);
    const service = createService(tx);

    const result = await service.sync(credential, {
      mode: "FULL",
      sourceSnapshotAt: "2026-09-07T09:00:00.000Z",
      finalize: false,
      products: [],
    });

    expect(result.finalized).toBe(false);
    expect(tx.externalProductMapping.findMany).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it("archives every local product reference when an integration is removed", async () => {
    const tx = createTransaction();
    tx.externalProductMapping.findMany.mockResolvedValue([
      { productId: "selfx-product-1" },
      { productId: "selfx-product-2" },
    ]);
    const service = createService(tx);
    const archivedAt = new Date("2026-09-07T11:00:00.000Z");

    await expect(
      service.archiveIntegrationCatalog("integration-1", archivedAt),
    ).resolves.toBe(2);
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["selfx-product-1", "selfx-product-2"] },
      },
      data: { active: false },
    });
    expect(tx.externalProductMapping.updateMany).toHaveBeenCalledWith({
      where: { integrationId: "integration-1" },
      data: {
        status: ExternalProductMappingStatus.ARCHIVED,
        externalUpdatedAt: archivedAt,
        lastSeenAt: archivedAt,
      },
    });
  });

  it("rejects duplicate external product identities", async () => {
    const tx = createTransaction();
    const service = createService(tx);

    await expect(
      service.sync(credential, {
        mode: "INCREMENTAL",
        products: [productInput, productInput],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: INTEGRATION_CATALOG_SYNC_ERROR_CODES.duplicateProduct,
        }),
      }),
    });
    expect(tx.product.create).not.toHaveBeenCalled();
  });
});

function createService(tx: ReturnType<typeof createTransaction>) {
  return new IntegrationCatalogSyncService({
    $transaction: vi.fn(async (callback) => callback(tx)),
  } as never);
}

function createTransaction() {
  return {
    productCategory: {
      upsert: vi.fn().mockResolvedValue({ id: "category-1" }),
    },
    product: {
      create: vi.fn().mockResolvedValue({ id: "selfx-product-1" }),
      update: vi.fn().mockResolvedValue({ id: "selfx-product-1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    externalProductMapping: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "mapping-1" }),
      update: vi.fn().mockResolvedValue({ id: "mapping-1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}
