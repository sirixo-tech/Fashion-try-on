"use client";
import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
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

type MobileExperienceDay = {
  date: string;
  attempts: number;
  completed: number;
  failed: number;
  personalCompleted: number;
  storeCompleted: number;
  storeVisits: number;
};

export function MobileDashboardStatusChart({
  verified,
  pending,
  suspended,
}: {
  verified: number;
  pending: number;
  suspended: number;
}) {
  const total = verified + pending + suspended;
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">No customer accounts yet.</p>
    );
  }
  return (
    <div className="space-y-2">
      <div
        className="flex h-3 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${verified} verified, ${pending} awaiting verification, ${suspended} suspended accounts`}
      >
        {verified > 0 && (
          <span
            style={{
              width: `${(verified / total) * 100}%`,
              background: "var(--dashboard-green)",
            }}
          />
        )}
        {pending > 0 && (
          <span
            style={{
              width: `${(pending / total) * 100}%`,
              background: "var(--dashboard-blue)",
            }}
          />
        )}
        {suspended > 0 && (
          <span
            style={{
              width: `${(suspended / total) * 100}%`,
              background: "var(--dashboard-orange)",
            }}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span style={{ color: "var(--dashboard-green)" }}>●</span> Verified
        </span>
        <span>
          <span style={{ color: "var(--dashboard-blue)" }}>●</span> Awaiting
          verification
        </span>
        <span>
          <span style={{ color: "var(--dashboard-orange)" }}>●</span> Suspended
        </span>
      </div>
    </div>
  );
}

export function MobileDashboardActivityCharts({
  daily,
  personalCompleted,
  storeCompleted,
}: {
  daily: MobileExperienceDay[] | null;
  personalCompleted: number;
  storeCompleted: number;
}) {
  const points = daily ?? [];
  const hasActivity = points.some(
    (row) => row.attempts > 0 || row.storeVisits > 0,
  );
  const totalCompleted = personalCompleted + storeCompleted;
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <section
        className="min-w-0 rounded-lg border bg-muted/10 p-4"
        aria-label="Daily mobile Try-On activity"
      >
        <h3 className="font-medium">Try-On activity by day</h3>
        <p className="text-xs text-muted-foreground">
          Attempts, completed looks, failures and QR visits · UTC
        </p>
        {!daily ? (
          <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Daily activity chart will appear after the API is updated.
          </p>
        ) : hasActivity ? (
          <div
            className="mt-3 h-48 w-full"
            role="img"
            aria-label={`${points.reduce((sum, row) => sum + row.attempts, 0)} attempts, ${points.reduce((sum, row) => sum + row.completed, 0)} completed, ${points.reduce((sum, row) => sum + row.failed, 0)} failed and ${points.reduce((sum, row) => sum + row.storeVisits, 0)} Store QR visits in the selected period`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={points}
                margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="2 6"
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                  tickFormatter={(date: string) => date.slice(5)}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip content={<CapitalioChartTooltip />} />
                <Line
                  dataKey="attempts"
                  name="Attempts"
                  stroke="var(--dashboard-blue)"
                  strokeWidth={2}
                  dot={points.length <= 7}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="completed"
                  name="Completed"
                  stroke="var(--dashboard-green)"
                  strokeWidth={2}
                  dot={points.length <= 7}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="failed"
                  name="Failed"
                  stroke="var(--dashboard-orange)"
                  strokeWidth={2}
                  dot={points.length <= 7}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="storeVisits"
                  name="Store QR visits"
                  stroke="var(--dashboard-purple)"
                  strokeWidth={2}
                  dot={points.length <= 7}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No Try-On or Store QR activity in this period.
          </p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            <span style={{ color: "var(--dashboard-blue)" }}>●</span> Attempts
          </span>
          <span>
            <span style={{ color: "var(--dashboard-green)" }}>●</span> Completed
          </span>
          <span>
            <span style={{ color: "var(--dashboard-orange)" }}>●</span> Failed
          </span>
          <span>
            <span style={{ color: "var(--dashboard-purple)" }}>●</span> Store QR
            visits
          </span>
        </div>
      </section>
      <section
        className="rounded-lg border bg-muted/10 p-4"
        aria-label="Completed looks by payer"
      >
        <h3 className="font-medium">Completed looks by payer</h3>
        <p className="text-xs text-muted-foreground">
          Personal and Store-sponsored Try-Ons
        </p>
        {totalCompleted > 0 ? (
          <div className="mt-10 space-y-5">
            <div
              className="flex h-5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${personalCompleted} personal looks and ${storeCompleted} Store-sponsored looks`}
            >
              {personalCompleted > 0 && (
                <span
                  style={{
                    width: `${(personalCompleted / totalCompleted) * 100}%`,
                    background: "var(--dashboard-green)",
                  }}
                />
              )}
              {storeCompleted > 0 && (
                <span
                  style={{
                    width: `${(storeCompleted / totalCompleted) * 100}%`,
                    background: "var(--dashboard-blue)",
                  }}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span
                  className="inline-block size-2.5 rounded-xs"
                  style={{ background: "var(--dashboard-green)" }}
                  aria-hidden="true"
                />{" "}
                Personal{" "}
                <strong className="block text-lg">{personalCompleted}</strong>
              </div>
              <div>
                <span
                  className="inline-block size-2.5 rounded-xs"
                  style={{ background: "var(--dashboard-blue)" }}
                  aria-hidden="true"
                />{" "}
                Store-sponsored{" "}
                <strong className="block text-lg">{storeCompleted}</strong>
              </div>
            </div>
          </div>
        ) : (
          <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No completed looks in this period.
          </p>
        )}
      </section>
    </div>
  );
}

export function MobileDashboardTrialChart({
  granted,
  used,
  reserved,
}: {
  granted: number;
  used: number;
  reserved: number;
}) {
  const remaining = Math.max(0, granted - used - reserved);
  if (granted === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No trial credits granted yet.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Lifetime trial-credit usage</p>
      <div
        className="flex h-3 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${used} used, ${reserved} reserved and ${remaining} remaining out of ${granted} granted trial credits`}
      >
        {used > 0 && (
          <span
            style={{
              width: `${(Math.min(used, granted) / granted) * 100}%`,
              background: "var(--dashboard-orange)",
            }}
          />
        )}
        {reserved > 0 && (
          <span
            style={{
              width: `${(Math.min(reserved, Math.max(0, granted - used)) / granted) * 100}%`,
              background: "var(--dashboard-blue)",
            }}
          />
        )}
        {remaining > 0 && (
          <span
            style={{
              width: `${(remaining / granted) * 100}%`,
              background: "var(--dashboard-green)",
            }}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {used} used · {reserved} reserved · {remaining} remaining
      </p>
    </div>
  );
}
