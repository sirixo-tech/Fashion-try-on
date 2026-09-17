import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("./db.server", () => ({ default: { selfxConnection: database } }));

import {
  getSelfxConnectionView,
  updateSelfxStorefrontSettings,
} from "./selfx-connection.server";
import { parseShopifyTryOnMode } from "./selfx-tryon-settings";

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
