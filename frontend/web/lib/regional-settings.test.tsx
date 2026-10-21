import { expect, it } from "vitest";
import { formatRegionalDate } from "./regional-settings";
it("formats explicit date order and timezone across midnight", () => {
  expect(
    formatRegionalDate(
      "2026-10-21T00:30:00Z",
      { timezone: "America/Los_Angeles", dateFormat: "YMD", timeFormat: "H24" },
      "date",
    ),
  ).toBe("2026-10-20");
});
it("keeps daily report bucket dates fixed rather than shifting them", () => {
  expect(
    formatRegionalDate(
      "2026-10-21T00:00:00Z",
      {
        timezone: "America/Los_Angeles",
        dateFormat: "DMY",
        timeFormat: "AUTO",
      },
      "date",
      true,
    ),
  ).toBe("21/10/2026");
});
it("applies daylight-saving transitions", () => {
  const settings = {
    timezone: "America/New_York",
    dateFormat: "YMD",
    timeFormat: "H24",
  } as const;
  expect(
    formatRegionalDate("2026-03-08T06:30:00Z", settings, "time"),
  ).toContain("01:30");
  expect(
    formatRegionalDate("2026-03-08T07:30:00Z", settings, "time"),
  ).toContain("03:30");
});
it("supports 12/24-hour formats and invalid timestamp fallbacks", () => {
  expect(
    formatRegionalDate("2026-10-21T18:30:00Z", {
      timezone: "UTC",
      dateFormat: "MDY",
      timeFormat: "H12",
    }),
  ).toMatch(/10\/21\/2026.*06:30/i);
  expect(formatRegionalDate("invalid")).toBe("—");
});
