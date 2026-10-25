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
import { Card } from "../components/card";
import { Skeleton } from "../components/skeleton";

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
    GOOGLE: "Google",
    APPLE: "Apple",
  };
  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[2fr_1fr]">
      <Card className="min-w-0 gap-3 rounded-lg p-5 shadow-none ring-0">
        <h2 className="text-lg font-medium">Customer growth</h2>
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
                      stopColor="var(--selfx-primary)"
                      stopOpacity={0.25}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--selfx-primary)"
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
                <Tooltip
                  formatter={(value) => [value, "New accounts"]}
                  contentStyle={{
                    background: "var(--card)",
                    borderColor: "var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="accounts"
                  stroke="var(--selfx-primary)"
                  fill={`url(#${gradient})`}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      <Card className="min-w-0 gap-3 rounded-lg p-5 shadow-none ring-0">
        <h2 className="text-lg font-medium">Sign-in methods</h2>
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
                <Tooltip
                  formatter={(value) => [value, "Accounts"]}
                  contentStyle={{
                    background: "var(--card)",
                    borderColor: "var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Bar
                  dataKey="accounts"
                  fill="var(--dashboard-blue, #0085ff)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={46}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
