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
  BanIcon,
  CalendarDaysIcon,
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
import { useSession } from "@/lib/session";
import {
  activateStore,
  createStore,
  deactivateStore,
  deleteStore,
  listStores,
  type AdminStore,
  type StoreInput,
  type StoreStatus,
} from "@/lib/stores";

const statusOptions: Array<StoreStatus | "ALL"> = ["ALL", "ACTIVE", "INACTIVE"];

export default function StoresPage() {
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
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingStoreId, setDeletingStoreId] = useState<string | null>(null);
  const [statusStoreId, setStatusStoreId] = useState<string | null>(null);

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
            <Button onClick={() => setCreateOpen(true)}>
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
                  onDelete={() => void removeStore(store.id)}
                  onChangeStatus={() => void changeStoreStatus(store)}
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

      <StoreFormDialog
        open={createOpen}
        title="Add Store"
        description="Create the merchant tenant that will own SelfX kiosks."
        submitLabel="Create Store"
        onOpenChange={setCreateOpen}
        onSubmit={async (input) => {
          if (!accessToken) {
            return;
          }
          await createStore(accessToken, input);
          setCreateOpen(false);
          await load();
        }}
      />
    </PageContainer>
  );
}

function StoreDirectoryCard({
  store,
  deleting,
  statusChanging,
  onDelete,
  onChangeStatus,
}: {
  store: AdminStore;
  deleting: boolean;
  statusChanging: boolean;
  onDelete: () => void;
  onChangeStatus: () => void;
}) {
  const active = store.status === "ACTIVE";
  const location = storeLocation(store);
  const ownerEmail = store.contactEmail ?? "No owner/contact email";

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
            title="Impersonation is not available yet"
            disabled
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

function StoreFormDialog({
  open,
  title,
  description,
  submitLabel,
  initial,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  submitLabel: string;
  initial?: Partial<StoreInput>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: StoreInput) => Promise<void>;
}) {
  const [form, setForm] = useState<StoreInput>(() => ({
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    contactEmail: initial?.contactEmail ?? "",
    contactPhone: initial?.contactPhone ?? "",
    website: initial?.website ?? "",
    address: initial?.address ?? "",
    city: initial?.city ?? "",
    stateRegion: initial?.stateRegion ?? "",
    postalCode: initial?.postalCode ?? "",
    country: initial?.country ?? "",
    timezone: initial?.timezone ?? "UTC",
  }));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!form.name.trim()) {
      setError("Store name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(cleanStoreInput(form));
      setForm({
        name: "",
        slug: "",
        contactEmail: "",
        contactPhone: "",
        website: "",
        address: "",
        city: "",
        stateRegion: "",
        postalCode: "",
        country: "",
        timezone: "UTC",
      });
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <div className="grid max-h-[68vh] gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
          <label className="space-y-2 text-sm sm:col-span-2">
            <span>Store Name *</span>
            <Input
              value={form.name}
              maxLength={200}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Slug</span>
            <Input
              value={form.slug}
              maxLength={120}
              placeholder="selfx-demo-store"
              onChange={(event) =>
                setForm((current) => ({ ...current, slug: event.target.value }))
              }
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Timezone</span>
            <Input
              value={form.timezone}
              maxLength={64}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  timezone: event.target.value,
                }))
              }
            />
          </label>
          <TextInput
            label="Contact Email"
            value={form.contactEmail}
            onChange={(contactEmail) =>
              setForm((current) => ({ ...current, contactEmail }))
            }
          />
          <TextInput
            label="Contact Phone"
            value={form.contactPhone}
            onChange={(contactPhone) =>
              setForm((current) => ({ ...current, contactPhone }))
            }
          />
          <label className="space-y-2 text-sm sm:col-span-2">
            <span>Website</span>
            <Input
              value={form.website}
              maxLength={2048}
              placeholder="https://example.com"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  website: event.target.value,
                }))
              }
            />
          </label>
          <label className="space-y-2 text-sm sm:col-span-2">
            <span>Address</span>
            <Input
              value={form.address}
              maxLength={240}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  address: event.target.value,
                }))
              }
            />
          </label>
          <TextInput
            label="City"
            value={form.city}
            onChange={(city) => setForm((current) => ({ ...current, city }))}
          />
          <TextInput
            label="State / Region"
            value={form.stateRegion}
            onChange={(stateRegion) =>
              setForm((current) => ({ ...current, stateRegion }))
            }
          />
          <TextInput
            label="Postal Code"
            value={form.postalCode}
            onChange={(postalCode) =>
              setForm((current) => ({ ...current, postalCode }))
            }
          />
          <TextInput
            label="Country"
            value={form.country}
            onChange={(country) =>
              setForm((current) => ({ ...current, country }))
            }
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={submitting} onClick={() => void submit()}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span>{label}</span>
      <Input
        value={value ?? ""}
        maxLength={120}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function cleanStoreInput(input: StoreInput): StoreInput {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      typeof value === "string" ? value.trim() !== "" : value !== undefined,
    ),
  ) as StoreInput;
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
