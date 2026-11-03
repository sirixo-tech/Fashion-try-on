"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  StoreIcon,
  WebhookIcon,
} from "lucide-react";

import {
  Button,
  PageContainer,
  PageHeader,
  PageSection,
  SelectMenu,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@selfx/ui";
import { RegionalDateTime } from "@/lib/regional-settings";
import { SafeApiError } from "@/lib/api";
import {
  getDeveloperApiPlatformOverview,
  type DeveloperApiPlatformOverview,
  type DeveloperApiUsageRangePreset,
} from "@/lib/developer-api";

const ranges: Array<{ value: DeveloperApiUsageRangePreset; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

export function DeveloperApiPlatformDashboard({
  accessToken,
  onSelectStore,
}: {
  accessToken: string | null;
  onSelectStore: (storeId: string) => void;
}) {
  const [range, setRange] = useState<DeveloperApiUsageRangePreset>("30d");
  const [overview, setOverview] = useState<DeveloperApiPlatformOverview | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setOverview(await getDeveloperApiPlatformOverview(accessToken, range));
    } catch (caught) {
      setOverview(null);
      setError(
        caught instanceof SafeApiError
          ? caught.message
          : "Developer API overview could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const daily = overview?.dailyUsage ?? [];
  const maxRuns = Math.max(1, ...daily.map((row) => row.runsCreated));
  const hasActivity = daily.some((row) => row.runsCreated > 0);

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Platform overview"
        title="Developer / API"
        description="A cross-Store view of API adoption, Try-On activity and webhook usage."
        actions={
          <div className="flex items-center gap-2">
            <SelectMenu
              ariaLabel="Developer API date range"
              value={range}
              options={ranges}
              onChange={setRange}
            />
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
          </div>
        }
      />

      {error ? (
        <PageSection>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        </PageSection>
      ) : null}

      <PageSection>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<KeyRoundIcon aria-hidden="true" />}
            label="Active API keys"
            value={
              overview ? `${overview.activeKeys} / ${overview.totalKeys}` : "—"
            }
            detail="Active / total"
            loading={loading}
          />
          <MetricCard
            icon={<StoreIcon aria-hidden="true" />}
            label="Stores using API"
            value={overview?.storesUsingApi ?? "—"}
            detail="Stores with an active key"
            loading={loading}
          />
          <MetricCard
            icon={<ActivityIcon aria-hidden="true" />}
            label="Try-Ons generated"
            value={overview?.generatedLooks ?? "—"}
            detail={`${overview?.runsCreated ?? 0} requests in this period`}
            loading={loading}
          />
          <MetricCard
            icon={<WebhookIcon aria-hidden="true" />}
            label="Active webhooks"
            value={overview?.activeWebhooks ?? "—"}
            detail={`${overview?.downloadsCompleted ?? 0} result downloads`}
            loading={loading}
          />
        </div>
      </PageSection>

      <PageSection>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.7fr)]">
          <TableContainer
            title="API Try-On activity"
            description={
              overview
                ? `${formatDate(overview.range.from)} – ${formatDate(overview.range.to)} · ${overview.completedRuns} completed · ${overview.failedRuns} failed`
                : "Daily requests and generated results."
            }
          >
            {loading ? (
              <div className="h-44 animate-pulse rounded-md bg-muted/50" />
            ) : daily.length && hasActivity ? (
              <div className="overflow-x-auto pb-1">
                <div className="flex h-44 min-w-[560px] items-end gap-1 border-b px-1">
                  {daily.map((row) => {
                    const height = Math.max(
                      row.runsCreated ? 5 : 0,
                      Math.round((row.runsCreated / maxRuns) * 128),
                    );
                    return (
                      <div
                        key={row.date}
                        className="group flex h-full min-w-0 flex-1 flex-col justify-end"
                        title={`${row.date}: ${row.runsCreated} requests, ${row.generatedLooks} generated`}
                      >
                        <div
                          className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary"
                          style={{ height }}
                        />
                        <span className="mt-2 h-5 truncate text-center text-[10px] text-muted-foreground">
                          {daily.length <= 10 || row.date.endsWith("-01")
                            ? formatShortDate(row.date)
                            : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Requests: {overview?.runsCreated ?? 0}</span>
                  <span>Generated: {overview?.generatedLooks ?? 0}</span>
                  <span>Downloads: {overview?.downloadsCompleted ?? 0}</span>
                </div>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No API activity in this period.
              </p>
            )}
          </TableContainer>

          <TableContainer
            title="Revenue attribution"
            description="Billing visibility"
          >
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-lg font-semibold">Not tracked separately</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Current billing records do not attribute collected revenue to
                Public API usage. No revenue estimate is shown.
              </p>
            </div>
          </TableContainer>
        </div>
      </PageSection>

      <PageSection>
        <TableContainer
          title="Stores using Developer API"
          description="Top Stores by API Try-On requests in the selected period."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Active keys</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Failed</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7}>Loading Store activity…</TableCell>
                </TableRow>
              ) : overview?.topStores.length ? (
                overview.topStores.map((store) => (
                  <TableRow key={store.storeId}>
                    <TableCell className="font-medium">
                      {store.storeName}
                    </TableCell>
                    <TableCell>{store.activeKeys}</TableCell>
                    <TableCell>{store.runsCreated}</TableCell>
                    <TableCell>{store.completedRuns}</TableCell>
                    <TableCell>{store.failedRuns}</TableCell>
                    <TableCell>
                      {store.lastActivityAt ? (
                        <RegionalDateTime value={store.lastActivityAt} />
                      ) : (
                        "No activity"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSelectStore(store.storeId)}
                      >
                        View details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7}>
                    No Stores are using the Developer API yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </PageSection>
    </PageContainer>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  loading,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold">{loading ? "—" : value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
