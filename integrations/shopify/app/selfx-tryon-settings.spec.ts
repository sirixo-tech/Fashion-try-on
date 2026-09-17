import { describe, expect, it } from "vitest";

import {
  parseShopifyProductVisibilityRules,
  tryOnModeAllowsVertical,
} from "./selfx-tryon-settings";

describe("Shopify Try-On settings", () => {
  it("keeps garment and jewellery visibility rules separate", () => {
    expect(
      parseShopifyProductVisibilityRules({
        GARMENT: {
          mode: "ALL",
          selectedCollectionIds: [],
          selectedProductIds: [],
          exceptionProductIds: ["product-1"],
        },
        JEWELLERY: {
          mode: "SELECTED",
          selectedCollectionIds: ["collection-1"],
          selectedProductIds: ["product-2"],
          exceptionProductIds: [],
        },
      }),
    ).toEqual({
      GARMENT: {
        mode: "ALL",
        selectedCollectionIds: [],
        selectedProductIds: [],
        exceptionProductIds: ["product-1"],
      },
      JEWELLERY: {
        mode: "SELECTED",
        selectedCollectionIds: ["collection-1"],
        selectedProductIds: ["product-2"],
        exceptionProductIds: [],
      },
    });
  });

  it("allows both verticals only when Both is selected", () => {
    expect(tryOnModeAllowsVertical("GARMENT", "GARMENT")).toBe(true);
    expect(tryOnModeAllowsVertical("GARMENT", "JEWELLERY")).toBe(false);
    expect(tryOnModeAllowsVertical("BOTH", "GARMENT")).toBe(true);
    expect(tryOnModeAllowsVertical("BOTH", "JEWELLERY")).toBe(true);
  });
});
