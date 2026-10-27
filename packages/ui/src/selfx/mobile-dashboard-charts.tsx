"use client";
import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CapitalioPanel,
  CapitalioPanelHeader,
  CapitalioMetric,
  CapitalioChartTooltip,
} from "./capitalio/dashboard";
import { Skeleton } from "../components/skeleton";
import { Progress } from "../components/progress";
import {
  DashboardMoneyBagIcon,
  DashboardAnalyticsUpIcon,
  DashboardPieChartIcon,
  DashboardShieldIcon,
} from "./capitalio/icons";

type MobileTotals = {
  total: number;
  newAccounts: number;
  recentlyActive: number;
  verified: number;
  pending: number;
  suspended: number;
};
export function MobileDashboardMetrics({
  totals,
  daily,
  loading,
}: {
  totals: MobileTotals | null;
  daily: Array<{ date: string; accounts: number }> | null;
  loading: boolean;
}) {
  const number = (value?: number) =>
    value == null ? "—" : new Intl.NumberFormat().format(value);
  const shortDate = (value?: string) =>
    value
      ? new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(new Date(value))
      : "";
  const rate = (value?: number, total?: number) =>
    total ? Math.round(((value ?? 0) / total) * 1000) / 10 : null;
  const activeRate = rate(totals?.recentlyActive, totals?.verified),
    verifiedRate = rate(totals?.verified, totals?.total);
  return (
    <div
      className="capitalio-dashboard-content grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      aria-busy={loading}
    >
      <CapitalioMetric
        title="Registered customers"
        value={number(totals?.total)}
        icon={<DashboardMoneyBagIcon />}
        loading={loading}
        note="Current accounts"
      >
        <div className="mt-auto space-y-3 text-sm">
          {[
            {
              name: "Verified",
              value: totals?.verified,
              color: "var(--dashboard-green)",
            },
            {
              name: "Awaiting verification",
              value: totals?.pending,
              color: "var(--dashboard-blue)",
            },
            {
              name: "Suspended",
              value: totals?.suspended,
              color: "var(--dashboard-orange)",
            },
          ].map((row) => (
            <div
              key={row.name}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-xs"
                  style={{ background: row.color }}
                  aria-hidden="true"
                />
                {row.name}
              </span>
              <strong className="font-medium">{number(row.value)}</strong>
            </div>
          ))}
        </div>
      </CapitalioMetric>
      <CapitalioMetric
        title="New accounts"
        value={number(totals?.newAccounts)}
        icon={<DashboardAnalyticsUpIcon />}
        loading={loading}
        note="Selected period"
      >
        {daily?.some((row) => row.accounts) ? (
          <div className="mt-auto space-y-2">
            <div
              className="h-16"
              role="img"
              aria-label="New customer accounts trend"
            >
              <ResponsiveContainer width="100%" height={64} minWidth={1}>
                <BarChart data={daily}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide allowDecimals={false} />
                  <Tooltip content={<CapitalioChartTooltip />} />
                  <Bar
                    name="New accounts"
                    dataKey="accounts"
                    fill="var(--dashboard-blue)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{shortDate(daily[0]?.date)}</span>
              <span>{shortDate(daily.at(-1)?.date)}</span>
            </div>
          </div>
        ) : (
          <p className="mt-auto text-sm text-muted-foreground">
            {totals
              ? "No new accounts in this period."
              : "Account metrics are unavailable."}
          </p>
        )}
      </CapitalioMetric>
      <CapitalioMetric
        title="Recently active"
        value={number(totals?.recentlyActive)}
        icon={<DashboardPieChartIcon />}
        loading={loading}
        note="Selected period"
      >
        <div className="mt-auto space-y-3">
          {activeRate != null ? (
            <>
              <Progress
                value={activeRate}
                aria-label="Recently active share of verified accounts"
              />
              <p className="text-sm">
                <strong className="font-medium">{activeRate}%</strong>{" "}
                <span className="text-muted-foreground">
                  of verified customers
                </span>
              </p>
            </>
          ) : null}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Latest sign-in or session refresh in this period. This is a current
            activity snapshot.
          </p>
        </div>
      </CapitalioMetric>
      <CapitalioMetric
        title="Verified customers"
        value={number(totals?.verified)}
        icon={<DashboardShieldIcon />}
        loading={loading}
        note="Current active accounts"
      >
        <div className="mt-auto space-y-3">
          {verifiedRate != null ? (
            <>
              <Progress
                value={verifiedRate}
                aria-label="Verified share of registered accounts"
              />
              <p className="text-sm">
                <strong className="font-medium">{verifiedRate}%</strong>{" "}
                <span className="text-muted-foreground">
                  of registered customers
                </span>
              </p>
            </>
          ) : null}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Verified, active customer accounts. Deleted accounts are excluded.
          </p>
        </div>
      </CapitalioMetric>
    </div>
  );
}

export function MobileDashboardCharts({
  daily,
  methods,
  loading,
}: {
  daily: Array<{ date: string; accounts: number }> | null;
  methods: Array<{ provider: string; accounts: number }> | null;
  loading: boolean;
}) {
  const gradient = useId().replace(/:/g, "");
  const methodNames: Record<string, string> = {
    EMAIL_PASSWORD: "Email",
    FIREBASE_PHONE: "Phone",
    GOOGLE: "Google",
    APPLE: "Apple",
  };
  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[2fr_1fr]">
      <CapitalioPanel title="Customer growth">
        <CapitalioPanelHeader title="Customer growth" />
        <p className="text-sm text-muted-foreground">
          New accounts in the selected period · UTC dates
        </p>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : !daily?.some((row) => row.accounts > 0) ? (
          <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No new accounts in this period.
          </p>
        ) : (
          <div
            className="h-64 w-full"
            role="img"
            aria-label={`${daily.reduce((sum, row) => sum + row.accounts, 0)} new customer accounts in the selected period`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={daily}
                margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
              >
                <defs>
                  <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--dashboard-green)"
                      stopOpacity={0.25}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--dashboard-green)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="2 6"
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                  tickFormatter={(date: string) => date.slice(5)}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={35}
                />
                <Tooltip content={<CapitalioChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="accounts"
                  name="New accounts"
                  stroke="var(--dashboard-green)"
                  fill={`url(#${gradient})`}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CapitalioPanel>
      <CapitalioPanel title="Sign-in methods">
        <CapitalioPanelHeader title="Sign-in methods" />
        <p className="text-sm text-muted-foreground">
          Current verified accounts · accounts may have multiple methods
        </p>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : !methods?.length ? (
          <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No verified accounts yet.
          </p>
        ) : (
          <div
            className="h-64 w-full"
            role="img"
            aria-label={methods
              .map(
                (row) =>
                  `${methodNames[row.provider] ?? row.provider}: ${row.accounts}`,
              )
              .join(", ")}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={methods.map((row) => ({
                  ...row,
                  name: methodNames[row.provider] ?? row.provider,
                }))}
                margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="2 6"
                  stroke="var(--border)"
                />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={35}
                />
                <Tooltip content={<CapitalioChartTooltip />} />
                <Bar
                  dataKey="accounts"
                  name="Accounts"
                  fill="var(--dashboard-blue, #0085ff)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={46}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CapitalioPanel>
    </div>
  );
}
