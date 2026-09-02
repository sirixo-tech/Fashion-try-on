"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldAlertIcon,
  StoreIcon,
  Trash2Icon,
} from "lucide-react";

import {
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
  SelectMenu,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  createStore,
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
        <TableContainer
          title="Store directory"
          description={`${total} Stores found. Store is the merchant tenant for SelfX kiosks.`}
        >
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

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Kiosks</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6}>Loading Stores...</TableCell>
                </TableRow>
              ) : stores.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="flex items-center gap-3 py-8 text-muted-foreground">
                      <StoreIcon size={20} aria-hidden="true" />
                      No Stores yet. Create your first Store to start pairing
                      and managing SelfX kiosks.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                stores.map((store) => (
                  <TableRow key={store.id}>
                    <TableCell>
                      <div className="font-medium">{store.name}</div>
                      <div className="text-xs text-muted-foreground">
                        /{store.slug}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={store.status} label={store.status} />
                    </TableCell>
                    <TableCell>
                      {store.totalKiosks}
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        total / {store.activeKiosks} active
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(store.lastActivityAt)}</TableCell>
                    <TableCell>{formatDate(store.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          render={<Link href={`/app/stores/${store.id}`} />}
                          variant="outline"
                          size="sm"
                        >
                          View Store
                        </Button>
                        {store.status === "INACTIVE" ? (
                          <ConfirmDialog
                            title="Delete Store?"
                            description="This archives the inactive Store and removes it from Store lists. Kiosk records, settings, products and audit history are retained."
                            confirmLabel="Delete"
                            destructive
                            onConfirm={() => void removeStore(store.id)}
                            trigger={
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={deletingStoreId === store.id}
                              >
                                <Trash2Icon aria-hidden="true" />
                                Delete
                              </Button>
                            }
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

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
        </TableContainer>
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

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  return "The Store request could not be completed.";
}
