import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SHOPIFY_APP_SERVICE_AUTH_ERROR_CODES,
  ShopifyAppServiceAuthService,
} from "./shopify-app-service-auth.service.js";

describe("ShopifyAppServiceAuthService", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts only the configured server-to-server token", () => {
    const token = "shopify-service-token-with-at-least-32-characters";
    vi.stubEnv("SELFX_SHOPIFY_APP_SERVICE_TOKEN", token);
    vi.stubEnv("SELFX_WEB_BASE_URL", "https://app.selfx.test");
    const auth = new ShopifyAppServiceAuthService();

    expect(() => auth.requireServiceToken(token)).not.toThrow();
    expect(() => auth.requireServiceToken("wrong-token")).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: SHOPIFY_APP_SERVICE_AUTH_ERROR_CODES.unauthorized,
          }),
        }),
      }),
    );
  });

  it("fails closed when linking is not configured", () => {
    vi.stubEnv("SELFX_SHOPIFY_APP_SERVICE_TOKEN", "");
    const auth = new ShopifyAppServiceAuthService();

    expect(() => auth.requireServiceToken("anything")).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: SHOPIFY_APP_SERVICE_AUTH_ERROR_CODES.configuration,
          }),
        }),
      }),
    );
  });
});
