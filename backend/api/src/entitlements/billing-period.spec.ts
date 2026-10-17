import { describe, expect, it } from "vitest";
import { monthlyBillingPeriod } from "./billing-period.js";

describe("UTC monthly billing anniversaries", () => {
  const anchor = new Date("2024-01-31T18:42:13.123Z");
  it("clamps February and restores the original day in March", () => {
    expect(
      monthlyBillingPeriod(anchor, new Date("2024-03-01T00:00:00Z")),
    ).toEqual({
      start: new Date("2024-02-29T18:42:13.123Z"),
      end: new Date("2024-03-31T18:42:13.123Z"),
    });
  });
  it("uses half-open boundaries and handles non-leap years", () => {
    expect(
      monthlyBillingPeriod(anchor, new Date("2025-02-28T18:42:13.123Z")),
    ).toEqual({
      start: new Date("2025-02-28T18:42:13.123Z"),
      end: new Date("2025-03-31T18:42:13.123Z"),
    });
    expect(
      monthlyBillingPeriod(
        anchor,
        new Date("2025-02-28T18:42:13.122Z"),
      ).end.toISOString(),
    ).toBe("2025-02-28T18:42:13.123Z");
  });
  it("rejects invalid dates and dates before activation", () => {
    expect(() => monthlyBillingPeriod(anchor, new Date("2023-12-01"))).toThrow(
      RangeError,
    );
    expect(() => monthlyBillingPeriod(new Date("bad"), anchor)).toThrow(
      RangeError,
    );
  });
});
