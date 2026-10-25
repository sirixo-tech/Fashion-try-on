"use client";
import { useEffect, useState } from "react";
import {
  getCurrentPlatformAccess,
  type CurrentPlatformAccess,
} from "./access-control";
import {
  getCurrentMerchantStoreAccess,
  hasStoreResourcePermission,
} from "./current-store";
import {
  getEffectiveStorePermissions,
  listStores,
  listStoreKiosks,
  listStoreProducts,
  listStoreUsers,
} from "./stores";
import type { KioskDevice } from "./kiosks";
import {
  getUsageSummary,
  type UsageRangePreset,
  type UsageSummary,
} from "./usage";
import { dashboardMetrics, previousDashboardRange } from "./dashboard-metrics";
import { navigationAccess, canSeeHref } from "./navigation-access";

type Context = {
  token: string;
  platform: CurrentPlatformAccess;
  options: { id: string; name: string }[];
  defaultStoreId: string;
  totalStores: number | null;
  error: string | null;
};
type Snapshot = {
  key: string;
  summary: UsageSummary | null;
  previous: UsageSummary | null;
  kiosks: KioskDevice[] | null;
  products: number | null;
  staff: number | null;
  canUsage: boolean;
  canAnalysis: boolean;
  canProducts: boolean;
  canActivity: boolean;
  error: string | null;
  updatedAt: string;
};
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Dashboard data could not be loaded.";

export function useDashboard(
  token: string | null,
  selectedStoreId: string | null,
  range: UsageRangePreset,
  refreshKey: number,
) {
  const [context, setContext] = useState<Context | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [accessVersion, setAccessVersion] = useState(0);
  useEffect(() => {
    const invalidate = () => {
      setContext(null);
      setSnapshot(null);
      setAccessVersion((value) => value + 1);
    };
    window.addEventListener("selfx:permissions-changed", invalidate);
    window.addEventListener("selfx:impersonation-changed", invalidate);
    return () => {
      window.removeEventListener("selfx:permissions-changed", invalidate);
      window.removeEventListener("selfx:impersonation-changed", invalidate);
    };
  }, []);
  const current = context?.token === token ? context : null;
  const mayChoose = Boolean(
    current &&
    (current.platform.isSuperadmin ||
      current.platform.permissions.includes("STORES_VIEW")),
  );
  const mayViewAll = Boolean(
    current &&
    (current.platform.isSuperadmin ||
      current.platform.permissions.includes("USAGE_VIEW")),
  );
  const validSelection =
    selectedStoreId === ""
      ? mayViewAll
      : Boolean(current?.options.some((store) => store.id === selectedStoreId));
  const storeId =
    mayChoose && validSelection
      ? selectedStoreId!
      : (current?.defaultStoreId ?? "");
  const key = `${token}:${storeId}:${range}:${refreshKey}:${accessVersion}`;
  const data = current && snapshot?.key === key ? snapshot : null;
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      try {
        const platform = await getCurrentPlatformAccess(token!);
        const choose =
          platform.isSuperadmin || platform.permissions.includes("STORES_VIEW");
        const allUsage =
          platform.isSuperadmin || platform.permissions.includes("USAGE_VIEW");
        let options: Context["options"] = [],
          totalStores: number | null = null,
          defaultStoreId = "";
        if (choose) {
          const stores = await listStores(token!, { pageSize: 100 });
          options = stores.data.map((store) => ({
            id: store.id,
            name: store.name,
          }));
          totalStores = stores.pagination.total;
          defaultStoreId = allUsage ? "" : (options[0]?.id ?? "");
        } else if (!allUsage) {
          const merchant = await getCurrentMerchantStoreAccess(token!);
          options = merchant.store
            ? [{ id: merchant.store.id, name: merchant.store.name }]
            : [];
          defaultStoreId = options[0]?.id ?? "";
        }
        if (!cancelled)
          setContext({
            token: token!,
            platform,
            options,
            totalStores,
            defaultStoreId,
            error: null,
          });
      } catch (error) {
        if (!cancelled)
          setContext({
            token: token!,
            platform: { isSuperadmin: false, permissions: [] },
            options: [],
            defaultStoreId: "",
            totalStores: null,
            error: errorMessage(error),
          });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, refreshKey, accessVersion]);
  useEffect(() => {
    if (!token || !current || current.error) return;
    let cancelled = false;
    async function load() {
      try {
        const platform = current!.platform;
        const storeAccess = storeId
          ? await getEffectiveStorePermissions(token!, storeId)
          : null;
        const allUsage =
          platform.isSuperadmin || platform.permissions.includes("USAGE_VIEW");
        const access = navigationAccess({
          sessionHasPlatformAccess:
            platform.isSuperadmin || platform.permissions.length > 0,
          platformAccess: platform,
          storeAccess,
          hasActiveStore: Boolean(storeId),
        });
        const canUsage = storeId
          ? Boolean(
              storeAccess &&
              (storeAccess.platformBypass ||
                storeAccess.permissions.includes("analytics.view")) &&
              storeAccess.featureKeys.includes("ANALYTICS"),
            )
          : allUsage;
        const resource = (permission: string) =>
          hasStoreResourcePermission(storeAccess, permission);
        const canKiosks = Boolean(
          storeId &&
          resource("kiosks.view") &&
          storeAccess?.featureKeys.some((feature) =>
            ["KIOSK_MANAGEMENT", "KIOSK_RENTAL"].includes(feature),
          ),
        );
        const [usage, kiosks, products, staff] = await Promise.allSettled([
          canUsage
            ? getUsageSummary(token!, {
                range,
                ...(storeId ? { storeId } : {}),
                limit: 10,
              })
            : Promise.resolve(null),
          canKiosks ? listStoreKiosks(token!, storeId) : Promise.resolve(null),
          storeId && resource("stores.view")
            ? listStoreProducts(token!, storeId, { pageSize: 8 })
            : Promise.resolve(null),
          storeId &&
          (storeAccess?.platformBypass ||
            storeAccess?.permissions.includes("users.view"))
            ? listStoreUsers(token!, storeId, { pageSize: 8 })
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const summary = usage.status === "fulfilled" ? usage.value : null;
        let previous: UsageSummary | null = null;
        if (summary)
          previous = await getUsageSummary(token!, {
            ...previousDashboardRange(summary),
            ...(storeId ? { storeId } : {}),
            limit: 1,
          }).catch(() => null);
        const failures = [usage, kiosks, products, staff].filter(
          (result) => result.status === "rejected",
        );
        if (!cancelled)
          setSnapshot({
            key,
            summary,
            previous,
            kiosks: kiosks.status === "fulfilled" ? kiosks.value : null,
            products:
              products.status === "fulfilled"
                ? (products.value?.pagination.total ?? null)
                : null,
            staff:
              staff.status === "fulfilled"
                ? (staff.value?.pagination.total ?? null)
                : null,
            canUsage,
            canAnalysis: canSeeHref(
              storeId ? "/app/analytics" : "/app/billing",
              access,
            ),
            canProducts:
              storeId && access.hasPlatformAccess
                ? resource("stores.view") && canSeeHref("/app/stores", access)
                : canSeeHref("/app/products", access),
            canActivity: canSeeHref("/app/try-on-activity", access),
            error:
              failures
                .map((failure) => errorMessage(failure.reason))
                .join(" ") || null,
            updatedAt: new Date().toISOString(),
          });
      } catch (error) {
        if (!cancelled)
          setSnapshot({
            key,
            summary: null,
            previous: null,
            kiosks: null,
            products: null,
            staff: null,
            canUsage: false,
            canAnalysis: false,
            canProducts: false,
            canActivity: false,
            error: errorMessage(error),
            updatedAt: new Date().toISOString(),
          });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, current, storeId, range, key]);
  return {
    storeId,
    context: current,
    data,
    metrics: data?.summary
      ? dashboardMetrics(data.summary, data.previous)
      : null,
    loading: Boolean(token) && (!current || (!current.error && !data)),
    error: current?.error ?? data?.error ?? null,
    canChooseStore: Boolean(
      current &&
      (current.platform.isSuperadmin ||
        current.platform.permissions.includes("STORES_VIEW")),
    ),
    canViewAll: Boolean(
      current &&
      (current.platform.isSuperadmin ||
        current.platform.permissions.includes("USAGE_VIEW")),
    ),
  };
}
