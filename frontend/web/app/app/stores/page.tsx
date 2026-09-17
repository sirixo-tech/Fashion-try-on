"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  BanIcon,
  CalendarDaysIcon,
  CreditCardIcon,
  EyeIcon,
  MailIcon,
  MapPinIcon,
  MonitorIcon,
  PlusIcon,
  PowerIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldAlertIcon,
  StoreIcon,
  Trash2Icon,
  UserCircleIcon,
} from "lucide-react";

import {
  buttonVariants,
  Button,
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
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
  SelectMenu,
  StatusBadge,
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import { listPricingPlans, type PricingPlan } from "@/lib/pricing";
import { useSession } from "@/lib/session";
import {
  activateStore,
  assignStorePricingPlan,
  deactivateStore,
  deleteStore,
  listStores,
  startStoreImpersonation,
  type AdminStore,
  type StoreStatus,
} from "@/lib/stores";

const statusOptions: Array<StoreStatus | "ALL"> = ["ALL", "ACTIVE", "INACTIVE"];

export default function StoresPage() {
  const router = useRouter();
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StoreStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingStoreId, setDeletingStoreId] = useState<string | null>(null);
  const [statusStoreId, setStatusStoreId] = useState<string | null>(null);
  const [impersonatingStoreId, setImpersonatingStoreId] = useState<
    string | null
  >(null);
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([]);
  const [pricingPlansLoading, setPricingPlansLoading] = useState(false);
  const [planDialogStore, setPlanDialogStore] = useState<AdminStore | null>(
    null,
  );
  const [planStoreId, setPlanStoreId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await listStores(accessToken, {
        page,
        pageSize: 25,
        search,
        status,
        sort: "createdDesc",
      });
      setStores(response.data);
      setTotal(response.pagination.total);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, page, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadPricingPlanOptions = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setPricingPlansLoading(true);
    try {
      const plans = await listPricingPlans(accessToken);
      setPricingPlans(plans);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setPricingPlansLoading(false);
    }
  }, [accessToken]);

  const activeCount = useMemo(
    () => stores.filter((store) => store.status === "ACTIVE").length,
    [stores],
  );

  async function removeStore(storeId: string) {
    if (!accessToken) {
      return;
    }
    setDeletingStoreId(storeId);
    setError(null);
    try {
      const archived = await deleteStore(accessToken, storeId);
      setStores((current) =>
        current.filter((store) => store.id !== archived.id),
      );
      setTotal((current) => Math.max(0, current - 1));
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setDeletingStoreId(null);
    }
  }

  async function changeStoreStatus(store: AdminStore) {
    if (!accessToken) {
      return;
    }
    const nextStatus = store.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setStatusStoreId(store.id);
    setError(null);
    try {
      const updated =
        nextStatus === "ACTIVE"
          ? await activateStore(accessToken, store.id)
          : await deactivateStore(accessToken, store.id);
      const keepInCurrentView = shouldShowStoreForStatus(updated, status);
      setStores((current) =>
        keepInCurrentView
          ? current.map((item) => (item.id === updated.id ? updated : item))
          : current.filter((item) => item.id !== updated.id),
      );
      if (!keepInCurrentView) {
        setTotal((current) => Math.max(0, current - 1));
      }
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setStatusStoreId(null);
    }
  }

  async function impersonateStore(store: AdminStore) {
    if (!accessToken) {
      return;
    }
    setImpersonatingStoreId(store.id);
    setError(null);
    try {
      await startStoreImpersonation(accessToken, store.id);
      window.dispatchEvent(new Event("selfx:impersonation-changed"));
      router.push("/app/dashboard");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setImpersonatingStoreId(null);
    }
  }

  function openPlanDialog(store: AdminStore) {
    setPlanDialogStore(store);
    if (pricingPlans.length === 0 && !pricingPlansLoading) {
      void loadPricingPlanOptions();
    }
  }

  async function assignPlan(store: AdminStore, pricingPlanId: string) {
    if (!accessToken) {
      return;
    }
    setPlanStoreId(store.id);
    setError(null);
    try {
      const subscription = await assignStorePricingPlan(
        accessToken,
        store.id,
        pricingPlanId,
      );
      setStores((current) =>
        current.map((item) =>
          item.id === store.id ? { ...item, subscription } : item,
        ),
      );
      setPlanDialogStore((current) =>
        current?.id === store.id ? { ...current, subscription } : current,
      );
    } finally {
      setPlanStoreId(null);
    }
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Platform"
        title="Stores"
        description="Create and manage merchant Stores, then pair and configure their SelfX kiosks."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            <Button onClick={() => router.push("/app/stores/create")}>
              <PlusIcon aria-hidden="true" />
              Add Store
            </Button>
          </div>
        }
        status={<StatusBadge status="ACTIVE" label={`${activeCount} active`} />}
      />

      <PageSection>
        <div className="space-y-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold tracking-tight">
              Store directory
            </h2>
            <p className="text-sm text-muted-foreground">
              {total} Stores found. Store is the merchant tenant for SelfX
              kiosks.
            </p>
          </div>

          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex-1 space-y-2 text-sm">
              <span className="font-medium">Search</span>
              <div className="relative">
                <SearchIcon
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  size={16}
                  aria-hidden="true"
                />
                <Input
                  className="pl-9"
                  value={search}
                  placeholder="Search Store name or slug"
                  onChange={(event) => {
                    setPage(1);
                    setSearch(event.target.value);
                  }}
                />
              </div>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Status</span>
              <SelectMenu
                ariaLabel="Status"
                value={status}
                options={statusOptions.map((option) => ({
                  value: option,
                  label: option === "ALL" ? "All Stores" : option,
                }))}
                className="min-w-40"
                onChange={(value) => {
                  setPage(1);
                  setStatus(value);
                }}
              />
            </label>
          </div>

          {error ? (
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <ShieldAlertIcon size={18} aria-hidden="true" />
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className="h-72 animate-pulse rounded-xl border bg-card"
                />
              ))}
            </div>
          ) : stores.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed bg-background p-8 text-muted-foreground">
              <StoreIcon size={20} aria-hidden="true" />
              No Stores yet. Create your first Store to start pairing and
              managing SelfX kiosks.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {stores.map((store) => (
                <StoreDirectoryCard
                  key={store.id}
                  store={store}
                  deleting={deletingStoreId === store.id}
                  statusChanging={statusStoreId === store.id}
                  impersonating={impersonatingStoreId === store.id}
                  onDelete={() => void removeStore(store.id)}
                  onChangeStatus={() => void changeStoreStatus(store)}
                  onImpersonate={() => void impersonateStore(store)}
                  onManagePlan={() => openPlanDialog(store)}
                />
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {page}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page * 25 >= total}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </PageSection>

      <StorePlanDialog
        store={planDialogStore}
        plans={pricingPlans}
        loading={pricingPlansLoading}
        assigning={planDialogStore?.id === planStoreId}
        onOpenChange={(open) => {
          if (!open) {
            setPlanDialogStore(null);
          }
        }}
        onReloadPlans={loadPricingPlanOptions}
        onAssign={assignPlan}
      />
    </PageContainer>
  );
}

function StoreDirectoryCard({
  store,
  deleting,
  statusChanging,
  impersonating,
  onDelete,
  onChangeStatus,
  onImpersonate,
  onManagePlan,
}: {
  store: AdminStore;
  deleting: boolean;
  statusChanging: boolean;
  impersonating: boolean;
  onDelete: () => void;
  onChangeStatus: () => void;
  onImpersonate: () => void;
  onManagePlan: () => void;
}) {
  const active = store.status === "ACTIVE";
  const location = storeLocation(store);
  const ownerEmail = store.contactEmail ?? "No owner/contact email";
  const subscription = store.subscription;
  const currentPlan = subscription?.subscription?.pricingPlan ?? null;

  return (
    <Card
      className={
        active
          ? "border-t-4 border-t-emerald-500"
          : "border-t-4 border-t-amber-500"
      }
    >
      <CardHeader className="gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary text-base font-bold text-primary-foreground shadow-sm">
            {storeInitials(store.name)}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-lg font-semibold">
              {store.name}
            </CardTitle>
            <div className="truncate text-xs text-muted-foreground">
              /{store.slug}
            </div>
          </div>
        </div>
        <CardAction>
          <StatusBadge status={store.status} label={store.status} />
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <CreditCardIcon
              size={16}
              className="shrink-0 text-primary"
              aria-hidden="true"
            />
            <span className="truncate text-sm font-semibold">
              {currentPlan?.name ?? "No plan assigned"}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {subscription
              ? `${formatNumber(subscription.availableCredits)} credits available`
              : "Assign a plan to activate credits"}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 border-y py-3">
          <StoreMetric label="Kiosks" value={store.totalKiosks} />
          <StoreMetric label="Active" value={store.activeKiosks} />
          <StoreMetric label="Offline" value={store.offlineKiosks} />
        </div>

        <div className="space-y-2.5">
          <StoreInfoLine
            icon={<MailIcon size={15} aria-hidden="true" />}
            label="Owner"
            value={ownerEmail}
          />
          <StoreInfoLine
            icon={<MapPinIcon size={15} aria-hidden="true" />}
            label="Location"
            value={location}
          />
          <StoreInfoLine
            icon={<RefreshCwIcon size={15} aria-hidden="true" />}
            label="Last activity"
            value={formatDate(store.lastActivityAt)}
          />
          <StoreInfoLine
            icon={<CalendarDaysIcon size={15} aria-hidden="true" />}
            label="Created"
            value={formatDate(store.createdAt)}
          />
        </div>
      </CardContent>

      <CardFooter className="justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <MonitorIcon size={15} aria-hidden="true" />
          <span className="truncate">
            {store.totalKiosks} assigned kiosk
            {store.totalKiosks === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`Change plan for ${store.name}`}
            title="Change plan"
            onClick={onManagePlan}
          >
            <CreditCardIcon aria-hidden="true" />
          </Button>

          <Link
            href={`/app/stores/${store.id}`}
            aria-label={`View ${store.name}`}
            title="View Store"
            className={buttonVariants({ variant: "outline", size: "icon-sm" })}
          >
            <EyeIcon aria-hidden="true" />
          </Link>

          <ConfirmDialog
            title={active ? "Suspend Store?" : "Reactivate Store?"}
            description={
              active
                ? "The Store will remain in SelfX, but inactive Stores cannot receive new kiosk assignments."
                : "The Store will become active again and can receive kiosk assignments."
            }
            confirmLabel={active ? "Suspend" : "Reactivate"}
            destructive={active}
            onConfirm={onChangeStatus}
            trigger={
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={active ? "Suspend Store" : "Reactivate Store"}
                title={active ? "Suspend Store" : "Reactivate Store"}
                disabled={statusChanging}
              >
                {active ? (
                  <BanIcon aria-hidden="true" />
                ) : (
                  <PowerIcon aria-hidden="true" />
                )}
              </Button>
            }
          />

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Impersonate Store owner"
            title="Impersonate Store owner"
            disabled={impersonating}
            onClick={onImpersonate}
          >
            <UserCircleIcon aria-hidden="true" />
          </Button>

          {active ? (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Delete Store"
              title="Suspend the Store before deleting"
              disabled
            >
              <Trash2Icon aria-hidden="true" />
            </Button>
          ) : (
            <ConfirmDialog
              title="Delete Store?"
              description="This archives the inactive Store and removes it from Store lists. Kiosk records, settings, products and audit history are retained."
              confirmLabel="Delete"
              destructive
              onConfirm={onDelete}
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Delete Store"
                  title="Delete Store"
                  disabled={deleting}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              }
            />
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

function StoreMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold leading-none text-foreground">
        {value}
      </div>
    </div>
  );
}

function StoreInfoLine({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-sm">
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="truncate text-foreground">{value}</div>
      </div>
    </div>
  );
}

function StorePlanDialog({
  store,
  plans,
  loading,
  assigning,
  onOpenChange,
  onReloadPlans,
  onAssign,
}: {
  store: AdminStore | null;
  plans: PricingPlan[];
  loading: boolean;
  assigning: boolean;
  onOpenChange: (open: boolean) => void;
  onReloadPlans: () => Promise<void>;
  onAssign: (store: AdminStore, pricingPlanId: string) => Promise<void>;
}) {
  const currentPlanId =
    store?.subscription?.subscription?.pricingPlan?.id ?? "";
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPlanId(currentPlanId);
    setError(null);
  }, [currentPlanId, store?.id]);

  const activePlans = useMemo(
    () => plans.filter((plan) => plan.status === "ACTIVE"),
    [plans],
  );
  const selectedPlan =
    activePlans.find((plan) => plan.id === selectedPlanId) ?? null;
  const currentPlan = store?.subscription?.subscription?.pricingPlan ?? null;
  const hasSelectionChanged =
    Boolean(selectedPlanId) && selectedPlanId !== currentPlanId;

  async function submitPlanChange() {
    if (!store || !selectedPlanId) {
      setError("Choose a plan before updating this Store.");
      return;
    }
    setError(null);
    try {
      await onAssign(store, selectedPlanId);
      onOpenChange(false);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }

  if (!store) {
    return null;
  }

  return (
    <Dialog open={Boolean(store)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
          <DialogDescription>
            Update the manual subscription plan for {store.name}. Changes apply
            immediately.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <PlanSummaryTile
              label="Current plan"
              value={currentPlan?.name ?? "No plan assigned"}
              detail={`${formatNumber(
                store.subscription?.availableCredits ?? 0,
              )} credits available`}
            />
            <PlanSummaryTile
              label="Selected plan"
              value={selectedPlan?.name ?? "Choose a plan"}
              detail={
                selectedPlan ? planDetail(selectedPlan) : "Ready to assign"
              }
            />
          </div>

          <label className="space-y-2 text-sm">
            <span className="font-medium">Plan</span>
            <SelectMenu
              ariaLabel="Plan"
              value={selectedPlanId}
              placeholder="Select a plan"
              disabled={loading || assigning}
              options={[
                {
                  value: "",
                  label: loading ? "Loading plans..." : "Select a plan",
                  disabled: true,
                },
                ...activePlans.map((plan) => ({
                  value: plan.id,
                  label: `${plan.name} - ${formatNumber(
                    plan.includedCredits,
                  )} credits`,
                })),
              ]}
              onChange={setSelectedPlanId}
            />
          </label>

          {selectedPlan ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="font-medium">{planDetail(selectedPlan)}</div>
              <div className="mt-1 text-muted-foreground">
                Channels: {selectedPlan.channels.join(", ") || "None"}
              </div>
            </div>
          ) : null}

          {activePlans.length === 0 && !loading ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              No active pricing plans are available. Create or activate a plan
              in the pricing control center first.
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={loading || assigning}
            onClick={() => void onReloadPlans()}
          >
            <RefreshCwIcon aria-hidden="true" />
            Refresh plans
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              loading ||
              assigning ||
              activePlans.length === 0 ||
              !hasSelectionChanged
            }
            onClick={() => void submitPlanChange()}
          >
            Update plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanSummaryTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value,
  );
}

function planDetail(plan: PricingPlan): string {
  const price = formatMoney(plan.monthlyPriceCents, plan.currency);
  return `${price} / month, ${formatNumber(plan.includedCredits)} included credits`;
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "-";
}

function storeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return (parts.map((part) => part[0]).join("") || "SX").toUpperCase();
}

function storeLocation(store: AdminStore): string {
  return (
    [store.city, store.stateRegion, store.country].filter(Boolean).join(", ") ||
    "-"
  );
}

function shouldShowStoreForStatus(
  store: AdminStore,
  selectedStatus: StoreStatus | "ALL",
): boolean {
  return selectedStatus === "ALL" || store.status === selectedStatus;
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  return "The Store request could not be completed.";
}
