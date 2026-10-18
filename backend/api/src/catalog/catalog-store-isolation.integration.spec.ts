import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { CatalogService } from "./catalog.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { JewelleryCaptureRequirementsService } from "../try-on/jewellery/jewellery-capture-requirements.service.js";

const url = process.env.CATALOG_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test"))
)
  throw new Error("Disposable localhost database required.");

describe.skipIf(!url)("Store-only kiosk catalog — PostgreSQL", () => {
  const db = new PrismaClient({
    datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
  });
  const service = new CatalogService(
    db as PrismaService,
    {} as never,
    new JewelleryCaptureRequirementsService(),
  );
  const stores = [createSelfxId(), createSelfxId(), createSelfxId()];
  const products: string[] = [],
    categories: string[] = [];
  let platformGarment: string,
    platformJewellery: string,
    ownGarment: string,
    otherGarment: string;
  async function createProduct(
    storeId: string | null,
    vertical: "GARMENT" | "JEWELLERY" = "GARMENT",
  ) {
    const categoryId = createSelfxId(),
      id = createSelfxId();
    categories.push(categoryId);
    products.push(id);
    const scope = storeId ? "STORE" : "PLATFORM_DEFAULT";
    await db.productCategory.create({
      data: {
        id: categoryId,
        catalogKey: categoryId,
        scope,
        organizationId: storeId,
        name: id,
        slug: id,
      },
    });
    await db.product.create({
      data: {
        id,
        catalogKey: id,
        scope,
        organizationId: storeId,
        categoryId,
        name: id,
        slug: id,
        audience: "UNISEX",
        productVertical: vertical,
        jewelleryType: vertical === "JEWELLERY" ? "EARRING" : null,
        garmentIntent: vertical === "JEWELLERY" ? "JEWELLERY" : "TOP",
        garmentCategory: vertical === "JEWELLERY" ? "EARRING" : "TOP",
        garmentPhotoType: "PRODUCT",
        imageUrl: "https://example.invalid/catalog.png",
        active: true,
        vtoEnabled: true,
      },
    });
    return id;
  }
  beforeAll(async () => {
    await db.$connect();
    for (const id of stores)
      await db.organization.create({
        data: { id, name: id, slug: id, status: "ACTIVE" },
      });
    platformGarment = await createProduct(null);
    platformJewellery = await createProduct(null, "JEWELLERY");
    ownGarment = await createProduct(stores[0]!);
    otherGarment = await createProduct(stores[1]!);
  });
  afterAll(async () => {
    await db.product.deleteMany({ where: { id: { in: products } } });
    await db.productCategory.deleteMany({ where: { id: { in: categories } } });
    await db.organization.deleteMany({ where: { id: { in: stores } } });
    await db.$disconnect();
  });
  it("returns only the assigned Store's products, including categories and snapshot", async () => {
    const result = await service.listKioskProducts(stores[0]!, {});
    expect(result.data.map((p) => p.id)).toEqual([ownGarment]);
    const snapshot = await service.getKioskCatalogSnapshot(stores[0]!, 1);
    expect(snapshot).toMatchObject({
      scope: "STORE",
      storeTenantId: stores[0],
      productCount: 1,
    });
    expect(snapshot.products.map((p) => p.id)).toEqual([ownGarment]);
    expect(snapshot.categories).toHaveLength(1);
    expect(
      (await service.listKioskCategories(stores[0]!, {})).data,
    ).toHaveLength(1);
  });
  it.each(["GARMENT", "JEWELLERY"] as const)(
    "keeps an empty Store empty for %s despite platform products",
    async (productVertical) => {
      expect(
        (await service.listKioskProducts(stores[2]!, { productVertical })).data,
      ).toEqual([]);
      expect(
        (await service.listKioskCategories(stores[2]!, { productVertical }))
          .data,
      ).toEqual([]);
      expect(
        await service.getKioskCatalogSnapshot(stores[2]!, 2, productVertical),
      ).toMatchObject({
        scope: "STORE",
        storeTenantId: stores[2],
        productCount: 0,
        products: [],
        categories: [],
      });
    },
  );
  it("does not fall back by vertical when a Store has garments but no jewellery", async () => {
    expect(
      (
        await service.listKioskProducts(stores[0]!, {
          productVertical: "JEWELLERY",
        })
      ).data,
    ).toEqual([]);
    expect(
      await service.getKioskCatalogRevision(stores[0]!, 1, "JEWELLERY"),
    ).toMatchObject({
      scope: "STORE",
      storeTenantId: stores[0],
      productCount: 0,
    });
  });
  it("gives unassigned kiosks an empty snapshot, changing the old platform cache revision", async () => {
    expect((await service.listKioskProducts(null, {})).data).toEqual([]);
    const snapshot = await service.getKioskCatalogSnapshot(null, 1);
    expect(snapshot).toMatchObject({
      scope: "STORE",
      storeTenantId: null,
      productCount: 0,
      products: [],
      categories: [],
    });
    expect(snapshot.revision).toContain("STORE:unassigned:");
  });
  it("rejects direct Try-On and jewellery requirements for platform and other-Store ids", async () => {
    for (const id of [platformGarment, otherGarment]) {
      await expect(
        service.resolveKioskProductForTryOn(stores[0]!, id),
      ).rejects.toMatchObject({ status: 404 });
    }
    await expect(
      service.resolveKioskJewelleryProductForTryOn(
        stores[0]!,
        platformJewellery,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.getKioskJewelleryCaptureRequirements(
        stores[0]!,
        platformJewellery,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.resolveKioskProductForTryOn(null, platformGarment),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("keeps inactive and VTO-disabled Store products out without falling back", async () => {
    await db.product.update({
      where: { id: ownGarment },
      data: { vtoEnabled: false },
    });
    expect((await service.listKioskProducts(stores[0]!, {})).data).toEqual([]);
    await db.product.update({
      where: { id: ownGarment },
      data: { vtoEnabled: true, active: false },
    });
    expect((await service.listKioskProducts(stores[0]!, {})).data).toEqual([]);
  });
});
