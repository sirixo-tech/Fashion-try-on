import { describe, expect, it } from "vitest";

import ShopifyTryOnPage from "./page";

describe("ShopifyTryOnPage", () => {
  it("requires a session capability param", async () => {
    const element = await ShopifyTryOnPage({
      searchParams: Promise.resolve({
        source: "shopify",
        shop: "merchant.myshopify.com",
        externalProductId: "gid://shopify/Product/1001",
        productHandle: "linen-shirt",
      }),
    });

    expect(element.props.sessionToken).toBeNull();
  });

  it("passes only the session capability to the client component", async () => {
    const token = "a".repeat(43);
    const element = await ShopifyTryOnPage({
      searchParams: Promise.resolve({
        session: token,
        shop: "attacker.myshopify.com",
        externalProductId: "gid://shopify/Product/9999",
      }),
    });

    expect(element.props).toEqual({ sessionToken: token });
  });
});
