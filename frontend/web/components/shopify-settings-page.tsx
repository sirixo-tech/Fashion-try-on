"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRightIcon,
  LinkIcon,
  PackageIcon,
  RefreshCwIcon,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@selfx/ui";
import { hasStoreResourcePermission } from "@/lib/current-store";
import {
  disconnectIntegration,
  getShopifyOverview,
  listIntegrations,
  startShopifyOauth,
  syncShopifyCatalog,
  type StoreIntegration,
  type CommerceOverviewRow,
} from "@/lib/integrations";
import {
  getEffectiveStorePermissions,
  getStore,
  getStoreCreditDiagnostics,
  type EffectiveStorePermissions,
  type StoreCreditDiagnostics,
  type StoreSubscriptionSummary,
} from "@/lib/stores";
import {
  CommerceIntegrationPage,
  ErrorNotice,
  HealthBadge,
  Metric,
  SyncDate,
  Website,
  messageFor,
  type CommerceDetailProps,
} from "./commerce-integration-page";

export function ShopifySettingsPage() {
  return (
    <CommerceIntegrationPage
      type="SHOPIFY"
      title="Shopify"
      renderDetails={(props) => <ShopifyStoreDetail {...props} />}
    />
  );
}

function ShopifyStoreDetail({
  accessToken,
  storeId,
  storeName,
  canManage,
}: CommerceDetailProps) {
  const [integration, setIntegration] = useState<StoreIntegration | null>(null);
  const [row, setRow] = useState<CommerceOverviewRow | null>(null);
  const [permissions, setPermissions] =
    useState<EffectiveStorePermissions | null>(null);
  const [subscription, setSubscription] =
    useState<StoreSubscriptionSummary | null>(null);
  const [diagnostics, setDiagnostics] = useState<StoreCreditDiagnostics | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [shop, setShop] = useState("");
  const mounted = useRef(false);
  const requestVersion = useRef(0);
  const refreshConnection = useCallback(async () => {
    const version = ++requestVersion.current;
    const [connections, overview] = await Promise.all([
      listIntegrations(accessToken, { storeId, type: "SHOPIFY" }),
      getShopifyOverview(accessToken, { storeId }),
    ]);
    if (!mounted.current || version !== requestVersion.current) return;
    const current = connections.data[0] ?? null;
    setIntegration(current);
    setRow(overview.data[0] ?? null);
    setShop(current?.shopDomain ?? "");
  }, [accessToken, storeId]);

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    setLoading(true);
    const version = requestVersion.current;
    void (async () => {
      try {
        await refreshConnection();
        if (cancelled || !mounted.current) return;
        const [access, store, credits] = await Promise.all([
          getEffectiveStorePermissions(accessToken, storeId).catch(() => null),
          getStore(accessToken, storeId).catch(() => null),
          getStoreCreditDiagnostics(accessToken, storeId).catch(() => null),
        ]);
        if (
          !cancelled &&
          mounted.current &&
          requestVersion.current === version + 1
        ) {
          setPermissions(access);
          setSubscription(store?.subscription ?? null);
          setDiagnostics(credits);
        }
      } catch (caught) {
        if (!cancelled && mounted.current) setError(messageFor(caught));
      } finally {
        if (!cancelled && mounted.current) setLoading(false);
      }
    })();
    const params = new URLSearchParams(window.location.search);
    if (!params.get("storeId") || params.get("storeId") === storeId) {
      if (params.get("oauth") === "sync_failed")
        setError(
          "Shopify connected, but the first catalog sync failed. Use Sync Catalog to try again.",
        );
      if (params.get("oauth") === "success")
        setNotice(
          "Shopify catalog access was saved. If the embedded Shopify app asks to reconnect, approve this Store in SelfX to finish the app link.",
        );
    }
    return () => {
      cancelled = true;
      mounted.current = false;
      requestVersion.current += 1;
    };
  }, [accessToken, storeId, refreshConnection]);

  const canManageCatalog =
    canManage && hasStoreResourcePermission(permissions, "products.manage");
  const connected = Boolean(
    integration && integration.status !== "DISCONNECTED",
  );
  const domain =
    integration?.shopDomain &&
    /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(integration.shopDomain)
      ? integration.shopDomain
      : null;
  const name = integration?.storeName ?? storeName ?? "SelfX Store";
  const payg =
    subscription?.subscription?.pricingPlan?.billingMode === "POSTPAID_PAYG";
  const plan = subscription?.subscription;
  const channelCredits = diagnostics?.byChannel.find(
    (channel) => channel.channel === "SHOPIFY",
  );

  async function connect() {
    if (!canManageCatalog || busy || !shop.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await startShopifyOauth(accessToken, {
        storeId,
        shop: shop.trim(),
      });
      if (mounted.current) window.location.assign(result.authorizationUrl);
    } catch (caught) {
      if (mounted.current) {
        setError(messageFor(caught));
        setConnectOpen(false);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function sync() {
    if (!canManageCatalog || !integration || !connected || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await syncShopifyCatalog(accessToken, integration.id);
      await refreshConnection();
      if (mounted.current) setNotice("Shopify catalog sync completed.");
    } catch (caught) {
      if (mounted.current) setError(messageFor(caught));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function disconnect() {
    if (!canManage || !integration || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await disconnectIntegration(accessToken, integration.id);
      if (mounted.current) {
        requestVersion.current += 1;
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
      {notice ? (
        <div
          role="status"
          className="rounded-xl border bg-muted/30 p-4 text-sm"
        >
          {notice}
        </div>
      ) : null}
      <Card>
        <CardContent className="space-y-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <StoreIcon />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-tight">{name}</h2>
                <div className="mt-1 text-sm text-muted-foreground">
                  <Website
                    value={domain ? `https://${domain}` : null}
                    empty="Connect your Shopify Store"
                  />
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
              note="Active Shopify products"
            />
            <Metric
              label="Successful Try-Ons"
              value={row ? String(row.successfulTryOns) : "—"}
              icon={<WandSparklesIcon size={16} />}
              note="Shopify · last 30 days"
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
                <dt className="text-muted-foreground">Shop name</dt>
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
          {canManageCatalog ? (
            <div className="flex flex-wrap gap-2 border-t pt-5">
              <Button disabled={busy} onClick={() => setConnectOpen(true)}>
                <LinkIcon aria-hidden="true" />
                {connected ? "Reconnect Shopify" : "Connect Shopify"}
              </Button>
              {connected ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void sync()}
                >
                  <RefreshCwIcon aria-hidden="true" />
                  Sync Catalog
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="gap-4 sm:flex sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Shopify setup</CardTitle>
            <p className="text-sm text-muted-foreground">
              Connect your catalog and bring Try-On to your product pages.
            </p>
          </div>
          {domain ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <a
                  href={`https://${domain}/admin`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <ArrowUpRightIcon aria-hidden="true" />
              Open Shopify admin
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5">
          <ol className="grid gap-5 md:grid-cols-3">
            {[
              {
                title: "Connect Shopify",
                description:
                  "Authorize read-only catalog access for this SelfX Store. Approve the same Store if the embedded SelfX app requests its connection.",
              },
              {
                title: "Enable Try-On products",
                description:
                  "Open the SelfX app inside Shopify to review product images and choose which products offer Try-On.",
              },
              {
                title: "Add to your storefront",
                description:
                  "Add the SelfX Try-On app block to your product template in Shopify’s theme editor.",
              },
            ].map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">{step.title}</h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="border-t pt-4 text-xs leading-5 text-muted-foreground">
            Shopify manages product details, options, cart and checkout. The
            SelfX app in Shopify manages product Try-On settings and Shopify
            plan approvals.
          </p>
        </CardContent>
      </Card>
      {subscription ? (
        <Card>
          <CardHeader>
            <CardTitle>SelfX plan & usage</CardTitle>
            <p className="text-sm text-muted-foreground">
              Your Store’s plan and allowance are shared across SelfX channels.
            </p>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Current plan</dt>
                <dd className="mt-2 font-semibold">
                  {plan?.pricingPlan?.name ??
                    plan?.pricingPlan?.code ??
                    "No plan"}
                </dd>
                {plan ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {plan.status}
                  </p>
                ) : null}
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {payg ? "Billable Try-Ons this period" : "Available credits"}
                </dt>
                <dd className="mt-2 text-xl font-semibold tabular-nums">
                  {payg
                    ? subscription.postpaid
                      ? String(subscription.postpaid.billableCredits)
                      : "—"
                    : subscription.availableCredits}
                </dd>
                <p className="mt-1 text-xs text-muted-foreground">
                  All SelfX channels
                </p>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  Current plan period ends
                </dt>
                <dd className="mt-2">
                  <SyncDate
                    value={plan?.currentPeriodEnd ?? null}
                    empty="Not available"
                  />
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      ) : null}
      {diagnostics ? (
        <Card className="gap-0 py-0">
          <Collapsible>
            <CollapsibleTrigger className="rounded-xl px-5 py-4">
              Credit diagnostics
              <span className="text-xs font-normal text-muted-foreground">
                Shared Store allowance
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid gap-4 border-t p-5 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">Credits granted</p>
                  <p className="mt-2 font-semibold">
                    {diagnostics.totals.grantedCredits}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">
                    Credits consumed · all channels
                  </p>
                  <p className="mt-2 font-semibold">
                    {diagnostics.totals.consumedCredits}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">
                    Shopify credits consumed
                  </p>
                  <p className="mt-2 font-semibold">
                    {channelCredits?.consumedCredits ?? 0}
                  </p>
                </div>
                {diagnostics.topProducts[0] ? (
                  <div className="border-t pt-4 sm:col-span-3">
                    <p className="text-muted-foreground">
                      Most used product · all channels
                    </p>
                    <p className="mt-1 font-medium">
                      {diagnostics.topProducts[0].productName}
                    </p>
                  </div>
                ) : null}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      ) : null}
      {integration && canManage && connected ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm font-medium">Disconnect Shopify</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Stops catalog sync and storefront Try-Ons for this Store.
              </p>
            </div>
            <ConfirmDialog
              title="Disconnect Shopify?"
              description="Disconnecting stops catalog sync and storefront Try-On launches until Shopify is connected again."
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
      <Dialog
        open={connectOpen}
        onOpenChange={(open) => {
          if (!busy) setConnectOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {connected ? "Reconnect Shopify" : "Connect Shopify"}
            </DialogTitle>
            <DialogDescription>
              Authorize read-only product access for {name}. Reconnecting keeps
              this SelfX Store.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-2 text-sm">
            <span>Shop domain</span>
            <Input
              value={shop}
              maxLength={180}
              placeholder="my-shop.myshopify.com"
              disabled={busy}
              onChange={(event) => setShop(event.target.value)}
            />
          </label>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConnectOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !shop.trim() || !canManageCatalog}
              onClick={() => void connect()}
            >
              <LinkIcon aria-hidden="true" />
              Continue to Shopify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function healthExplanation(reasons: string[]) {
  if (reasons.some((reason) => reason.startsWith("SELFX_STORE_")))
    return "The SelfX Store is inactive. A platform administrator must review its status before the connection can be used.";
  if (reasons.includes("CENTRAL_INTEGRATION_ERROR"))
    return "The Shopify catalog sync needs a retry. Use Sync Catalog, or reconnect Shopify if access needs to be renewed.";
  if (reasons.includes("INTEGRATION_CREDENTIAL_MISSING"))
    return "Open the SelfX app inside Shopify, choose Reconnect Store and approve this Store in SelfX to finish the app link.";
  return "Review this Store’s connection in the SelfX app inside Shopify.";
}
