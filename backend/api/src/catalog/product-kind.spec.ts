import { describe, expect, it } from "vitest";

import {
  assertJewelleryProductImageDimensions,
  jewelleryLegacyGarmentFields,
  resolveCreateProductKind,
  resolveUpdateProductKind,
} from "./product-kind.js";

describe("product kind", () => {
  it("defaults new products to garment without a jewellery type", () => {
    expect(resolveCreateProductKind({}, invalid)).toEqual({
      productVertical: "GARMENT",
      jewelleryType: null,
    });
  });

  it("requires jewellery type for jewellery products", () => {
    expect(() =>
      resolveCreateProductKind({ productVertical: "JEWELLERY" }, invalid),
    ).toThrow("Jewellery products require a jewellery type");
  });

  it("rejects jewellery type on garment products", () => {
    expect(() =>
      resolveCreateProductKind(
        { productVertical: "GARMENT", jewelleryType: "RING" },
        invalid,
      ),
    ).toThrow("Jewellery type is only valid for jewellery products");
  });

  it("normalizes jewellery type and legacy placeholders", () => {
    const kind = resolveCreateProductKind(
      { productVertical: "jewellery", jewelleryType: "ring" },
      invalid,
    );

    expect(kind).toEqual({
      productVertical: "JEWELLERY",
      jewelleryType: "RING",
    });
    if (kind.productVertical !== "JEWELLERY") {
      throw new Error("Expected jewellery product kind.");
    }
    expect(jewelleryLegacyGarmentFields(kind.jewelleryType)).toEqual({
      garmentIntent: "JEWELLERY",
      garmentCategory: "RING",
      garmentPhotoType: "PRODUCT",
    });
  });

  it("preserves existing jewellery type during partial updates", () => {
    expect(
      resolveUpdateProductKind(
        { product_vertical: "JEWELLERY", jewellery_type: "EARRING" },
        {},
        invalid,
      ),
    ).toEqual({
      productVertical: "JEWELLERY",
      jewelleryType: "EARRING",
    });
  });

  it("enforces provider-compatible jewellery catalogue dimensions", () => {
    const jewellery = resolveCreateProductKind(
      { productVertical: "JEWELLERY", jewelleryType: "NECKLACE" },
      invalid,
    );

    expect(() =>
      assertJewelleryProductImageDimensions(
        jewellery,
        { width: 640, height: 640 },
        invalid,
      ),
    ).not.toThrow();
    expect(() =>
      assertJewelleryProductImageDimensions(
        jewellery,
        { width: 225, height: 225 },
        invalid,
      ),
    ).toThrow("at least 640 x 640");
    expect(() =>
      assertJewelleryProductImageDimensions(
        jewellery,
        { width: null, height: null },
        invalid,
      ),
    ).toThrow("could not be verified");
    expect(() =>
      assertJewelleryProductImageDimensions(
        jewellery,
        { width: 4097, height: 640 },
        invalid,
      ),
    ).toThrow("must not exceed 4096 x 4096");
  });

  it("does not apply jewellery dimensions to garment products", () => {
    const garment = resolveCreateProductKind({}, invalid);
    expect(() =>
      assertJewelleryProductImageDimensions(
        garment,
        { width: 225, height: 225 },
        invalid,
      ),
    ).not.toThrow();
  });
});

function invalid(message: string): never {
  throw new Error(message);
}
