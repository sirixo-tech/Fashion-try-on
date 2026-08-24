"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIcon,
  ArrowLeftIcon,
  Clock3Icon,
  GlobeIcon,
  MailIcon,
  MapPinIcon,
  MonitorIcon,
  PackageIcon,
  PhoneIcon,
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
  getEffectiveStorePermissions,
  getStore,
  getStoreKioskConfiguration,
  getStoreVirtualTryOnSettings,
  pairStoreKiosk,
  updateStore,
  updateStoreKioskConfiguration,
  updateStoreVirtualTryOnSettings,
  type AdminStoreDetail,
  type StoreInput,
  type StoreVirtualTryOnSettings,
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
  const [storeTryOnSettings, setStoreTryOnSettings] =
    useState<StoreVirtualTryOnSettings | null>(null);
  const [effectivePermissions, setEffectivePermissions] = useState<string[]>(
    [],
  );
  const [platformBypass, setPlatformBypass] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [savingStoreTryOnSettings, setSavingStoreTryOnSettings] =
    useState(false);
  const [configurationDevice, setConfigurationDevice] =
    useState<KioskDevice | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextStore, nextEffectivePermissions, nextStoreTryOnSettings] =
        await Promise.all([
          getStore(accessToken, storeId),
          getEffectiveStorePermissions(accessToken, storeId),
          getStoreVirtualTryOnSettings(accessToken, storeId),
        ]);
      const nextEffectivePermissionCodes = nextEffectivePermissions.permissions;
      setStore(nextStore);
      setStoreTryOnSettings(nextStoreTryOnSettings);
      setEffectivePermissions(nextEffectivePermissionCodes);
      setPlatformBypass(nextEffectivePermissions.platformBypass);
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
  const can = useCallback(
    (permission: string) => effectivePermissions.includes(permission),
    [effectivePermissions],
  );
  const canPairKiosks = can("kiosks.pair");
  const canConfigureKiosks = can("kiosks.configure");
  const canUpdateStore = can("stores.update");
  const location = store ? storeLocation(store) : "";
  const activeKioskShare =
    store && store.totalKiosks > 0
      ? Math.round((store.activeKiosks / store.totalKiosks) * 100)
      : 0;
  const garmentPreviewControlDisabled =
    !canUpdateStore ||
    savingStoreTryOnSettings ||
    !storeTryOnSettings?.platformGarmentPreviewEnabled ||
    !storeTryOnSettings.storeHasGarmentPreviewPermission;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Store Dashboard"
        title={store?.name ?? "Store"}
        description={
          store
            ? location || "Store operations and kiosk runtime settings."
            : "Store operations and kiosk runtime settings."
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
            <Button
              render={<Link href={`/app/stores/${storeId}/products`} />}
              variant="outline"
            >
              <PackageIcon aria-hidden="true" />
              Products
            </Button>
            <Button
              onClick={() => setPairOpen(true)}
              disabled={!store || !canPairKiosks}
            >
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Kiosks"
            value={store?.totalKiosks ?? 0}
            icon={<MonitorIcon size={18} aria-hidden="true" />}
            caption="Paired devices"
          />
          <MetricCard
            label="Active Kiosks"
            value={store?.activeKiosks ?? 0}
            icon={<ActivityIcon size={18} aria-hidden="true" />}
            caption={`${activeKioskShare}% fleet active`}
          />
          <MetricCard
            label="Last Activity"
            value={formatDate(store?.lastActivityAt ?? null)}
            icon={<Clock3Icon size={18} aria-hidden="true" />}
            caption="Most recent kiosk signal"
          />
          <MetricCard
            label="Configuration"
            value={kiosks.length}
            icon={<SettingsIcon size={18} aria-hidden="true" />}
            caption="Kiosks ready to manage"
          />
        </div>
      </PageSection>

      <PageSection>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.55fr)]">
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
                        {canConfigureKiosks ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfigurationDevice(device)}
                          >
                            <SettingsIcon aria-hidden="true" />
                            Manage
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            {store ? (
              <div className="space-y-5">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">Store Settings</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Store profile and runtime preferences.
                      </p>
                    </div>
                    <StatusBadge status={store.status} label={store.status} />
                  </div>
                </div>

                <div className="grid gap-3">
                  <StoreInfoRow
                    icon={<MapPinIcon size={16} aria-hidden="true" />}
                    label="Store URL"
                    value={`/${store.slug}`}
                  />
                  <StoreInfoRow
                    icon={<MailIcon size={16} aria-hidden="true" />}
                    label="Contact"
                    value={store.contactEmail ?? "-"}
                  />
                  <StoreInfoRow
                    icon={<PhoneIcon size={16} aria-hidden="true" />}
                    label="Phone"
                    value={store.contactPhone ?? "-"}
                  />
                  <StoreInfoRow
                    icon={<GlobeIcon size={16} aria-hidden="true" />}
                    label="Website"
                    value={store.website ?? "-"}
                  />
                  <StoreInfoRow
                    icon={<Clock3Icon size={16} aria-hidden="true" />}
                    label="Timezone"
                    value={store.timezone}
                  />
                </div>

                {storeTryOnSettings ? (
                  <div className="rounded-lg border bg-muted/25 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">
                          Captured Garment Preview
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Show the extracted garment preview after a garment is
                          photographed.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        className="mt-1 size-4"
                        checked={storeTryOnSettings.storeGarmentPreviewEnabled}
                        disabled={garmentPreviewControlDisabled}
                        onChange={(event) =>
                          void updateStoreGarmentPreview(
                            event.target.checked,
                          )
                        }
                      />
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      Effective:{" "}
                      {storeTryOnSettings.effectiveGarmentPreviewEnabled
                        ? "On"
                        : "Off"}
                      {!storeTryOnSettings.platformGarmentPreviewEnabled
                        ? " - disabled globally"
                        : !storeTryOnSettings.storeHasGarmentPreviewPermission
                          ? " - feature not granted"
                          : ""}
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-2">
                  {canUpdateStore ? (
                    <Button variant="outline" onClick={() => setEditOpen(true)}>
                      Edit Store
                    </Button>
                  ) : null}
                  {platformBypass && store.status === "ACTIVE" ? (
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
                  ) : platformBypass ? (
                    <Button onClick={() => void changeStoreStatus("ACTIVE")}>
                      Reactivate
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
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

  async function updateStoreGarmentPreview(enabled: boolean) {
    if (!accessToken || !store) {
      return;
    }
    setSavingStoreTryOnSettings(true);
    setError(null);
    try {
      setStoreTryOnSettings(
        await updateStoreVirtualTryOnSettings(accessToken, store.id, {
          garmentPreviewEnabled: enabled,
        }),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSavingStoreTryOnSettings(false);
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
  icon,
  caption,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  caption: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold">{value}</div>
        </div>
        <div className="grid size-9 place-items-center rounded-lg border bg-muted/40 text-primary">
          {icon}
        </div>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">{caption}</div>
    </div>
  );
}

function StoreInfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border bg-background/70 p-3 text-sm">
      <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-muted/50 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 break-words font-medium">{value}</div>
      </div>
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
