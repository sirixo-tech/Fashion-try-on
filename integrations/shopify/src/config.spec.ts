import { describe, expect, it } from "vitest";

import { loadShopifyConnectorConfig, normalizeShopDomain } from "./config.js";

describe("Shopify connector config", () => {
  it("loads a least-privilege server-side connector configuration", () => {
    expect(
      loadShopifyConnectorConfig({
        SHOPIFY_SHOP_DOMAIN: "Demo-Store.myshopify.com",
        SHOPIFY_ADMIN_ACCESS_TOKEN: "shop-token",
        SELFX_API_BASE_URL: "https://api.selfx.test/",
        SELFX_INTEGRATION_TOKEN: "selfx-token",
      }),
    ).toEqual({
      shopDomain: "demo-store.myshopify.com",
      adminAccessToken: "shop-token",
      apiVersion: "2026-07",
      selfxApiBaseUrl: "https://api.selfx.test",
      selfxIntegrationToken: "selfx-token",
      productPageSize: 50,
      selfxBatchSize: 25,
    });
  });

  it("rejects non-Shopify and URL-shaped shop domains", () => {
    expect(() => normalizeShopDomain("example.com")).toThrow(".myshopify.com");
    expect(() => normalizeShopDomain("https://demo.myshopify.com")).toThrow(
      ".myshopify.com",
    );
  });

  it("allows HTTP only for local SelfX development", () => {
    const base = {
      SHOPIFY_SHOP_DOMAIN: "demo.myshopify.com",
      SHOPIFY_ADMIN_ACCESS_TOKEN: "shop-token",
      SELFX_INTEGRATION_TOKEN: "selfx-token",
    };
    expect(
      loadShopifyConnectorConfig({
        ...base,
        SELFX_API_BASE_URL: "http://localhost:3001",
      }).selfxApiBaseUrl,
    ).toBe("http://localhost:3001");
    expect(() =>
      loadShopifyConnectorConfig({
        ...base,
        SELFX_API_BASE_URL: "http://api.selfx.test",
      }),
    ).toThrow("HTTPS");
  });
});
