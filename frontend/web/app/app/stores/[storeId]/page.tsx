"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  MonitorIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  ShieldAlertIcon,
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
import {
  type KioskConfiguration,
  type KioskConfigurationAssetType,
  type KioskConfigurationUpdateInput,
  type KioskDevice,
} from "@/lib/kiosks";
import { useSession } from "@/lib/session";
import {
  activateStore,
  deactivateStore,
  getStore,
  getStoreKioskConfiguration,
  pairStoreKiosk,
  updateStore,
  updateStoreKioskConfiguration,
  type AdminStoreDetail,
  type StoreInput,
} from "@/lib/stores";

export default function StoreDashboardPage() {
  const params = useParams<{ storeId: string }>();
  const storeId = params.storeId;
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [store, setStore] = useState<AdminStoreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [configurationDevice, setConfigurationDevice] =
    useState<KioskDevice | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setStore(await getStore(accessToken, storeId));
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const kiosks = store?.kiosks.data ?? [];

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Store Dashboard"
        title={store?.name ?? "Store"}
        description={
          store
            ? storeLocation(store) || "Manage Store kiosks."
            : "Manage Store kiosks."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button render={<Link href="/app/stores" />} variant="outline">
              <ArrowLeftIcon aria-hidden="true" />
              Stores
            </Button>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            <Button onClick={() => setPairOpen(true)} disabled={!store}>
              <PlusIcon aria-hidden="true" />
              Pair Kiosk
            </Button>
          </div>
        }
        status={
          store ? (
            <StatusBadge status={store.status} label={store.status} />
          ) : null
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

      <PageSection>
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Total Kiosks" value={store?.totalKiosks ?? 0} />
          <MetricCard label="Active Kiosks" value={store?.activeKiosks ?? 0} />
          <MetricCard
            label="Last Activity"
            value={formatDate(store?.lastActivityAt ?? null)}
          />
          <MetricCard label="Configurable" value={kiosks.length} />
        </div>
      </PageSection>

      <PageSection>
        <div className="grid gap-5 lg:grid-cols-[1.5fr_0.75fr]">
          <TableContainer
            title="Store Kiosks"
            description="Kiosks assigned to this Store. Configuration remains attached to each kiosk device."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6}>Loading Store kiosks...</TableCell>
                  </TableRow>
                ) : kiosks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="flex items-center gap-3 py-8 text-muted-foreground">
                        <MonitorIcon size={20} aria-hidden="true" />
                        No kiosks are paired to this Store yet.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  kiosks.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell>
                        <div className="font-medium">{device.displayName}</div>
                        <div className="text-xs text-muted-foreground">
                          {device.id}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={device.status}
                          label={device.status}
                        />
                      </TableCell>
                      <TableCell>
                        {device.platform ?? "Unknown"}
                        {device.appVersion ? ` / ${device.appVersion}` : ""}
                      </TableCell>
                      <TableCell>
                        v{device.latestConfigurationVersion}
                      </TableCell>
                      <TableCell>{formatDate(device.lastSeenAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfigurationDevice(device)}
                        >
                          <SettingsIcon aria-hidden="true" />
                          Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TableContainer title="Store Settings" description="Store details">
            {store ? (
              <div className="space-y-4 text-sm">
                <DetailRow label="Slug" value={`/${store.slug}`} />
                <DetailRow label="Contact" value={store.contactEmail ?? "-"} />
                <DetailRow label="Phone" value={store.contactPhone ?? "-"} />
                <DetailRow label="Website" value={store.website ?? "-"} />
                <DetailRow label="Timezone" value={store.timezone} />
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="outline" onClick={() => setEditOpen(true)}>
                    Edit Store
                  </Button>
                  {store.status === "ACTIVE" ? (
                    <ConfirmDialog
                      title="Deactivate Store?"
                      description="The Store remains stored and kiosk records/configuration are not deleted. Inactive Stores cannot receive new kiosk assignments."
                      confirmLabel="Deactivate"
                      destructive
                      onConfirm={() => void changeStoreStatus("INACTIVE")}
                      trigger={
                        <Button variant="destructive">Deactivate</Button>
                      }
                    />
                  ) : (
                    <Button onClick={() => void changeStoreStatus("ACTIVE")}>
                      Reactivate
                    </Button>
                  )}
                </div>
              </div>
            ) : null}
          </TableContainer>
        </div>
      </PageSection>

      <PairStoreKioskDialog
        open={pairOpen}
        disabled={store?.status !== "ACTIVE"}
        onOpenChange={setPairOpen}
        onSubmit={async (input) => {
          if (!accessToken || !store) {
            return;
          }
          await pairStoreKiosk(accessToken, store.id, input);
          setPairOpen(false);
          await load();
        }}
      />

      {store ? (
        <EditStoreDialog
          open={editOpen}
          store={store}
          onOpenChange={setEditOpen}
          onSubmit={async (input) => {
            if (!accessToken) {
              return;
            }
            await updateStore(accessToken, store.id, input);
            setEditOpen(false);
            await load();
          }}
        />
      ) : null}

      <StoreKioskConfigurationDialog
        device={configurationDevice}
        accessToken={accessToken}
        storeId={storeId}
        onOpenChange={(open) => {
          if (!open) {
            setConfigurationDevice(null);
          }
        }}
        onSaved={(configuration) => {
          setStore((current) =>
            current
              ? {
                  ...current,
                  kiosks: {
                    data: current.kiosks.data.map((device) =>
                      device.id === configurationDevice?.id
                        ? {
                            ...device,
                            latestConfigurationVersion: configuration.version,
                          }
                        : device,
                    ),
                  },
                }
              : current,
          );
        }}
      />
    </PageContainer>
  );

  async function changeStoreStatus(nextStatus: "ACTIVE" | "INACTIVE") {
    if (!accessToken || !store) {
      return;
    }
    setError(null);
    try {
      const updated =
        nextStatus === "ACTIVE"
          ? await activateStore(accessToken, store.id)
          : await deactivateStore(accessToken, store.id);
      setStore((current) => (current ? { ...current, ...updated } : current));
    } catch (caught) {
      setError(messageFor(caught));
    }
  }
}

function StoreKioskConfigurationDialog({
  device,
  accessToken,
  storeId,
  onOpenChange,
  onSaved,
}: {
  device: KioskDevice | null;
  accessToken: string | null;
  storeId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (configuration: KioskConfiguration) => void;
}) {
  const open = device !== null;
  const [configuration, setConfiguration] = useState<KioskConfiguration | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!device || !accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await getStoreKioskConfiguration(
        accessToken,
        storeId,
        device.id,
      );
      setConfiguration(next);
      setTitle(next.display.title ?? "");
      setCtaLabel(next.display.ctaLabel);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, device, storeId]);

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setConfiguration(null);
      setError(null);
    }
  }, [load, open]);

  async function save() {
    if (!device || !accessToken || !configuration) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateStoreKioskConfiguration(
        accessToken,
        storeId,
        device.id,
        configurationUpdateInput(configuration, {
          title: title.trim() || null,
          ctaLabel: ctaLabel.trim() || "Start Try-On",
        }),
      );
      setConfiguration(updated);
      onSaved(updated);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Store Kiosk Configuration</DialogTitle>
          <DialogDescription>
            {device
              ? `${device.displayName} runtime settings for this Store.`
              : "Runtime settings for this Store."}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {loading ? (
          <div className="py-8 text-sm text-muted-foreground">
            Loading Store kiosk configuration...
          </div>
        ) : configuration ? (
          <div className="space-y-4">
            <DetailRow
              label="Current Version"
              value={`v${configuration.version}`}
            />
            <DetailRow
              label="Presentation Assets"
              value={String(configuration.display.assets.length)}
            />
            <label className="space-y-2 text-sm">
              <span>Display Title</span>
              <Input
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span>CTA Label</span>
              <Input
                value={ctaLabel}
                maxLength={40}
                onChange={(event) => setCtaLabel(event.target.value)}
              />
            </label>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            disabled={loading || saving || !configuration}
            onClick={() => void save()}
          >
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-words">{value}</div>
    </div>
  );
}

function PairStoreKioskDialog({
  open,
  disabled,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    pairingCode: string;
    displayName: string;
  }) => Promise<void>;
}) {
  const [pairingCode, setPairingCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const canonicalCode = pairingCode.replace(/\s/g, "");
    if (!/^\d{6}$/.test(canonicalCode)) {
      setError("Pairing code expired or invalid.");
      return;
    }
    if (!displayName.trim()) {
      setError("Device name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ pairingCode: canonicalCode, displayName });
      setPairingCode("");
      setDisplayName("");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pair Kiosk</DialogTitle>
          <DialogDescription>
            Enter the six-digit code shown on the physical kiosk. This kiosk
            will be assigned to this Store automatically.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {disabled ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            Inactive Stores cannot receive new kiosk assignments.
          </div>
        ) : null}
        <div className="space-y-4">
          <label className="space-y-2 text-sm">
            <span>Pairing Code</span>
            <Input
              value={pairingCode}
              inputMode="numeric"
              placeholder="482731"
              maxLength={7}
              onChange={(event) => setPairingCode(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Device Name</span>
            <Input
              value={displayName}
              maxLength={160}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={disabled || submitting || !displayName.trim()}
            onClick={() => void submit()}
          >
            Pair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditStoreDialog({
  open,
  store,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  store: AdminStoreDetail;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: StoreInput) => Promise<void>;
}) {
  const [name, setName] = useState(store.name);
  const [contactEmail, setContactEmail] = useState(store.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(store.contactPhone ?? "");
  const [website, setWebsite] = useState(store.website ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) {
      setError("Store name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(
        cleanStoreInput({
          name,
          contactEmail,
          contactPhone,
          website,
          timezone: store.timezone,
        }),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Store</DialogTitle>
          <DialogDescription>Update Store details.</DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <div className="space-y-4">
          <label className="space-y-2 text-sm">
            <span>Store Name *</span>
            <Input
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Contact Email</span>
            <Input
              value={contactEmail}
              maxLength={254}
              onChange={(event) => setContactEmail(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Contact Phone</span>
            <Input
              value={contactPhone}
              maxLength={40}
              onChange={(event) => setContactPhone(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Website</span>
            <Input
              value={website}
              maxLength={2048}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={submitting} onClick={() => void submit()}>
            Save Store
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function configurationUpdateInput(
  configuration: KioskConfiguration,
  overrides: { title: string | null; ctaLabel: string },
): KioskConfigurationUpdateInput {
  return {
    display: {
      idleMode: configuration.display.idleMode,
      slideDurationSeconds: configuration.display.slideDurationSeconds,
      title: overrides.title,
      subtitle: configuration.display.subtitle,
      ctaLabel: overrides.ctaLabel,
      assets: configuration.display.assets.map((asset) => ({
        type: asset.type as KioskConfigurationAssetType,
        label: asset.label,
        ...(asset.url ? { url: asset.url } : {}),
        ...(asset.bundledAssetKey
          ? { bundledAssetKey: asset.bundledAssetKey }
          : {}),
        ...(asset.assetRef ? { assetRef: asset.assetRef } : {}),
        ...(asset.contentType ? { contentType: asset.contentType } : {}),
        ...(asset.sizeBytes ? { sizeBytes: asset.sizeBytes } : {}),
      })),
    },
    capture: {
      countdownSeconds: configuration.capture.countdownSeconds,
      soundEnabled: configuration.capture.soundEnabled,
      soundProfile: configuration.capture.soundProfile,
      guidanceAudioEnabled: configuration.capture.guidanceAudioEnabled,
    },
    experience: {
      enabledGarmentIntents: configuration.experience.enabledGarmentIntents,
      sessionIdleTimeoutSeconds:
        configuration.experience.sessionIdleTimeoutSeconds,
    },
  };
}

function cleanStoreInput(input: StoreInput): StoreInput {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      typeof value === "string" ? value.trim() !== "" : value !== undefined,
    ),
  ) as StoreInput;
}

function storeLocation(store: AdminStoreDetail): string {
  return [store.city, store.stateRegion, store.country]
    .filter(Boolean)
    .join(", ");
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
