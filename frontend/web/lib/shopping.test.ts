import { describe, expect, it } from "vitest";
import { parseTaxRate } from "./shopping";
describe("tax rate input", () => {
  it("distinguishes inheritance from zero and converts decimals exactly", () => {
    expect(parseTaxRate("")).toBeNull();
    expect(parseTaxRate("0")).toBe(0);
    expect(parseTaxRate("18")).toBe(1800);
    expect(parseTaxRate("5.25")).toBe(525);
    expect(parseTaxRate("100")).toBe(10000);
    for (const value of ["-1", "100.01", "1.234", "1e2", "NaN"])
      expect(() => parseTaxRate(value)).toThrow();
  });
});
