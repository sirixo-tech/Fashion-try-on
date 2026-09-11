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
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.selfx.test/api/v1/public/integrations/shopify/try-on-sessions",
      expect.any(Object),
    );
    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(request.headers);
    expect(request.method).toBe("POST");
    expect(headers.get("Content-Type")).toBe("application/json");
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

  it("builds a shopper redirect URL with only the capability token", () => {
    expect(
      buildStorefrontTryOnSessionUrl({
        baseUrl:
          "https://app.selfx.test/try-on/shopify?shop=merchant.myshopify.com",
        session: "a".repeat(43),
      }),
    ).toBe(`https://app.selfx.test/try-on/shopify?session=${"a".repeat(43)}`);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
