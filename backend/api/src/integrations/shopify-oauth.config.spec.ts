import { describe, expect, it } from "vitest";

import { loadShopifyOauthConfig } from "./shopify-oauth.config.js";

describe("Shopify OAuth configuration", () => {
  it("loads server-only credentials and derives the callback URL", () => {
    const config = loadShopifyOauthConfig({
      SHOPIFY_CLIENT_ID: "client-id",
      SHOPIFY_CLIENT_SECRET: "client-secret",
      SELFX_INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      SELFX_API_BASE_URL: "https://api.selfx.test/",
      SELFX_WEB_BASE_URL: "https://app.selfx.test/",
    });

    expect(config.callbackUrl).toBe(
      "https://api.selfx.test/api/v1/admin/integrations/shopify/oauth/callback",
    );
    expect(config.apiVersion).toBe("2026-07");
    expect(config.encryptionKey).toHaveLength(32);
  });

  it("rejects an invalid encryption key", () => {
    expect(() =>
      loadShopifyOauthConfig({
        SHOPIFY_CLIENT_ID: "client-id",
        SHOPIFY_CLIENT_SECRET: "client-secret",
        SELFX_INTEGRATION_ENCRYPTION_KEY: "too-short",
        SELFX_API_BASE_URL: "https://api.selfx.test",
        SELFX_WEB_BASE_URL: "https://app.selfx.test",
      }),
    ).toThrow(/32-byte key/);
  });
});
