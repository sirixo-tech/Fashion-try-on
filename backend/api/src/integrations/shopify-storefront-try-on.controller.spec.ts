import { describe, expect, it, vi } from "vitest";

import { SHOPIFY_APP_SERVICE_TOKEN_HEADER } from "./shopify-link.controller.js";
import { ShopifyStorefrontTryOnController } from "./shopify-storefront-try-on.controller.js";

describe("ShopifyStorefrontTryOnController", () => {
  it("does not let a browser create a session with only shop and product params", () => {
    const serviceAuth = {
      requireServiceToken: vi.fn(() => {
        throw new Error("unauthorized");
      }),
    };
    const tryOns = {
      createSession: vi.fn(),
    };
    const controller = new ShopifyStorefrontTryOnController(
      serviceAuth as never,
      tryOns as never,
    );

    expect(() =>
      controller.createSession(undefined, {
        source: "shopify",
        shop: "merchant.myshopify.com",
        externalProductId: "gid://shopify/Product/1001",
      }),
    ).toThrow("unauthorized");

    expect(serviceAuth.requireServiceToken).toHaveBeenCalledWith(undefined);
    expect(tryOns.createSession).not.toHaveBeenCalled();
  });

  it("creates a session for a server-authenticated Shopify app request", async () => {
    const created = {
      session: "a".repeat(43),
      garmentAssetId: "garment-1",
      expiresAt: "2026-09-11T00:15:00.000Z",
      product: { id: "product-1", name: "Product" },
    };
    const serviceAuth = {
      requireServiceToken: vi.fn(),
    };
    const tryOns = {
      createSession: vi.fn().mockResolvedValue(created),
    };
    const controller = new ShopifyStorefrontTryOnController(
      serviceAuth as never,
      tryOns as never,
    );

    await expect(
      controller.createSession("server-token", {
        source: "shopify",
        shop: "merchant.myshopify.com",
        externalProductId: "gid://shopify/Product/1001",
      }),
    ).resolves.toEqual(created);

    expect(serviceAuth.requireServiceToken).toHaveBeenCalledWith(
      "server-token",
    );
    expect(tryOns.createSession).toHaveBeenCalledOnce();
    expect(SHOPIFY_APP_SERVICE_TOKEN_HEADER).toBe(
      "x-selfx-shopify-service-token",
    );
  });

  it("returns plan summaries only for a server-authenticated Shopify app request", async () => {
    const plans = {
      data: [
        {
          id: "plan-1",
          code: "shopify-growth",
          name: "Shopify Growth",
          channels: ["SHOPIFY"],
          currency: "INR",
          monthlyPriceCents: 4999,
          includedCredits: 200,
          trialCredits: 10,
          extraCreditPriceCents: 49,
          kioskMonthlyRentCents: null,
          kioskDeviceLimit: null,
        },
      ],
    };
    const serviceAuth = {
      requireServiceToken: vi.fn(),
    };
    const tryOns = {
      getAvailablePlansForShop: vi.fn().mockResolvedValue(plans),
    };
    const controller = new ShopifyStorefrontTryOnController(
      serviceAuth as never,
      tryOns as never,
    );

    await expect(
      controller.getPlans("server-token", "merchant.myshopify.com"),
    ).resolves.toEqual(plans);

    expect(serviceAuth.requireServiceToken).toHaveBeenCalledWith(
      "server-token",
    );
    expect(tryOns.getAvailablePlansForShop).toHaveBeenCalledWith(
      "merchant.myshopify.com",
    );
  });

  it("returns connection health only for a server-authenticated Shopify app request", async () => {
    const health = {
      state: "CONNECTED",
      shopDomain: "merchant.myshopify.com",
      storeName: "Merchant Store",
      integrationId: "integration-1",
      storeId: "store-1",
      reasons: ["CENTRAL_INTEGRATION_ACTIVE"],
      message: "This Shopify shop is connected to SelfX.",
    };
    const serviceAuth = {
      requireServiceToken: vi.fn(),
    };
    const tryOns = {
      getConnectionHealthForShop: vi.fn().mockResolvedValue(health),
    };
    const controller = new ShopifyStorefrontTryOnController(
      serviceAuth as never,
      tryOns as never,
    );

    await expect(
      controller.getConnectionHealth("server-token", "merchant.myshopify.com"),
    ).resolves.toEqual(health);

    expect(serviceAuth.requireServiceToken).toHaveBeenCalledWith(
      "server-token",
    );
    expect(tryOns.getConnectionHealthForShop).toHaveBeenCalledWith(
      "merchant.myshopify.com",
    );
  });
});
