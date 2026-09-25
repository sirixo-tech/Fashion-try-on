"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  EyeIcon,
  LinkIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  StoreIcon,
  UnplugIcon,
} from "lucide-react";

import {
  buttonVariants,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  PageContainer,
  PageHeader,
  PageSection,
  StatusBadge,
  TableContainer,
} from "@selfx/ui";

import {
  getCurrentPlatformAccess,
  type CurrentPlatformAccess,
} from "@/lib/access-control";
import { SafeApiError } from "@/lib/api";
import { getCurrentMerchantStore } from "@/lib/current-store";
import {
  connectIntegration,
  disconnectIntegration,
  listIntegrations,
  startShopifyOauth,
  syncShopifyCatalog,
  type IntegrationType,
  type StoreIntegration,
} from "@/lib/integrations";
import { useSession } from "@/lib/session";
import {
  getStoreCreditDiagnostics,
  getEffectiveStorePermissions,
  listStores,
  type AdminStore,
  type EffectiveStorePermissions,
  type StoreCreditDiagnostics,
} from "@/lib/stores";

type StoreOption = { id: string; name: string };

type ConnectionDraft = {
  externalAccountId: string;
  externalAccountName: string;
};

export function IntegrationSettingsPage({
  type,
  title,
}: {
  type: IntegrationType;
  title: string;
}) {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [platformAccess, setPlatformAccess] =
    useState<CurrentPlatformAccess | null>(null);
  const [selectedStoreAccess, setSelectedStoreAccess] =
    useState<EffectiveStorePermissions | null>(null);
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [integration, setIntegration] = useState<StoreIntegration | null>(null);
  const [platformIntegrations, setPlatformIntegrations] = useState<
    StoreIntegration[]
  >([]);
  const [creditDiagnostics, setCreditDiagnostics] =
    useState<StoreCreditDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft>({
    externalAccountId: "",
    externalAccountName: "",
  });
  const [error, setError] = useState<string | null>(null);

  const hasPlatformIntegrationAccess = Boolean(
    platformAccess?.isSuperadmin ||
    platformAccess?.permissions.includes("INTEGRATIONS_VIEW") ||
    platformAccess?.permissions.includes("INTEGRATIONS_MANAGE"),
  );
  const canManagePlatformIntegrations = Boolean(
    platformAccess?.isSuperadmin ||
    platformAccess?.permissions.includes("INTEGRATIONS_MANAGE"),
  );
  const canViewSelectedIntegration = Boolean(
    hasPlatformIntegrationAccess ||
    selectedStoreAccess?.platformBypass ||
    selectedStoreAccess?.permissions.includes("integrations.view") ||
    selectedStoreAccess?.permissions.includes("integrations.manage"),
  );
  const canManageSelectedIntegration = Boolean(
    canManagePlatformIntegrations ||
    selectedStoreAccess?.platformBypass ||
    selectedStoreAccess?.permissions.includes("integrations.manage"),
  );
  const selectedStoreName =
    storeOptions.find((store) => store.id === selectedStoreId)?.name ?? "";
  const shopifyUsage =
    creditDiagnostics?.byChannel.find(
      (channel) => channel.channel === "SHOPIFY",
    )?.consumedCredits ?? 0;
  const totalConsumed = creditDiagnostics?.totals.consumedCredits ?? 0;
  const topShopifyProduct = creditDiagnostics?.topProducts[0] ?? null;
  const showShopifyPlatformOverview =
    type === "SHOPIFY" && hasPlatformIntegrationAccess;
  const overviewRows = useMemo(
    () =>
      platformIntegrations.map((currentIntegration) => {
        const store = stores.find(
          (candidate) => candidate.id === currentIntegration.storeId,
        );
        return {
          integration: currentIntegration,
          store,
          availableCredits: store?.subscription?.availableCredits ?? null,
          planName:
            store?.subscription?.subscription?.pricingPlan?.name ??
            store?.subscription?.subscription?.pricingPlan?.code ??
            "No plan",
        };
      }),
    [platformIntegrations, stores],
  );
  const overviewActiveCount = platformIntegrations.filter(
    (currentIntegration) => currentIntegration.health === "CONNECTED",
  ).length;
  const overviewDisconnectedCount = platformIntegrations.filter(
    (currentIntegration) => currentIntegration.health === "DISCONNECTED",
  ).length;
  const overviewNeedsAttentionCount = platformIntegrations.filter(
    (currentIntegration) => currentIntegration.health === "NEEDS_ATTENTION",
  ).length;

  const loadAccess = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setError(null);
    try {
      const access = await getCurrentPlatformAccess(accessToken);
      setPlatformAccess(access);
      if (
        access.isSuperadmin ||
        access.permissions.includes("STORES_VIEW") ||
        access.permissions.includes("INTEGRATIONS_VIEW") ||
        access.permissions.includes("INTEGRATIONS_MANAGE")
      ) {
        const response = await listStores(accessToken, { pageSize: 100 });
        setStores(response.data);
        const options = response.data.map(storeOptionFromAdminStore);
        setStoreOptions(options);
        setSelectedStoreId((current) => current || options[0]?.id || "");
        return;
      }

      const currentStore = await getCurrentMerchantStore(accessToken);
      const options = currentStore
        ? [{ id: currentStore.id, name: currentStore.name }]
        : [];
      setStores([]);
      setStoreOptions(options);
      setSelectedStoreId((current) => current || options[0]?.id || "");
    } catch (caught) {
      setError(messageFor(caught));
      setPlatformAccess({ isSuperadmin: false, permissions: [] });
      setStores([]);
      setStoreOptions([]);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callbackStoreId = params.get("storeId");
    const oauth = params.get("oauth");
    if (callbackStoreId) {
      setSelectedStoreId(callbackStoreId);
    }
    if (oauth === "sync_failed") {
      setError(
        "Shopify connected, but the first catalog sync failed. Use Sync Catalog to try again.",
      );
    }
  }, []);

  useEffect(() => {
    if (!accessToken || !selectedStoreId) {
      setSelectedStoreAccess(null);
      return;
    }
    let cancelled = false;
    getEffectiveStorePermissions(accessToken, selectedStoreId)
      .then((nextAccess) => {
        if (!cancelled) {
          setSelectedStoreAccess(nextAccess);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedStoreAccess(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedStoreId]);

  const loadIntegration = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    if (showShopifyPlatformOverview) {
      setLoading(true);
      setError(null);
      try {
        const response = await listIntegrations(accessToken, {
          type,
          pageSize: 100,
        });
        setPlatformIntegrations(response.data);
        setIntegration(null);
        setCreditDiagnostics(null);
      } catch (caught) {
        setError(messageFor(caught));
        setPlatformIntegrations([]);
      } finally {
        setLoading(false);
      }
      return;
    }
    setPlatformIntegrations([]);
    if (!selectedStoreId || !canViewSelectedIntegration) {
      setIntegration(null);
      setCreditDiagnostics(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await listIntegrations(accessToken, {
        storeId: selectedStoreId,
        type,
      });
      setCreditDiagnostics(
        await getStoreCreditDiagnostics(accessToken, selectedStoreId).catch(
          () => null,
        ),
      );
      const current = response.data[0] ?? null;
      setIntegration(current);
      setConnectionDraft({
        externalAccountId: current?.externalAccountId ?? "",
        externalAccountName: current?.externalAccountName ?? "",
      });
    } catch (caught) {
      setError(messageFor(caught));
      setIntegration(null);
    } finally {
      setLoading(false);
    }
  }, [
    accessToken,
    canViewSelectedIntegration,
    selectedStoreId,
    showShopifyPlatformOverview,
    type,
  ]);

  useEffect(() => {
    void loadIntegration();
  }, [loadIntegration]);

  async function saveConnection() {
    if (!accessToken || !selectedStoreId || !canManageSelectedIntegration) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (type === "SHOPIFY") {
        const response = await startShopifyOauth(accessToken, {
          storeId: selectedStoreId,
          shop: connectionDraft.externalAccountId,
        });
        window.location.assign(response.authorizationUrl);
        return;
      }
      const saved = await connectIntegration(accessToken, {
        storeId: selectedStoreId,
        type,
        externalAccountId: connectionDraft.externalAccountId || null,
        externalAccountName: connectionDraft.externalAccountName || null,
      });
      setIntegration(saved);
      setConnectOpen(false);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  async function syncShopify() {
    if (!accessToken || !integration || type !== "SHOPIFY") {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await syncShopifyCatalog(accessToken, integration.id);
      await loadIntegration();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  async function disconnectCurrentIntegration() {
    if (!accessToken || !integration || !canManageSelectedIntegration) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      setIntegration(await disconnectIntegration(accessToken, integration.id));
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  const connected = Boolean(
    integration && integration.status !== "DISCONNECTED",
  );

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Integrations"
        title={title}
        description={
          showShopifyPlatformOverview
            ? "Monitor Shopify connections across SelfX Stores."
            : type === "SHOPIFY"
              ? "Connect Shopify catalog to SelfX. Product Try-On controls are managed inside Shopify."
              : "Connect your commerce catalog to SelfX Try-On."
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={() => void loadIntegration()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            {!showShopifyPlatformOverview ? (
              <Button
                disabled={!selectedStoreId || !canManageSelectedIntegration}
                onClick={() => setConnectOpen(true)}
              >
                <LinkIcon aria-hidden="true" />
                {type === "SHOPIFY"
                  ? connected
                    ? "Reconnect Shopify"
                    : "Connect Shopify"
                  : connected
                    ? "Edit Connection"
                    : "Register Connection"}
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? (
        <PageSection>
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <ShieldAlertIcon size={18} aria-hidden="true" />
            {error}
          </div>
        </PageSection>
      ) : null}

      {showShopifyPlatformOverview ? (
        <ShopifyPlatformOverview
          activeCount={overviewActiveCount}
          disconnectedCount={overviewDisconnectedCount}
          needsAttentionCount={overviewNeedsAttentionCount}
          loading={loading}
          rows={overviewRows}
          totalStores={stores.length}
        />
      ) : (
        <>
          <PageSection>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SummaryTile
                label="Connection"
                value={connected ? "CONNECTED" : "NOT CONNECTED"}
              />
              <SummaryTile
                label="Available Credits"
                value={
                  creditDiagnostics
                    ? String(creditDiagnostics.availableCredits)
                    : "Loading"
                }
              />
              <SummaryTile label="Shopify Used" value={String(shopifyUsage)} />
              <SummaryTile label="Total Used" value={String(totalConsumed)} />
            </div>
          </PageSection>

          <PageSection>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.4fr)]">
              <TableContainer
                title={`${title} Connection`}
                description={
                  type === "SHOPIFY"
                    ? "Shopify authorizes read-only catalog access. Shopify remains the product source of truth."
                    : "External store identity and connection status."
                }
                actions={
                  connected && canManageSelectedIntegration ? (
                    <div className="flex items-center gap-2">
                      {type === "SHOPIFY" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={saving}
                          onClick={() => void syncShopify()}
                        >
                          <RefreshCwIcon aria-hidden="true" />
                          Sync Catalog
                        </Button>
                      ) : null}
                      <ConfirmDialog
                        title={`Disconnect ${title}?`}
                        description="Disconnecting stops catalog sync and storefront Try-On launches until the integration is connected again."
                        confirmLabel="Disconnect"
                        destructive
                        onConfirm={() => void disconnectCurrentIntegration()}
                        trigger={
                          <Button variant="outline" size="sm" disabled={saving}>
                            <UnplugIcon aria-hidden="true" />
                            Disconnect
                          </Button>
                        }
                      />
                    </div>
                  ) : null
                }
              >
                {loading ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    Loading integration...
                  </div>
                ) : integration ? (
                  <div className="grid gap-4 p-1 md:grid-cols-2">
                    <Detail
                      label="Status"
                      value={<StatusBadge status={integration.status} />}
                    />
                    <Detail
                      label={type === "SHOPIFY" ? "Shop domain" : "External ID"}
                      value={integration.externalAccountId || "Not connected"}
                    />
                    <Detail
                      label={type === "SHOPIFY" ? "Shop name" : "External name"}
                      value={integration.externalAccountName || "Not connected"}
                    />
                    <Detail
                      label="Connected"
                      value={formatDateTime(integration.connectedAt)}
                    />
                    <Detail
                      label="Last updated"
                      value={formatDateTime(integration.updatedAt)}
                    />
                    <Detail
                      label="SelfX workspace"
                      value={integration.storeName}
                    />
                  </div>
                ) : (
                  <div className="space-y-4 p-4">
                    <p className="text-sm leading-6 text-muted-foreground">
                      {type === "SHOPIFY"
                        ? "Connect Shopify to authorize catalog sync. After connection, manage Try-On availability from the embedded Shopify app."
                        : "Register the commerce connection to start syncing catalog and Try-On usage."}
                    </p>
                    <div className="rounded-lg border bg-muted/25 p-3 text-sm text-muted-foreground">
                      SelfX will use your active workspace automatically.
                      {selectedStoreName
                        ? ` Workspace: ${selectedStoreName}.`
                        : ""}
                    </div>
                  </div>
                )}
              </TableContainer>

              <TableContainer
                title="Try-On Diagnostics"
                description="Credits and usage are shared across SelfX channels."
              >
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SummaryTile
                      label="Granted"
                      value={String(
                        creditDiagnostics?.totals.grantedCredits ?? 0,
                      )}
                    />
                    <SummaryTile
                      label="Consumed"
                      value={String(
                        creditDiagnostics?.totals.consumedCredits ?? 0,
                      )}
                    />
                  </div>
                  <div className="rounded-lg border bg-muted/25 p-3 text-sm">
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Most used product
                    </div>
                    <div className="mt-1 font-semibold">
                      {topShopifyProduct?.productName ?? "No Try-Ons yet"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {topShopifyProduct
                        ? `${topShopifyProduct.consumedCredits} credits across ${topShopifyProduct.runs} runs`
                        : "Usage appears here after shoppers generate Try-Ons."}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/25 p-3 text-sm leading-6 text-muted-foreground">
                    Product images and Try-On enablement are controlled inside
                    Shopify. This dashboard shows connection health, credits and
                    diagnostics.
                  </div>
                </div>
              </TableContainer>
            </div>
          </PageSection>
        </>
      )}

      {!showShopifyPlatformOverview ? (
        <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {type === "SHOPIFY" ? "Connect Shopify" : `Register ${title}`}
              </DialogTitle>
              <DialogDescription>
                {type === "SHOPIFY"
                  ? `Authorize read-only product access for ${selectedStoreName}.`
                  : `Record the external store identity for ${selectedStoreName}.`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <label className="space-y-2 text-sm">
                <span>
                  {type === "SHOPIFY" ? "Shop domain" : "External store ID"}
                </span>
                <Input
                  value={connectionDraft.externalAccountId}
                  maxLength={180}
                  placeholder={
                    type === "SHOPIFY"
                      ? "my-shop.myshopify.com"
                      : "https://store.example.com"
                  }
                  onChange={(event) =>
                    setConnectionDraft((current) => ({
                      ...current,
                      externalAccountId: event.target.value,
                    }))
                  }
                />
              </label>
              {type !== "SHOPIFY" ? (
                <label className="space-y-2 text-sm">
                  <span>External store name</span>
                  <Input
                    value={connectionDraft.externalAccountName}
                    maxLength={240}
                    placeholder={selectedStoreName || title}
                    onChange={(event) =>
                      setConnectionDraft((current) => ({
                        ...current,
                        externalAccountName: event.target.value,
                      }))
                    }
                  />
                </label>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConnectOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={
                  saving ||
                  !selectedStoreId ||
                  (type === "SHOPIFY" && !connectionDraft.externalAccountId)
                }
                onClick={saveConnection}
              >
                <LinkIcon aria-hidden="true" />
                {type === "SHOPIFY" ? "Continue to Shopify" : "Save Connection"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </PageContainer>
  );
}

function ShopifyPlatformOverview({
  activeCount,
  disconnectedCount,
  needsAttentionCount,
  loading,
  rows,
  totalStores,
}: {
  activeCount: number;
  disconnectedCount: number;
  needsAttentionCount: number;
  loading: boolean;
  rows: Array<{
    integration: StoreIntegration;
    store: AdminStore | undefined;
    availableCredits: number | null;
    planName: string;
  }>;
  totalStores: number;
}) {
  return (
    <>
      <PageSection>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryTile label="Shopify stores" value={String(rows.length)} />
          <SummaryTile label="Active" value={String(activeCount)} />
          <SummaryTile label="Disconnected" value={String(disconnectedCount)} />
          <SummaryTile
            label="Needs attention"
            value={String(needsAttentionCount)}
          />
        </div>
      </PageSection>

      <PageSection>
        <TableContainer
          title="Shopify Stores"
          description={`Store-level operational controls stay inside each Store. ${totalStores} SelfX Stores are available on the platform.`}
        >
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">
              Loading Shopify stores...
            </div>
          ) : rows.length === 0 ? (
            <div className="grid place-items-center gap-3 p-8 text-center">
              <div className="grid size-12 place-items-center rounded-lg bg-primary/10 text-primary">
                <StoreIcon aria-hidden="true" />
              </div>
              <div>
                <div className="font-semibold">No Shopify stores connected</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Connected Shopify stores will appear here after they are
                  linked to a SelfX Store.
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Store</th>
                    <th className="px-4 py-3 font-semibold">Shopify domain</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Plan</th>
                    <th className="px-4 py-3 font-semibold">Credits</th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">Connected</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map(
                    ({ availableCredits, integration, planName, store }) => (
                      <tr key={integration.id} className="align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            {store?.name ?? integration.storeName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {store?.slug ?? integration.storeId}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            {integration.externalAccountId || "Not available"}
                          </div>
                          {integration.externalAccountName ? (
                            <div className="text-xs text-muted-foreground">
                              {integration.externalAccountName}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={
                              integration.health === "CONNECTED"
                                ? integration.status
                                : integration.health
                            }
                          />
                          {integration.health === "NEEDS_ATTENTION" &&
                          integration.healthReasons.length > 0 ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatHealthReason(
                                integration.healthReasons[0]!,
                              )}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">{planName}</td>
                        <td className="px-4 py-3">
                          {formatNullableNumber(availableCredits)}
                        </td>
                        <td className="px-4 py-3">
                          {store?.contactEmail ?? "Not set"}
                        </td>
                        <td className="px-4 py-3">
                          {formatDateTime(integration.connectedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <Link
                              href={`/app/stores/${integration.storeId}`}
                              aria-label={`View ${store?.name ?? integration.storeName}`}
                              title="View store"
                              className={buttonVariants({
                                variant: "outline",
                                size: "icon-sm",
                              })}
                            >
                              <EyeIcon aria-hidden="true" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TableContainer>
      </PageSection>
    </>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold">{value}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function storeOptionFromAdminStore(store: AdminStore): StoreOption {
  return { id: store.id, name: store.name };
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "-" : new Intl.NumberFormat().format(value);
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Never";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatHealthReason(reason: string): string {
  const labels: Record<string, string> = {
    CENTRAL_INTEGRATION_ERROR: "Connection error",
    CENTRAL_INTEGRATION_DISCONNECTED: "Disconnected",
    INTEGRATION_CREDENTIAL_MISSING: "Credential missing or expired",
    SELFX_STORE_ACTIVE: "Store active",
    SELFX_STORE_SUSPENDED: "Store suspended",
    SELFX_STORE_INACTIVE: "Store inactive",
  };
  return labels[reason] ?? reason.replaceAll("_", " ").toLowerCase();
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  return "Integration settings could not be loaded.";
}
