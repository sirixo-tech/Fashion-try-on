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

export function revokeKioskDevice(
  accessToken: string,
  deviceId: string,
): Promise<KioskDevice> {
  return selfxApi<KioskDevice>(`/api/v1/admin/kiosks/${deviceId}/revoke`, {
    method: "POST",
    accessToken,
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
