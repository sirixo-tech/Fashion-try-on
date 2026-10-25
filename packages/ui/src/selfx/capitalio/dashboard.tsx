"use client";

// Adapted from Capitalio Dashboard, MIT © Watermelon Contributors.
// See capitalio/LICENSE. Layout retained; all metrics are supplied by SelfX.
import { useId, type ReactNode } from "react";
import { ArrowUpRightIcon, PackageIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "../../components/button";
import { Card } from "../../components/card";
import { Badge } from "../../components/badge";
import { Progress } from "../../components/progress";
import { Skeleton } from "../../components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/table";
import { cn } from "../../lib/utils";
import {
  DashboardMoneyBagIcon,
  DashboardAnalyticsUpIcon,
  DashboardPieChartIcon,
  DashboardShieldIcon,
  Dashboard3dScaleIcon,
  DashboardTaxesIcon,
  DashboardReloadHorizontalIcon,
} from "./icons";
import type {
  CapitalioDashboardProps,
  DashboardAction,
  DashboardPoint,
} from "./types";

const COLORS = {
  green: "var(--dashboard-green)",
  blue: "var(--dashboard-blue)",
  orange: "var(--dashboard-orange)",
  purple: "var(--dashboard-purple)",
};
const number = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
const percent = (value: number | null | undefined) =>
  value == null
    ? "—"
    : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}%`;
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));

function Panel({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <Card
      aria-label={title}
      className={cn(
        "capitalio-panel min-w-0 gap-5 rounded-lg border p-5 shadow-none ring-0",
        className,
      )}
    >
      {children}
    </Card>
  );
}
function Header({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-medium tracking-tight">{title}</h2>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
function Action({ action }: { action?: DashboardAction }) {
  return action ? (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={action.onClick}
    >
      {action.label}
      <ArrowUpRightIcon aria-hidden="true" />
    </Button>
  ) : null;
}
function Marker({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3 shrink-0 rounded-xs"
      style={{ background: color }}
    />
  );
}
function IconBadge({ children }: { children: ReactNode }) {
  return (
    <span
      className="capitalio-icon flex size-9 shrink-0 items-center justify-center rounded-lg p-2 text-white"
      aria-hidden="true"
    >
      {children}
    </span>
  );
}
function Empty({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-16 items-center justify-center rounded-md bg-muted/20 px-3 py-5 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{
    value?: number | string;
    name?: string;
    color?: string;
    payload?: { date?: string };
  }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-md">
      <div className="mb-2 font-medium">
        {payload[0]?.payload?.date ? dateLabel(payload[0].payload.date) : label}
      </div>
      {payload.map((item) => (
        <div
          key={item.name}
          className="flex items-center justify-between gap-6 py-1"
        >
          <span className="flex items-center gap-2">
            <Marker color={item.color ?? COLORS.blue} />
            {item.name}
          </span>
          <strong>
            {typeof item.value === "number" ? number(item.value) : item.value}
          </strong>
        </div>
      ))}
    </div>
  );
}

function MiniChart({
  data,
  metric,
  color,
  bars = false,
}: {
  data: DashboardPoint[];
  metric: "generated" | "downloads" | "successRate";
  color: string;
  bars?: boolean;
}) {
  const gradient = useId().replaceAll(":", "");
  const labels = Array.from(
    new Set([
      data[0]?.date,
      data[Math.floor((data.length - 1) / 2)]?.date,
      data.at(-1)?.date,
    ]),
  ).filter((value): value is string => Boolean(value));
  if (
    !data.some(
      (point) =>
        point[metric] != null &&
        (metric === "successRate" || (point[metric] ?? 0) > 0),
    )
  )
    return <Empty>No activity in this period</Empty>;
  const series = bars ? (
    <Bar
      dataKey={metric}
      name="Downloads"
      fill={color}
      radius={[4, 4, 0, 0]}
      isAnimationActive={false}
    />
  ) : (
    <Area
      dataKey={metric}
      name={metric === "successRate" ? "Success rate (%)" : "Generated Try-Ons"}
      type="monotone"
      stroke={color}
      strokeWidth={2}
      fill={`url(#${gradient})`}
      isAnimationActive={false}
      connectNulls={false}
    />
  );
  const content = (
    <>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <XAxis dataKey="date" hide />
      <YAxis hide domain={metric === "successRate" ? [0, 100] : [0, "auto"]} />
      <Tooltip content={<ChartTooltip />} />
      {series}
    </>
  );
  return (
    <div className="mt-auto space-y-2">
      <div
        role="img"
        aria-label={`${metric === "successRate" ? "Success rate" : metric === "downloads" ? "Downloads" : "Try-On"} trend`}
        className="h-16 min-w-0"
      >
        <ResponsiveContainer width="100%" height={64} minWidth={1}>
          {bars ? (
            <BarChart data={data}>{content}</BarChart>
          ) : (
            <AreaChart data={data}>{content}</AreaChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        {labels.map((date) => (
          <span key={date}>{dateLabel(date)}</span>
        ))}
      </div>
    </div>
  );
}

function Metric({
  title,
  value,
  children,
  icon,
  note,
  loading,
}: {
  title: string;
  value: string;
  children: ReactNode;
  icon: ReactNode;
  note?: ReactNode;
  loading: boolean;
}) {
  return (
    <Panel title={title} className="min-h-64">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-normal">{title}</h2>
        <IconBadge>{icon}</IconBadge>
      </div>
      <div className="flex min-h-10 flex-wrap items-baseline gap-x-2 gap-y-1">
        {loading ? (
          <Skeleton className="h-9 w-28" />
        ) : (
          <strong className="text-3xl font-semibold leading-none tracking-tight">
            {value}
          </strong>
        )}
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
      {loading ? <Skeleton className="mt-auto h-20 w-full" /> : children}
    </Panel>
  );
}

export function CapitalioDashboard({
  metrics: m,
  loading = false,
  unavailableMessage = "Usage is unavailable for this scope.",
  analysisAction,
  productsAction,
  activityAction,
}: CapitalioDashboardProps) {
  const noData = m == null ? unavailableMessage : "No activity in this period";
  const donutId = useId().replaceAll(":", "");
  const growth = m?.growthPercent;
  const outcomes = m
    ? [
        { name: "Completed", value: m.completed, color: COLORS.green },
        { name: "Failed", value: m.failed, color: COLORS.orange },
        { name: "Queued", value: m.queued, color: COLORS.blue },
        { name: "Processing", value: m.processing, color: COLORS.purple },
      ]
    : [];
  const outcomeTotal = outcomes.reduce((sum, item) => sum + item.value, 0);
  const generatedSeries = m?.daily ?? [];
  return (
    <div
      className="capitalio-dashboard-content grid min-w-0 gap-4"
      aria-busy={loading}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          title="Total Try-Ons"
          value={m ? number(m.generated) : "—"}
          loading={loading}
          icon={<DashboardMoneyBagIcon />}
          note={
            m ? (
              growth == null ? (
                "No prior usage to compare"
              ) : (
                <span
                  className={
                    growth >= 0
                      ? "text-[var(--dashboard-green)]"
                      : "text-destructive"
                  }
                >
                  {growth > 0 ? "+" : ""}
                  {percent(growth)}{" "}
                  <span className="text-muted-foreground">
                    vs previous period
                  </span>
                </span>
              )
            ) : (
              ""
            )
          }
        >
          {m ? (
            <MiniChart
              data={generatedSeries}
              metric="generated"
              color={COLORS.green}
            />
          ) : (
            <Empty>{noData}</Empty>
          )}
        </Metric>
        <Metric
          title="Downloads"
          value={m ? number(m.downloads) : "—"}
          loading={loading}
          icon={<DashboardAnalyticsUpIcon />}
          note={
            m?.downloadRate != null
              ? `${percent(m.downloadRate)} download-to-look ratio`
              : ""
          }
        >
          {m ? (
            <div className="mt-auto space-y-3">
              <Progress
                aria-label="Download rate"
                value={Math.min(100, m.downloadRate ?? 0)}
              />
              <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span>{number(m.downloads)} downloads</span>
                <span>{number(m.generated)} looks</span>
              </div>
              <MiniChart
                data={generatedSeries}
                metric="downloads"
                color={COLORS.blue}
                bars
              />
            </div>
          ) : (
            <Empty>{noData}</Empty>
          )}
        </Metric>
        <Metric
          title="Generation attempts"
          value={m ? number(m.attempts) : "—"}
          loading={loading}
          icon={<DashboardPieChartIcon />}
        >
          {m ? (
            <div className="mt-auto space-y-5">
              <div
                role="img"
                aria-label="Completed and other generation attempts"
                className="flex h-5 overflow-hidden rounded-md bg-muted"
              >
                {[
                  { value: m.completed, color: COLORS.green },
                  {
                    value: Math.max(0, m.attempts - m.completed),
                    color: COLORS.blue,
                  },
                ].map((item, index) => (
                  <div
                    key={index}
                    style={{
                      width: `${m.attempts ? (item.value / m.attempts) * 100 : 0}%`,
                      background: `repeating-linear-gradient(135deg, transparent 0 12px, rgb(0 0 0 / 8%) 12px 24px), ${item.color}`,
                    }}
                  />
                ))}
              </div>
              {[
                { label: "Completed", value: m.completed, color: COLORS.green },
                {
                  label: "Other attempts",
                  value: Math.max(0, m.attempts - m.completed),
                  color: COLORS.blue,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-3 text-sm"
                >
                  <Marker color={item.color} />
                  <span className="flex-1">{item.label}</span>
                  <strong>{number(item.value)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <Empty>{noData}</Empty>
          )}
        </Metric>
        <Metric
          title="Success rate"
          value={m ? percent(m.successRate) : "—"}
          loading={loading}
          icon={<DashboardShieldIcon />}
          note={
            m
              ? `${number(m.completed)} completed / ${number(m.attempts)} attempts`
              : ""
          }
        >
          {m ? (
            <MiniChart
              data={generatedSeries}
              metric="successRate"
              color={COLORS.orange}
            />
          ) : (
            <Empty>{noData}</Empty>
          )}
        </Metric>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <Panel title="Try-On performance" className="xl:col-span-2">
          <Header title="Try-On performance">
            <Badge variant="secondary">
              {m ? `${number(m.generated)} generated` : "Usage"}
            </Badge>
            <Action action={analysisAction} />
          </Header>
          {loading ? (
            <Skeleton className="h-72 w-full" />
          ) : m?.daily.some((row) => row.attempts || row.generated) ? (
            <div
              role="img"
              aria-label="Daily Try-On performance"
              className="capitalio-dot-grid h-72 min-w-0"
            >
              <ResponsiveContainer width="100%" height={288} minWidth={1}>
                <AreaChart
                  data={m.daily}
                  margin={{ top: 12, right: 10, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient
                      id={`${donutId}-performance`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={COLORS.green}
                        stopOpacity={0.4}
                      />
                      <stop
                        offset="100%"
                        stopColor={COLORS.green}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="2 8"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={dateLabel}
                    minTickGap={36}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    width={38}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    name="Generated"
                    dataKey="generated"
                    type="monotone"
                    fill={`url(#${donutId}-performance)`}
                    stroke={COLORS.green}
                    strokeWidth={3}
                    isAnimationActive={false}
                  />
                  <Area
                    name="Attempts"
                    dataKey="attempts"
                    type="monotone"
                    fill="transparent"
                    stroke={COLORS.blue}
                    strokeWidth={2}
                    strokeDasharray="6 6"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty className="min-h-72">{noData}</Empty>
          )}
          <div className="flex justify-end gap-5 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <Marker color={COLORS.green} />
              Generated
            </span>
            <span className="flex items-center gap-2">
              <Marker color={COLORS.blue} />
              Attempts
            </span>
          </div>
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {[
              { label: "Sessions started", value: m?.sessions },
              { label: "Downloads", value: m?.downloads },
              { label: "Failed attempts", value: m?.failed },
              {
                label: "In progress",
                value: m ? m.queued + m.processing : undefined,
              },
            ].map((item) => (
              <div key={item.label} className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  {item.label}
                </div>
                <div className="text-2xl font-medium">
                  {loading
                    ? "…"
                    : item.value == null
                      ? "—"
                      : number(item.value)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Selected period
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Generation mix">
          <Header title="Generation mix">
            <Badge variant="secondary">Outcomes</Badge>
          </Header>
          {loading ? (
            <Skeleton className="mx-auto size-52 rounded-full" />
          ) : outcomeTotal ? (
            <div
              role="img"
              aria-label="Generation outcome distribution"
              className="relative mx-auto size-56 max-w-full"
            >
              <ResponsiveContainer width="100%" height={224} minWidth={1}>
                <PieChart>
                  <Pie
                    data={outcomes.filter((row) => row.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="68%"
                    outerRadius="88%"
                    cornerRadius={4}
                    paddingAngle={5}
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {outcomes
                      .filter((row) => row.value > 0)
                      .map((row) => (
                        <Cell key={row.name} fill={row.color} />
                      ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <strong className="text-3xl font-semibold">
                  {number(outcomeTotal)}
                </strong>
                <span className="mt-1 text-sm text-muted-foreground">
                  Attempts
                </span>
              </div>
            </div>
          ) : (
            <Empty className="min-h-56">{noData}</Empty>
          )}
          <div className="mt-auto space-y-4">
            {(m
              ? outcomes
              : [
                  { name: "Completed", value: null, color: COLORS.green },
                  { name: "Failed", value: null, color: COLORS.orange },
                  { name: "Queued", value: null, color: COLORS.blue },
                  { name: "Processing", value: null, color: COLORS.purple },
                ]
            ).map((item) => (
              <div key={item.name} className="flex items-center gap-3 text-sm">
                <Marker color={item.color} />
                <span className="flex-1">{item.name}</span>
                <strong>{item.value == null ? "—" : number(item.value)}</strong>
                <span className="w-12 text-right text-muted-foreground">
                  {item.value == null || !outcomeTotal
                    ? "—"
                    : percent((item.value / outcomeTotal) * 100)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <Panel title="Product performance" className="xl:col-span-2">
          <Header title="Product performance">
            <Action action={productsAction} />
          </Header>
          <div className="hidden min-w-0 overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Try-Ons</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="text-right">Downloads</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-28 w-full" />
                    </TableCell>
                  </TableRow>
                ) : !m?.products.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-32 text-center text-muted-foreground"
                    >
                      {m
                        ? "No product activity in this period"
                        : unavailableMessage}
                    </TableCell>
                  </TableRow>
                ) : (
                  m.products.map((product, index) => (
                    <TableRow key={product.id}>
                      <TableCell className="text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-40 items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <PackageIcon
                              className="size-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </span>
                          <div>
                            <div className="max-w-64 truncate font-medium">
                              {product.name}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {product.category}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {number(product.generated)}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.generated
                          ? percent((product.generated / m.generated) * 100)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {number(product.downloads)}
                      </TableCell>
                      <TableCell className="text-right">
                        {number(product.failed)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-3 md:hidden">
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : !m?.products.length ? (
              <Empty>
                {m ? "No product activity in this period" : unavailableMessage}
              </Empty>
            ) : (
              m.products.map((product, index) => (
                <div key={product.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{product.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {product.category}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      #{index + 1}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3">
                    {[
                      { label: "Try-Ons", value: number(product.generated) },
                      {
                        label: "Share",
                        value: m.generated
                          ? percent((product.generated / m.generated) * 100)
                          : "—",
                      },
                      { label: "Downloads", value: number(product.downloads) },
                      { label: "Failed", value: number(product.failed) },
                    ].map((item) => (
                      <div key={item.label}>
                        <dt className="text-xs text-muted-foreground">
                          {item.label}
                        </dt>
                        <dd className="mt-1 font-medium">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Most used product references in the selected period.
          </p>
        </Panel>
        <Panel title="Operational insights">
          <Header title="Operational insights">
            <Badge variant="secondary">
              {loading ? "Loading" : m ? "Current snapshot" : "Unavailable"}
            </Badge>
          </Header>
          <div className="divide-y">
            {[
              {
                title: "Generation health",
                description: m
                  ? `${number(m.failed)} failed attempts out of ${number(m.attempts)}. ${m.attempts ? `${percent(m.successRate)} completed successfully.` : "No attempts recorded yet."}`
                  : unavailableMessage,
                icon: <Dashboard3dScaleIcon />,
                action: activityAction,
              },
              {
                title: "Work in progress",
                description: m
                  ? `${number(m.queued)} queued and ${number(m.processing)} processing attempts from this period.`
                  : unavailableMessage,
                icon: <DashboardReloadHorizontalIcon />,
                action: analysisAction,
              },
              {
                title: "Customer engagement",
                description: m
                  ? `${number(m.downloads)} downloads from ${number(m.generated)} generated looks in this period.`
                  : unavailableMessage,
                icon: <DashboardTaxesIcon />,
                action: analysisAction,
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex gap-3 py-5 first:pt-0 last:pb-0"
              >
                <IconBadge>{item.icon}</IconBadge>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">{item.title}</h3>
                  {loading ? (
                    <Skeleton className="my-3 h-10 w-full" />
                  ) : (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                  <div className="mt-3 flex justify-end">
                    <Action action={item.action} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <p className="sr-only">
        {m
          ? `${number(m.generated)} generated Try-Ons, ${number(m.downloads)} downloads, ${number(m.failed)} failed attempts.`
          : unavailableMessage}
      </p>
    </div>
  );
}
