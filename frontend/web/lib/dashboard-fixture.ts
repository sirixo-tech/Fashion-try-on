import type { UsageSummary } from "./usage";

/** Deterministic test/preview fixture; never imported by the dashboard runtime. */
export function dashboardFixture(generated = 18): UsageSummary {
  const counts = {
    sessionsStarted: 30,
    runsCreated: 24,
    completedRuns: 20,
    failedRuns: 2,
    tryOnsGenerated: generated,
    downloadsCompleted: 9,
  };
  return {
    range: {
      preset: "30d",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-08T00:00:00.000Z",
    },
    scope: { mode: "STORE", storeId: "store-a", storeName: "Store A" },
    totals: {
      ...counts,
      sessionsCompleted: 20,
      sessionsIdleExpired: 2,
      queuedRuns: 1,
      processingRuns: 1,
      downloadRate: 50,
      successRate: 83.333,
    },
    stores: [{ ...counts, storeId: "store-a", storeName: "Store A" }],
    kiosks: [],
    channels: [],
    categories: [],
    products: [
      {
        ...counts,
        productId: "product-a",
        name: "Linen shirt",
        category: "Tops",
      },
    ],
    daily: Array.from({ length: 8 }, (_, index) => ({
      ...counts,
      date: `2026-10-${String(index + 1).padStart(2, "0")}`,
      sessionsStarted: 3 + index,
      runsCreated: index + 1,
      completedRuns: index,
      failedRuns: index % 3 ? 0 : 1,
      tryOnsGenerated: index,
      downloadsCompleted: Math.floor(index / 2),
    })),
  };
}
