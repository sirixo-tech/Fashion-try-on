import { selfxApi } from "@/lib/api";

export type UsageRangePreset = "today" | "7d" | "30d" | "90d" | "custom";
export type UsageChannelFilter = "ALL" | "KIOSK" | "PUBLIC_API";

type UsageCountRow = {
  sessionsStarted: number;
  runsCreated: number;
  completedRuns: number;
  failedRuns: number;
  tryOnsGenerated: number;
  downloadsCompleted: number;
};

export type UsageSummary = {
  range: {
    preset: UsageRangePreset;
    from: string;
    to: string;
  };
  scope: {
    mode: "PLATFORM" | "STORE";
    storeId?: string;
    storeName?: string;
  };
  totals: {
    sessionsStarted: number;
    sessionsCompleted: number;
    sessionsIdleExpired: number;
    runsCreated: number;
    queuedRuns: number;
    processingRuns: number;
    completedRuns: number;
    failedRuns: number;
    tryOnsGenerated: number;
    downloadsCompleted: number;
    downloadRate: number;
    successRate: number;
  };
  providerUsage: Array<
    Omit<UsageCountRow, "sessionsStarted"> & {
    provider: string;
    providerModel: string | null;
    }
  >;
  stores: Array<
    UsageCountRow & {
    storeId: string | null;
    storeName: string;
    }
  >;
  kiosks: Array<
    UsageCountRow & {
    kioskDeviceId: string;
    displayName: string;
    storeId: string | null;
    storeName: string | null;
    }
  >;
  products: Array<
    UsageCountRow & {
    productId: string | null;
    name: string;
    category?: string;
    catalogSource?: string | null;
    externalProductId?: string;
    externalVariantId?: string;
    sku?: string;
    }
  >;
  categories: Array<UsageCountRow & { category: string }>;
  channels: Array<UsageCountRow & { channel: "KIOSK" | "PUBLIC_API" }>;
  daily: Array<UsageCountRow & { date: string }>;
};

export function getUsageSummary(
  accessToken: string,
  query: {
    range?: UsageRangePreset;
    storeId?: string;
    kioskDeviceId?: string;
    channel?: UsageChannelFilter;
    limit?: number;
  } = {},
): Promise<UsageSummary> {
  const params = new URLSearchParams();
  params.set("range", query.range ?? "7d");
  params.set("limit", String(query.limit ?? 10));
  if (query.storeId) {
    params.set("storeId", query.storeId);
  }
  if (query.kioskDeviceId) {
    params.set("kioskDeviceId", query.kioskDeviceId);
  }
  if (query.channel) {
    params.set("channel", query.channel);
  }
  return selfxApi<UsageSummary>(`/api/v1/admin/usage/summary?${params}`, {
    accessToken,
  });
}
