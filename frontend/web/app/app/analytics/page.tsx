"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIcon,
  BarChart3Icon,
  BoxesIcon,
  DownloadIcon,
  Layers3Icon,
  MonitorIcon,
  PackageIcon,
  RefreshCwIcon,
  SparklesIcon,
  StoreIcon,
  WorkflowIcon,
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
  type UsageChannelFilter,
  type UsageRangePreset,
  type UsageSummary,
} from "@/lib/usage";

const ranges: Array<{ value: UsageRangePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

const channels: Array<{ value: UsageChannelFilter; label: string }> = [
  { value: "ALL", label: "All channels" },
  { value: "KIOSK", label: "Kiosk" },
  { value: "PUBLIC_API", label: "Public API" },
];

type StoreOption = { id: string; name: string };

export default function AnalyticsPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [range, setRange] = useState<UsageRangePreset>("7d");
  const [channel, setChannel] = useState<UsageChannelFilter>("ALL");
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
  const selectedStoreName = useMemo(
    () =>
      storeId
        ? (storeOptions.find((store) => store.id === storeId)?.name ?? null)
        : null,
    [storeId, storeOptions],
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
        channel,
        storeId: storeId || undefined,
        limit: 10,
      });
      setSummary(nextSummary);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, channel, hasPlatformUsageAccess, range, storeId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const scopeLabel =
    summary?.scope.mode === "STORE"
      ? (summary.scope.storeName ?? selectedStoreName ?? "Selected Store")
      : "All Stores";
  const maxDaily = Math.max(
    1,
    ...(summary?.daily ?? []).map((row) => row.tryOnsGenerated),
  );

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Workspace"
        title="Analytics"
        description="Hierarchical usage visibility for platform teams and Store teams without exposing customer images."
        status={<Badge variant="secondary">{scopeLabel}</Badge>}
        actions={
          <Button variant="outline" onClick={() => void loadSummary()}>
            <RefreshCwIcon aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <PageSection>
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[12rem_12rem_minmax(0,18rem)_1fr]">
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
            Channel
            <SelectMenu
              ariaLabel="Channel"
              value={channel}
              options={channels}
              className="h-11"
              onChange={setChannel}
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
              : "Usage is loaded from run records and event rollups."}
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
            label="Generated Looks"
            value={displayNumber(summary?.totals.tryOnsGenerated)}
            secondaryValue={`${displayPercent(summary?.totals.successRate)} success rate`}
            icon={<SparklesIcon size={18} aria-hidden="true" />}
          />
          <StatCard
            label="Sessions"
            value={displayNumber(summary?.totals.sessionsStarted)}
            secondaryValue={`${displayNumber(summary?.totals.sessionsCompleted)} completed`}
            icon={<ActivityIcon size={18} aria-hidden="true" />}
          />
          <StatCard
            label="Downloads"
            value={displayNumber(summary?.totals.downloadsCompleted)}
            secondaryValue={`${displayPercent(summary?.totals.downloadRate)} download rate`}
            icon={<DownloadIcon size={18} aria-hidden="true" />}
          />
          <StatCard
            label="Failed Runs"
            value={displayNumber(summary?.totals.failedRuns)}
            secondaryValue={`${displayNumber(summary?.totals.processingRuns)} processing now`}
            icon={<WorkflowIcon size={18} aria-hidden="true" />}
          />
        </StatGrid>
      </PageSection>

      <PageSection>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
          <TableContainer
            title="Daily Try-On Activity"
            actions={<div className="text-primary"><BarChart3Icon size={18} /></div>}
          >
            <div className="grid gap-2 p-1">
              {loading ? (
                <div className="text-sm text-muted-foreground">
                  Loading daily activity...
                </div>
              ) : (summary?.daily ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No activity in this range.
                </div>
              ) : (
                (summary?.daily ?? []).map((row) => (
                  <div
                    key={row.date}
                    className="grid grid-cols-[5.5rem_1fr_5rem] items-center gap-3 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {shortDate(row.date)}
                    </span>
                    <div className="h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.max(
                            4,
                            (row.tryOnsGenerated / maxDaily) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="text-right font-semibold">
                      {displayNumber(row.tryOnsGenerated)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </TableContainer>

          <TableContainer
            title="Channel Split"
            actions={<div className="text-primary"><Layers3Icon size={18} /></div>}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Runs</TableHead>
                  <TableHead>Looks</TableHead>
                  <TableHead>Downloads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4}>Loading channels...</TableCell>
                  </TableRow>
                ) : (
                  (summary?.channels ?? []).map((row) => (
                    <TableRow key={row.channel}>
                      <TableCell className="font-medium">
                        {channelName(row.channel)}
                      </TableCell>
                      <TableCell>{displayNumber(row.runsCreated)}</TableCell>
                      <TableCell>
                        {displayNumber(row.tryOnsGenerated)}
                      </TableCell>
                      <TableCell>
                        {displayNumber(row.downloadsCompleted)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      </PageSection>

      <PageSection>
        <div className="grid gap-4 xl:grid-cols-2">
          <UsageTable
            title={hasPlatformUsageAccess && !storeId ? "Store Usage" : "Store Summary"}
            icon={<StoreIcon size={18} aria-hidden="true" />}
            empty="No Store usage in this range."
            loading={loading}
            headers={["Store", "Sessions", "Runs", "Looks", "Downloads"]}
            rows={(summary?.stores ?? []).map((row) => [
              row.storeName,
              displayNumber(row.sessionsStarted),
              displayNumber(row.runsCreated),
              displayNumber(row.tryOnsGenerated),
              displayNumber(row.downloadsCompleted),
            ])}
          />
          <UsageTable
            title="Product Usage"
            icon={<PackageIcon size={18} aria-hidden="true" />}
            empty="No product usage in this range."
            loading={loading}
            headers={["Product", "Category", "Runs", "Looks", "Downloads"]}
            rows={(summary?.products ?? []).map((row) => [
              productLabel(row),
              row.category ?? "-",
              displayNumber(row.runsCreated),
              displayNumber(row.tryOnsGenerated),
              displayNumber(row.downloadsCompleted),
            ])}
          />
          <UsageTable
            title="Category Usage"
            icon={<BoxesIcon size={18} aria-hidden="true" />}
            empty="No category usage in this range."
            loading={loading}
            headers={["Category", "Runs", "Completed", "Failed", "Looks"]}
            rows={(summary?.categories ?? []).map((row) => [
              row.category,
              displayNumber(row.runsCreated),
              displayNumber(row.completedRuns),
              displayNumber(row.failedRuns),
              displayNumber(row.tryOnsGenerated),
            ])}
          />
          <UsageTable
            title="Kiosk Usage"
            icon={<MonitorIcon size={18} aria-hidden="true" />}
            empty="No kiosk usage in this range."
            loading={loading}
            headers={["Kiosk", "Store", "Sessions", "Looks", "Downloads"]}
            rows={(summary?.kiosks ?? []).map((row) => [
              row.displayName,
              row.storeName ?? "Platform fleet",
              displayNumber(row.sessionsStarted),
              displayNumber(row.tryOnsGenerated),
              displayNumber(row.downloadsCompleted),
            ])}
          />
          <UsageTable
            title="Provider Health"
            icon={<WorkflowIcon size={18} aria-hidden="true" />}
            empty="No provider activity in this range."
            loading={loading}
            headers={["Provider", "Model", "Runs", "Failed", "Looks"]}
            rows={(summary?.providerUsage ?? []).map((row) => [
              row.provider,
              row.providerModel ?? "-",
              displayNumber(row.runsCreated),
              displayNumber(row.failedRuns),
              displayNumber(row.tryOnsGenerated),
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
              <TableCell colSpan={headers.length}>Loading analytics...</TableCell>
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

function productLabel(row: UsageSummary["products"][number]): string {
  const source = row.catalogSource ? ` (${sourceLabel(row.catalogSource)})` : "";
  return `${row.name}${source}`;
}

function sourceLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function channelName(value: UsageChannelFilter): string {
  return value === "PUBLIC_API" ? "Public API" : "Kiosk";
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

function shortDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  if (caught instanceof Error) {
    return caught.message;
  }
  return "Analytics could not be loaded.";
}
