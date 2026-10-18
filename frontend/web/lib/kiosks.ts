export type KioskAssignmentScope = "PLATFORM" | "ORGANIZATION" | "STORE";
export type KioskDeviceStatus = "ACTIVE" | "INACTIVE" | "REVOKED" | "DELETED";

export type KioskDevice = {
  id: string;
  displayName: string;
  status: KioskDeviceStatus;
  assignment: {
    scope: KioskAssignmentScope;
    organizationId: string | null;
    organizationName: string | null;
    storeId: string | null;
    storeName: string | null;
  };
  platform: string | null;
  appVersion: string | null;
  installationId: string | null;
  pairedAt: string;
  lastSeenAt: string | null;
  inactiveAt: string | null;
  revokedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  latestConfigurationVersion: number;
};

export type KioskIdleMode = "STATIC" | "SLIDESHOW";
export type KioskConfigurationAssetType =
  "BUNDLED_IMAGE" | "REMOTE_IMAGE" | "UPLOADED_IMAGE";
export type KioskConfigurationSoundProfile =
  "SELFX_SIGNATURE" | "SOFT" | "STUDIO" | "MINIMAL" | "MUTED";
export type KioskConfigurationGarmentIntent = "TOP" | "BOTTOM" | "FULL_OUTFIT";
export type StoreTryOnCapability = "GARMENT_TRY_ON" | "JEWELLERY_TRY_ON";

export type KioskConfiguration = {
  version: number;
  display: {
    idleMode: KioskIdleMode;
    slideDurationSeconds: number;
    title: string | null;
    subtitle: string | null;
    ctaLabel: string;
    assets: Array<{
      id: string;
      type: KioskConfigurationAssetType;
      label: string;
      url: string | null;
      bundledAssetKey: string | null;
      assetRef: string | null;
      contentType: string | null;
      sizeBytes: number | null;
      durationSeconds: number | null;
      sortOrder: number;
    }>;
  };
  capture: {
    countdownSeconds: number;
    soundEnabled: boolean;
    soundProfile: KioskConfigurationSoundProfile;
    guidanceAudioEnabled: boolean;
  };
  experience: {
    enabledTryOnCapabilities: StoreTryOnCapability[];
    enabledGarmentIntents: KioskConfigurationGarmentIntent[];
    multiGarmentSelectionEnabled: boolean;
    maxTryOnPicks: number;
    sessionIdleTimeoutSeconds: number;
    garmentPreviewEnabled: boolean;
  };
  assetUpload: {
    supported: boolean;
    maxImageBytes: number;
    maxVideoBytes: number;
    maxVideoDurationSeconds: number;
    supportedContentTypes: string[];
  };
  captureUpload: {
    maxImageBytes: number;
    supportedContentTypes: string[];
  };
  updatedAt: string;
};

export type KioskConfigurationUpdateInput = {
  display: {
    idleMode: KioskIdleMode;
    slideDurationSeconds: number;
    title?: string | null;
    subtitle?: string | null;
    ctaLabel?: string;
    assets: Array<{
      type: KioskConfigurationAssetType;
      label: string;
      url?: string;
      bundledAssetKey?: string;
      assetRef?: string;
      contentType?: string;
      sizeBytes?: number;
      durationSeconds?: number;
    }>;
  };
  capture: {
    countdownSeconds: number;
    soundEnabled: boolean;
    soundProfile: KioskConfigurationSoundProfile;
    guidanceAudioEnabled: boolean;
  };
  experience: {
    enabledGarmentIntents: KioskConfigurationGarmentIntent[];
    multiGarmentSelectionEnabled: boolean;
    maxTryOnPicks: number;
    sessionIdleTimeoutSeconds: number;
  };
};

export type KioskAssignmentOptions = {
  organizations: Array<{ id: string; name: string; status: string }>;
  stores: Array<{
    id: string;
    organizationId: string;
    name: string;
    status: string;
  }>;
};

export type KioskConfigurationAssetUploadIntent = {
  assetRef: string;
  type: "UPLOADED_IMAGE";
  label: string;
  uploadUrl: string;
  method: "PUT";
  expiresAt: string;
  headers: Record<string, string>;
  maxImageBytes: number;
  maxVideoBytes: number;
  maxVideoDurationSeconds: number;
  supportedContentTypes: string[];
};
