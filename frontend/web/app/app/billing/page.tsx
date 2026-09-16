"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIcon,
  BarChart3Icon,
  CheckCircle2Icon,
  CreditCardIcon,
  DownloadIcon,
  MonitorIcon,
  RefreshCwIcon,
  SparklesIcon,
  TimerResetIcon,
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
import {
  getCurrentMerchantStore,
  type CurrentStore,
} from "@/lib/current-store";
import {
  listAvailablePricingPlans,
  listPlanFeatures,
  type PlanFeature,
  type PricingPlan,
} from "@/lib/pricing";
import { useSession } from "@/lib/session";
import {
  getStore,
  getStoreCreditDiagnostics,
  listStores,
  type AdminStore,
  type AdminStoreDetail,
  type StoreCreditDiagnostics,
  type StoreSubscriptionSummary,
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

export default function BillingPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [range, setRange] = useState<UsageRangePreset>("30d");
  const [storeId, setStoreId] = useState("");
  const [currentStore, setCurrentStore] = useState<CurrentStore | null>(null);
  const [platformAccess, setPlatformAccess] =
    useState<CurrentPlatformAccess | null>(null);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [clientStores, setClientStores] = useState<AdminStore[]>([]);
  const [billingStore, setBillingStore] = useState<AdminStoreDetail | null>(
    null,
  );
  const [creditDiagnostics, setCreditDiagnostics] =
    useState<StoreCreditDiagnostics | null>(null);
  const [availablePlans, setAvailablePlans] = useState<PricingPlan[]>([]);
  const [planFeatures, setPlanFeatures] = useState<PlanFeature[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasPlatformUsageAccess = Boolean(
    platformAccess?.isSuperadmin ||
    platformAccess?.permissions.includes("USAGE_VIEW"),
  );
  const canChooseStoreScope = Boolean(
    platformAccess?.isSuperadmin ||
    platformAccess?.permissions.includes("STORES_VIEW"),
  );

  useEffect(() => {
    if (!accessToken) {
      setPlatformAccess(null);
      setStoreOptions([]);
      setClientStores([]);
      setStoreId("");
      setCurrentStore(null);
      return;
    }

    const token = accessToken;
    let cancelled = false;

    async function loadAccess() {
      setError(null);
      try {
        const access = await getCurrentPlatformAccess(token).catch(() => ({
          isSuperadmin: false,
          permissions: [] as CurrentPlatformAccess["permissions"],
        }));
        if (cancelled) return;
        setPlatformAccess(access);

        if (access.isSuperadmin || access.permissions.includes("STORES_VIEW")) {
          const stores = await listStores(token, { pageSize: 100 });
          if (cancelled) return;
          setClientStores(stores.data);
          setStoreOptions(stores.data.map(storeOptionFromAdminStore));
          return;
        }

        const store = await getCurrentMerchantStore(token);
        if (cancelled) return;
        setCurrentStore(store);
        const options = store ? [{ id: store.id, name: store.name }] : [];
        setStoreOptions(options);
        setStoreId((current) => current || options[0]?.id || "");
      } catch (caught) {
        if (!cancelled) {
          setError(messageFor(caught));
          setPlatformAccess({ isSuperadmin: false, permissions: [] });
        }
      }
    }

    void loadAccess();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const loadBilling = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    const effectiveStoreId = canChooseStoreScope ? storeId : currentStore?.id;
    setBillingLoading(true);
    try {
      const [plans, features, store, diagnostics] = await Promise.all([
        listAvailablePricingPlans(accessToken),
        listPlanFeatures(accessToken).catch(() => []),
        effectiveStoreId ? getStore(accessToken, effectiveStoreId) : null,
        effectiveStoreId
          ? getStoreCreditDiagnostics(accessToken, effectiveStoreId).catch(
              () => null,
            )
          : null,
      ]);
      setAvailablePlans(plans);
      setPlanFeatures(features);
      setBillingStore(store);
      setCreditDiagnostics(diagnostics);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBillingLoading(false);
    }
  }, [accessToken, canChooseStoreScope, currentStore?.id, storeId]);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  const loadSummary = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    if (!hasPlatformUsageAccess && !storeId) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextSummary = await getUsageSummary(accessToken, {
        range,
        storeId: storeId || undefined,
        limit: 10,
      });
      setSummary(nextSummary);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, hasPlatformUsageAccess, range, storeId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const filteredStoreName = useMemo(
    () => storeOptions.find((store) => store.id === storeId)?.name ?? null,
    [storeId, storeOptions],
  );

  const pageStatus = canChooseStoreScope
    ? filteredStoreName
      ? filteredStoreName
      : "All clients"
    : (billingStore?.subscription.subscription?.status ?? "Store billing");

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow={canChooseStoreScope ? "Platform billing" : "Your billing"}
        title="Billing"
        description={
          canChooseStoreScope
            ? "Review client plans, credit balances and usage from one place."
            : "See your current plan, Try-On credit balance, billing history and available upgrades."
        }
        status={<Badge variant="secondary">{pageStatus}</Badge>}
        actions={
          <Button
            variant="outline"
            onClick={() => {
              void loadBilling();
              void loadSummary();
            }}
          >
            <RefreshCwIcon aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {error ? (
        <PageSection>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        </PageSection>
      ) : null}

      <PageSection>
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[12rem_minmax(0,18rem)_1fr]">
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
          {canChooseStoreScope ? (
            <label className="grid gap-2 text-sm font-medium">
              Client
              <SelectMenu
                ariaLabel="Client"
                value={storeId}
                disabled={storeOptions.length === 0}
                options={[
                  ...(hasPlatformUsageAccess
                    ? [{ value: "", label: "All clients" }]
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
          ) : (
            <div className="grid gap-2 text-sm font-medium">
              SelfX account
              <div className="flex h-11 items-center rounded-md border bg-muted/25 px-3 text-sm font-normal">
                {billingStore?.name ?? currentStore?.name ?? "Your Store"}
              </div>
            </div>
          )}
          <div className="flex items-end text-sm text-muted-foreground">
            {summary
              ? `${formatDate(summary.range.from)} to ${formatDate(summary.range.to)}`
              : "Usage and credit events come from SelfX billing ledgers."}
          </div>
        </div>
      </PageSection>

      {canChooseStoreScope ? (
        <PageSection>
          <ClientBillingTable stores={clientStores} loading={billingLoading} />
        </PageSection>
      ) : (
        <MerchantBilling
          store={billingStore}
          diagnostics={creditDiagnostics}
          plans={availablePlans}
          features={planFeatures}
          loading={billingLoading}
        />
      )}

      <PageSection>
        <StatGrid>
          <StatCard
            label="Sessions"
            value={displayNumber(summary?.totals.sessionsStarted)}
            secondaryValue={`${displayNumber(summary?.totals.sessionsCompleted)} completed`}
            icon={<ActivityIcon size={18} aria-hidden="true" />}
          />
          <StatCard
            label="Generated Looks"
            value={displayNumber(summary?.totals.tryOnsGenerated)}
            secondaryValue="Successful Try-On outputs"
            icon={<SparklesIcon size={18} aria-hidden="true" />}
          />
          <StatCard
            label="Downloads"
            value={displayNumber(summary?.totals.downloadsCompleted)}
            secondaryValue={`${displayPercent(summary?.totals.downloadRate)} download rate`}
            icon={<DownloadIcon size={18} aria-hidden="true" />}
          />
          <StatCard
            label="Idle Returns"
            value={displayNumber(summary?.totals.sessionsIdleExpired)}
            secondaryValue="Sessions reset by inactivity"
            icon={<TimerResetIcon size={18} aria-hidden="true" />}
          />
        </StatGrid>
      </PageSection>

      <PageSection>
        <div className="grid gap-4 xl:grid-cols-2">
          <UsageTable
            title="Provider Usage"
            icon={<CreditCardIcon size={18} aria-hidden="true" />}
            empty="No provider usage in this range."
            loading={loading}
            headers={["Provider", "Model", "Looks"]}
            rows={(summary?.providerUsage ?? []).map((row) => [
              row.provider,
              row.providerModel ?? "-",
              displayNumber(row.tryOnsGenerated),
            ])}
          />
          <UsageTable
            title="Top Stores"
            icon={<BarChart3Icon size={18} aria-hidden="true" />}
            empty="No Store usage in this range."
            loading={loading}
            headers={["Store", "Sessions", "Looks", "Downloads"]}
            rows={(summary?.stores ?? []).map((row) => [
              row.storeName,
              displayNumber(row.sessionsStarted),
              displayNumber(row.tryOnsGenerated),
              displayNumber(row.downloadsCompleted),
            ])}
          />
          <UsageTable
            title="Top Kiosks"
            icon={<MonitorIcon size={18} aria-hidden="true" />}
            empty="No kiosk usage in this range."
            loading={loading}
            headers={["Kiosk", "Store", "Looks", "Downloads"]}
            rows={(summary?.kiosks ?? []).map((row) => [
              row.displayName,
              row.storeName ?? "Platform fleet",
              displayNumber(row.tryOnsGenerated),
              displayNumber(row.downloadsCompleted),
            ])}
          />
        </div>
      </PageSection>
    </PageContainer>
  );
}

function MerchantBilling({
  store,
  diagnostics,
  plans,
  features,
  loading,
}: {
  store: AdminStoreDetail | null;
  diagnostics: StoreCreditDiagnostics | null;
  plans: PricingPlan[];
  features: PlanFeature[];
  loading: boolean;
}) {
  const subscription = store?.subscription ?? null;
  const plan = subscription?.subscription?.pricingPlan ?? null;
  const status = subscription?.subscription?.status ?? "TRIALING";
  const currentPlanName =
    plan?.name ?? (status === "TRIALING" ? "Free trial" : "No plan assigned");

  return (
    <>
      <PageSection>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
          <div className="rounded-lg border bg-card">
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div className="flex items-start gap-3">
                <div className="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary">
                  <SparklesIcon size={22} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Current plan</h2>
                  <p className="text-sm text-muted-foreground">
                    Your active SelfX subscription for this Store account.
                  </p>
                </div>
              </div>
              <Badge variant={status === "ACTIVE" ? "default" : "secondary"}>
                {statusLabel(status)}
              </Badge>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <BillingMetric
                label="Plan"
                value={loading ? "Loading..." : currentPlanName}
                detail={
                  plan
                    ? money(plan.monthlyPriceCents, plan.currency)
                    : "Trial credits only"
                }
              />
              <BillingMetric
                label="Credits available"
                value={displayNumber(subscription?.availableCredits)}
                detail={`${displayNumber(diagnostics?.totals.consumedCredits)} consumed`}
              />
              <BillingMetric
                label="Period"
                value={periodLabel(subscription)}
                detail={resetLabel(subscription)}
              />
            </div>
          </div>

          <div className="rounded-lg border bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-lg bg-amber-100 text-amber-700">
                <CreditCardIcon size={20} aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Credit balance</h2>
                <p className="text-sm text-muted-foreground">
                  Credits are shared by Shopify, WooCommerce and kiosks.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <PlanLine
                label="Granted"
                value={displayNumber(diagnostics?.totals.grantedCredits)}
              />
              <PlanLine
                label="Manual adjustments"
                value={displayNumber(diagnostics?.totals.manualAdjustments)}
              />
              <PlanLine
                label="Net balance"
                value={displayNumber(diagnostics?.totals.netCredits)}
              />
            </div>
          </div>
        </div>
      </PageSection>

      <PageSection>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <BillingHistoryTable diagnostics={diagnostics} loading={loading} />
          <AvailablePlansPanel
            plans={plans}
            features={features}
            currentPlanId={plan?.id ?? null}
          />
        </div>
      </PageSection>
    </>
  );
}

function ClientBillingTable({
  stores,
  loading,
}: {
  stores: AdminStore[];
  loading: boolean;
}) {
  return (
    <TableContainer
      title="Client Billing"
      actions={<CreditCardIcon size={18} aria-hidden="true" />}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Subscription</TableHead>
            <TableHead>Credits</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5}>Loading clients...</TableCell>
            </TableRow>
          ) : stores.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>No clients found.</TableCell>
            </TableRow>
          ) : (
            stores.map((store) => {
              const subscription = store.subscription;
              const plan = subscription?.subscription?.pricingPlan ?? null;
              return (
                <TableRow key={store.id}>
                  <TableCell>
                    <div className="font-medium">{store.name}</div>
                    <div className="text-xs text-muted-foreground">
                      /{store.slug}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        store.status === "ACTIVE" ? "default" : "secondary"
                      }
                    >
                      {store.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{plan?.name ?? "No plan assigned"}</TableCell>
                  <TableCell>
                    {statusLabel(
                      subscription?.subscription?.status ?? "TRIALING",
                    )}
                  </TableCell>
                  <TableCell>
                    {displayNumber(subscription?.availableCredits)}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function BillingHistoryTable({
  diagnostics,
  loading,
}: {
  diagnostics: StoreCreditDiagnostics | null;
  loading: boolean;
}) {
  const rows = diagnostics?.recentLedgerEntries ?? [];
  return (
    <TableContainer
      title="Billing History"
      actions={<TimerResetIcon size={18} aria-hidden="true" />}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Event</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Credits</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={4}>Loading billing history...</TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4}>No billing history yet.</TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="font-medium">
                    {ledgerLabel(row.entryType)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {row.reason ?? "SelfX billing event"}
                  </div>
                </TableCell>
                <TableCell>{channelLabel(row.channel)}</TableCell>
                <TableCell>{signedNumber(row.quantity)}</TableCell>
                <TableCell>{formatDate(row.occurredAt)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function AvailablePlansPanel({
  plans,
  features,
  currentPlanId,
}: {
  plans: PricingPlan[];
  features: PlanFeature[];
  currentPlanId: string | null;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b p-5">
        <h2 className="text-lg font-semibold">Available plans</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Online payment is not enabled yet. Contact SelfX support to upgrade,
          downgrade or change channels.
        </p>
      </div>
      <div className="grid gap-3 p-5">
        {plans.length === 0 ? (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            No active plans are available right now.
          </div>
        ) : (
          plans.map((plan) => {
            const featureLabels = labelsForFeatureKeys(
              plan.featureKeys,
              features,
            );
            return (
              <div
                key={plan.id}
                className="rounded-lg border bg-background p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{plan.name}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {money(plan.monthlyPriceCents, plan.currency)} / month
                    </div>
                  </div>
                  {plan.id === currentPlanId ? (
                    <Badge variant="default">Current</Badge>
                  ) : (
                    <Badge variant="secondary">
                      {plan.channels.join(", ")}
                    </Badge>
                  )}
                </div>
                <div className="mt-4 grid gap-2 text-sm">
                  <PlanLine
                    label="Included credits"
                    value={displayNumber(plan.includedCredits)}
                  />
                  <PlanLine
                    label="Trial credits"
                    value={displayNumber(plan.trialCredits)}
                  />
                  <PlanLine
                    label="Store locations"
                    value={
                      plan.storeLocationLimit === null
                        ? "Custom"
                        : displayNumber(plan.storeLocationLimit)
                    }
                  />
                  <PlanLine
                    label="Kiosk devices"
                    value={
                      plan.kioskDeviceLimit === null
                        ? "Not limited"
                        : displayNumber(plan.kioskDeviceLimit)
                    }
                  />
                </div>
                {featureLabels.length > 0 ? (
                  <ul className="mt-4 grid gap-2 border-t pt-4 text-sm">
                    {featureLabels.slice(0, 6).map((label) => (
                      <li key={label} className="flex items-start gap-2">
                        <CheckCircle2Icon
                          size={16}
                          aria-hidden="true"
                          className="mt-0.5 shrink-0 text-emerald-600"
                        />
                        <span>{label}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Button className="mt-4 w-full" variant="outline" disabled>
                  Contact support
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function UsageTable({
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
              <TableCell colSpan={headers.length}>Loading usage...</TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={headers.length}>{empty}</TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow key={`${title}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <TableCell
                    key={`${title}-${index}-${cellIndex}`}
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

function BillingMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

function PlanLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function storeOptionFromAdminStore(store: AdminStore): StoreOption {
  return { id: store.id, name: store.name };
}

function periodLabel(subscription: StoreSubscriptionSummary | null): string {
  if (!subscription?.subscription?.currentPeriodStart) {
    return "Trial";
  }
  return formatDate(subscription.subscription.currentPeriodStart);
}

function resetLabel(subscription: StoreSubscriptionSummary | null): string {
  const end = subscription?.subscription?.currentPeriodEnd;
  return end ? `Renews ${formatDate(end)}` : "No renewal scheduled";
}

function statusLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ledgerLabel(value: string): string {
  if (value === "TRIAL_GRANTED") return "Trial credits granted";
  if (value === "PLAN_GRANTED") return "Plan credits granted";
  if (value === "CREDIT_CONSUMED") return "Try-On credit consumed";
  if (value === "MANUAL_ADJUSTMENT") return "Manual credit adjustment";
  return statusLabel(value);
}

function channelLabel(value: string | null): string {
  if (!value) return "SelfX";
  if (value === "PUBLIC_API") return "Public API";
  return statusLabel(value);
}

function labelsForFeatureKeys(
  featureKeys: string[],
  features: PlanFeature[],
): string[] {
  const labels = new Map(
    features.map((feature) => [feature.key, feature.displayName]),
  );
  return featureKeys.map((key) => labels.get(key) ?? key);
}

function signedNumber(value: number): string {
  return `${value > 0 ? "+" : ""}${displayNumber(value)}`;
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

function money(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(value / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  if (caught instanceof Error) {
    return caught.message;
  }
  return "Billing could not be loaded.";
}
