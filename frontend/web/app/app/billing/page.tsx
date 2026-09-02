"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIcon,
  BarChart3Icon,
  CreditCardIcon,
  DownloadIcon,
  MonitorIcon,
  PackageIcon,
  RefreshCwIcon,
  SparklesIcon,
  TimerResetIcon,
} from "lucide-react";

import {
  Badge,
  Button,
  PageContainer,
  PageHeader,
  PageSection,
  SelectMenu,
  StatCard,
  StatGrid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@selfx/ui";

import {
  getCurrentPlatformAccess,
  type CurrentPlatformAccess,
} from "@/lib/access-control";
import { SafeApiError } from "@/lib/api";
import { listActiveOrganizations } from "@/lib/organizations";
import { useSession } from "@/lib/session";
import { listStores, type AdminStore } from "@/lib/stores";
import {
  getUsageSummary,
  type UsageRangePreset,
  type UsageSummary,
} from "@/lib/usage";

const ranges: Array<{ value: UsageRangePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

type StoreOption = { id: string; name: string };

export default function BillingPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [range, setRange] = useState<UsageRangePreset>("7d");
  const [storeId, setStoreId] = useState("");
  const [platformAccess, setPlatformAccess] =
    useState<CurrentPlatformAccess | null>(null);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasPlatformUsageAccess = Boolean(
    platformAccess?.isSuperadmin ||
    platformAccess?.permissions.includes("USAGE_VIEW"),
  );

  useEffect(() => {
    if (!accessToken) {
      setPlatformAccess(null);
      setStoreOptions([]);
      setStoreId("");
      return;
    }

    const token = accessToken;
    let cancelled = false;

    async function loadAccess() {
      try {
        const access = await getCurrentPlatformAccess(token);
        if (cancelled) {
          return;
        }
        setPlatformAccess(access);

        if (access.isSuperadmin || access.permissions.includes("STORES_VIEW")) {
          const stores = await listStores(token, { pageSize: 100 });
          if (!cancelled) {
            setStoreOptions(stores.data.map(storeOptionFromAdminStore));
          }
          return;
        }

        const stores = await listActiveOrganizations(token);
        if (!cancelled) {
          const options = stores.map((store) => ({
            id: store.id,
            name: store.name,
          }));
          setStoreOptions(options);
          setStoreId((current) => current || options[0]?.id || "");
        }
      } catch (caught) {
        if (!cancelled) {
          setError(messageFor(caught));
          setPlatformAccess({ isSuperadmin: false, permissions: [] });
        }
      }
    }

    void loadAccess();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const loadSummary = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    if (!hasPlatformUsageAccess && !storeId) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextSummary = await getUsageSummary(accessToken, {
        range,
        storeId: storeId || undefined,
        limit: 10,
      });
      setSummary(nextSummary);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, hasPlatformUsageAccess, range, storeId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const filteredStoreName = useMemo(
    () => storeOptions.find((store) => store.id === storeId)?.name ?? null,
    [storeId, storeOptions],
  );

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Commercial Operations"
        title="Usage & Billing"
        description="Privacy-safe kiosk usage rollups for sessions, generated looks, downloads and provider activity."
        status={
          <Badge variant="secondary">
            {filteredStoreName ? filteredStoreName : "All Stores"}
          </Badge>
        }
        actions={
          <Button variant="outline" onClick={() => void loadSummary()}>
            <RefreshCwIcon aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <PageSection>
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[12rem_minmax(0,18rem)_1fr]">
          <label className="grid gap-2 text-sm font-medium">
            Date range
            <SelectMenu
              ariaLabel="Date range"
              value={range}
              options={ranges}
              className="h-11"
              onChange={setRange}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Store
            <SelectMenu
              ariaLabel="Store"
              value={storeId}
              disabled={storeOptions.length === 0}
              options={[
                ...(hasPlatformUsageAccess
                  ? [{ value: "", label: "All Stores" }]
                  : []),
                ...storeOptions.map((store) => ({
                  value: store.id,
                  label: store.name,
                })),
              ]}
              className="h-11"
              onChange={setStoreId}
            />
          </label>
          <div className="flex items-end text-sm text-muted-foreground">
            {summary
              ? `${formatDate(summary.range.from)} to ${formatDate(summary.range.to)}`
              : "Usage is loaded from the kiosk event ledger."}
          </div>
        </div>
      </PageSection>

      {error ? (
        <PageSection>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        </PageSection>
      ) : null}

      <PageSection>
        <StatGrid>
          <StatCard
            label="Sessions"
            value={displayNumber(summary?.totals.sessionsStarted)}
            secondaryValue={`${displayNumber(summary?.totals.sessionsCompleted)} completed`}
            icon={<ActivityIcon size={18} aria-hidden="true" />}
          />
          <StatCard
            label="Generated Looks"
            value={displayNumber(summary?.totals.tryOnsGenerated)}
            secondaryValue="Successful kiosk Try-On outputs"
            icon={<SparklesIcon size={18} aria-hidden="true" />}
          />
          <StatCard
            label="Downloads"
            value={displayNumber(summary?.totals.downloadsCompleted)}
            secondaryValue={`${displayPercent(summary?.totals.downloadRate)} download rate`}
            icon={<DownloadIcon size={18} aria-hidden="true" />}
          />
          <StatCard
            label="Idle Returns"
            value={displayNumber(summary?.totals.sessionsIdleExpired)}
            secondaryValue="Sessions reset by inactivity"
            icon={<TimerResetIcon size={18} aria-hidden="true" />}
          />
        </StatGrid>
      </PageSection>

      <PageSection>
        <div className="grid gap-4 xl:grid-cols-2">
          <UsageTable
            title="Provider Usage"
            icon={<CreditCardIcon size={18} aria-hidden="true" />}
            empty="No provider usage in this range."
            loading={loading}
            headers={["Provider", "Model", "Looks"]}
            rows={(summary?.providerUsage ?? []).map((row) => [
              row.provider,
              row.providerModel ?? "-",
              displayNumber(row.tryOnsGenerated),
            ])}
          />
          <UsageTable
            title="Top Stores"
            icon={<BarChart3Icon size={18} aria-hidden="true" />}
            empty="No Store usage in this range."
            loading={loading}
            headers={["Store", "Sessions", "Looks", "Downloads"]}
            rows={(summary?.stores ?? []).map((row) => [
              row.storeName,
              displayNumber(row.sessionsStarted),
              displayNumber(row.tryOnsGenerated),
              displayNumber(row.downloadsCompleted),
            ])}
          />
          <UsageTable
            title="Top Kiosks"
            icon={<MonitorIcon size={18} aria-hidden="true" />}
            empty="No kiosk usage in this range."
            loading={loading}
            headers={["Kiosk", "Store", "Looks", "Downloads"]}
            rows={(summary?.kiosks ?? []).map((row) => [
              row.displayName,
              row.storeName ?? "Platform fleet",
              displayNumber(row.tryOnsGenerated),
              displayNumber(row.downloadsCompleted),
            ])}
          />
          <UsageTable
            title="Top Products"
            icon={<PackageIcon size={18} aria-hidden="true" />}
            empty="No product usage in this range."
            loading={loading}
            headers={["Product", "Looks", "Downloads"]}
            rows={(summary?.products ?? []).map((row) => [
              row.name,
              displayNumber(row.tryOnsGenerated),
              displayNumber(row.downloadsCompleted),
            ])}
          />
        </div>
      </PageSection>
    </PageContainer>
  );
}

function UsageTable({
  title,
  icon,
  headers,
  rows,
  empty,
  loading,
}: {
  title: string;
  icon: ReactNode;
  headers: string[];
  rows: string[][];
  empty: string;
  loading: boolean;
}) {
  return (
    <TableContainer
      title={title}
      actions={<div className="text-primary">{icon}</div>}
    >
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={headers.length}>Loading usage...</TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={headers.length}>{empty}</TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow key={`${title}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <TableCell
                    key={`${title}-${index}-${cellIndex}`}
                    className={cellIndex === 0 ? "font-medium" : undefined}
                  >
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function storeOptionFromAdminStore(store: AdminStore): StoreOption {
  return { id: store.id, name: store.name };
}

function displayNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value ?? 0,
  );
}

function displayPercent(value: number | null | undefined): string {
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(value ?? 0)}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  if (caught instanceof Error) {
    return caught.message;
  }
  return "Usage could not be loaded.";
}
