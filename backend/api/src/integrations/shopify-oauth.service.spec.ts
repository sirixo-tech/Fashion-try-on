import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  normalizeShopDomain,
  verifyShopifyCallbackHmac,
  ShopifyOauthService,
} from "./shopify-oauth.service.js";

describe("Shopify OAuth security helpers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("creates a short-lived server-side state and requests only read_products", async () => {
    vi.stubEnv("SHOPIFY_CLIENT_ID", "client-id");
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", "client-secret");
    vi.stubEnv(
      "SELFX_INTEGRATION_ENCRYPTION_KEY",
      Buffer.alloc(32, 9).toString("base64"),
    );
    vi.stubEnv("SELFX_API_BASE_URL", "https://api.selfx.test");
    vi.stubEnv("SELFX_WEB_BASE_URL", "https://app.selfx.test");
    const created: Array<Record<string, unknown>> = [];
    const transaction = {
      integrationOauthState: {
        deleteMany: vi.fn(),
        create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
        }),
      },
    };
    const prisma = {
      organization: {
        findFirst: vi.fn().mockResolvedValue({ id: "store-1" }),
      },
      $transaction: vi.fn(
        (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const service = new ShopifyOauthService(prisma as never, {} as never);

    const result = await service.start(
      "user-1",
      "store-1",
      "merchant.myshopify.com",
    );
    const url = new URL(result.authorizationUrl);

    expect(url.origin).toBe("https://merchant.myshopify.com");
    expect(url.searchParams.get("scope")).toBe("read_products");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://api.selfx.test/api/v1/admin/integrations/shopify/oauth/callback",
    );
    expect(created[0]?.stateHash).not.toBe(url.searchParams.get("state"));
    expect(created[0]).toMatchObject({
      organizationId: "store-1",
      provider: "SHOPIFY",
      createdByUserId: "user-1",
    });
  });

  it("verifies Shopify callback HMAC and rejects changed parameters", () => {
    const secret = "shopify-client-secret";
    const query = {
      code: "authorization-code",
      host: "bWVyY2hhbnQubXlzaG9waWZ5LmNvbQ",
      shop: "merchant.myshopify.com",
      state: "12345678901234567890123456789012",
      timestamp: "1788768000",
    };
    const message = Object.entries(query)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    const hmac = createHmac("sha256", secret).update(message).digest("hex");

    expect(verifyShopifyCallbackHmac({ ...query, hmac }, secret)).toBe(true);
    expect(
      verifyShopifyCallbackHmac(
        { ...query, shop: "attacker.myshopify.com", hmac },
        secret,
      ),
    ).toBe(false);
  });

  it("accepts only canonical myshopify domains", () => {
    expect(normalizeShopDomain(" Merchant-Store.MyShopify.com ")).toBe(
      "merchant-store.myshopify.com",
    );
    expect(() => normalizeShopDomain("merchant.example.com")).toThrow();
    expect(() =>
      normalizeShopDomain("merchant.myshopify.com.attacker.test"),
    ).toThrow();
  });
});
