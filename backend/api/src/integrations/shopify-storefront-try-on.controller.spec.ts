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
});
