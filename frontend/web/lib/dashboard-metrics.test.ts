import { describe, expect, it } from "vitest";
import {
  dashboardCsv,
  dashboardMetrics,
  previousDashboardRange,
} from "./dashboard-metrics";
import { dashboardFixture } from "./dashboard-fixture";

describe("SelfX dashboard metrics", () => {
  it("uses real counts and compares equal non-overlapping windows", () => {
    const current = dashboardFixture(18),
      previous = dashboardFixture(12);
    const metrics = dashboardMetrics(current, previous);
    expect(metrics.growthPercent).toBe(50);
    expect(metrics.generated).toBe(18);
    expect(metrics.products[0]?.name).toBe("Linen shirt");
    const before = previousDashboardRange(current);
    const duration =
      new Date(current.range.to).getTime() -
      new Date(current.range.from).getTime();
    expect(new Date(before.to).getTime()).toBe(
      new Date(current.range.from).getTime() - 1,
    );
    expect(
      new Date(before.to).getTime() - new Date(before.from).getTime(),
    ).toBe(duration);
  });
  it("does not invent growth, success or download percentages when denominators are missing", () => {
    const current = dashboardFixture(0);
    current.totals.runsCreated = 0;
    const metrics = dashboardMetrics(current, dashboardFixture(0));
    expect(metrics.growthPercent).toBeNull();
    expect(metrics.successRate).toBeNull();
    expect(metrics.downloadRate).toBeNull();
    expect(dashboardMetrics(dashboardFixture(10)).growthPercent).toBeNull();
  });
  it("exports scoped data with safe CSV cells rather than executable spreadsheet formulas", () => {
    const current = dashboardFixture();
    current.scope.storeName = '=HYPERLINK("https://bad.example")';
    current.products[0]!.name = '  @malicious,"name"\nsecond line';
    const csv = dashboardCsv(current);
    expect(csv).toContain('"\'=HYPERLINK(""https://bad.example"")"');
    expect(csv).toContain('"\'  @malicious,""name""\nsecond line"');
    expect(csv).toContain('"Generated Try-Ons","18"');
    expect(csv).not.toMatch(/image|token|person|base64/i);
  });
  it("maps and exports Store performance for platform scope without individual products", () => {
    const current = dashboardFixture();
    current.scope = { mode: "PLATFORM" };
    current.stores[0]!.storeName = '=HYPERLINK("bad")';
    const metrics = dashboardMetrics(current);
    expect(metrics.products).toEqual([]);
    expect(metrics.stores?.[0]).toMatchObject({
      id: "store-a",
      generated: 18,
      attempts: 24,
      successRate: (20 / 24) * 100,
    });
    const csv = dashboardCsv(current);
    expect(csv).toContain(
      '"Top Store","Generated","Attempts","Success rate (%)","Failed","Downloads"',
    );
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).not.toContain("Linen shirt");
    expect(csv).not.toContain("Top product");
    current.stores[0]!.runsCreated = 0;
    expect(dashboardMetrics(current).stores?.[0]?.successRate).toBeNull();
  });
});
