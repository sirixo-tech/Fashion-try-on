"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  SaveIcon,
  ShieldAlertIcon,
  UploadIcon,
  Volume2Icon,
} from "lucide-react";

import {
  Button,
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
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import {
  createKioskConfigurationAssetUploadIntent,
  getKioskConfiguration,
  listKioskAssignmentOptions,
  listKioskDevices,
  updateKioskAssignment,
  updateKioskConfiguration,
  updateKioskDevice,
  type KioskAssignmentOptions,
  type KioskConfiguration,
  type KioskConfigurationAssetType,
  type KioskConfigurationGarmentIntent,
  type KioskConfigurationSoundProfile,
  type KioskDevice,
  type KioskIdleMode,
} from "@/lib/kiosks";
import { useSession } from "@/lib/session";

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
};

export default function KioskEditPage() {
  const params = useParams<{ deviceId: string }>();
  const deviceId = params.deviceId;
  const session = useSession();
  const accessToken =
    session.status === "authenticated" ? session.accessToken : null;
  const [device, setDevice] = useState<KioskDevice | null>(null);
  const [options, setOptions] = useState<KioskAssignmentOptions>({
    organizations: [],
    stores: [],
  });
  const [form, setForm] = useState<KioskConfigurationForm>(
    defaultConfigForm(),
  );
  const [version, setVersion] = useState(1);
  const [displayName, setDisplayName] = useState("");
  const [assignmentStoreId, setAssignmentStoreId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [devices, nextOptions, configuration] = await Promise.all([
        listKioskDevices(accessToken),
        listKioskAssignmentOptions(accessToken),
        getKioskConfiguration(accessToken, deviceId),
      ]);
      const nextDevice = devices.find((item) => item.id === deviceId) ?? null;
      if (!nextDevice) {
        setDevice(null);
        setError("Kiosk device was not found.");
        return;
      }
      setDevice(nextDevice);
      setOptions(nextOptions);
      setVersion(configuration.version);
      setForm(formFromConfiguration(configuration));
      setDisplayName(nextDevice.displayName);
      setAssignmentStoreId(currentAssignmentStoreId(nextDevice));
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [accessToken, deviceId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    setSaving(true);
    setError(null);
    try {
      let nextDevice = device;
      if (assignmentStoreId !== currentAssignmentStoreId(device)) {
        nextDevice = await updateKioskAssignment(
          accessToken,
          device.id,
          assignmentStoreId
            ? {
                assignmentScope: "ORGANIZATION",
                organizationId: assignmentStoreId,
              }
            : { assignmentScope: "PLATFORM" },
        );
      }
      if (nextDisplayName !== nextDevice.displayName) {
        nextDevice = await updateKioskDevice(accessToken, device.id, {
          displayName: nextDisplayName,
        });
      }
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
            assets: configurationAssets(form),
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
      setDevice({
        ...nextDevice,
        latestConfigurationVersion: configuration.version,
      });
      setVersion(configuration.version);
      setForm(formFromConfiguration(configuration));
      setDisplayName(nextDevice.displayName);
      setAssignmentStoreId(currentAssignmentStoreId(nextDevice));
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  async function uploadPresentationAssets(fileList: FileList) {
    if (!device || !accessToken) {
      return;
    }
    const selectedFiles = Array.from(fileList);
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
        const intent = await createKioskConfigurationAssetUploadIntent(
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
  const currentStoreName =
    device?.assignment.organizationName ?? device?.assignment.storeName ?? null;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Platform fleet"
        title={device ? `Edit ${device.displayName}` : "Edit Kiosk"}
        description={`Configure kiosk runtime settings. Current version ${version}.`}
        actions={
          <Button render={<Link href="/app/kiosks" />} variant="outline">
            <ArrowLeftIcon aria-hidden="true" />
            Back to Kiosks
          </Button>
        }
        status={
          device ? (
            <StatusBadge status={device.status} label={device.status} />
          ) : undefined
        }
      />

      <PageSection>
        <div className="space-y-4">
          {error ? (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <ShieldAlertIcon size={18} aria-hidden="true" />
              {error}
            </div>
          ) : null}
          {loading ? (
            <div className="py-8 text-sm text-muted-foreground">
              Loading kiosk configuration...
            </div>
          ) : device ? (
            <>
              <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                <fieldset className="rounded-lg border bg-card/70 p-4 shadow-sm lg:col-span-2">
                  <legend className="px-1 text-sm font-semibold">
                    Kiosk Details
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2 text-sm">
                      <Label htmlFor="configure-kiosk-name">Kiosk Name</Label>
                      <Input
                        id="configure-kiosk-name"
                        value={displayName}
                        maxLength={160}
                        onChange={(event) =>
                          setDisplayName(event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2 text-sm">
                      <Label htmlFor="store-assignment">
                        Store Assignment
                      </Label>
                      <select
                        id="store-assignment"
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={assignmentStoreId}
                        onChange={(event) =>
                          setAssignmentStoreId(event.target.value)
                        }
                      >
                        <option value="">Platform fleet</option>
                        {storeOptions.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.status === "ACTIVE"
                              ? store.name
                              : `${store.name} (${store.status.toLowerCase()})`}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">
                        {currentStoreName
                          ? `Currently assigned to ${currentStoreName}.`
                          : "Assign this screen to a Store when it is ready for the floor."}
                      </p>
                    </div>
                  </div>
                </fieldset>

                <fieldset className="space-y-3 rounded-lg border bg-card/70 p-4 shadow-sm">
                  <legend className="px-1 text-sm font-semibold">
                    Display
                  </legend>
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
                </fieldset>

                <fieldset className="space-y-3 rounded-lg border bg-card/70 p-4 shadow-sm">
                  <legend className="px-1 text-sm font-semibold">
                    Capture
                  </legend>
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
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
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
                                value === "MUTED"
                                  ? false
                                  : current.soundEnabled,
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

                <fieldset className="space-y-3 rounded-lg border bg-card/70 p-4 shadow-sm lg:col-span-2">
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
                          sessionIdleTimeoutSeconds: Number(
                            event.target.value,
                          ),
                        }))
                      }
                    />
                  </label>
                </fieldset>

                <fieldset className="rounded-lg border bg-card/70 p-4 shadow-sm lg:col-span-2">
                  <legend className="px-1 text-sm font-semibold">
                    Presentation Image
                  </legend>
                  <PresentationAssetUploader
                    assets={form.presentationAssets}
                    idleMode={form.idleMode}
                    uploading={uploading}
                    onUpload={(files) => void uploadPresentationAssets(files)}
                  />
                </fieldset>
              </div>

              <div className="flex justify-end gap-2">
                <Button render={<Link href="/app/kiosks" />} variant="outline">
                  Cancel
                </Button>
                <Button disabled={saving || uploading} onClick={save}>
                  <SaveIcon aria-hidden="true" />
                  Save Changes
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </PageSection>
    </PageContainer>
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
}: {
  assets: PresentationAssetFormItem[];
  idleMode: KioskIdleMode;
  uploading: boolean;
  onUpload: (files: FileList) => void;
}) {
  const inputId = "presentation-asset-upload";
  const currentAsset = assets[0] ?? null;
  const currentPreviewUrl = currentAsset?.url ?? "";
  const currentDescription = currentAsset
    ? currentAsset.type === "REMOTE_IMAGE"
      ? "Hosted image"
      : formatFileSize(currentAsset.sizeBytes)
    : "Bundled kiosk image";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={inputId}>Current wallpaper</Label>
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
      <div className="max-w-xl rounded-lg border bg-background p-2">
        <div className="aspect-video overflow-hidden rounded-md border bg-muted">
          {currentPreviewUrl ? (
            <img
              src={currentPreviewUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <DefaultWallpaperPreview />
          )}
        </div>
        <div className="mt-2 min-w-0">
          <div className="truncate text-sm font-medium">
            {currentAsset?.label ?? "SelfX default wallpaper"}
          </div>
          <div className="text-xs text-muted-foreground">
            {currentDescription}
          </div>
        </div>
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

function DefaultWallpaperPreview() {
  return (
    <div className="relative flex size-full overflow-hidden bg-zinc-950 text-white">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#09090b_0%,#18181b_58%,#7c2d12_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-black/35" />
      <div className="relative flex size-full flex-col justify-end p-5">
        <div className="max-w-[78%]">
          <div className="text-lg font-semibold leading-tight">
            SelfX Virtual Try-On
          </div>
          <div className="mt-1 text-xs text-white/75">
            Find your perfect fit in seconds.
          </div>
          <div className="mt-3 inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
            Start Try-On
          </div>
        </div>
      </div>
    </div>
  );
}

function configurationAssets(form: KioskConfigurationForm) {
  if (form.presentationAssets.length === 0) {
    return [
      {
        type: "BUNDLED_IMAGE" as const,
        label: "SelfX default wallpaper",
        bundledAssetKey: "selfx-default-kiosk-wallpaper",
      },
    ];
  }
  return form.presentationAssets.map((asset) => ({
    type: asset.type,
    label: asset.label,
    ...(asset.url ? { url: asset.url } : {}),
    ...(asset.bundledAssetKey ? { bundledAssetKey: asset.bundledAssetKey } : {}),
    ...(asset.assetRef ? { assetRef: asset.assetRef } : {}),
    ...(asset.contentType ? { contentType: asset.contentType } : {}),
    ...(asset.sizeBytes ? { sizeBytes: asset.sizeBytes } : {}),
  }));
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

function currentAssignmentStoreId(device: KioskDevice | null): string {
  if (!device || device.assignment.scope === "PLATFORM") {
    return "";
  }
  return device.assignment.organizationId ?? device.assignment.storeId ?? "";
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
    presentationAssets: configuration.display.assets
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
      })),
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

function messageFor(caught: unknown): string {
  if (caught instanceof SafeApiError) {
    return caught.message;
  }
  return "The kiosk request could not be completed.";
}
