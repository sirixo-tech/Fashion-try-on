import type { CapitalioDashboardMetrics } from "@selfx/ui";
import type { UsageSummary } from "./usage";

export function dashboardMetrics(
  summary: UsageSummary,
  previous?: UsageSummary | null,
): CapitalioDashboardMetrics {
  const t = summary.totals;
  const prior = previous?.totals.tryOnsGenerated;
  return {
    generated: t.tryOnsGenerated,
    attempts: t.runsCreated,
    completed: t.completedRuns,
    failed: t.failedRuns,
    queued: t.queuedRuns,
    processing: t.processingRuns,
    sessions: t.sessionsStarted,
    downloads: t.downloadsCompleted,
    successRate: t.runsCreated ? t.successRate : null,
    downloadRate: t.tryOnsGenerated ? t.downloadRate : null,
    growthPercent: !prior ? null : ((t.tryOnsGenerated - prior) / prior) * 100,
    daily: summary.daily.map((row) => ({
      date: row.date,
      generated: row.tryOnsGenerated,
      attempts: row.runsCreated,
      downloads: row.downloadsCompleted,
      failed: row.failedRuns,
      successRate: row.runsCreated
        ? (row.completedRuns / row.runsCreated) * 100
        : null,
    })),
    products: summary.products.map((row, index) => ({
      id: row.productId ?? `unmapped-${index}`,
      name: row.name,
      category: row.category ?? row.catalogSource ?? "Product reference",
      generated: row.tryOnsGenerated,
      attempts: row.runsCreated,
      downloads: row.downloadsCompleted,
      failed: row.failedRuns,
    })),
  };
}
export function previousDashboardRange(summary: UsageSummary) {
  const from = new Date(summary.range.from).getTime(),
    to = new Date(summary.range.to).getTime();
  return {
    range: "custom" as const,
    from: new Date(from - (to - from) - 1).toISOString(),
    to: new Date(from - 1).toISOString(),
  };
}
function csvCell(value: string | number) {
  const text = String(value);
  // External product/Store names must not become spreadsheet formulas.
  const safe = /^\s*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function dashboardCsv(summary: UsageSummary): string {
  const t = summary.totals;
  const rows: Array<Array<string | number>> = [
    ["Scope", summary.scope.storeName ?? "All Stores"],
    ["From (UTC)", summary.range.from],
    ["To (UTC)", summary.range.to],
    [],
    ["Metric", "Count"],
    ["Sessions", t.sessionsStarted],
    ["Generated Try-Ons", t.tryOnsGenerated],
    ["Attempts", t.runsCreated],
    ["Completed", t.completedRuns],
    ["Failed", t.failedRuns],
    ["Queued", t.queuedRuns],
    ["Processing", t.processingRuns],
    ["Downloads", t.downloadsCompleted],
    [],
    ["Date (UTC)", "Generated", "Attempts", "Failed", "Downloads"],
    ...summary.daily.map((row) => [
      row.date,
      row.tryOnsGenerated,
      row.runsCreated,
      row.failedRuns,
      row.downloadsCompleted,
    ]),
    [],
    ["Top product", "Category", "Generated", "Attempts", "Failed", "Downloads"],
    ...summary.products.map((row) => [
      row.name,
      row.category ?? "",
      row.tryOnsGenerated,
      row.runsCreated,
      row.failedRuns,
      row.downloadsCompleted,
    ]),
  ];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
