"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleAlertIcon,
  GlobeIcon,
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
  getWooCommerceOverview,
  getShopifyOverview,
  type IntegrationType,
  type IntegrationHealth,
  type CommerceOverviewResponse,
} from "@/lib/integrations";
import { RegionalDateTime } from "@/lib/regional-settings";
import { useSession } from "@/lib/session";
import { getEffectiveStorePermissions } from "@/lib/stores";

export type CommerceDetailProps = {
  accessToken: string;
  storeId: string;
  storeName: string | null;
  canManage: boolean;
};
type PageProps = {
  type: IntegrationType;
  title: string;
  renderDetails: (props: CommerceDetailProps) => ReactNode;
};
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

export function CommerceIntegrationPage(props: PageProps) {
  const session = useSession();
  return session.status === "authenticated" ? (
    <AuthorizedCommercePage
      {...props}
      key={session.accessToken}
      accessToken={session.accessToken}
    />
  ) : null;
}

function AuthorizedCommercePage({
  accessToken,
  type,
  title,
  renderDetails,
}: PageProps & { accessToken: string }) {
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
          throw new Error(`Select a Store to view its ${title} connection.`);
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
    if (type === "SHOPIFY") url.searchParams.delete("oauth");
    window.history.pushState(null, "", url.pathname + url.search);
    setSelection(storeId);
  }
  const refresh = () => setVersion((value) => value + 1);
  if (!access)
    return (
      <PageContainer>
        <PageHeader
          eyebrow="Integrations"
          title={title}
          description="Connect your commerce catalog to SelfX Try-On."
        />
        {error ? (
          <ErrorNotice message={error} retry={refresh} />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Loading {title}…
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
            All {title} Stores
          </Button>
        </div>
      ) : null}
      <PageHeader
        eyebrow={`Integrations / ${title}`}
        title={storeId ? "Store connection" : title}
        description={
          storeId
            ? "Connection, catalog sync and storefront Try-On activity."
            : `Monitor ${title} connections across your SelfX Stores.`
        }
        actions={
          <Button variant="outline" onClick={refresh}>
            <RefreshCwIcon aria-hidden="true" />
            Refresh
          </Button>
        }
      />
      {storeId ? (
        <div key={storeId} className="contents">
          {renderDetails({
            accessToken,
            storeId,
            storeName: access.storeName,
            canManage: access.canManage,
          })}
        </div>
      ) : (
        <CommerceOverview
          type={type}
          title={title}
          accessToken={accessToken}
          openStore={selectStore}
        />
      )}
    </PageContainer>
  );
}

function CommerceOverview({
  accessToken,
  openStore,
  type,
  title,
}: {
  accessToken: string;
  openStore: (id: string) => void;
  type: IntegrationType;
  title: string;
}) {
  const [data, setData] = useState<CommerceOverviewResponse | null>(null);
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
    (type === "SHOPIFY" ? getShopifyOverview : getWooCommerceOverview)(
      accessToken,
      {
        search: query.search,
        health: query.health === "ALL" ? undefined : query.health,
        page: query.page,
        pageSize: 20,
      },
    )
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
  }, [accessToken, query, type]);
  const stats = data?.summary;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`${title} Stores`}
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
          secondaryValue={`${title} · last 30 days`}
          icon={<WandSparklesIcon size={19} />}
        />
      </div>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Store connections</CardTitle>
          <p className="text-sm text-muted-foreground">
            {type === "SHOPIFY"
              ? "Open a Store to review its connection and Shopify setup."
              : "Open a Store to review its connection and plugin setup."}
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
                aria-label={`${title} Store connections`}
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
                  : `No ${title} connections yet`
              }
              description={
                type === "SHOPIFY"
                  ? "Stores appear here after connecting SelfX to Shopify."
                  : "Stores appear here after connecting the SelfX plugin in WordPress."
              }
            />
          )}
        </CardContent>
      </Card>
      <p className="text-xs leading-5 text-muted-foreground">
        {type === "SHOPIFY"
          ? "Connection health checks the SelfX Store, connection and app token. Full sync dates reflect completed catalog syncs. Manage product Try-On controls in the SelfX app inside Shopify."
          : "Connection health checks the SelfX Store, connection and token. Full sync dates appear after the plugin completes a catalog sync. WordPress shows local sync progress and retry errors."}
      </p>
    </>
  );
}

export function Metric({
  label,
  value,
  icon,
  note,
}: {
  label: string;
  value: string;
  icon: ReactNode;
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
export function HealthBadge({ health }: { health: IntegrationHealth }) {
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
export function SyncDate({
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
export function Website({
  value,
  empty = "Connect your website from WordPress",
}: {
  value: string | null;
  empty?: string;
}) {
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
    <span>{empty}</span>
  );
}
export function ErrorNotice({
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
export function messageFor(caught: unknown) {
  return caught instanceof SafeApiError || caught instanceof Error
    ? caught.message
    : "Integration information could not be loaded. Refresh to try again.";
}
