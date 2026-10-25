import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("./db.server", () => ({ default: { selfxConnection: database } }));

import {
  getSelfxConnectionView,
  clearStaleSelfxConnection,
  restartSelfxConnection,
  updateSelfxStorefrontSettings,
} from "./selfx-connection.server";
import { parseShopifyTryOnMode } from "./selfx-tryon-settings";
import { ShopifyAdminClient } from "../src/shopify-admin.server";
import { SelfxLinkClient } from "./selfx-link.server";

const shop = "merchant.myshopify.com";
const settings = {
  shop,
  storefrontLocale: "auto",
  adminLocale: "en",
  visitorTryOnLimit: 5,
  visitorTryOnLimitPeriod: "DAY",
  monthlyStoreTryOnLimit: 0,
};

describe("Shopify Try-On type settings", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("defaults an unconnected shop to garments and jewellery", async () => {
    database.findUnique.mockResolvedValue(null);
    expect(await getSelfxConnectionView(shop)).toMatchObject({
      shop,
      tryOnMode: "BOTH",
    });
  });

  it.each(["GARMENT", "JEWELLERY", "BOTH"] as const)(
    "saves and reads %s for the authenticated shop",
    async (tryOnMode) => {
      database.findUnique.mockResolvedValue({
        ...settings,
        status: "CONNECTED",
        tryOnMode,
      });
      const result = await updateSelfxStorefrontSettings({
        ...settings,
        tryOnMode,
      });
      expect(database.update).toHaveBeenCalledWith({
        where: { shop },
        data: expect.objectContaining({ tryOnMode }),
      });
      expect(result.tryOnMode).toBe(tryOnMode);
    },
  );

  it("does not overwrite the type when only other settings are submitted", async () => {
    database.findUnique.mockResolvedValue({
      ...settings,
      status: "CONNECTED",
      tryOnMode: "BOTH",
    });
    const result = await updateSelfxStorefrontSettings({
      ...settings,
      adminLocale: "es",
    });
    expect(database.update.mock.calls[0]?.[0].data).not.toHaveProperty(
      "tryOnMode",
    );
    expect(result.tryOnMode).toBe("BOTH");
  });

  it.each(["OTHER", "", null, ["GARMENT", "JEWELLERY"]])(
    "rejects invalid type %j without writing settings",
    async (tryOnMode) => {
      await expect(
        updateSelfxStorefrontSettings({ ...settings, tryOnMode }),
      ).rejects.toThrow("Choose Garments, Jewellery or Both");
      expect(database.update).not.toHaveBeenCalled();
    },
  );

  it("requires a connection before saving", async () => {
    database.findUnique.mockResolvedValue(null);
    await expect(
      updateSelfxStorefrontSettings({ ...settings, tryOnMode: "BOTH" }),
    ).rejects.toThrow("Connect this Shopify shop");
    expect(database.update).not.toHaveBeenCalled();
  });

  it("does not accept an absent type as an explicit choice", () => {
    expect(() => parseShopifyTryOnMode(undefined)).toThrow();
  });
});

describe("Shopify Store reconnection", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("clears a stale connected Store and app token after central disconnect", async () => {
    const saved = {
      ...settings,
      shopName: "Merchant",
      status: "CONNECTED",
      tryOnMode: "BOTH",
      selfxStoreId: "archived-store",
      selfxStoreName: "Archived Store",
      selfxIntegrationId: "old-integration",
      integrationTokenCiphertext: "encrypted-token",
      syncStatus: "SUCCESS",
    } as Record<string, unknown>;
    database.findUnique.mockImplementation(async () => saved);
    database.updateMany.mockImplementation(async ({ data }) => {
      Object.assign(saved, data);
      return { count: 1 };
    });

    const result = await clearStaleSelfxConnection(shop);

    expect(database.updateMany).toHaveBeenCalledWith({
      where: { shop, status: "CONNECTED" },
      data: expect.objectContaining({
        integrationTokenCiphertext: null,
        selfxIntegrationId: null,
      }),
    });
    expect(result).toMatchObject({
      status: "NOT_CONNECTED",
      storeId: "archived-store",
    });
  });

  it("retains the approved Store when requesting reconnection", async () => {
    vi.stubEnv("SELFX_SHOPIFY_APP_SERVICE_TOKEN", "s".repeat(32));
    vi.stubEnv("SELFX_API_BASE_URL", "https://api.selfx.test");
    vi.stubEnv("SELFX_WEB_BASE_URL", "https://app.selfx.test");
    vi.stubEnv(
      "SELFX_SHOPIFY_CREDENTIAL_ENCRYPTION_KEY",
      Buffer.alloc(32, 1).toString("base64"),
    );
    const saved = {
      ...settings,
      shopifyAccountId: "gid://shopify/Shop/1001",
      shopName: "Merchant",
      status: "CONNECTED",
      tryOnMode: "BOTH",
      selfxStoreId: "archived-store",
      selfxStoreName: "Archived Store",
      selfxIntegrationId: "old-integration",
      syncStatus: "SUCCESS",
    } as Record<string, unknown>;
    database.findUnique.mockImplementation(async () => saved);
    database.upsert.mockImplementation(async ({ update }) => {
      Object.assign(saved, update);
      return saved;
    });
    vi.spyOn(ShopifyAdminClient.prototype, "getShopIdentity").mockResolvedValue(
      {
        id: "gid://shopify/Shop/1001",
        name: "Merchant",
        myshopifyDomain: shop,
      },
    );
    const create = vi
      .spyOn(SelfxLinkClient.prototype, "create")
      .mockResolvedValue({
        linkToken: "t".repeat(43),
        approvalUrl: "https://app.selfx.test/app/integrations/shopify/link",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });

    const result = await restartSelfxConnection({
      shop,
      shopifyAccessToken: "shopify-token",
    });

    expect(create).toHaveBeenCalledWith({
      shopDomain: shop,
      externalAccountId: "gid://shopify/Shop/1001",
      externalAccountName: "Merchant",
      storeId: "archived-store",
    });
    expect(database.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          selfxStoreId: "archived-store",
          selfxIntegrationId: null,
        }),
      }),
    );
    expect(result.status).toBe("PENDING_APPROVAL");
    expect(result.storeId).toBe("archived-store");
  });
});
