import { describe, expect, it } from "vitest";

import {
  needsShopifyJewelleryClassification,
  shopifyTryOnModeAllowsProduct,
  shopifyTryOnModeFromMetadata,
} from "./shopify-product-category.js";

describe("Shopify jewellery category fallback", () => {
  const metadata = {
    authoritativeSource: "SHOPIFY",
    shopifyCategoryName:
      "Apparel & Accessories > Jewelry > Brooches & Lapel Pins",
  };

  it("requires manual classification for unsupported jewellery categories", () => {
    expect(needsShopifyJewelleryClassification(metadata, "GARMENT")).toBe(true);
  });

  it("keeps explicit merchant corrections and inferred jewellery available", () => {
    expect(
      needsShopifyJewelleryClassification(
        { ...metadata, classificationSource: "MANUAL" },
        "GARMENT",
      ),
    ).toBe(false);
    expect(needsShopifyJewelleryClassification(metadata, "JEWELLERY")).toBe(
      false,
    );
  });

  it("does not affect non-jewellery or other commerce products", () => {
    expect(
      needsShopifyJewelleryClassification(
        { ...metadata, authoritativeSource: "WOOCOMMERCE" },
        "GARMENT",
      ),
    ).toBe(false);
    expect(
      needsShopifyJewelleryClassification(
        {
          ...metadata,
          shopifyCategoryName: "Apparel & Accessories > Clothing > Shirts",
        },
        "GARMENT",
      ),
    ).toBe(false);
  });
});

describe("Shopify Try-On mode", () => {
  it("defaults legacy integrations to garments and jewellery", () => {
    expect(shopifyTryOnModeFromMetadata({})).toBe("BOTH");
    expect(shopifyTryOnModeAllowsProduct({}, "GARMENT")).toBe(true);
    expect(shopifyTryOnModeAllowsProduct({}, "JEWELLERY")).toBe(true);
  });

  it("allows both product verticals only in BOTH mode", () => {
    const metadata = { tryOnMode: "BOTH" };
    expect(shopifyTryOnModeAllowsProduct(metadata, "GARMENT")).toBe(true);
    expect(shopifyTryOnModeAllowsProduct(metadata, "JEWELLERY")).toBe(true);
  });
});
