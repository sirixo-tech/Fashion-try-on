"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleAlertIcon,
  GlobeIcon,
  PackageIcon,
  RefreshCwIcon,
  SearchIcon,
  StoreIcon,
  UnplugIcon,
  WandSparklesIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Input,
  PageContainer,
  PageHeader,
  SelectMenu,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@selfx/ui";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { SafeApiError } from "@/lib/api";
import { getCurrentMerchantStore } from "@/lib/current-store";
import {
  disconnectIntegration,
  getWooCommerceOverview,
  listIntegrations,
  type IntegrationCredential,
  type IntegrationHealth,
  type StoreIntegration,
  type WooCommerceOverviewResponse,
  type WooCommerceOverviewRow,
} from "@/lib/integrations";
import { RegionalDateTime } from "@/lib/regional-settings";
import { useSession } from "@/lib/session";
import { getEffectiveStorePermissions } from "@/lib/stores";
import {
  WooCommercePluginConnection,
  WooCommercePluginSetup,
} from "./woocommerce-plugin-connection";

type Access = {
  platform: boolean;
  canManage: boolean;
  storeId: string | null;
  storeName: string | null;
};
const healthLabels: Record<IntegrationHealth, string> = {
  CONNECTED: "Connected",
  NEEDS_ATTENTION: "Needs attention",
  DISCONNECTED: "Disconnected",
};

export function WooCommerceSettingsPage() {
  const session = useSession();
  return session.status === "authenticated" ? (
    <AuthorizedWooCommercePage
      key={session.accessToken}
      accessToken={session.accessToken}
    />
  ) : null;
}

function AuthorizedWooCommercePage({ accessToken }: { accessToken: string }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<string | null>(null);
  useEffect(() => {
    const invalidate = () => {
      setAccess(null);
      setVersion((current) => current + 1);
    };
    window.addEventListener("selfx:permissions-changed", invalidate);
    window.addEventListener("selfx:impersonation-changed", invalidate);
    return () => {
      window.removeEventListener("selfx:permissions-changed", invalidate);
      window.removeEventListener("selfx:impersonation-changed", invalidate);
    };
  }, []);
  useEffect(() => {
    const readSelection = () =>
      setSelection(new URLSearchParams(window.location.search).get("storeId"));
    readSelection();
    window.addEventListener("popstate", readSelection);
    return () => window.removeEventListener("popstate", readSelection);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setAccess(null);
    setError(null);
    void (async () => {
      try {
        const platform = await getCurrentPlatformAccess(accessToken);
        const canManage =
          platform.isSuperadmin ||
          platform.permissions.includes("INTEGRATIONS_MANAGE");
        if (canManage || platform.permissions.includes("INTEGRATIONS_VIEW")) {
          if (!cancelled)
            setAccess({
              platform: true,
              canManage,
              storeId: null,
              storeName: null,
            });
          return;
        }
        const store = await getCurrentMerchantStore(accessToken);
        if (!store)
          throw new Error("Select a Store to view its WooCommerce connection.");
        const permissions = await getEffectiveStorePermissions(
          accessToken,
          store.id,
        );
        const manage =
          permissions.platformBypass ||
          permissions.permissions.includes("integrations.manage");
        if (!manage && !permissions.permissions.includes("integrations.view"))
          throw new Error(
            "You do not have permission to view this Store’s integrations.",
          );
        if (!cancelled)
          setAccess({
            platform: false,
            canManage: manage,
            storeId: store.id,
            storeName: store.name,
          });
      } catch (caught) {
        if (!cancelled) setError(messageFor(caught));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, version]);
  function selectStore(storeId: string | null) {
    const url = new URL(window.location.href);
    if (storeId) url.searchParams.set("storeId", storeId);
    else url.searchParams.delete("storeId");
    window.history.pushState(null, "", url.pathname + url.search);
    setSelection(storeId);
  }
  const refresh = () => setVersion((value) => value + 1);
  if (!access)
    return (
      <PageContainer>
        <PageHeader
          eyebrow="Integrations"
          title="WooCommerce"
          description="Connect your commerce catalog to SelfX Try-On."
        />
        {error ? (
          <ErrorNotice message={error} retry={refresh} />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Loading WooCommerce…
          </p>
        )}
      </PageContainer>
    );
  const storeId = access.platform ? selection : access.storeId;
  return (
    <PageContainer>
      {access.platform && storeId ? (
        <div>
          <Button size="sm" variant="ghost" onClick={() => selectStore(null)}>
            <ArrowLeftIcon aria-hidden="true" />
            All WooCommerce Stores
          </Button>
        </div>
      ) : null}
      <PageHeader
        eyebrow="Integrations / WooCommerce"
        title={storeId ? "Store connection" : "WooCommerce"}
        description={
          storeId
            ? "Connection, catalog sync and storefront Try-On activity."
            : "Monitor WooCommerce connections across your SelfX Stores."
        }
        actions={
          <Button variant="outline" onClick={refresh}>
            <RefreshCwIcon aria-hidden="true" />
            Refresh
          </Button>
        }
      />
      {storeId ? (
        <WooCommerceStoreDetail
          key={storeId}
          accessToken={accessToken}
          storeId={storeId}
          storeName={access.storeName}
          canManage={access.canManage}
        />
      ) : (
        <WooCommerceOverview
          accessToken={accessToken}
          openStore={selectStore}
        />
      )}
    </PageContainer>
  );
}

function WooCommerceOverview({
  accessToken,
  openStore,
}: {
  accessToken: string;
  openStore: (id: string) => void;
}) {
  const [data, setData] = useState<WooCommerceOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState<{
    search: string;
    health: IntegrationHealth | "ALL";
    page: number;
  }>({ search: "", health: "ALL", page: 1 });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    getWooCommerceOverview(accessToken, {
      search: query.search,
      health: query.health === "ALL" ? undefined : query.health,
      page: query.page,
      pageSize: 20,
    })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((caught) => {
        if (!cancelled) setError(messageFor(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, query]);
  const stats = data?.summary;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="WooCommerce Stores"
          value={stats ? String(stats.total) : "—"}
          secondaryValue="Matching your filters"
          icon={<StoreIcon size={19} />}
        />
        <StatCard
          label="Connected"
          value={stats ? String(stats.connected) : "—"}
          secondaryValue={
            stats ? `${stats.disconnected} disconnected` : "Connection health"
          }
          icon={<CheckCircle2Icon size={19} />}
        />
        <StatCard
          label="Needs attention"
          value={stats ? String(stats.needsAttention) : "—"}
          secondaryValue="Connections to review"
          icon={<CircleAlertIcon size={19} />}
        />
        <StatCard
          label="Successful Try-Ons"
          value={stats ? String(stats.successfulTryOns) : "—"}
          secondaryValue="WooCommerce · last 30 days"
          icon={<WandSparklesIcon size={19} />}
        />
      </div>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Store connections</CardTitle>
          <p className="text-sm text-muted-foreground">
            Open a Store to review its connection and plugin setup.
          </p>
        </CardHeader>
        <CardContent className="min-w-0 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <form
              className="flex w-full max-w-lg gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setQuery((current) => ({
                  ...current,
                  search: searchDraft.trim(),
                  page: 1,
                }));
              }}
            >
              <Input
                aria-label="Search Stores or websites"
                placeholder="Search Stores or websites…"
                value={searchDraft}
                maxLength={120}
                onChange={(event) => setSearchDraft(event.target.value)}
              />
              <Button variant="outline" type="submit" aria-label="Search">
                <SearchIcon aria-hidden="true" />
              </Button>
            </form>
            <SelectMenu
              ariaLabel="Connection status"
              className="sm:w-48"
              value={query.health}
              onChange={(health) =>
                setQuery((current) => ({ ...current, health, page: 1 }))
              }
              options={[
                { value: "ALL", label: "All connections" },
                ...Object.entries(healthLabels).map(([value, label]) => ({
                  value: value as IntegrationHealth,
                  label,
                })),
              ]}
            />
          </div>
          {error ? (
            <ErrorNotice message={error} />
          ) : loading ? (
            <p
              role="status"
              className="py-10 text-center text-sm text-muted-foreground"
            >
              Loading Store connections…
            </p>
          ) : data?.data.length ? (
            <>
              <div className="hidden min-w-0 md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Store / website</TableHead>
                      <TableHead>Connection</TableHead>
                      <TableHead className="text-right">Products</TableHead>
                      <TableHead>Last full sync</TableHead>
                      <TableHead className="text-right">
                        Try-Ons · 30 days
                      </TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                              <StoreIcon className="size-5 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium">{row.storeName}</p>
                              <p className="max-w-64 truncate text-xs text-muted-foreground">
                                {websiteLabel(row.website) ||
                                  row.externalAccountName ||
                                  "Website not recorded"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <HealthBadge health={row.health} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.productCount}
                        </TableCell>
                        <TableCell>
                          <SyncDate value={row.lastCatalogSyncAt} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.successfulTryOns}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`View ${row.storeName} details`}
                            onClick={() => openStore(row.storeId)}
                          >
                            View details
                            <ChevronRightIcon aria-hidden="true" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul
                className="space-y-4 md:hidden"
                aria-label="WooCommerce Store connections"
              >
                {data.data.map((row) => (
                  <li key={row.id} className="space-y-4 rounded-xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold">{row.storeName}</h3>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {websiteLabel(row.website) ||
                            row.externalAccountName ||
                            "Website not recorded"}
                        </p>
                      </div>
                      <HealthBadge health={row.health} />
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Products
                        </dt>
                        <dd className="mt-1 font-medium tabular-nums">
                          {row.productCount}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Try-Ons · 30 days
                        </dt>
                        <dd className="mt-1 font-medium tabular-nums">
                          {row.successfulTryOns}
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-xs text-muted-foreground">
                          Last full sync
                        </dt>
                        <dd className="mt-1">
                          <SyncDate value={row.lastCatalogSyncAt} />
                        </dd>
                      </div>
                    </dl>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      aria-label={`Open ${row.storeName} connection`}
                      onClick={() => openStore(row.storeId)}
                    >
                      View details
                      <ChevronRightIcon aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm text-muted-foreground">
                <span>
                  {data.pagination.total} Stores · Page {data.pagination.page}{" "}
                  of {data.pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={query.page <= 1}
                    onClick={() =>
                      setQuery((current) => ({
                        ...current,
                        page: current.page - 1,
                      }))
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!data.pagination.hasMore}
                    onClick={() =>
                      setQuery((current) => ({
                        ...current,
                        page: current.page + 1,
                      }))
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              title={
                query.search || query.health !== "ALL"
                  ? "No matching Stores"
                  : "No WooCommerce connections yet"
              }
              description="Stores appear here after connecting the SelfX plugin in WordPress."
            />
          )}
        </CardContent>
      </Card>
      <p className="text-xs leading-5 text-muted-foreground">
        Connection health checks the SelfX Store, connection and token. Full
        sync dates appear after the plugin completes a catalog sync. WordPress
        shows local sync progress and retry errors.
      </p>
    </>
  );
}

function WooCommerceStoreDetail({
  accessToken,
  storeId,
  storeName,
  canManage,
}: {
  accessToken: string;
  storeId: string;
  storeName: string | null;
  canManage: boolean;
}) {
  const [integration, setIntegration] = useState<StoreIntegration | null>(null);
  const [row, setRow] = useState<WooCommerceOverviewRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const mutationVersion = useRef(0);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    Promise.all([
      listIntegrations(accessToken, { storeId, type: "WOOCOMMERCE" }),
      getWooCommerceOverview(accessToken, { storeId }),
    ])
      .then(([connections, overview]) => {
        if (!cancelled) {
          setIntegration(connections.data[0] ?? null);
          setRow(overview.data[0] ?? null);
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(messageFor(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [accessToken, storeId]);
  async function disconnect() {
    if (!integration || !canManage || busy) return;
    setBusy(true);
    mutationVersion.current += 1;
    setError(null);
    try {
      const result = await disconnectIntegration(accessToken, integration.id);
      if (mounted.current) {
        setIntegration(result);
        setRow((current) =>
          current
            ? {
                ...current,
                health: result.health,
                healthReasons: result.healthReasons,
              }
            : current,
        );
      }
    } catch (caught) {
      if (mounted.current) setError(messageFor(caught));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function credentialChanged(credential: IntegrationCredential) {
    setIntegration((current) =>
      current
        ? {
            ...current,
            credentials: [
              credential,
              ...current.credentials.filter(
                (item) => item.id !== credential.id,
              ),
            ],
          }
        : current,
    );
    const version = ++mutationVersion.current;
    void getWooCommerceOverview(accessToken, { storeId })
      .then((overview) => {
        if (!mounted.current || version !== mutationVersion.current) return;
        const latest = overview.data[0];
        if (latest) {
          setRow(latest);
          setIntegration((current) =>
            current
              ? {
                  ...current,
                  health: latest.health,
                  healthReasons: latest.healthReasons,
                }
              : current,
          );
        }
      })
      .catch(() => {
        if (mounted.current && version === mutationVersion.current)
          setError(
            "Token updated. Refresh to check the latest connection health.",
          );
      });
  }
  if (loading)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading Store connection…
      </p>
    );
  if (error && !integration) return <ErrorNotice message={error} />;
  return (
    <>
      {error ? <ErrorNotice message={error} /> : null}
      <Card>
        <CardContent className="space-y-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <StoreIcon />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-tight">
                  {integration?.storeName ?? storeName ?? "SelfX Store"}
                </h2>
                <div className="mt-1 text-sm text-muted-foreground">
                  <Website value={integration?.externalAccountId ?? null} />
                </div>
              </div>
            </div>
            {integration ? (
              <HealthBadge health={integration.health} />
            ) : (
              <Badge variant="secondary">Not connected</Badge>
            )}
          </div>
          <div className="grid gap-5 border-t pt-5 sm:grid-cols-3">
            <Metric
              label="Imported products"
              value={row ? String(row.productCount) : "—"}
              icon={<PackageIcon size={16} />}
              note="Active WooCommerce products"
            />
            <Metric
              label="Successful Try-Ons"
              value={row ? String(row.successfulTryOns) : "—"}
              icon={<WandSparklesIcon size={16} />}
              note="WooCommerce · last 30 days"
            />
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Last full catalog sync</p>
              <div className="font-medium">
                <SyncDate value={row?.lastCatalogSyncAt ?? null} />
              </div>
              <p className="text-xs text-muted-foreground">
                Completed syncs acknowledged by SelfX
              </p>
            </div>
          </div>
          {integration?.health === "NEEDS_ATTENTION" ? (
            <div
              role="status"
              className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm"
            >
              <p className="font-medium">This connection needs attention</p>
              <p className="mt-1 text-muted-foreground">
                {healthExplanation(integration.healthReasons ?? [])}
              </p>
            </div>
          ) : null}
          {integration ? (
            <dl className="grid gap-x-6 gap-y-4 border-t pt-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Website name</dt>
                <dd className="mt-1 font-medium">
                  {integration.externalAccountName || "Not recorded"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Connected</dt>
                <dd className="mt-1">
                  <SyncDate
                    value={integration.connectedAt}
                    empty="Not connected"
                  />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Connection updated</dt>
                <dd className="mt-1">
                  <SyncDate
                    value={integration.updatedAt}
                    empty="Not recorded"
                  />
                </dd>
              </div>
            </dl>
          ) : null}
        </CardContent>
      </Card>
      {integration ? (
        <WooCommercePluginConnection
          key={integration.id}
          accessToken={accessToken}
          integration={integration}
          canManage={canManage}
          onCredential={credentialChanged}
        />
      ) : (
        <WooCommercePluginSetup />
      )}
      {integration && canManage && integration.status !== "DISCONNECTED" ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm font-medium">Disconnect WooCommerce</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Stops catalog sync and storefront Try-Ons for this Store.
              </p>
            </div>
            <ConfirmDialog
              title="Disconnect WooCommerce?"
              description="Catalog sync and storefront Try-On launches will stop. Connect again from WooCommerce → SelfX in WordPress to resume."
              confirmLabel="Disconnect"
              destructive
              onConfirm={disconnect}
              trigger={
                <Button variant="outline" size="sm" disabled={busy}>
                  <UnplugIcon aria-hidden="true" />
                  Disconnect
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function Metric({
  label,
  value,
  icon,
  note,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  note: string;
}) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
function HealthBadge({ health }: { health: IntegrationHealth }) {
  return (
    <Badge
      variant={health === "NEEDS_ATTENTION" ? "destructive" : "secondary"}
      className={
        health === "CONNECTED"
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : undefined
      }
    >
      {health === "CONNECTED" ? (
        <CheckCircle2Icon aria-hidden="true" />
      ) : health === "NEEDS_ATTENTION" ? (
        <CircleAlertIcon aria-hidden="true" />
      ) : (
        <UnplugIcon aria-hidden="true" />
      )}
      {healthLabels[health]}
    </Badge>
  );
}
function SyncDate({
  value,
  empty = "Not recorded yet",
}: {
  value: string | null | undefined;
  empty?: string;
}) {
  return value ? (
    <RegionalDateTime value={value} />
  ) : (
    <span className="text-muted-foreground">{empty}</span>
  );
}
function safeWebsite(value: string | null) {
  try {
    const url = new URL(value ?? "");
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}
function websiteLabel(value: string | null) {
  const url = safeWebsite(value);
  return url ? url.host + (url.pathname === "/" ? "" : url.pathname) : null;
}
function Website({ value }: { value: string | null }) {
  const url = safeWebsite(value);
  return url ? (
    <a
      href={url.href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 hover:text-foreground"
    >
      <GlobeIcon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="break-all">{websiteLabel(value)}</span>
      <ArrowUpRightIcon className="size-3.5 shrink-0" aria-hidden="true" />
    </a>
  ) : (
    <span>Connect your website from WordPress</span>
  );
}
function healthExplanation(reasons: string[]) {
  if (reasons.some((reason) => reason.startsWith("SELFX_STORE_")))
    return "The SelfX Store is inactive. A platform administrator must review its status before the connection can be used.";
  if (reasons.includes("INTEGRATION_CREDENTIAL_MISSING"))
    return "The plugin has no valid connection token. Reconnect from WooCommerce → SelfX in WordPress.";
  return "Review the connection in WooCommerce → SelfX in WordPress and retry the catalog sync.";
}
function ErrorNotice({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
    >
      <span>{message}</span>
      {retry ? (
        <Button size="sm" variant="outline" onClick={retry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
function messageFor(caught: unknown) {
  return caught instanceof SafeApiError || caught instanceof Error
    ? caught.message
    : "WooCommerce information could not be loaded. Refresh to try again.";
}
