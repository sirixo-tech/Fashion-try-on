import { describe, expect, it, vi } from "vitest";

import {
  SelfxStorefrontTryOnClient,
  buildStorefrontTryOnSessionUrl,
  normalizeShopifyProductId,
  productReference,
} from "./selfx-storefront-tryon.server";

const config = {
  apiBaseUrl: "https://api.selfx.test",
  webBaseUrl: "https://app.selfx.test",
  serviceToken: "s".repeat(32),
};

describe("SelfxStorefrontTryOnClient", () => {
  it("creates a storefront session with server authentication", async () => {
    const session = "a".repeat(43);
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        session,
        garmentAssetId: "garment-1",
        expiresAt: "2026-09-11T00:15:00.000Z",
        product: { id: "product-1", name: "Linen Shirt" },
      }),
    );
    const client = new SelfxStorefrontTryOnClient(config, fetchImpl);

    await client.createSession({
      source: "shopify",
      shop: "merchant.myshopify.com",
      externalProductId: "gid://shopify/Product/1001",
      locale: "es",
      visitorToken: "v".repeat(43),
      visitorTryOnLimit: 5,
      visitorTryOnLimitPeriod: "DAY",
      monthlyStoreTryOnLimit: 300,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.selfx.test/api/v1/public/integrations/shopify/try-on-sessions",
      expect.any(Object),
    );
    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(request.headers);
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toMatchObject({
      locale: "es",
      visitorToken: "v".repeat(43),
      visitorTryOnLimit: 5,
      visitorTryOnLimitPeriod: "DAY",
      monthlyStoreTryOnLimit: 300,
    });
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("x-selfx-shopify-service-token")).toBe("s".repeat(32));
  });

  it("reads the credit summary with server authentication", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        availableCredits: 42,
        subscription: {
          id: "subscription-1",
          status: "ACTIVE",
          channels: ["SHOPIFY"],
          includedCredits: 100,
          trialCredits: 10,
          currentPeriodStart: "2026-09-01T00:00:00.000Z",
          currentPeriodEnd: "2026-10-01T00:00:00.000Z",
          trialStartedAt: null,
          trialEndsAt: null,
          pricingPlan: { id: "plan-1", name: "Shopify Growth" },
        },
      }),
    );
    const client = new SelfxStorefrontTryOnClient(config, fetchImpl);

    await expect(
      client.getCreditSummary("merchant.myshopify.com"),
    ).resolves.toMatchObject({ availableCredits: 42 });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.selfx.test/api/v1/public/integrations/shopify/try-on-sessions/credit-summary?shop=merchant.myshopify.com",
      expect.any(Object),
    );
    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(request.headers);
    expect(request.method).toBe("GET");
    expect(headers.get("x-selfx-shopify-service-token")).toBe("s".repeat(32));
  });

  it("reads connection health with server authentication", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        state: "CONNECTED",
        shopDomain: "merchant.myshopify.com",
        storeName: "Merchant Store",
        integrationId: "integration-1",
        storeId: "store-1",
        reasons: [
          "CENTRAL_INTEGRATION_ACTIVE",
          "SELFX_STORE_ACTIVE",
          "INTEGRATION_CREDENTIAL_ACTIVE",
        ],
        message: "This Shopify shop is connected to SelfX.",
      }),
    );
    const client = new SelfxStorefrontTryOnClient(config, fetchImpl);

    await expect(
      client.getConnectionHealth("merchant.myshopify.com"),
    ).resolves.toMatchObject({
      state: "CONNECTED",
      storeName: "Merchant Store",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.selfx.test/api/v1/public/integrations/shopify/try-on-sessions/connection-health?shop=merchant.myshopify.com",
      expect.any(Object),
    );
    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(request.headers);
    expect(request.method).toBe("GET");
    expect(headers.get("x-selfx-shopify-service-token")).toBe("s".repeat(32));
  });

  it("reads Shopify storefront usage summary with server authentication", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        totalTryOns: 12,
        thisMonth: {
          start: "2026-09-01T00:00:00.000Z",
          end: "2026-09-14T00:00:00.000Z",
          tryOns: 5,
          completedTryOns: 4,
          failedTryOns: 1,
          generatedImages: 4,
          creditsConsumed: 5,
        },
        topProducts: [
          {
            productId: "product-1",
            productName: "Linen Shirt",
            productSlug: "linen-shirt",
            tryOns: 5,
          },
        ],
      }),
    );
    const client = new SelfxStorefrontTryOnClient(config, fetchImpl);

    await expect(
      client.getUsageSummary("merchant.myshopify.com"),
    ).resolves.toMatchObject({
      totalTryOns: 12,
      thisMonth: { tryOns: 5, creditsConsumed: 5 },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.selfx.test/api/v1/public/integrations/shopify/try-on-sessions/usage-summary?shop=merchant.myshopify.com",
      expect.any(Object),
    );
    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(request.headers);
    expect(request.method).toBe("GET");
    expect(headers.get("x-selfx-shopify-service-token")).toBe("s".repeat(32));
  });

  it("reads active Shopify plans with server authentication", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
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
      }),
    );
    const client = new SelfxStorefrontTryOnClient(config, fetchImpl);

    await expect(
      client.getAvailablePlans("merchant.myshopify.com"),
    ).resolves.toMatchObject({
      data: [{ code: "shopify-growth", channels: ["SHOPIFY"] }],
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.selfx.test/api/v1/public/integrations/shopify/try-on-sessions/plans?shop=merchant.myshopify.com",
      expect.any(Object),
    );
    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(request.headers);
    expect(request.method).toBe("GET");
    expect(headers.get("x-selfx-shopify-service-token")).toBe("s".repeat(32));
  });
});

describe("Shopify storefront Try-On launch helpers", () => {
  it("normalizes numeric Liquid product IDs to Shopify product GIDs", () => {
    expect(normalizeShopifyProductId("12345")).toBe(
      "gid://shopify/Product/12345",
    );
    expect(normalizeShopifyProductId("gid://shopify/Product/12345")).toBe(
      "gid://shopify/Product/12345",
    );
    expect(normalizeShopifyProductId("gid://shopify/Variant/12345")).toBeNull();
  });

  it("extracts product ID and handle from app proxy search params", () => {
    expect(
      productReference(
        new URLSearchParams({
          productId: "1001",
          productHandle: "Linen-Shirt",
        }),
      ),
    ).toEqual({
      externalProductId: "gid://shopify/Product/1001",
      productHandle: "linen-shirt",
    });
  });

  it("builds a shopper redirect URL with only the capability token by default", () => {
    expect(
      buildStorefrontTryOnSessionUrl({
        baseUrl:
          "https://app.selfx.test/try-on/shopify?shop=merchant.myshopify.com",
        session: "a".repeat(43),
      }),
    ).toBe(`https://app.selfx.test/try-on/shopify?session=${"a".repeat(43)}`);
  });

  it("preserves safe Shopify launch context in the shopper redirect URL", () => {
    expect(
      buildStorefrontTryOnSessionUrl({
        baseUrl:
          "https://app.selfx.test/try-on/shopify?stale=true#ignored-section",
        session: "a".repeat(43),
        shop: "merchant.myshopify.com",
        productId: "gid://shopify/Product/1001",
        productHandle: "linen-shirt",
        locale: "en",
      }),
    ).toBe(
      `https://app.selfx.test/try-on/shopify?session=${"a".repeat(
        43,
      )}&shop=merchant.myshopify.com&productId=gid%3A%2F%2Fshopify%2FProduct%2F1001&productHandle=linen-shirt&locale=en`,
    );
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
