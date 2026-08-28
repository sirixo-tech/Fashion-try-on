import { selfxApi } from "@/lib/api";

export type UsageRangePreset = "today" | "7d" | "30d" | "90d" | "custom";

export type UsageSummary = {
  range: {
    preset: UsageRangePreset;
    from: string;
    to: string;
  };
  totals: {
    sessionsStarted: number;
    sessionsCompleted: number;
    sessionsIdleExpired: number;
    tryOnsGenerated: number;
    downloadsCompleted: number;
    downloadRate: number;
  };
  providerUsage: Array<{
    provider: string;
    providerModel: string | null;
    tryOnsGenerated: number;
  }>;
  stores: Array<{
    storeId: string | null;
    storeName: string;
    sessionsStarted: number;
    tryOnsGenerated: number;
    downloadsCompleted: number;
  }>;
  kiosks: Array<{
    kioskDeviceId: string;
    displayName: string;
    storeId: string | null;
    storeName: string | null;
    sessionsStarted: number;
    tryOnsGenerated: number;
    downloadsCompleted: number;
  }>;
  products: Array<{
    productId: string;
    name: string;
    tryOnsGenerated: number;
    downloadsCompleted: number;
  }>;
};

export function getUsageSummary(
  accessToken: string,
  query: {
    range?: UsageRangePreset;
    storeId?: string;
    kioskDeviceId?: string;
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
  return selfxApi<UsageSummary>(`/api/v1/admin/usage/summary?${params}`, {
    accessToken,
  });
}
