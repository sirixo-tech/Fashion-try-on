"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDaysIcon,
  DownloadIcon,
  RefreshCwIcon,
  MonitorIcon,
  PackageIcon,
  StoreIcon,
  UsersIcon,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  Button,
  CapitalioDashboard,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  SelectMenu,
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@selfx/ui";
import { useSession } from "@/lib/session";
import { RegionalDateTime } from "@/lib/regional-settings";
import { useDashboard } from "@/lib/use-dashboard";
import { dashboardCsv } from "@/lib/dashboard-metrics";
import type { UsageRangePreset } from "@/lib/usage";

const ranges: { value: UsageRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];
export default function DashboardPage() {
  const session = useSession();
  const router = useRouter();
  const [range, setRange] = useState<UsageRangePreset>("30d");
  const [storeId, setStoreId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const dashboard = useDashboard(
    session.status === "authenticated" ? session.accessToken : null,
    storeId,
    range,
    refresh,
  );
  const { data, context, loading, metrics } = dashboard;
  const scope = !context
    ? "Loading scope…"
    : dashboard.storeId
      ? (context?.options.find((store) => store.id === dashboard.storeId)
          ?.name ?? "Selected Store")
      : dashboard.canViewAll
        ? "All Stores"
        : "No active Store";
  const unavailable = dashboard.error
    ? "This metric could not be loaded. Try Refresh."
    : "Usage is not available with your current permissions or plan.";
  function exportCsv() {
    if (!data?.summary) return;
    const url = URL.createObjectURL(
      new Blob([dashboardCsv(data.summary)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `selfx-dashboard-${dashboard.storeId ? "store" : "platform"}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  const analysisAction = data?.summary
    ? { label: "Full analysis", onClick: () => setAnalysisOpen(true) }
    : undefined;
  return (
    <main className="mx-auto min-w-0 max-w-[112rem] space-y-6 px-4 py-6 md:px-8 lg:py-8">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>
              Last updated{" "}
              {data ? <RegionalDateTime value={data.updatedAt} /> : "—"}
            </span>
            <span aria-hidden="true">•</span>
            <span>{scope}</span>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="flex max-w-full items-center rounded-md border bg-card">
            <CalendarDaysIcon
              className="ml-3 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <SelectMenu
              ariaLabel="Date range"
              value={range}
              options={ranges}
              onChange={setRange}
              className="min-w-40 border-0 bg-transparent"
            />
          </div>
          {dashboard.canChooseStore ? (
            <SelectMenu
              ariaLabel="Store scope"
              value={dashboard.storeId}
              options={[
                ...(dashboard.canViewAll
                  ? [{ value: "", label: "All Stores" }]
                  : []),
                ...(context?.options ?? []).map((store) => ({
                  value: store.id,
                  label: store.name,
                })),
              ]}
              onChange={setStoreId}
              disabled={!context?.options.length && !dashboard.canViewAll}
              className="max-w-full sm:w-48"
            />
          ) : null}
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh dashboard"
            title="Refresh dashboard"
            disabled={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCwIcon
              className={loading ? "animate-spin" : undefined}
              aria-hidden="true"
            />
          </Button>
          <Button onClick={exportCsv} disabled={!data?.summary || loading}>
            <span>Export</span>
            <DownloadIcon aria-hidden="true" />
          </Button>
        </div>
      </header>
      {data?.summary ? (
        <p className="-mt-2 text-xs text-muted-foreground">
          <RegionalDateTime value={data.summary.range.from} /> –{" "}
          <RegionalDateTime value={data.summary.range.to} /> · Daily chart dates
          use UTC
        </p>
      ) : null}
      {dashboard.error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{dashboard.error}</AlertDescription>
        </Alert>
      ) : null}
      <CapitalioDashboard
        metrics={metrics}
        loading={loading}
        unavailableMessage={unavailable}
        analysisAction={analysisAction}
        productsAction={
          data?.canProducts
            ? {
                label: "View products",
                onClick: () => router.push("/app/products"),
              }
            : analysisAction
              ? { label: "View usage", onClick: analysisAction.onClick }
              : undefined
        }
        activityAction={
          data?.canActivity
            ? {
                label: "View activity",
                onClick: () => router.push("/app/try-on-activity"),
              }
            : analysisAction
        }
      />
      <section
        aria-label="Workspace resources"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {[
          {
            title: "Stores",
            value: context?.totalStores,
            icon: StoreIcon,
            note: "Across your platform access",
          },
          {
            title: "Store kiosks",
            value: data?.kiosks?.length,
            icon: MonitorIcon,
            note: data?.kiosks
              ? `${data.kiosks.filter((kiosk) => kiosk.status === "ACTIVE").length} active`
              : "Select an authorized Store",
          },
          {
            title: "Store products",
            value: data?.products,
            icon: PackageIcon,
            note: "Complete catalog count",
          },
          {
            title: "Store team",
            value: data?.staff,
            icon: UsersIcon,
            note: "Complete team count",
          },
        ].map((item) => (
          <Card
            key={item.title}
            className="gap-3 rounded-lg border p-5 shadow-none ring-0"
          >
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <h2>{item.title}</h2>
              <item.icon className="size-4" aria-hidden="true" />
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-semibold">
                {item.value == null
                  ? "—"
                  : new Intl.NumberFormat().format(item.value)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {item.value == null && !loading
                ? "Available for permitted scopes"
                : item.note}
            </p>
          </Card>
        ))}
      </section>
      {data?.kiosks ? (
        <section aria-label="Kiosk fleet">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-medium">Kiosk fleet</h2>
            <span className="text-xs text-muted-foreground">{scope}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.kiosks.length ? (
              data.kiosks.slice(0, 6).map((kiosk) => (
                <Card
                  key={kiosk.id}
                  className="flex-row items-center justify-between gap-4 rounded-lg border p-4 shadow-none ring-0"
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium">
                      {kiosk.displayName}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last seen{" "}
                      {kiosk.lastSeenAt ? (
                        <RegionalDateTime value={kiosk.lastSeenAt} />
                      ) : (
                        "Never"
                      )}
                    </p>
                  </div>
                  <StatusBadge status={kiosk.status} />
                </Card>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No kiosks assigned to this Store.
              </p>
            )}
          </div>
        </section>
      ) : null}
      <Dialog open={analysisOpen} onOpenChange={setAnalysisOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Try-On analysis · {scope}</DialogTitle>
            <DialogDescription>
              Daily counts for the current dashboard scope and date range. Dates
              are UTC.
            </DialogDescription>
          </DialogHeader>
          {data?.summary ? (
            <>
              <Button variant="outline" onClick={exportCsv}>
                Export this range
                <DownloadIcon aria-hidden="true" />
              </Button>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        "Date (UTC)",
                        "Sessions",
                        "Attempts",
                        "Generated",
                        "Failed",
                        "Downloads",
                      ].map((label) => (
                        <TableHead key={label}>{label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.summary.daily.map((row) => (
                      <TableRow key={row.date}>
                        <TableCell>{row.date.slice(0, 10)}</TableCell>
                        <TableCell>{row.sessionsStarted}</TableCell>
                        <TableCell>{row.runsCreated}</TableCell>
                        <TableCell>{row.tryOnsGenerated}</TableCell>
                        <TableCell>{row.failedRuns}</TableCell>
                        <TableCell>{row.downloadsCompleted}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {loading ? "Loading selected scope…" : unavailable}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
