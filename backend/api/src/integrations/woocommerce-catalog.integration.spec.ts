import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { ValidationPipe } from "@nestjs/common";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { CatalogService } from "../catalog/catalog.service.js";
import { IntegrationCatalogSyncService } from "./integration-catalog-sync.service.js";
import {
  IntegrationTokenAuthService,
  type IntegrationCredentialContext,
} from "./integration-token-auth.service.js";
import { hashIntegrationToken } from "./integrations.service.js";
import { IntegrationCatalogSyncInputDto } from "./dto/integration-catalog-sync.dto.js";

const url = process.env.WOOCOMMERCE_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/woocommerce_catalog_test")
)
  throw new Error("Dedicated localhost woocommerce_catalog_test required.");
describe.skipIf(!url)("WooCommerce plugin → SelfX Store → kiosk", () => {
  const db = new PrismaService({
    datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
  });
  const sync = new IntegrationCatalogSyncService(db),
    auth = new IntegrationTokenAuthService(db);
  const catalog = new CatalogService(db, {} as never, {} as never);
  const store = createSelfxId(),
    other = createSelfxId(),
    integrationId = createSelfxId();
  const token = `selfx_woocommerce_${createSelfxId().replaceAll("-", "")}${createSelfxId().replaceAll("-", "")}`;
  const credentialId = createSelfxId();
  let credential: IntegrationCredentialContext;
  let input: IntegrationCatalogSyncInputDto;
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  beforeAll(async () => {
    await db.$connect();
    for (const id of [store, other])
      await db.organization.create({
        data: { id, name: id, slug: id, status: "ACTIVE" },
      });
    await db.integration.create({
      data: {
        id: integrationId,
        organizationId: store,
        type: "WOOCOMMERCE",
        externalAccountId: "https://website.example",
      },
    });
    await db.integrationCredential.create({
      data: {
        id: credentialId,
        integrationId,
        organizationId: store,
        tokenPrefix: token.slice(0, 32),
        tokenHash: hashIntegrationToken(token),
        name: "WooCommerce test",
        scopes: ["catalog:sync"],
      },
    });
    credential = await auth.verifyToken(token, ["catalog:sync"]);
    const fixture = execFileSync(
      process.env.PHP_BIN ?? "php",
      [
        resolve("../../integrations/woocommerce/tests/plugin-test.php"),
        "--fixture",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    input = await pipe.transform(JSON.parse(fixture), {
      type: "body",
      metatype: IntegrationCatalogSyncInputDto,
    });
  });
  afterAll(async () => {
    await db.integration.deleteMany({ where: { id: integrationId } });
    await db.product.deleteMany({ where: { organizationId: store } });
    await db.productCategory.deleteMany({ where: { organizationId: store } });
    await db.organization.deleteMany({ where: { id: { in: [store, other] } } });
    await db.$disconnect();
  });
  it("accepts real PHP normalization with optional size/color fields and rejects client Store overrides", async () => {
    expect(input.products[0]?.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalVariantId: "11",
          size: "M",
          color: "Blue",
          priceAmountCents: 2000,
        }),
        expect.objectContaining({
          externalVariantId: "12",
          available: false,
          priceAmountCents: 2500,
        }),
      ]),
    );
    await expect(
      pipe.transform(
        { ...input, storeId: other },
        { type: "body", metatype: IntegrationCatalogSyncInputDto },
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        {
          ...input,
          products: [
            {
              ...input.products[0],
              variants: [{ externalVariantId: "x", size: "x".repeat(81) }],
            },
          ],
        },
        { type: "body", metatype: IntegrationCatalogSyncInputDto },
      ),
    ).rejects.toThrow();
  });
  it("imports one Store product with variation reference metadata and no duplicate kiosk cards", async () => {
    expect((await sync.sync(credential, input)).created).toBe(1);
    expect(await db.product.count({ where: { organizationId: store } })).toBe(
      1,
    );
    expect(
      await db.externalProductMapping.count({ where: { integrationId } }),
    ).toBe(3);
    const variant = await db.externalProductMapping.findFirstOrThrow({
      where: { integrationId, externalVariantId: "12" },
    });
    expect(variant.metadata).toMatchObject({
      color: "Red",
      size: "L",
      available: false,
      priceAmountCents: 2500,
      imageUrl: "https://website.example/images/12.jpg",
    });
    expect((await catalog.listKioskProducts(store, {})).data).toHaveLength(0);
    await sync.updateProductVto(credential, {
      externalProductId: "10",
      enabled: true,
    });
    const visible = await catalog.listKioskProducts(store, {});
    expect(visible.data).toHaveLength(1);
    expect((await catalog.listKioskProducts(other, {})).data).toHaveLength(0);
    expect((await catalog.listKioskProducts(null, {})).data).toHaveLength(0);
  });
  it("preserves manual eligibility and keeps sold-out products available for Try-On", async () => {
    const update = {
      ...input.products[0]!,
      title: "Updated shirt",
      sourceUpdatedAt: "2026-10-22T01:00:00.000Z",
      variants: input.products[0]!.variants!.map((variant) => ({
        ...variant,
        available: false,
      })),
    };
    await sync.sync(credential, { mode: "INCREMENTAL", products: [update] });
    expect((await catalog.listKioskProducts(store, {})).data).toHaveLength(1);
    await sync.updateProductVto(credential, {
      externalProductId: "10",
      enabled: false,
    });
    await sync.sync(credential, {
      mode: "INCREMENTAL",
      products: [{ ...update, sourceUpdatedAt: "2026-10-22T02:00:00.000Z" }],
    });
    expect((await catalog.listKioskProducts(store, {})).data).toHaveLength(0);
    expect(
      (await db.product.findFirstOrThrow({ where: { organizationId: store } }))
        .vtoEnabled,
    ).toBe(false);
  });
  it("archives a deleted product and its variants without affecting another Store", async () => {
    await sync.sync(credential, {
      mode: "INCREMENTAL",
      products: [
        {
          externalProductId: "10",
          status: "ARCHIVED",
          sourceUpdatedAt: "2026-10-22T03:00:00.000Z",
        },
      ],
    });
    expect(
      await db.externalProductMapping.count({
        where: { integrationId, status: "ACTIVE" },
      }),
    ).toBe(0);
    expect((await catalog.listKioskProducts(store, {})).data).toHaveLength(0);
    expect(await db.organization.count()).toBeGreaterThanOrEqual(2);
  });
  it("serializes simultaneous imports without duplicating a parent or its variants", async () => {
    const product = {
      ...input.products[0]!,
      externalProductId: "concurrent-product",
    };
    const results = await Promise.all([
      sync.sync(credential, { mode: "INCREMENTAL", products: [product] }),
      sync.sync(credential, { mode: "INCREMENTAL", products: [product] }),
    ]);
    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(1);
    expect(
      results.reduce((sum, result) => sum + result.ignoredAsStale, 0),
    ).toBe(1);
    expect(
      await db.externalProductMapping.count({
        where: { integrationId, externalProductId: "concurrent-product" },
      }),
    ).toBe(3);
  });
  it("preserves a newer observation across a retried old full scan and finalization", async () => {
    const product = {
      ...input.products[0]!,
      externalProductId: "newer-product",
      sourceUpdatedAt: "2026-10-22T09:00:00.000Z",
    };
    await sync.sync(credential, { mode: "INCREMENTAL", products: [product] });
    const latest = await db.externalProductMapping.findFirstOrThrow({
      where: {
        integrationId,
        externalProductId: "newer-product",
        externalVariantId: null,
      },
    });
    const snapshot = new Date(
      latest.lastSeenAt.getTime() - 60_000,
    ).toISOString();
    await sync.sync(credential, {
      mode: "FULL",
      sourceSnapshotAt: snapshot,
      finalize: false,
      products: [product],
    });
    await sync.sync(credential, {
      mode: "FULL",
      sourceSnapshotAt: new Date(
        latest.lastSeenAt.getTime() - 30_000,
      ).toISOString(),
      finalize: true,
      products: [],
    });
    const after = await db.externalProductMapping.findUniqueOrThrow({
      where: { id: latest.id },
    });
    expect(after.lastSeenAt).toEqual(latest.lastSeenAt);
    expect(after.status).toBe("ACTIVE");
  });
  it("rejects revoked credentials, missing scopes and suspended Store access", async () => {
    await db.integrationCredential.update({
      where: { id: credentialId },
      data: { scopes: [] },
    });
    await expect(auth.verifyToken(token, ["catalog:sync"])).rejects.toThrow();
    await db.integrationCredential.update({
      where: { id: credentialId },
      data: { scopes: ["catalog:sync"] },
    });
    await db.organization.update({
      where: { id: store },
      data: { status: "SUSPENDED" },
    });
    await expect(auth.verifyToken(token, ["catalog:sync"])).rejects.toThrow();
    await db.organization.update({
      where: { id: store },
      data: { status: "ACTIVE" },
    });
    await db.integrationCredential.update({
      where: { id: credentialId },
      data: { revokedAt: new Date(), status: "REVOKED" },
    });
    await expect(auth.verifyToken(token, ["catalog:sync"])).rejects.toThrow();
  });
});
