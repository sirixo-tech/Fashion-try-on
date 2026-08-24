import { selfxApi } from "@/lib/api";

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
    enabledGarmentIntents: KioskConfigurationGarmentIntent[];
    sessionIdleTimeoutSeconds: number;
    garmentPreviewEnabled: boolean;
  };
  assetUpload: {
    supported: boolean;
    maxImageBytes: number;
    maxVideoBytes: number;
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

export async function listKioskDevices(
  accessToken: string,
): Promise<KioskDevice[]> {
  const response = await selfxApi<{ data: KioskDevice[] }>(
    "/api/v1/admin/kiosks",
    { accessToken },
  );
  return response.data;
}

export function listKioskAssignmentOptions(
  accessToken: string,
): Promise<KioskAssignmentOptions> {
  return selfxApi<KioskAssignmentOptions>(
    "/api/v1/admin/kiosks/assignment-options",
    { accessToken },
  );
}

export async function pairKioskDevice(
  accessToken: string,
  input: {
    pairingCode: string;
    displayName: string;
    assignmentScope: KioskAssignmentScope;
    organizationId?: string;
    storeId?: string;
  },
): Promise<KioskDevice> {
  const response = await selfxApi<{ device: KioskDevice }>(
    "/api/v1/admin/kiosks/pair",
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  );
  return response.device;
}

export function pairExistingKioskDevice(
  accessToken: string,
  deviceId: string,
  input: { pairingCode: string },
): Promise<KioskDevice> {
  return selfxApi<KioskDevice>(`/api/v1/admin/kiosks/${deviceId}/pair`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export function revokeKioskDevice(
  accessToken: string,
  deviceId: string,
): Promise<KioskDevice> {
  return selfxApi<KioskDevice>(`/api/v1/admin/kiosks/${deviceId}/revoke`, {
    method: "POST",
    accessToken,
  });
}

export function unpairKioskDevice(
  accessToken: string,
  deviceId: string,
): Promise<KioskDevice> {
  return revokeKioskDevice(accessToken, deviceId);
}

export function updateKioskDevice(
  accessToken: string,
  deviceId: string,
  input: { displayName: string },
): Promise<KioskDevice> {
  return selfxApi<KioskDevice>(`/api/v1/admin/kiosks/${deviceId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  });
}

export function assignKioskDeviceToStore(
  accessToken: string,
  storeId: string,
  deviceId: string,
): Promise<KioskDevice> {
  return selfxApi<KioskDevice>(
    `/api/v1/admin/stores/${storeId}/kiosks/${deviceId}/assign`,
    {
      method: "POST",
      accessToken,
    },
  );
}

export function updateKioskAssignment(
  accessToken: string,
  deviceId: string,
  input: {
    assignmentScope: KioskAssignmentScope;
    organizationId?: string;
    storeId?: string;
  },
): Promise<KioskDevice> {
  return selfxApi<KioskDevice>(`/api/v1/admin/kiosks/${deviceId}/assignment`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  });
}

export function activateKioskDevice(
  accessToken: string,
  deviceId: string,
): Promise<KioskDevice> {
  return selfxApi<KioskDevice>(`/api/v1/admin/kiosks/${deviceId}/activate`, {
    method: "POST",
    accessToken,
  });
}

export function deactivateKioskDevice(
  accessToken: string,
  deviceId: string,
): Promise<KioskDevice> {
  return selfxApi<KioskDevice>(`/api/v1/admin/kiosks/${deviceId}/deactivate`, {
    method: "POST",
    accessToken,
  });
}

export function deleteKioskDevice(
  accessToken: string,
  deviceId: string,
): Promise<KioskDevice> {
  return selfxApi<KioskDevice>(`/api/v1/admin/kiosks/${deviceId}`, {
    method: "DELETE",
    accessToken,
  });
}

export function getKioskConfiguration(
  accessToken: string,
  deviceId: string,
): Promise<KioskConfiguration> {
  return selfxApi<KioskConfiguration>(
    `/api/v1/admin/kiosks/${deviceId}/configuration`,
    { accessToken },
  );
}

export function updateKioskConfiguration(
  accessToken: string,
  deviceId: string,
  input: KioskConfigurationUpdateInput,
): Promise<KioskConfiguration> {
  return selfxApi<KioskConfiguration>(
    `/api/v1/admin/kiosks/${deviceId}/configuration`,
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}

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
  supportedContentTypes: string[];
};

export function createKioskConfigurationAssetUploadIntent(
  accessToken: string,
  deviceId: string,
  input: {
    contentType: string;
    sizeBytes: number;
    fileName?: string;
  },
): Promise<KioskConfigurationAssetUploadIntent> {
  return selfxApi<KioskConfigurationAssetUploadIntent>(
    `/api/v1/admin/kiosks/${deviceId}/configuration/assets/upload-intent`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}
