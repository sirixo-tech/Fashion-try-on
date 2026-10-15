import { describe, expect, it } from "vitest";
import { stockPriceToCents, stockQuantityFromInput } from "./product-stock";

describe("stock input parsing", () => {
  it("preserves decimal monetary amounts without rounding or treating blank as zero", () => {
    expect(stockPriceToCents("19.99")).toBe(1999);
    expect(stockPriceToCents("0.01")).toBe(1);
    expect(stockPriceToCents("0")).toBe(0);
    expect(stockPriceToCents("")).toBeNull();
    for (const input of ["1.999", "-1", "1e3", "NaN", "1000000.01"])
      expect(() => stockPriceToCents(input)).toThrow();
  });
  it("requires explicit whole stock quantities within the supported range", () => {
    expect(stockQuantityFromInput("0")).toBe(0);
    expect(stockQuantityFromInput("1000000")).toBe(1_000_000);
    for (const input of ["", "-1", "0.5", "1e2", "1000001"])
      expect(() => stockQuantityFromInput(input)).toThrow();
  });
});
