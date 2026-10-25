"use client";
import { useEffect, useState } from "react";
import {
  getMobileDashboard,
  type MobileRange,
  type MobileDashboardSummary,
} from "./mobile-dashboard";

export function useMobileDashboard(
  token: string | null,
  range: MobileRange,
  refresh: number,
) {
  const [accessVersion, setAccessVersion] = useState(0);
  const key = `${token}:${range}:${refresh}:${accessVersion}`;
  const [snapshot, setSnapshot] = useState<{
    key: string;
    data: MobileDashboardSummary | null;
    error: string | null;
  } | null>(null);
  useEffect(() => {
    const invalidate = () => {
      setSnapshot(null);
      setAccessVersion((version) => version + 1);
    };
    window.addEventListener("selfx:permissions-changed", invalidate);
    window.addEventListener("selfx:impersonation-changed", invalidate);
    return () => {
      window.removeEventListener("selfx:permissions-changed", invalidate);
      window.removeEventListener("selfx:impersonation-changed", invalidate);
    };
  }, []);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getMobileDashboard(token, range).then(
      (data) => {
        if (!cancelled) setSnapshot({ key, data, error: null });
      },
      (error: unknown) => {
        if (!cancelled)
          setSnapshot({
            key,
            data: null,
            error:
              error instanceof Error
                ? error.message
                : "Mobile metrics could not be loaded.",
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, range, refresh, key]);
  return snapshot?.key === key
    ? { ...snapshot, loading: false }
    : { data: null, error: null, loading: true };
}
