"use client";
import { useEffect, useRef, useState } from "react";
import {
  PackageIcon,
  StoreIcon,
  UnplugIcon,
  WandSparklesIcon,
} from "lucide-react";
import { Badge, Button, Card, CardContent, ConfirmDialog } from "@selfx/ui";
import {
  disconnectIntegration,
  getWooCommerceOverview,
  listIntegrations,
  type IntegrationCredential,
  type StoreIntegration,
  type WooCommerceOverviewRow,
} from "@/lib/integrations";
import {
  WooCommercePluginConnection,
  WooCommercePluginSetup,
} from "./woocommerce-plugin-connection";
import {
  CommerceIntegrationPage,
  ErrorNotice,
  HealthBadge,
  Metric,
  SyncDate,
  Website,
  messageFor,
} from "./commerce-integration-page";

export function WooCommerceSettingsPage() {
  return (
    <CommerceIntegrationPage
      type="WOOCOMMERCE"
      title="WooCommerce"
      renderDetails={(props) => <WooCommerceStoreDetail {...props} />}
    />
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

function healthExplanation(reasons: string[]) {
  if (reasons.some((reason) => reason.startsWith("SELFX_STORE_")))
    return "The SelfX Store is inactive. A platform administrator must review its status before the connection can be used.";
  if (reasons.includes("INTEGRATION_CREDENTIAL_MISSING"))
    return "The plugin has no valid connection token. Reconnect from WooCommerce → SelfX in WordPress.";
  return "Review the connection in WooCommerce → SelfX in WordPress and retry the catalog sync.";
}
