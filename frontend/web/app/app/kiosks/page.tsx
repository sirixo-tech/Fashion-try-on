"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MonitorIcon,
  PlusIcon,
  PowerIcon,
  PowerOffIcon,
  RefreshCwIcon,
  SettingsIcon,
  ShieldAlertIcon,
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
  activateKioskDevice,
  deactivateKioskDevice,
  deleteKioskDevice,
  getKioskConfiguration,
  listKioskAssignmentOptions,
  listKioskDevices,
  pairKioskDevice,
  revokeKioskDevice,
  updateKioskConfiguration,
  type KioskConfiguration,
  type KioskConfigurationGarmentIntent,
  type KioskConfigurationSoundProfile,
  type KioskAssignmentOptions,
  type KioskAssignmentScope,
  type KioskDevice,
  type KioskIdleMode,
} from "@/lib/kiosks";
import { useSession } from "@/lib/session";

const assignmentScopes: KioskAssignmentScope[] = [
  "PLATFORM",
  "ORGANIZATION",
  "STORE",
];
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

  const activeCount = devices.filter((device) => device.status === "ACTIVE").length;
  const inactiveCount = devices.filter(
    (device) => device.status === "INACTIVE",
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
          description={`Kiosks belong to the SelfX platform fleet and may be assigned to platform, organization or store scope. ${inactiveCount} inactive.`}
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
                      <StatusBadge status={device.status} label={device.status} />
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
                        onActivate={() => void activate(device.id)}
                        onDeactivate={() => void deactivate(device.id)}
                        onRevoke={() => void revoke(device.id)}
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
        onOpenChange={(open) => {
          if (!open) {
            setConfigurationDevice(null);
          }
        }}
        onSaved={(configuration) => {
          setDevices((current) =>
            current.map((device) =>
              device.id === configurationDevice?.id
                ? {
                    ...device,
                    latestConfigurationVersion: configuration.version,
                  }
                : device,
            ),
          );
        }}
      />
    </PageContainer>
  );

  async function revoke(deviceId: string) {
    await updateDevice((token) => revokeKioskDevice(token, deviceId));
  }

  async function activate(deviceId: string) {
    await updateDevice((token) => activateKioskDevice(token, deviceId));
  }

  async function deactivate(deviceId: string) {
    await updateDevice((token) => deactivateKioskDevice(token, deviceId));
  }

  async function remove(deviceId: string) {
    await updateDevice(
      (token) => deleteKioskDevice(token, deviceId),
      { removeFromList: true },
    );
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
  onActivate,
  onDeactivate,
  onRevoke,
  onDelete,
  onConfigure,
}: {
  device: KioskDevice;
  onActivate: () => void;
  onDeactivate: () => void;
  onRevoke: () => void;
  onDelete: () => void;
  onConfigure: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="outline" size="sm" onClick={onConfigure}>
        <SettingsIcon aria-hidden="true" />
        Configure
      </Button>
      {device.status === "ACTIVE" ? (
        <Button variant="outline" size="sm" onClick={onDeactivate}>
          <PowerOffIcon aria-hidden="true" />
          Deactivate
        </Button>
      ) : null}
      {device.status === "INACTIVE" ? (
        <Button variant="outline" size="sm" onClick={onActivate}>
          <PowerIcon aria-hidden="true" />
          Activate
        </Button>
      ) : null}
      {device.status !== "REVOKED" ? (
        <ConfirmDialog
          title="Revoke kiosk?"
          description="This unpairs the kiosk device and revokes active refresh sessions. The physical display must be paired again before it can run as a kiosk."
          confirmLabel="Revoke"
          destructive
          onConfirm={onRevoke}
          trigger={
            <Button variant="destructive" size="sm">
              Revoke
            </Button>
          }
        />
      ) : null}
      <ConfirmDialog
        title="Delete kiosk?"
        description="This removes the kiosk from the fleet list and revokes any remaining device sessions. Audit history is retained."
        confirmLabel="Delete"
        destructive
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
  const [storeId, setStoreId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const stores = useMemo(
    () =>
      options.stores.filter((store) => store.organizationId === organizationId),
    [options.stores, organizationId],
  );

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
        ...(assignmentScope === "STORE" ? { storeId } : {}),
      });
      onPaired(device);
      setPairingCode("");
      setDisplayName("");
      setAssignmentScope("PLATFORM");
      setOrganizationId("");
      setStoreId("");
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
                setStoreId("");
              }}
            >
              {assignmentScopes.map((scope) => (
                <option key={scope} value={scope}>
                  {scope}
                </option>
              ))}
            </select>
          </div>
          {assignmentScope !== "PLATFORM" ? (
            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              <select
                id="organization"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={organizationId}
                onChange={(event) => {
                  setOrganizationId(event.target.value);
                  setStoreId("");
                }}
              >
                <option value="">Select organization</option>
                {options.organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {assignmentScope === "STORE" ? (
            <div className="space-y-2">
              <Label htmlFor="store">Store</Label>
              <select
                id="store"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={storeId}
                onChange={(event) => setStoreId(event.target.value)}
              >
                <option value="">Select store</option>
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
  assetLabel: string;
  remoteAssetUrl: string;
};

function KioskConfigurationDialog({
  device,
  onOpenChange,
  onSaved,
}: {
  device: KioskDevice | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (configuration: KioskConfiguration) => void;
}) {
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const open = device !== null;
  const [form, setForm] = useState<KioskConfigurationForm>(defaultConfigForm());
  const [version, setVersion] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfiguration = useCallback(async () => {
    if (!device || !accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const configuration = await getKioskConfiguration(
        accessToken,
        device.id,
      );
      setVersion(configuration.version);
      setForm(formFromConfiguration(configuration));
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, device]);

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
    setSaving(true);
    setError(null);
    try {
      const configuration = await updateKioskConfiguration(
        accessToken,
        device.id,
        {
          display: {
            idleMode: form.idleMode,
            slideDurationSeconds: form.slideDurationSeconds,
            title: form.title || null,
            subtitle: form.subtitle || null,
            ctaLabel: form.ctaLabel || "Start Try-On",
            assets: form.remoteAssetUrl.trim()
              ? [
                  {
                    type: "REMOTE_IMAGE",
                    label: form.assetLabel || "Kiosk presentation image",
                    url: form.remoteAssetUrl.trim(),
                  },
                ]
              : [
                  {
                    type: "BUNDLED_IMAGE",
                    label: "SelfX default wallpaper",
                    bundledAssetKey: "selfx-default-kiosk-wallpaper",
                  },
                ],
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
      setVersion(configuration.version);
      setForm(formFromConfiguration(configuration));
      onSaved(configuration);
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
          <div className="grid max-h-[70vh] gap-5 overflow-y-auto pr-1">
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">Display</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span>Idle Mode</span>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={form.idleMode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        idleMode: event.target.value as KioskIdleMode,
                      }))
                    }
                  >
                    <option value="STATIC">Static</option>
                    <option value="SLIDESHOW">Slideshow</option>
                  </select>
                </label>
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
              <label className="space-y-2 text-sm">
                <span>HTTPS Presentation Image URL</span>
                <Input
                  value={form.remoteAssetUrl}
                  placeholder="Leave blank to use bundled SelfX wallpaper"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      remoteAssetUrl: event.target.value,
                    }))
                  }
                />
              </label>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">Capture</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span>Countdown</span>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={form.countdownSeconds}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        countdownSeconds: Number(event.target.value),
                      }))
                    }
                  >
                    <option value={5}>5 seconds</option>
                    <option value={10}>10 seconds</option>
                    <option value={15}>15 seconds</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <span>Sound Profile</span>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={form.soundProfile}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        soundProfile: event.target
                          .value as KioskConfigurationSoundProfile,
                      }))
                    }
                  >
                    {soundProfiles.map((profile) => (
                      <option key={profile} value={profile}>
                        {profileLabel(profile)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.soundEnabled}
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

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">Experience</legend>
              <div className="flex flex-wrap gap-3">
                {garmentIntents.map((intent) => (
                  <label key={intent} className="flex items-center gap-2 text-sm">
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

            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              Presentation asset upload is deferred until durable object storage
              ownership metadata exists. Use HTTPS image URLs or the bundled
              SelfX wallpaper.
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled={saving || loading} onClick={() => void save()}>
            Save Configuration
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

function assignmentLabel(device: KioskDevice): string {
  if (device.assignment.scope === "PLATFORM") {
    return "Platform";
  }
  if (device.assignment.scope === "ORGANIZATION") {
    return device.assignment.organizationName ?? "Organization";
  }
  return [
    device.assignment.organizationName ?? "Organization",
    device.assignment.storeName ?? "Store",
  ].join(" / ");
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
    assetLabel: "SelfX default wallpaper",
    remoteAssetUrl: "",
  };
}

function formFromConfiguration(
  configuration: KioskConfiguration,
): KioskConfigurationForm {
  const remoteAsset = configuration.display.assets.find(
    (asset) => asset.type === "REMOTE_IMAGE",
  );
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
    assetLabel: remoteAsset?.label ?? "SelfX default wallpaper",
    remoteAssetUrl: remoteAsset?.url ?? "",
  };
}

function validateConfigurationForm(form: KioskConfigurationForm): string | null {
  if (
    !Number.isInteger(form.slideDurationSeconds) ||
    form.slideDurationSeconds < 3 ||
    form.slideDurationSeconds > 60
  ) {
    return "Slide duration must be between 3 and 60 seconds.";
  }
  const remoteAssetUrl = form.remoteAssetUrl.trim();
  if (remoteAssetUrl && !remoteAssetUrl.startsWith("https://")) {
    return "Presentation image URL must use HTTPS.";
  }
  return null;
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
