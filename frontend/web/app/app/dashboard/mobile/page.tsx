"use client";
import { useState } from "react";
import { CalendarDaysIcon, DownloadIcon, RefreshCwIcon } from "lucide-react";
import {
  Alert,
  AlertDescription,
  Button,
  CapitalioPanel,
  CapitalioPanelHeader,
  MobileDashboardMetrics,
  DashboardTypeName,
  MobileDashboardCharts,
  SelectMenu,
  Skeleton,
  StatusBadge,
  MetricValue,
} from "@selfx/ui";
import { useSession } from "@/lib/session";
import { RegionalDateTime } from "@/lib/regional-settings";
import { useMobileDashboard } from "@/lib/use-mobile-dashboard";
import { mobileDashboardCsv, type MobileRange } from "@/lib/mobile-dashboard";

const ranges: Array<{ value: MobileRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];
export default function MobileDashboardPage() {
  const session = useSession();
  const [range, setRange] = useState<MobileRange>("30d");
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useMobileDashboard(
    session.status === "authenticated" ? session.accessToken : null,
    range,
    refresh,
  );
  const totals = data?.totals;
  const format = (value: number | undefined) =>
    value == null ? "—" : new Intl.NumberFormat().format(value);
  function exportCsv() {
    if (!data) return;
    const csv = mobileDashboardCsv(data);
    if (!csv) return;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `selfx-mobile-dashboard-${range}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main className="capitalio-dashboard-content mx-auto min-w-0 max-w-[112rem] space-y-6 px-4 py-6 md:px-8 lg:py-8">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            <DashboardTypeName type="mobile" />
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Last updated{" "}
            {data ? <RegionalDateTime value={data.updatedAt} /> : "—"}
            <span aria-hidden="true">•</span> Customer app
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="flex items-center rounded-md border bg-card">
            <CalendarDaysIcon
              className="ml-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <SelectMenu
              ariaLabel="Mobile date range"
              value={range}
              options={ranges}
              onChange={setRange}
              className="min-w-40 border-0 bg-transparent"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh mobile dashboard"
            disabled={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCwIcon
              className={
                loading ? "animate-spin motion-reduce:animate-none" : undefined
              }
              aria-hidden="true"
            />
          </Button>
          <Button
            onClick={exportCsv}
            disabled={loading || !data?.available || !totals}
          >
            Export
            <DownloadIcon aria-hidden="true" />
          </Button>
        </div>
      </header>
      {data ? (
        <p className="text-xs text-muted-foreground">
          <RegionalDateTime value={data.range.from} /> –{" "}
          <RegionalDateTime value={data.range.to} /> · Daily chart dates use UTC
        </p>
      ) : null}
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error} Use Refresh to try again.</AlertDescription>
        </Alert>
      ) : null}
      {data && !data.available ? (
        <Alert>
          <AlertDescription>
            Customer accounts have not been activated on this backend. Mobile
            metrics will appear after activation; unavailable values are not
            zero.
          </AlertDescription>
        </Alert>
      ) : null}
      <MobileDashboardMetrics
        totals={totals ?? null}
        daily={data?.daily ?? null}
        loading={loading}
      />
      {(data?.available || loading) && !error ? (
        <MobileDashboardCharts
          daily={data?.daily ?? null}
          methods={data?.methods ?? null}
          loading={loading}
        />
      ) : null}
      <CapitalioPanel title="Account overview">
        <CapitalioPanelHeader title="Account overview" />
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            ["Verified", totals?.verified],
            ["Awaiting verification", totals?.pending],
            ["Suspended", totals?.suspended],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-sm text-muted-foreground">{label}</p>
              {loading ? (
                <Skeleton className="mt-2 h-7 w-14" />
              ) : (
                <p className="mt-1 text-xl font-semibold">
                  {format(value as number | undefined)}
                </p>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Current account status snapshot. Deleted accounts are excluded.
          Recently active uses the latest known sign-in/refresh timestamp, not a
          historical daily-active-user count.
        </p>
      </CapitalioPanel>
      {data?.experience ? (
        <CapitalioPanel title="Mobile Try-On activity">
          <CapitalioPanelHeader title="Mobile Try-On activity" />
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              ["Generation attempts", data.experience.attempts],
              ["Completed looks", data.experience.completed],
              ["Failed attempts", data.experience.failed],
              ["Personal looks", data.experience.personalCompleted],
              ["Store-sponsored looks", data.experience.storeCompleted],
              ["Store QR visits", data.experience.storeVisits],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold">
                  <MetricValue value={value as number} />
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Selected period. Store-sponsored costs belong to the Store. Personal
            activity is excluded from business dashboards.
          </p>
          <div className="grid gap-5 border-t pt-4 sm:grid-cols-3">
            {[
              ["Trial credits granted", data.experience.trialGranted],
              ["Trial credits used", data.experience.trialUsed],
              ["Trial credits reserved", data.experience.trialReserved],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold">
                  <MetricValue value={value as number} />
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Lifetime free-trial snapshot. Deleting expired images does not reset
            used credits. Personal paid plans are not connected.
          </p>
        </CapitalioPanel>
      ) : null}
      {!data?.experience ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            [
              "Mobile Try-Ons",
              "Generation attempts, successful looks and failures will appear after customer Try-On is connected.",
            ],
            [
              "Personal plans & revenue",
              "Customer subscriptions, purchases and credit usage will appear after separate personal billing is connected.",
            ],
            [
              "Store QR activity",
              "Sponsored sessions and Store totals will appear after QR sponsorship is connected. Charges will belong to the Store.",
            ],
          ].map(([title, description]) => (
            <CapitalioPanel key={title} title={title}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-medium">{title}</h2>
                <StatusBadge status="PENDING" label="Not connected" />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </CapitalioPanel>
          ))}
        </div>
      ) : null}
    </main>
  );
}
