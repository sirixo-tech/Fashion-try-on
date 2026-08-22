"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ImageIcon,
  MonitorIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  ShieldAlertIcon,
  StoreIcon,
  Trash2Icon,
  UploadIcon,
  Volume2Icon,
  XIcon,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  PageContainer,
  PageHeader,
  PageSection,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableContainer,
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import {
  assignKioskDeviceToStore,
  deleteKioskDevice,
  createKioskConfigurationAssetUploadIntent,
  getKioskConfiguration,
  listKioskAssignmentOptions,
  listKioskDevices,
  pairKioskDevice,
  unpairKioskDevice,
  updateKioskConfiguration,
  updateKioskDevice,
  type KioskConfiguration,
  type KioskConfigurationAssetType,
  type KioskConfigurationGarmentIntent,
  type KioskConfigurationSoundProfile,
  type KioskAssignmentOptions,
  type KioskAssignmentScope,
  type KioskDevice,
  type KioskIdleMode,
} from "@/lib/kiosks";
import { useSession } from "@/lib/session";

const assignmentScopes: KioskAssignmentScope[] = ["PLATFORM", "ORGANIZATION"];
const soundProfiles: KioskConfigurationSoundProfile[] = [
  "SELFX_SIGNATURE",
  "SOFT",
  "STUDIO",
  "MINIMAL",
  "MUTED",
];
const garmentIntents: KioskConfigurationGarmentIntent[] = [
  "TOP",
  "BOTTOM",
  "FULL_OUTFIT",
];
const presentationImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxPresentationImageBytes = 12 * 1024 * 1024;

export default function KiosksPage() {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [devices, setDevices] = useState<KioskDevice[]>([]);
  const [options, setOptions] = useState<KioskAssignmentOptions>({
    organizations: [],
    stores: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [configurationDevice, setConfigurationDevice] =
    useState<KioskDevice | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextDevices, nextOptions] = await Promise.all([
        listKioskDevices(accessToken),
        listKioskAssignmentOptions(accessToken),
      ]);
      setDevices(nextDevices);
      setOptions(nextOptions);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = devices.filter(
    (device) => device.status === "ACTIVE",
  ).length;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Platform fleet"
        title="Kiosks"
        description="Pair and manage SelfX kiosk devices before production device-authenticated Try-On endpoints arrive."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCwIcon aria-hidden="true" />
              Refresh
            </Button>
            <Button onClick={() => setPairOpen(true)}>
              <PlusIcon aria-hidden="true" />
              Pair New Kiosk
            </Button>
          </div>
        }
        status={<StatusBadge status="ACTIVE" label={`${activeCount} active`} />}
      />

      <PageSection>
        <TableContainer
          title="Fleet devices"
          description="Kiosks belong to the SelfX platform fleet and may be assigned to platform or Store scope."
        >
          {error ? (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <ShieldAlertIcon size={18} aria-hidden="true" />
              {error}
            </div>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assignment</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead>Paired</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7}>Loading kiosks...</TableCell>
                </TableRow>
              ) : devices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="flex items-center gap-3 py-8 text-muted-foreground">
                      <MonitorIcon size={20} aria-hidden="true" />
                      No kiosks paired yet.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                devices.map((device) => (
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
                    <TableCell>{assignmentLabel(device)}</TableCell>
                    <TableCell>
                      {device.platform ?? "Unknown"}
                      {device.appVersion ? ` / ${device.appVersion}` : ""}
                    </TableCell>
                    <TableCell>{formatDate(device.lastSeenAt)}</TableCell>
                    <TableCell>{formatDate(device.pairedAt)}</TableCell>
                    <TableCell className="text-right">
                      <KioskLifecycleActions
                        device={device}
                        onUnpair={() => void unpair(device.id)}
                        onDelete={() => void remove(device.id)}
                        onConfigure={() => setConfigurationDevice(device)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </PageSection>

      <PairKioskDialog
        open={pairOpen}
        options={options}
        onOpenChange={setPairOpen}
        onPaired={(device) => {
          setDevices((current) => [device, ...current]);
          setPairOpen(false);
        }}
      />
      <KioskConfigurationDialog
        device={configurationDevice}
        options={options}
        onOpenChange={(open) => {
          if (!open) {
            setConfigurationDevice(null);
          }
        }}
        onSaved={(configuration, updatedDevice) => {
          setDevices((current) =>
            current.map((device) =>
              device.id === configurationDevice?.id
                ? {
                    ...device,
                    ...(updatedDevice ?? {}),
                    latestConfigurationVersion: configuration.version,
                  }
                : device,
            ),
          );
        }}
      />
    </PageContainer>
  );

  async function unpair(deviceId: string) {
    await updateDevice((token) => unpairKioskDevice(token, deviceId));
  }

  async function remove(deviceId: string) {
    await updateDevice((token) => deleteKioskDevice(token, deviceId), {
      removeFromList: true,
    });
  }

  async function updateDevice(
    action: (accessToken: string) => Promise<KioskDevice>,
    options: { removeFromList?: boolean } = {},
  ) {
    if (session.status !== "authenticated") {
      return;
    }
    setError(null);
    try {
      const updated = await action(session.accessToken);
      setDevices((current) =>
        options.removeFromList
          ? current.filter((device) => device.id !== updated.id)
          : current.map((device) =>
              device.id === updated.id ? updated : device,
            ),
      );
    } catch (caught) {
      setError(messageFor(caught));
    }
  }
}

function KioskLifecycleActions({
  device,
  onUnpair,
  onDelete,
  onConfigure,
}: {
  device: KioskDevice;
  onUnpair: () => void;
  onDelete: () => void;
  onConfigure: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="outline" size="sm" onClick={onConfigure}>
        <SettingsIcon aria-hidden="true" />
        Configure
      </Button>
      {device.status !== "REVOKED" ? (
        <ConfirmDialog
          title="Unpair kiosk?"
          description="This unpairs the kiosk, revokes active device sessions, and sends the physical display back to the pairing screen so it can show a new code."
          confirmLabel="Unpair"
          destructive
          onConfirm={onUnpair}
          trigger={
            <Button variant="destructive" size="sm">
              Unpair
            </Button>
          }
        />
      ) : null}
      <ConfirmDialog
        title="Delete kiosk?"
        description="This removes the kiosk from the fleet list and revokes any remaining device sessions. Audit history is retained."
        confirmLabel="Delete"
        onConfirm={onDelete}
        trigger={
          <Button variant="outline" size="sm">
            <Trash2Icon aria-hidden="true" />
            Delete
          </Button>
        }
      />
    </div>
  );
}

function PairKioskDialog({
  open,
  options,
  onOpenChange,
  onPaired,
}: {
  open: boolean;
  options: KioskAssignmentOptions;
  onOpenChange: (open: boolean) => void;
  onPaired: (device: KioskDevice) => void;
}) {
  const session = useSession();
  const [pairingCode, setPairingCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [assignmentScope, setAssignmentScope] =
    useState<KioskAssignmentScope>("PLATFORM");
  const [organizationId, setOrganizationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const stores = options.organizations;

  async function submit() {
    if (session.status !== "authenticated") {
      return;
    }
    const canonicalCode = pairingCode.replace(/\s/g, "");
    if (!/^\d{6}$/.test(canonicalCode)) {
      setError("Pairing code expired or invalid.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const device = await pairKioskDevice(session.accessToken, {
        pairingCode: canonicalCode,
        displayName,
        assignmentScope,
        ...(assignmentScope !== "PLATFORM" ? { organizationId } : {}),
      });
      onPaired(device);
      setPairingCode("");
      setDisplayName("");
      setAssignmentScope("PLATFORM");
      setOrganizationId("");
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
          <DialogTitle>Pair New Kiosk</DialogTitle>
          <DialogDescription>
            Enter the six-digit code shown on the physical kiosk.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="pairing-code">Pairing Code</Label>
            <Input
              id="pairing-code"
              value={pairingCode}
              inputMode="numeric"
              placeholder="482 731"
              maxLength={7}
              onChange={(event) => setPairingCode(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="device-name">Device Name</Label>
            <Input
              id="device-name"
              value={displayName}
              maxLength={160}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignment-scope">Assignment Scope</Label>
            <select
              id="assignment-scope"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={assignmentScope}
              onChange={(event) => {
                setAssignmentScope(event.target.value as KioskAssignmentScope);
                setOrganizationId("");
              }}
            >
              {assignmentScopes.map((scope) => (
                <option key={scope} value={scope}>
                  {scope === "ORGANIZATION" ? "STORE" : scope}
                </option>
              ))}
            </select>
          </div>
          {assignmentScope !== "PLATFORM" ? (
            <div className="space-y-2">
              <Label htmlFor="organization">Store</Label>
              <select
                id="organization"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
              >
                <option value="">Select Store</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={submitting || !displayName.trim()} onClick={submit}>
            Pair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type KioskConfigurationForm = {
  idleMode: KioskIdleMode;
  slideDurationSeconds: number;
  title: string;
  subtitle: string;
  ctaLabel: string;
  countdownSeconds: number;
  soundEnabled: boolean;
  soundProfile: KioskConfigurationSoundProfile;
  guidanceAudioEnabled: boolean;
  enabledGarmentIntents: KioskConfigurationGarmentIntent[];
  sessionIdleTimeoutSeconds: number;
  presentationAssets: PresentationAssetFormItem[];
};

type PresentationAssetFormItem = {
  id: string;
  type: KioskConfigurationAssetType;
  label: string;
  url?: string | null;
  bundledAssetKey?: string | null;
  assetRef?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  previewUrl?: string;
};

type KioskConfigurationDialogApi = {
  assignStore: (
    accessToken: string,
    storeId: string,
    deviceId: string,
  ) => Promise<KioskDevice>;
  updateDevice: (
    accessToken: string,
    deviceId: string,
    input: Parameters<typeof updateKioskDevice>[2],
  ) => Promise<KioskDevice>;
  getConfiguration: (
    accessToken: string,
    deviceId: string,
  ) => Promise<KioskConfiguration>;
  updateConfiguration: (
    accessToken: string,
    deviceId: string,
    input: Parameters<typeof updateKioskConfiguration>[2],
  ) => Promise<KioskConfiguration>;
  createAssetUploadIntent: (
    accessToken: string,
    deviceId: string,
    input: Parameters<typeof createKioskConfigurationAssetUploadIntent>[2],
  ) => ReturnType<typeof createKioskConfigurationAssetUploadIntent>;
};

const defaultKioskConfigurationDialogApi: KioskConfigurationDialogApi = {
  assignStore: assignKioskDeviceToStore,
  updateDevice: updateKioskDevice,
  getConfiguration: getKioskConfiguration,
  updateConfiguration: updateKioskConfiguration,
  createAssetUploadIntent: createKioskConfigurationAssetUploadIntent,
};

function KioskConfigurationDialog({
  device,
  options,
  onOpenChange,
  onSaved,
  api = defaultKioskConfigurationDialogApi,
}: {
  device: KioskDevice | null;
  options: KioskAssignmentOptions;
  onOpenChange: (open: boolean) => void;
  onSaved: (configuration: KioskConfiguration, device?: KioskDevice) => void;
  api?: KioskConfigurationDialogApi;
}) {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const open = device !== null;
  const [displayName, setDisplayName] = useState("");
  const [assignmentStoreId, setAssignmentStoreId] = useState("");
  const [form, setForm] = useState<KioskConfigurationForm>(defaultConfigForm());
  const [version, setVersion] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfiguration = useCallback(async () => {
    if (!device || !accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const configuration = await api.getConfiguration(accessToken, device.id);
      setVersion(configuration.version);
      setForm(formFromConfiguration(configuration));
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, api, device]);

  useEffect(() => {
    setDisplayName(device?.displayName ?? "");
    setAssignmentStoreId(currentAssignmentStoreId(device));
  }, [device]);

  useEffect(() => {
    if (open) {
      void loadConfiguration();
    }
  }, [loadConfiguration, open]);

  async function save() {
    if (!device || !accessToken) {
      return;
    }
    const validationError = validateConfigurationForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    const nextDisplayName = displayName.trim();
    if (!nextDisplayName) {
      setError("Kiosk name is required.");
      return;
    }
    const currentStoreId = currentAssignmentStoreId(device);
    if (currentStoreId && !assignmentStoreId) {
      setError("Choose a Store for this assigned kiosk.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let updatedDevice =
        assignmentStoreId && assignmentStoreId !== currentStoreId
          ? await api.assignStore(accessToken, assignmentStoreId, device.id)
          : undefined;
      const assets =
        form.presentationAssets.length > 0
          ? form.presentationAssets.map((asset) => ({
              type: asset.type,
              label: asset.label,
              ...(asset.url ? { url: asset.url } : {}),
              ...(asset.bundledAssetKey
                ? { bundledAssetKey: asset.bundledAssetKey }
                : {}),
              ...(asset.assetRef ? { assetRef: asset.assetRef } : {}),
              ...(asset.contentType ? { contentType: asset.contentType } : {}),
              ...(asset.sizeBytes ? { sizeBytes: asset.sizeBytes } : {}),
            }))
          : [
              {
                type: "BUNDLED_IMAGE" as const,
                label: "SelfX default wallpaper",
                bundledAssetKey: "selfx-default-kiosk-wallpaper",
              },
            ];
      const configuration = await api.updateConfiguration(
        accessToken,
        device.id,
        {
          display: {
            idleMode: form.idleMode,
            slideDurationSeconds: form.slideDurationSeconds,
            title: form.title || null,
            subtitle: form.subtitle || null,
            ctaLabel: form.ctaLabel || "Start Try-On",
            assets,
          },
          capture: {
            countdownSeconds: form.countdownSeconds,
            soundEnabled: form.soundEnabled,
            soundProfile: form.soundProfile,
            guidanceAudioEnabled: form.guidanceAudioEnabled,
          },
          experience: {
            enabledGarmentIntents: form.enabledGarmentIntents,
            sessionIdleTimeoutSeconds: form.sessionIdleTimeoutSeconds,
          },
        },
      );
      if (nextDisplayName !== (updatedDevice ?? device).displayName) {
        updatedDevice = await api.updateDevice(accessToken, device.id, {
          displayName: nextDisplayName,
        });
      }
      setVersion(configuration.version);
      setForm(formFromConfiguration(configuration));
      if (updatedDevice) {
        setDisplayName(updatedDevice.displayName);
        setAssignmentStoreId(currentAssignmentStoreId(updatedDevice));
      }
      onSaved(configuration, updatedDevice);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  async function uploadPresentationAssets(fileList: FileList | File[]) {
    if (!device || !accessToken) {
      return;
    }
    const selectedFiles = Array.from(fileList);
    if (selectedFiles.length === 0) {
      return;
    }
    const files =
      form.idleMode === "STATIC" ? selectedFiles.slice(0, 1) : selectedFiles;
    const remainingSlots =
      form.idleMode === "STATIC" ? 1 : 12 - form.presentationAssets.length;
    const uploadableFiles = files.slice(0, Math.max(0, remainingSlots));
    if (uploadableFiles.length === 0) {
      setError("Presentation assets are limited to 12 images.");
      return;
    }
    const invalid = uploadableFiles.find(
      (file) =>
        !presentationImageTypes.includes(file.type) ||
        file.size > maxPresentationImageBytes,
    );
    if (invalid) {
      setError("Upload JPG, PNG or WebP images up to 12 MB.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const uploadedAssets: PresentationAssetFormItem[] = [];
      for (const file of uploadableFiles) {
        const intent = await api.createAssetUploadIntent(
          accessToken,
          device.id,
          {
            contentType: file.type,
            sizeBytes: file.size,
            fileName: file.name,
          },
        );
        const response = await fetch(intent.uploadUrl, {
          method: intent.method,
          headers: intent.headers,
          body: file,
        });
        if (!response.ok) {
          throw new Error("upload failed");
        }
        uploadedAssets.push({
          id: localPresentationAssetId(),
          type: intent.type,
          label: intent.label,
          url: URL.createObjectURL(file),
          assetRef: intent.assetRef,
          contentType: file.type,
          sizeBytes: file.size,
        });
      }
      setForm((current) => ({
        ...current,
        presentationAssets:
          current.idleMode === "STATIC"
            ? uploadedAssets.slice(0, 1)
            : [...current.presentationAssets, ...uploadedAssets].slice(0, 12),
      }));
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setUploading(false);
    }
  }

  const storeOptions = assignmentStoreOptions(options, device);
  const currentStoreId = currentAssignmentStoreId(device);
  const currentStoreName =
    device?.assignment.organizationName ?? device?.assignment.storeName ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Configure Kiosk</DialogTitle>
          <DialogDescription>
            {device
              ? `${device.displayName} runtime configuration. Current version ${version}.`
              : "Runtime configuration."}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {loading ? (
          <div className="py-8 text-sm text-muted-foreground">
            Loading configuration...
          </div>
        ) : (
          <div className="grid max-h-[66vh] gap-4 overflow-y-auto pr-1 lg:grid-cols-[1.05fr_0.95fr]">
            <fieldset className="rounded-xl border bg-card/70 p-4 shadow-sm lg:col-span-2">
              <legend className="px-1 text-sm font-semibold">
                Kiosk Details
              </legend>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                <div className="space-y-2 text-sm">
                  <Label htmlFor="configure-kiosk-name">Kiosk Name</Label>
                  <Input
                    id="configure-kiosk-name"
                    value={displayName}
                    maxLength={160}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </div>
                <div className="space-y-2 text-sm">
                  <Label htmlFor="configure-kiosk-store">Store Assignment</Label>
                  <div className="relative">
                    <StoreIcon
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <select
                      id="configure-kiosk-store"
                      className="h-10 w-full rounded-full border bg-background py-2 pl-9 pr-9 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                      value={assignmentStoreId}
                      onChange={(event) =>
                        setAssignmentStoreId(event.target.value)
                      }
                    >
                      {!currentStoreId ? (
                        <option value="">Platform fleet</option>
                      ) : null}
                      {storeOptions.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name}
                          {store.status !== "ACTIVE"
                            ? ` (${store.status.toLowerCase()})`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {currentStoreName
                      ? `Currently assigned to ${currentStoreName}.`
                      : "Assign this screen to a Store when it is ready for the floor."}
                  </p>
                </div>
              </div>
            </fieldset>
            <fieldset className="space-y-3 rounded-xl border bg-card/70 p-4 shadow-sm">
              <legend className="px-1 text-sm font-semibold">Display</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 text-sm">
                  <Label>Idle Mode</Label>
                  <SelectMenu
                    ariaLabel="Idle mode"
                    value={form.idleMode}
                    options={[
                      { value: "STATIC", label: "Static" },
                      { value: "SLIDESHOW", label: "Slideshow" },
                    ]}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        idleMode: value,
                      }))
                    }
                  />
                </div>
                <label className="space-y-2 text-sm">
                  <span>Slide Duration</span>
                  <Input
                    type="number"
                    min={3}
                    max={60}
                    value={form.slideDurationSeconds}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        slideDurationSeconds: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span>Title</span>
                  <Input
                    value={form.title}
                    maxLength={120}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span>CTA Label</span>
                  <Input
                    value={form.ctaLabel}
                    maxLength={40}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        ctaLabel: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label className="space-y-2 text-sm">
                <span>Subtitle</span>
                <Input
                  value={form.subtitle}
                  maxLength={180}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      subtitle: event.target.value,
                    }))
                  }
                />
              </label>
              <PresentationAssetUploader
                assets={form.presentationAssets}
                idleMode={form.idleMode}
                uploading={uploading}
                onUpload={(files) => void uploadPresentationAssets(files)}
                onRemove={(assetId) =>
                  setForm((current) => ({
                    ...current,
                    presentationAssets: current.presentationAssets.filter(
                      (asset) => asset.id !== assetId,
                    ),
                  }))
                }
              />
            </fieldset>

            <fieldset className="space-y-3 rounded-xl border bg-card/70 p-4 shadow-sm">
              <legend className="px-1 text-sm font-semibold">Capture</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 text-sm">
                  <Label>Countdown</Label>
                  <SelectMenu
                    ariaLabel="Countdown"
                    value={String(form.countdownSeconds)}
                    options={[
                      { value: "5", label: "5 seconds" },
                      { value: "10", label: "10 seconds" },
                      { value: "15", label: "15 seconds" },
                    ]}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        countdownSeconds: Number(value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2 text-sm">
                  <Label>Sound Profile</Label>
                  <div className="flex gap-2">
                    <SelectMenu
                      ariaLabel="Sound profile"
                      value={form.soundProfile}
                      options={soundProfiles.map((profile) => ({
                        value: profile,
                        label: profileLabel(profile),
                      }))}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          soundProfile: value,
                          soundEnabled:
                            value === "MUTED" ? false : current.soundEnabled,
                        }))
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Sound preview unavailable"
                      title="Sound preview is unavailable until web-served kiosk sound assets are added."
                      disabled
                    >
                      <Volume2Icon aria-hidden="true" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Preview unavailable until web-served kiosk sound assets are
                    added.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.soundEnabled}
                  disabled={form.soundProfile === "MUTED"}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      soundEnabled: event.target.checked,
                    }))
                  }
                />
                Capture sounds enabled
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.guidanceAudioEnabled}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      guidanceAudioEnabled: event.target.checked,
                    }))
                  }
                />
                Guidance audio enabled
              </label>
            </fieldset>

            <fieldset className="space-y-3 rounded-xl border bg-card/70 p-4 shadow-sm lg:col-start-2 lg:row-start-2">
              <legend className="px-1 text-sm font-semibold">
                Experience
              </legend>
              <div className="flex flex-wrap gap-3">
                {garmentIntents.map((intent) => (
                  <label
                    key={intent}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.enabledGarmentIntents.includes(intent)}
                      onChange={() => toggleIntent(intent)}
                    />
                    {intentLabel(intent)}
                  </label>
                ))}
              </div>
              <label className="space-y-2 text-sm">
                <span>Session Idle Timeout</span>
                <Input
                  type="number"
                  min={30}
                  max={900}
                  value={form.sessionIdleTimeoutSeconds}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      sessionIdleTimeoutSeconds: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </fieldset>

            <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground lg:col-span-2">
              Uploaded presentation images are stored through SelfX object
              storage and delivered to the paired kiosk as signed runtime
              configuration media URLs.
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            disabled={saving || loading || uploading}
            onClick={() => void save()}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  function toggleIntent(intent: KioskConfigurationGarmentIntent) {
    setForm((current) => {
      const hasIntent = current.enabledGarmentIntents.includes(intent);
      const next = hasIntent
        ? current.enabledGarmentIntents.filter((value) => value !== intent)
        : [...current.enabledGarmentIntents, intent];
      return {
        ...current,
        enabledGarmentIntents: next.length > 0 ? next : [intent],
      };
    });
  }
}

function PresentationAssetUploader({
  assets,
  idleMode,
  uploading,
  onUpload,
  onRemove,
}: {
  assets: PresentationAssetFormItem[];
  idleMode: KioskIdleMode;
  uploading: boolean;
  onUpload: (files: FileList) => void;
  onRemove: (assetId: string) => void;
}) {
  const inputId = "presentation-asset-upload";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={inputId}>Presentation Image</Label>
        <label
          htmlFor={inputId}
          className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
        >
          <UploadIcon size={16} aria-hidden="true" />
          {uploading ? "Uploading" : "Upload Image"}
        </label>
        <input
          id={inputId}
          className="sr-only"
          type="file"
          accept={presentationImageTypes.join(",")}
          multiple={idleMode === "SLIDESHOW"}
          disabled={uploading}
          onChange={(event) => {
            const files = event.currentTarget.files;
            if (files) {
              onUpload(files);
            }
            event.currentTarget.value = "";
          }}
        />
      </div>
      <div className="grid gap-2">
        {assets.length === 0 ? (
          <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="grid size-10 place-items-center rounded-md bg-background text-muted-foreground">
              <ImageIcon size={18} aria-hidden="true" />
            </div>
            <div>
              <div className="font-medium">SelfX default wallpaper</div>
              <div className="text-xs text-muted-foreground">
                Bundled kiosk image
              </div>
            </div>
          </div>
        ) : (
          assets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center gap-3 rounded-md border bg-background p-2"
            >
              <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                {asset.previewUrl || asset.url ? (
                  <img
                    src={asset.previewUrl ?? asset.url ?? ""}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <ImageIcon size={18} aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {asset.label}
                </div>
                <div className="text-xs text-muted-foreground">
                  {asset.type === "REMOTE_IMAGE"
                    ? "Hosted image"
                    : formatFileSize(asset.sizeBytes)}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${asset.label}`}
                onClick={() => onRemove(asset.id)}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SelectMenu<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between bg-background font-normal"
            aria-label={ariaLabel}
          />
        }
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDownIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="rounded-xl p-1">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className="gap-2 rounded-lg px-3 py-2"
            onClick={() => onChange(option.value)}
          >
            <span className="grid size-4 place-items-center">
              {option.value === value ? (
                <CheckIcon size={14} aria-hidden="true" />
              ) : null}
            </span>
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function assignmentLabel(device: KioskDevice): string {
  if (device.assignment.scope === "PLATFORM") {
    return "Platform";
  }
  if (device.assignment.scope === "ORGANIZATION") {
    return device.assignment.organizationName ?? "Store";
  }
  return [
    device.assignment.organizationName ?? "Store",
    device.assignment.storeName ?? "Store",
  ].join(" / ");
}

function currentAssignmentStoreId(device: KioskDevice | null): string {
  if (!device || device.assignment.scope === "PLATFORM") {
    return "";
  }
  return device.assignment.organizationId ?? device.assignment.storeId ?? "";
}

function assignmentStoreOptions(
  options: KioskAssignmentOptions,
  device: KioskDevice | null,
): KioskAssignmentOptions["organizations"] {
  const currentStoreId = currentAssignmentStoreId(device);
  const stores = options.organizations.filter(
    (store) => store.status === "ACTIVE" || store.id === currentStoreId,
  );
  if (
    currentStoreId &&
    !stores.some((store) => store.id === currentStoreId)
  ) {
    stores.unshift({
      id: currentStoreId,
      name:
        device?.assignment.organizationName ??
        device?.assignment.storeName ??
        "Assigned Store",
      status: "ACTIVE",
    });
  }
  return stores;
}

function defaultConfigForm(): KioskConfigurationForm {
  return {
    idleMode: "STATIC",
    slideDurationSeconds: 6,
    title: "SelfX Virtual Try-On",
    subtitle: "Find your perfect fit in seconds.",
    ctaLabel: "Start Try-On",
    countdownSeconds: 10,
    soundEnabled: true,
    soundProfile: "SELFX_SIGNATURE",
    guidanceAudioEnabled: false,
    enabledGarmentIntents: ["TOP", "BOTTOM", "FULL_OUTFIT"],
    sessionIdleTimeoutSeconds: 120,
    presentationAssets: [],
  };
}

function formFromConfiguration(
  configuration: KioskConfiguration,
): KioskConfigurationForm {
  const presentationAssets = configuration.display.assets
    .filter((asset) => asset.type !== "BUNDLED_IMAGE")
    .map((asset) => ({
      id: asset.id,
      type: asset.type,
      label: asset.label,
      url: asset.url,
      bundledAssetKey: asset.bundledAssetKey,
      assetRef: asset.assetRef,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes,
    }));
  return {
    idleMode: configuration.display.idleMode,
    slideDurationSeconds: configuration.display.slideDurationSeconds,
    title: configuration.display.title ?? "",
    subtitle: configuration.display.subtitle ?? "",
    ctaLabel: configuration.display.ctaLabel,
    countdownSeconds: configuration.capture.countdownSeconds,
    soundEnabled: configuration.capture.soundEnabled,
    soundProfile: configuration.capture.soundProfile,
    guidanceAudioEnabled: configuration.capture.guidanceAudioEnabled,
    enabledGarmentIntents: configuration.experience.enabledGarmentIntents,
    sessionIdleTimeoutSeconds:
      configuration.experience.sessionIdleTimeoutSeconds,
    presentationAssets,
  };
}

function validateConfigurationForm(
  form: KioskConfigurationForm,
): string | null {
  if (
    !Number.isInteger(form.slideDurationSeconds) ||
    form.slideDurationSeconds < 3 ||
    form.slideDurationSeconds > 60
  ) {
    return "Slide duration must be between 3 and 60 seconds.";
  }
  if (form.presentationAssets.length > 12) {
    return "Presentation assets are limited to 12 images.";
  }
  if (form.idleMode === "SLIDESHOW" && form.presentationAssets.length < 2) {
    return "Slideshow mode requires at least two uploaded images.";
  }
  return null;
}

function formatFileSize(sizeBytes?: number | null): string {
  if (!sizeBytes) {
    return "Uploaded image";
  }
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function localPresentationAssetId(): string {
  return `asset-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}

function profileLabel(profile: KioskConfigurationSoundProfile): string {
  return profile
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function intentLabel(intent: KioskConfigurationGarmentIntent): string {
  return intent === "FULL_OUTFIT"
    ? "Full Outfit"
    : intent[0] + intent.slice(1).toLowerCase();
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "-";
}

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  return "The kiosk request could not be completed.";
}
