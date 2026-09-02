"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIcon,
  BarChart3Icon,
  DownloadIcon,
  MonitorIcon,
  PackageIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  SparklesIcon,
  StoreIcon,
  UsersIcon,
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
  StatusBadge,
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
import { listKioskDevices, type KioskDevice } from "@/lib/kiosks";
import { listActiveOrganizations } from "@/lib/organizations";
import { useSession } from "@/lib/session";
import {
  getEffectiveStorePermissions,
  listStoreKiosks,
  listStoreProducts,
  listStoreUsers,
  listStores,
  type AdminStore,
  type EffectiveStorePermissions,
  type StoreProduct,
  type StoreUser,
} from "@/lib/stores";
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

export default function DashboardPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [range, setRange] = useState<UsageRangePreset>("7d");
  const [storeId, setStoreId] = useState("");
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [platformAccess, setPlatformAccess] =
    useState<CurrentPlatformAccess | null>(null);
  const [storeAccess, setStoreAccess] =
    useState<EffectiveStorePermissions | null>(null);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [kiosks, setKiosks] = useState<KioskDevice[]>([]);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [staff, setStaff] = useState<StoreUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const platformPermissions = platformAccess?.permissions ?? [];
  const hasPlatformUsageAccess = Boolean(
    platformAccess?.isSuperadmin || platformPermissions.includes("USAGE_VIEW"),
  );
  const canViewPlatformKiosks = Boolean(
    platformAccess?.isSuperadmin || platformPermissions.includes("KIOSKS_VIEW"),
  );
  const hasStoreBypass = storeAccess?.platformBypass ?? false;
  const storePermissions = storeAccess?.permissions ?? [];
  const canViewStoreUsage = Boolean(
    hasStoreBypass || storePermissions.includes("analytics.view"),
  );
  const canViewStoreDetails = Boolean(
    hasStoreBypass || storePermissions.includes("stores.view"),
  );
  const canViewStoreKiosks = Boolean(
    hasStoreBypass || storePermissions.includes("kiosks.view"),
  );
  const canViewStoreStaff = Boolean(
    hasStoreBypass || storePermissions.includes("users.view"),
  );
  const selectedStoreName = useMemo(
    () =>
      storeOptions.find((store) => store.id === storeId)?.name ??
      "Selected Store",
    [storeId, storeOptions],
  );
  const isStoreScope = Boolean(storeId);

  useEffect(() => {
    if (!accessToken) {
      setPlatformAccess(null);
      setStoreOptions([]);
      setStoreId("");
      return;
    }

    const token = accessToken;
    let cancelled = false;

    async function loadContext() {
      setError(null);
      try {
        const nextAccess = await getCurrentPlatformAccess(token);
        if (cancelled) {
          return;
        }
        setPlatformAccess(nextAccess);

        if (
          nextAccess.isSuperadmin ||
          nextAccess.permissions.includes("STORES_VIEW")
        ) {
          const nextStores = await listStores(token, { pageSize: 100 });
          if (!cancelled) {
            const options = nextStores.data.map(storeOptionFromAdminStore);
            setStores(nextStores.data);
            setStoreOptions(options);
          }
          return;
        }

        const activeStores = await listActiveOrganizations(token);
        if (!cancelled) {
          const options = activeStores.map((store) => ({
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

    void loadContext();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !storeId) {
      setStoreAccess(null);
      return;
    }

    const token = accessToken;
    const selectedStoreId = storeId;
    let cancelled = false;

    getEffectiveStorePermissions(token, selectedStoreId)
      .then((nextAccess) => {
        if (!cancelled) {
          setStoreAccess(nextAccess);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setStoreAccess(null);
          setError(messageFor(caught));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, storeId]);

  const loadDashboard = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const mayLoadUsage = storeId ? canViewStoreUsage : hasPlatformUsageAccess;
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, nextKiosks, nextProducts, nextStaff] =
        await Promise.all([
          mayLoadUsage
            ? getUsageSummary(accessToken, {
                range,
                storeId: storeId || undefined,
                limit: 8,
              })
            : Promise.resolve(null),
          storeId
            ? canViewStoreKiosks
              ? listStoreKiosks(accessToken, storeId)
              : Promise.resolve([])
            : canViewPlatformKiosks
              ? listKioskDevices(accessToken)
              : Promise.resolve([]),
          storeId && canViewStoreDetails
            ? listStoreProducts(accessToken, storeId, { pageSize: 8 })
            : Promise.resolve(null),
          storeId && canViewStoreStaff
            ? listStoreUsers(accessToken, storeId, { pageSize: 8 })
            : Promise.resolve(null),
        ]);
      setSummary(nextSummary);
      setKiosks(nextKiosks);
      setProducts(nextProducts?.data ?? []);
      setStaff(nextStaff?.data ?? []);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [
    accessToken,
    canViewPlatformKiosks,
    canViewStoreDetails,
    canViewStoreKiosks,
    canViewStoreStaff,
    canViewStoreUsage,
    hasPlatformUsageAccess,
    range,
    storeId,
  ]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const activeStores = stores.filter((store) => store.status === "ACTIVE");
  const activeKiosks = kiosks.filter((kiosk) => kiosk.status === "ACTIVE");
  const activeProducts = products.filter((product) => product.active);
  const activeStaff = staff.filter((user) => user.status === "ACTIVE");
  const scopeLabel = isStoreScope ? selectedStoreName : "All Stores";

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Workspace"
        title="Dashboard"
        description="Role-aware operational overview for the current SelfX scope."
        status={<StatusBadge status="ACTIVE" label={scopeLabel} />}
        actions={
          <Button variant="outline" onClick={() => void loadDashboard()}>
            <RefreshCwIcon aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <PageSection>
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[12rem_minmax(0,22rem)_1fr]">
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
            Store scope
            <SelectMenu
              ariaLabel="Store scope"
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
              : "Dashboard data follows the permissions on this account."}
          </div>
        </div>
      </PageSection>

      {error ? <AccessError message={error} /> : null}

      <PageSection>
        <StatGrid>
          {isStoreScope ? (
            <>
              <StatCard
                label="Generated Looks"
                value={displayNumber(summary?.totals.tryOnsGenerated)}
                secondaryValue={`${displayPercent(summary?.totals.successRate)} success rate`}
                icon={<SparklesIcon size={18} aria-hidden="true" />}
              />
              <StatCard
                label="Store Kiosks"
                value={displayNumber(kiosks.length)}
                secondaryValue={`${displayNumber(activeKiosks.length)} active`}
                icon={<MonitorIcon size={18} aria-hidden="true" />}
              />
              <StatCard
                label="Products"
                value={displayNumber(products.length)}
                secondaryValue={`${displayNumber(activeProducts.length)} active`}
                icon={<PackageIcon size={18} aria-hidden="true" />}
              />
              <StatCard
                label="Staff"
                value={displayNumber(staff.length)}
                secondaryValue={`${displayNumber(activeStaff.length)} active`}
                icon={<UsersIcon size={18} aria-hidden="true" />}
              />
            </>
          ) : (
            <>
              <StatCard
                label="Stores"
                value={displayNumber(stores.length)}
                secondaryValue={`${displayNumber(activeStores.length)} active`}
                icon={<StoreIcon size={18} aria-hidden="true" />}
              />
              <StatCard
                label="Fleet Kiosks"
                value={displayNumber(kiosks.length)}
                secondaryValue={`${displayNumber(activeKiosks.length)} active`}
                icon={<MonitorIcon size={18} aria-hidden="true" />}
              />
              <StatCard
                label="Generated Looks"
                value={displayNumber(summary?.totals.tryOnsGenerated)}
                secondaryValue={`${displayNumber(summary?.totals.sessionsStarted)} sessions`}
                icon={<SparklesIcon size={18} aria-hidden="true" />}
              />
              <StatCard
                label="Downloads"
                value={displayNumber(summary?.totals.downloadsCompleted)}
                secondaryValue={`${displayPercent(summary?.totals.downloadRate)} download rate`}
                icon={<DownloadIcon size={18} aria-hidden="true" />}
              />
            </>
          )}
        </StatGrid>
      </PageSection>

      <PageSection>
        <div className="grid gap-4 xl:grid-cols-2">
          <DashboardTable
            title={isStoreScope ? "Store Activity" : "Store Usage"}
            icon={<BarChart3Icon size={18} aria-hidden="true" />}
            loading={loading}
            empty="No usage in this range."
            headers={
              isStoreScope
                ? ["Metric", "Count"]
                : ["Store", "Sessions", "Looks", "Downloads"]
            }
            rows={
              isStoreScope
                ? [
                    [
                      "Sessions",
                      displayNumber(summary?.totals.sessionsStarted),
                    ],
                    [
                      "Completed runs",
                      displayNumber(summary?.totals.completedRuns),
                    ],
                    [
                      "Failed runs",
                      displayNumber(summary?.totals.failedRuns),
                    ],
                    [
                      "Downloads",
                      displayNumber(summary?.totals.downloadsCompleted),
                    ],
                  ]
                : (summary?.stores ?? []).map((row) => [
                    row.storeName,
                    displayNumber(row.sessionsStarted),
                    displayNumber(row.tryOnsGenerated),
                    displayNumber(row.downloadsCompleted),
                  ])
            }
          />
          <DashboardTable
            title="Kiosks"
            icon={<MonitorIcon size={18} aria-hidden="true" />}
            loading={loading}
            empty="No kiosks visible for this scope."
            headers={["Kiosk", "Scope", "Status", "Last Seen"]}
            rows={kiosks.slice(0, 8).map((kiosk) => [
              kiosk.displayName,
              kiosk.assignment.organizationName ??
                kiosk.assignment.storeName ??
                "Platform fleet",
              kiosk.status,
              formatOptionalDate(kiosk.lastSeenAt),
            ])}
          />
          <DashboardTable
            title={isStoreScope ? "Products" : "Product Usage"}
            icon={<PackageIcon size={18} aria-hidden="true" />}
            loading={loading}
            empty="No product data visible for this scope."
            headers={
              isStoreScope
                ? ["Product", "Category", "Status", "Try-On"]
                : ["Product", "Category", "Looks", "Downloads"]
            }
            rows={
              isStoreScope
                ? products.slice(0, 8).map((product) => [
                    product.name,
                    product.categoryName,
                    product.active ? "Active" : "Inactive",
                    product.vtoEnabled ? "Enabled" : "Disabled",
                  ])
                : (summary?.products ?? []).map((row) => [
                    row.name,
                    row.category ?? "-",
                    displayNumber(row.tryOnsGenerated),
                    displayNumber(row.downloadsCompleted),
                  ])
            }
          />
          <DashboardTable
            title={isStoreScope ? "Staff" : "Channels"}
            icon={
              isStoreScope ? (
                <UsersIcon size={18} aria-hidden="true" />
              ) : (
                <ActivityIcon size={18} aria-hidden="true" />
              )
            }
            loading={loading}
            empty="No staff or channel data visible for this scope."
            headers={
              isStoreScope
                ? ["User", "Status", "Roles", "Joined"]
                : ["Channel", "Runs", "Looks", "Downloads"]
            }
            rows={
              isStoreScope
                ? staff.slice(0, 8).map((user) => [
                    user.displayName ?? user.email,
                    user.status,
                    roleNames(user.roles),
                    formatOptionalDate(user.joinedAt),
                  ])
                : (summary?.channels ?? []).map((row) => [
                    channelName(row.channel),
                    displayNumber(row.runsCreated),
                    displayNumber(row.tryOnsGenerated),
                    displayNumber(row.downloadsCompleted),
                  ])
            }
          />
        </div>
      </PageSection>

      <PageSection>
        <div className="rounded-lg border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Access Scope</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isStoreScope
                  ? "This dashboard is constrained to the selected Store and its granted permissions."
                  : "This dashboard is showing platform-wide rollups available to the current platform role."}
              </p>
            </div>
            <Badge variant="outline">
              {isStoreScope ? "Store RBAC" : "Platform RBAC"}
            </Badge>
          </div>
        </div>
      </PageSection>
    </PageContainer>
  );
}

function DashboardTable({
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
              <TableCell colSpan={headers.length}>Loading dashboard...</TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={headers.length}>{empty}</TableCell>
            </TableRow>
          ) : (
            rows.map((row, rowIndex) => (
              <TableRow key={`${title}-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <TableCell
                    key={`${title}-${rowIndex}-${cellIndex}`}
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

function AccessError({ message }: { message: string }) {
  return (
    <PageSection>
      <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <ShieldAlertIcon size={18} aria-hidden="true" />
        {message}
      </div>
    </PageSection>
  );
}

function storeOptionFromAdminStore(store: AdminStore): StoreOption {
  return { id: store.id, name: store.name };
}

function roleNames(roles: Array<{ name: string }>): string {
  return roles.length > 0 ? roles.map((role) => role.name).join(", ") : "-";
}

function channelName(value: string): string {
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

function formatOptionalDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "-";
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  if (caught instanceof Error) {
    return caught.message;
  }
  return "Dashboard data could not be loaded.";
}
