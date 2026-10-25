import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { ValidationPipe } from "@nestjs/common";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { CatalogService } from "../catalog/catalog.service.js";
import { AdminStoresService } from "../stores/admin-stores.service.js";
import { UpdateStoreProductDto } from "../stores/dto/admin-store.dto.js";
import { CommerceStorefrontTryOnService } from "./commerce-storefront-try-on.service.js";
import { TryOnSessionService } from "../try-on/try-on-session.service.js";
import { IntegrationCatalogSyncService } from "./integration-catalog-sync.service.js";
import {
  IntegrationTokenAuthService,
  type IntegrationCredentialContext,
} from "./integration-token-auth.service.js";
import { hashIntegrationToken } from "./integrations.service.js";
import { IntegrationCatalogSyncInputDto } from "./dto/integration-catalog-sync.dto.js";
import { wooCommerceOverview } from "./woocommerce-overview.js";
import { commerceOverview } from "./commerce-overview.js";

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
    await db.billableGeneration.deleteMany({
      where: { organizationId: { in: [store, other] } },
    });
    await db.auditLog.deleteMany({ where: { organizationId: store } });
    await db.kioskTryOnRun.deleteMany({ where: { organizationId: store } });
    await db.tryOnSession.deleteMany({ where: { organizationId: store } });
    await db.integration.deleteMany({ where: { id: integrationId } });
    await db.product.deleteMany({ where: { organizationId: store } });
    await db.productCategory.deleteMany({ where: { organizationId: store } });
    await db.organization.deleteMany({ where: { id: { in: [store, other] } } });
    await db.$disconnect();
  });
  it("accepts real PHP Try-On-only references and rejects client Store overrides", async () => {
    expect(input.products[0]?.variants).toBeUndefined();
    expect(input.products[0]?.priceAmountCents).toBeUndefined();
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
  it("imports one Store product without variation or inventory records", async () => {
    expect((await sync.sync(credential, input)).created).toBe(1);
    expect(await db.product.count({ where: { organizationId: store } })).toBe(
      1,
    );
    expect(
      await db.externalProductMapping.count({ where: { integrationId } }),
    ).toBe(1);
    expect((await catalog.listKioskProducts(store, {})).data).toHaveLength(0);
    await sync.updateProductVto(credential, {
      externalProductId: "10",
      enabled: true,
    });
    const visible = await catalog.listKioskProducts(store, {});
    expect(visible.data).toHaveLength(1);
    expect(visible.data[0]).toMatchObject({
      nativePurchasingAllowed: false,
      priceAmountCents: null,
    });
    expect((await catalog.listKioskProducts(other, {})).data).toHaveLength(0);
    expect((await catalog.listKioskProducts(null, {})).data).toHaveLength(0);
  });
  it("exposes imported source and prevents source-field edits/deletion while allowing Try-On settings", async () => {
    const stores = new AdminStoresService(
      db,
      {} as never,
      {} as never,
      {} as never,
    );
    const product = await db.product.findFirstOrThrow({
      where: { organizationId: store },
    });
    expect(
      (await stores.getStoreProduct(store, product.id)).catalogSource,
    ).toBe("WOOCOMMERCE");
    for (const change of [
      { name: "local overwrite" },
      { priceAmountCents: 1 },
      { active: false },
      { image: null },
    ])
      await expect(
        stores.updateStoreProduct(store, product.id, change),
      ).rejects.toMatchObject({
        response: { error: { code: "PRODUCT_EXTERNALLY_MANAGED" } },
      });
    await expect(
      stores.deleteStoreProduct(store, product.id),
    ).rejects.toThrow();
    await expect(stores.getStoreProduct(other, product.id)).rejects.toThrow();
    const toggle = await pipe.transform(
      { vtoEnabled: true },
      { type: "body", metatype: UpdateStoreProductDto },
    );
    expect(
      (await stores.updateStoreProduct(store, product.id, toggle)).vtoEnabled,
    ).toBe(true);
  });
  it("records consent and deduplicates concurrent generation against real PostgreSQL", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64",
    );
    const product = await db.product.findFirstOrThrow({
      where: { organizationId: store },
    });
    await db.product.update({
      where: { id: product.id },
      data: {
        imageStorageKey: "catalog/fixture.png",
        imageContentType: "image/png",
      },
    });
    const storage = {
      putObject: vi.fn(),
      readObject: vi.fn(async () => png),
      deleteObject: vi.fn(),
    };
    const process = vi.fn(async () => undefined);
    const storefront = new CommerceStorefrontTryOnService(
      db,
      new TryOnSessionService(db),
      storage as never,
      {
        assertConfigured: vi.fn(),
        metadata: () => ({
          provider: "GOOGLE",
          providerDisplayName: "Internal",
          model: "test",
        }),
        process,
      } as never,
      { assertStoreHasFeature: vi.fn(), consumeTryOnCredit: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const launch = await storefront.createWooCommerceSession(credential, {
      externalProductId: "10",
      visitorToken: "v".repeat(43),
    });
    await expect(
      storefront.requirePhotoConsent(launch.session),
    ).rejects.toThrow();
    await storefront.acceptPhotoConsent(launch.session);
    await storefront.uploadPersonImage(launch.session, {
      purpose: "PERSON",
      image: {
        fieldName: "image",
        filename: "person.png",
        mimeType: "image/png",
        buffer: png,
        sizeBytes: png.length,
        width: 1,
        height: 1,
      },
    } as never);
    const [one, two] = await Promise.all([
      storefront.createRun(launch.session, { clientRequestId: "same-request" }),
      storefront.createRun(launch.session, { clientRequestId: "same-request" }),
    ]);
    expect(one.id).toBe(two.id);
    expect(
      await db.kioskTryOnRun.count({ where: { organizationId: store } }),
    ).toBe(1);
    expect(
      await db.auditLog.count({
        where: {
          organizationId: store,
          action: "try_on.photo_consent_accepted",
        },
      }),
    ).toBe(1);
    expect(
      (await db.kioskTryOnRun.findUniqueOrThrow({ where: { id: one.id } }))
        .billingChannel,
    ).toBe("WOOCOMMERCE");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(process).toHaveBeenCalledTimes(1);
    await storefront.saveWooSettings(credential, {
      visitorTryOnLimit: 1,
      visitorTryOnLimitPeriod: "DAY",
      monthlyStoreTryOnLimit: 100,
    });
    expect(await storefront.wooSettings(credential)).toMatchObject({
      visitorTryOnLimit: 1,
      monthlyStoreTryOnLimit: 100,
    });
    await expect(
      storefront.createRun(launch.session, {
        clientRequestId: "over-new-limit",
      }),
    ).rejects.toMatchObject({
      response: {
        error: { code: "SHOPIFY_STOREFRONT_TRYON_VISITOR_LIMIT_REACHED" },
      },
    });
    await expect(
      storefront.wooSettings({ ...credential, storeId: other }),
    ).rejects.toThrow();
    await storefront.saveWooSettings(credential, {
      visitorTryOnLimit: 5,
      visitorTryOnLimitPeriod: "DAY",
      monthlyStoreTryOnLimit: 0,
    });
  });
  it("preserves manual eligibility and keeps sold-out products available for Try-On", async () => {
    const update = {
      ...input.products[0]!,
      title: "Updated shirt",
      sourceUpdatedAt: "2026-10-22T01:00:00.000Z",
      variants: (input.products[0]!.variants ?? []).map((variant) => ({
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
  it("reports Store-scoped WooCommerce products, durable usage and completed full syncs", async () => {
    const before = await db.integration.findUniqueOrThrow({
      where: { id: integrationId },
    });
    await sync.sync(credential, {
      mode: "FULL",
      sourceSnapshotAt: new Date().toISOString(),
      finalize: true,
      products: input.products,
    });
    const now = new Date();
    await db.billableGeneration.createMany({
      data: [
        {
          id: createSelfxId(),
          runId: createSelfxId(),
          organizationId: store,
          channel: "WOOCOMMERCE",
          completedAt: now,
        },
        {
          id: createSelfxId(),
          runId: createSelfxId(),
          organizationId: store,
          channel: "WOOCOMMERCE",
          completedAt: new Date(now.getTime() - 31 * 86400000),
        },
        {
          id: createSelfxId(),
          runId: createSelfxId(),
          organizationId: store,
          channel: "KIOSK",
          completedAt: now,
        },
        {
          id: createSelfxId(),
          runId: createSelfxId(),
          organizationId: other,
          channel: "WOOCOMMERCE",
          completedAt: now,
        },
      ],
    });
    const result = await wooCommerceOverview(db, { storeId: store });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      storeId: store,
      health: "CONNECTED",
      productCount: 1,
      successfulTryOns: 1,
      lastCatalogSyncAt: expect.any(String),
    });
    expect(result.summary).toEqual({
      total: 1,
      connected: 1,
      needsAttention: 0,
      disconnected: 0,
      successfulTryOns: 1,
    });
    expect((await wooCommerceOverview(db, { storeId: other })).data).toEqual(
      [],
    );
    expect(
      (
        await wooCommerceOverview(db, {
          storeId: store,
          health: "DISCONNECTED",
        })
      ).data,
    ).toEqual([]);
    await db.integrationCredential.update({
      where: { id: credentialId },
      data: { expiresAt: new Date(now.getTime() - 1000) },
    });
    expect(
      (
        await wooCommerceOverview(db, {
          storeId: store,
          health: "NEEDS_ATTENTION",
        })
      ).summary.needsAttention,
    ).toBe(1);
    await db.integrationCredential.update({
      where: { id: credentialId },
      data: { expiresAt: null },
    });
    const after = await db.integration.findUniqueOrThrow({
      where: { id: integrationId },
    });
    expect(after.metadata).toMatchObject({
      ...(before.metadata as Record<string, unknown>),
      lastCatalogSyncAt: expect.any(String),
    });
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
    ).toBe(1);
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
  it("keeps Shopify monitoring scoped to Shopify products, usage and completed receipts", async () => {
    const shopifyId = createSelfxId();
    const completedAt = new Date(Date.now() - 1000);
    try {
      await db.integration.create({
        data: {
          id: shopifyId,
          organizationId: other,
          type: "SHOPIFY",
          externalAccountId: `gid://shopify/Shop/${shopifyId}`,
          metadata: {
            shopDomain: "monitor.myshopify.com",
            lastCatalogSyncStatus: "COMPLETED",
            lastCatalogSyncAt: completedAt.toISOString(),
            privateLinkToken: "do-not-expose",
          },
        },
      });
      await db.integrationCredential.create({
        data: {
          id: createSelfxId(),
          integrationId: shopifyId,
          organizationId: other,
          tokenHash: hashIntegrationToken(createSelfxId()),
          tokenPrefix: "synthetic-shopify-monitor",
          name: "Monitoring fixture",
          scopes: ["catalog:sync"],
        },
      });
      await sync.sync(
        {
          ...credential,
          integrationId: shopifyId,
          integrationType: "SHOPIFY",
          storeId: other,
        },
        {
          mode: "INCREMENTAL",
          products: [
            {
              ...input.products[0]!,
              externalProductId: "monitor-product",
              variants: [
                { externalVariantId: "one" },
                { externalVariantId: "two" },
              ],
            },
          ],
        },
      );
      await db.billableGeneration.createMany({
        data: [
          {
            id: createSelfxId(),
            runId: createSelfxId(),
            organizationId: other,
            channel: "SHOPIFY",
            completedAt,
          },
          {
            id: createSelfxId(),
            runId: createSelfxId(),
            organizationId: other,
            channel: "SHOPIFY",
            completedAt: new Date(Date.now() - 31 * 86400000),
          },
          {
            id: createSelfxId(),
            runId: createSelfxId(),
            organizationId: other,
            channel: "WOOCOMMERCE",
            completedAt,
          },
        ],
      });
      const result = await commerceOverview(
        db,
        { storeId: other, search: "MONITOR", health: "CONNECTED" },
        "SHOPIFY",
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        website: "https://monitor.myshopify.com",
        productCount: 1,
        successfulTryOns: 1,
        lastCatalogSyncAt: completedAt.toISOString(),
      });
      expect(result.summary).toEqual({
        total: 1,
        connected: 1,
        needsAttention: 0,
        disconnected: 0,
        successfulTryOns: 1,
      });
      expect(JSON.stringify(result)).not.toMatch(/gid:\/\/|do-not-expose/);
      expect(
        (await commerceOverview(db, { storeId: store }, "SHOPIFY")).data,
      ).toEqual([]);
      await db.integration.update({
        where: { id: shopifyId },
        data: {
          status: "ERROR",
          metadata: {
            shopDomain: "monitor.myshopify.com",
            lastCatalogSyncStatus: "FAILED",
            lastCatalogSyncAt: new Date().toISOString(),
          },
        },
      });
      const failed = await commerceOverview(
        db,
        { storeId: other, health: "NEEDS_ATTENTION" },
        "SHOPIFY",
      );
      expect(failed.summary.needsAttention).toBe(1);
      expect(failed.data[0]!.lastCatalogSyncAt).toBeNull();
    } finally {
      await db.billableGeneration.deleteMany({
        where: { organizationId: other },
      });
      await db.integration.deleteMany({ where: { id: shopifyId } });
      await db.product.deleteMany({ where: { organizationId: other } });
      await db.productCategory.deleteMany({ where: { organizationId: other } });
    }
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
