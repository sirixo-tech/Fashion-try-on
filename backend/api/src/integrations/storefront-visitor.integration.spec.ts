import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { TryOnSessionService } from "../try-on/try-on-session.service.js";
import {
  CommerceStorefrontTryOnService,
  hashSessionToken,
} from "./commerce-storefront-try-on.service.js";

const url = process.env.WOOCOMMERCE_TEST_DATABASE_URL;
if (
  url &&
  (!["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/woocommerce_catalog_test")
)
  throw new Error("Dedicated localhost woocommerce_catalog_test required.");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

describe.skipIf(!url)(
  "SelfX visitor binding and atomic storefront quotas (PostgreSQL)",
  () => {
    const db = new PrismaService({
      datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
    });
    const stores: string[] = [];
    const entitlements = new EntitlementsService(db);
    const sessions = new TryOnSessionService(db);
    beforeAll(() => db.$connect());
    afterAll(async () => {
      const scope = { organizationId: { in: stores } };
      await db.auditLog.deleteMany({ where: scope });
      await db.kioskTryOnRun.deleteMany({ where: scope });
      await db.creditLedgerEntry.deleteMany({ where: scope });
      await db.shopifyStorefrontTryOnSession.deleteMany({ where: scope });
      await db.tryOnAsset.deleteMany({ where: scope });
      await db.tryOnSession.deleteMany({ where: scope });
      await db.integration.deleteMany({ where: scope });
      await db.product.deleteMany({ where: scope });
      await db.productCategory.deleteMany({ where: scope });
      await db.storeSubscription.deleteMany({ where: scope });
      await db.organization.deleteMany({ where: { id: { in: stores } } });
      await db.$disconnect();
    });

    async function fixture() {
      const store = createSelfxId(),
        integration = createSelfxId(),
        category = createSelfxId();
      const shop = `visitor-${store}.myshopify.com`;
      stores.push(store);
      await db.organization.create({
        data: {
          id: store,
          name: "Visitor test",
          slug: store,
          status: "ACTIVE",
        },
      });
      await entitlements.getStoreCreditSummary(store);
      await db.integration.create({
        data: {
          id: integration,
          organizationId: store,
          type: "SHOPIFY",
          status: "ACTIVE",
          externalAccountId: shop,
          metadata: { shopDomain: shop, tryOnMode: "GARMENT" },
        },
      });
      await db.productCategory.create({
        data: {
          id: category,
          catalogKey: category,
          scope: "STORE",
          organizationId: store,
          name: "Shirts",
          slug: "shirts",
        },
      });
      for (const id of ["1001", "1002"]) {
        const product = createSelfxId();
        await db.product.create({
          data: {
            id: product,
            catalogKey: product,
            scope: "STORE",
            organizationId: store,
            categoryId: category,
            name: "Shirt",
            slug: `shirt-${id}`,
            audience: "UNISEX",
            garmentIntent: "TOP",
            garmentCategory: "TOP",
            active: true,
            vtoEnabled: true,
            imageStorageKey: `catalog/${product}.png`,
            imageContentType: "image/png",
          },
        });
        await db.externalProductMapping.create({
          data: {
            id: createSelfxId(),
            organizationId: store,
            integrationId: integration,
            productId: product,
            externalProductId: `gid://shopify/Product/${id}`,
            externalHandle: `shirt-${id}`,
          },
        });
      }
      const metadata = vi.fn(() => ({
        provider: "GOOGLE",
        providerDisplayName: "Internal",
        model: "test",
      }));
      const process = vi.fn(async () => undefined);
      const service = new CommerceStorefrontTryOnService(
        db,
        sessions,
        {
          readObject: vi.fn(async () => png),
          putObject: vi.fn(),
          deleteObject: vi.fn(),
        } as never,
        { metadata, process, assertConfigured: vi.fn() } as never,
        entitlements,
        {} as never,
        {} as never,
        {} as never,
      );
      async function launch(
        visitor = "v".repeat(43),
        product = "1001",
        visitorLimit = 1,
        monthlyLimit = 0,
      ) {
        const created = await service.createSession({
          source: "shopify",
          shop,
          externalProductId: product,
          visitorTryOnLimit: visitorLimit,
          visitorTryOnLimitPeriod: "DAY",
          monthlyStoreTryOnLimit: monthlyLimit,
          visitorToken: "ignored".repeat(8),
        });
        await service.bindFirstPartyVisitor(created.session, visitor);
        await service.acceptPhotoConsent(created.session);
        const capability =
          await db.shopifyStorefrontTryOnSession.findUniqueOrThrow({
            where: { tokenHash: hashSessionToken(created.session) },
          });
        await sessions.attachPersonAsset({
          sessionId: capability.tryOnSessionId,
          organizationId: store,
          storeId: null,
          storageKey: `${capability.tryOnSessionId}/fixture-person.png`,
          contentType: "image/png",
          expiresAt: capability.expiresAt,
        });
        return { ...created, capability };
      }
      return { store, service, launch, process, metadata };
    }
    const consumed = (store: string) =>
      db.creditLedgerEntry.count({
        where: { organizationId: store, entryType: "CREDIT_CONSUMED" },
      });

    it("admits exactly one simultaneous generation across products for the same visitor, with independent Store limits", async () => {
      const first = await fixture();
      const one = await first.launch(),
        two = await first.launch("v".repeat(43), "1002");
      expect(one.capability.visitorTokenHash).toBe(
        two.capability.visitorTokenHash,
      );
      const results = await Promise.allSettled([
        first.service.createRun(one.session, { clientRequestId: "one" }),
        first.service.createRun(two.session, { clientRequestId: "two" }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: {
          response: {
            error: { code: "SHOPIFY_STOREFRONT_TRYON_VISITOR_LIMIT_REACHED" },
          },
        },
      });
      expect(await consumed(first.store)).toBe(1);
      expect(first.process).toHaveBeenCalledTimes(1);
      const other = await fixture();
      const separate = await other.launch();
      expect(separate.capability.visitorTokenHash).not.toBe(
        one.capability.visitorTokenHash,
      );
      await other.service.createRun(separate.session, {
        clientRequestId: "other-store",
      });
      expect(await consumed(other.store)).toBe(1);
    });
    it("returns the same run for concurrent retries even when that run uses the last visitor allowance", async () => {
      const f = await fixture(),
        launch = await f.launch();
      const runs = await Promise.all(
        Array.from({ length: 3 }, () =>
          f.service.createRun(launch.session, {
            clientRequestId: "same-request",
          }),
        ),
      );
      expect(new Set(runs.map((run) => run.id)).size).toBe(1);
      expect(await consumed(f.store)).toBe(1);
      expect(f.process).toHaveBeenCalledTimes(1);
    });
    it("enforces the monthly Store cap atomically across different visitors", async () => {
      const f = await fixture();
      const one = await f.launch("a".repeat(43), "1001", 0, 1),
        two = await f.launch("b".repeat(43), "1002", 0, 1);
      const results = await Promise.allSettled([
        f.service.createRun(one.session, { clientRequestId: "one" }),
        f.service.createRun(two.session, { clientRequestId: "two" }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: {
          response: {
            error: { code: "SHOPIFY_STOREFRONT_TRYON_MONTHLY_LIMIT_REACHED" },
          },
        },
      });
      expect(await consumed(f.store)).toBe(1);
    });
    it("rolls back the credit debit when run insertion fails, then permits a clean retry", async () => {
      const f = await fixture(),
        launch = await f.launch();
      f.metadata.mockReturnValue({
        provider: "GOOGLE",
        providerDisplayName: "x".repeat(1000),
        model: "test",
      });
      await expect(
        f.service.createRun(launch.session, {
          clientRequestId: "retry-after-failure",
        }),
      ).rejects.toThrow();
      expect(await consumed(f.store)).toBe(0);
      expect(
        await db.kioskTryOnRun.count({ where: { organizationId: f.store } }),
      ).toBe(0);
      expect(f.process).not.toHaveBeenCalled();
      f.metadata.mockReturnValue({
        provider: "GOOGLE",
        providerDisplayName: "Internal",
        model: "test",
      });
      await f.service.createRun(launch.session, {
        clientRequestId: "retry-after-failure",
      });
      expect(await consumed(f.store)).toBe(1);
    });
  },
);
