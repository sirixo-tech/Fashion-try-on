import { describe, expect, it } from "vitest";

import { mapShopifyProduct, moneyToCents } from "./shopify-product.mapper.js";
import { shopifyProduct } from "./test-fixtures.js";

describe("Shopify product normalization", () => {
  it("maps Shopify-owned product and variant data into the SelfX contract", () => {
    const result = mapShopifyProduct(
      shopifyProduct({
        status: "UNLISTED",
        featuredMedia: {
          preview: { image: { url: "https://cdn.shopify.test/tee.jpg" } },
        },
      }),
      "USD",
    );

    expect(result).toMatchObject({
      externalProductId: "gid://shopify/Product/1",
      title: "Black Tee",
      status: "DRAFT",
      priceAmountCents: 2999,
      priceCurrency: "USD",
      featuredImageUrl: "https://cdn.shopify.test/tee.jpg",
      variants: [
        {
          externalVariantId: "gid://shopify/ProductVariant/1",
          sku: "TEE-BLK-M",
          priceAmountCents: 2999,
          priceCurrency: "USD",
          imageUrl: "https://cdn.shopify.test/tee.jpg",
          available: true,
        },
      ],
    });
  });

  it("converts Shopify money strings to integer cents", () => {
    expect(moneyToCents("19.995")).toBe(2000);
    expect(moneyToCents("invalid")).toBeNull();
  });

  it("uses the first variant image when featured media is unavailable", () => {
    const result = mapShopifyProduct(
      shopifyProduct({
        featuredMedia: null,
        variants: [
          {
            id: "gid://shopify/ProductVariant/1",
            title: "Default",
            sku: null,
            price: "19.99",
            availableForSale: true,
            image: { url: "https://cdn.shopify.test/variant.jpg" },
          },
        ],
      }),
      "USD",
    );

    expect(result.featuredImageUrl).toBe(
      "https://cdn.shopify.test/variant.jpg",
    );
    expect(result.variants[0]?.imageUrl).toBe(
      "https://cdn.shopify.test/variant.jpg",
    );
  });
});
