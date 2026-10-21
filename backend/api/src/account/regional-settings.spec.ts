import "reflect-metadata";
import { expect, it, vi } from "vitest";
import {
  RegionalSettingsController,
  validateTimezone,
} from "./regional-settings.controller.js";
it("accepts automatic and IANA time zones and rejects invalid zones", () => {
  expect(validateTimezone(null)).toBeNull();
  expect(validateTimezone("America/New_York")).toBe("America/New_York");
  expect(() => validateTimezone("wrong-zone")).toThrow();
});
it("updates only the authenticated user's preferences", async () => {
  const update = vi.fn();
  const controller = new RegionalSettingsController(
    {
      requireAccessUser: vi.fn().mockResolvedValue({ id: "actual-user" }),
    } as never,
    { user: { update } } as never,
  );
  await controller.save(
    { headers: { authorization: "Bearer fixture" } } as never,
    { timezone: "UTC", dateFormat: "YMD", timeFormat: "H24" },
  );
  expect(update).toHaveBeenCalledWith({
    where: { id: "actual-user" },
    data: {
      regionalTimezone: "UTC",
      regionalDateFormat: "YMD",
      regionalTimeFormat: "H24",
    },
  });
});
