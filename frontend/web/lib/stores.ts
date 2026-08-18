import { selfxApi } from "@/lib/api";
import {
  type KioskConfiguration,
  type KioskConfigurationAssetUploadIntent,
  type KioskConfigurationUpdateInput,
  type KioskDevice,
} from "@/lib/kiosks";

export type StoreStatus = "ACTIVE" | "INACTIVE";

export type AdminStore = {
  id: string;
  name: string;
  slug: string;
  status: StoreStatus;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  country: string | null;
  timezone: string;
  totalKiosks: number;
  activeKiosks: number;
  offlineKiosks: number;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  internalLegacyModel: "ORGANIZATION_AS_STORE";
};

export type AdminStoreDetail = AdminStore & {
  kiosks: { data: KioskDevice[] };
};

export type StorePermission = {
  id: string;
  code: string;
  module: string;
  action: string;
  label: string;
  description: string | null;
  isSystem: boolean;
  applicability: "PLATFORM_ONLY" | "STORE" | "BOTH";
  granted: boolean;
};

export type StoreRole = {
  id: string;
  name: string;
  description: string | null;
  systemCode: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissionsCount: number;
  assignedUsersCount: number;
  permissions: StorePermission[];
  createdAt: string;
  updatedAt: string;
};

export type StoreUser = {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string | null;
  status: "INVITED" | "PENDING_ACTIVATION" | "ACTIVE" | "SUSPENDED" | "REVOKED";
  roles: StoreRole[];
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoreRbacListResponse<T> = {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
};

export type EffectiveStorePermissions = {
  storeId: string;
  permissions: string[];
  platformBypass: boolean;
  membershipId: string | null;
};

export type StoreListResponse = {
  data: AdminStore[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
};

export type StoreInput = {
  name: string;
  slug?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  address?: string;
  city?: string;
  stateRegion?: string;
  postalCode?: string;
  country?: string;
  timezone?: string;
};

export function listStores(
  accessToken: string,
  query: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: StoreStatus | "ALL";
    sort?: "createdDesc" | "createdAsc" | "nameAsc" | "nameDesc";
  } = {},
): Promise<StoreListResponse> {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 25));
  if (query.search) {
    params.set("search", query.search);
  }
  if (query.status && query.status !== "ALL") {
    params.set("status", query.status);
  }
  if (query.sort) {
    params.set("sort", query.sort);
  }
  return selfxApi<StoreListResponse>(`/api/v1/admin/stores?${params}`, {
    accessToken,
  });
}

export function createStore(
  accessToken: string,
  input: StoreInput,
): Promise<AdminStore> {
  return selfxApi<AdminStore>("/api/v1/admin/stores", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export function getStore(
  accessToken: string,
  storeId: string,
): Promise<AdminStoreDetail> {
  return selfxApi<AdminStoreDetail>(`/api/v1/admin/stores/${storeId}`, {
    accessToken,
  });
}

export function updateStore(
  accessToken: string,
  storeId: string,
  input: StoreInput & { status?: StoreStatus },
): Promise<AdminStore> {
  return selfxApi<AdminStore>(`/api/v1/admin/stores/${storeId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  });
}

export function deactivateStore(
  accessToken: string,
  storeId: string,
): Promise<AdminStore> {
  return selfxApi<AdminStore>(`/api/v1/admin/stores/${storeId}/deactivate`, {
    method: "POST",
    accessToken,
  });
}

export function activateStore(
  accessToken: string,
  storeId: string,
): Promise<AdminStore> {
  return selfxApi<AdminStore>(`/api/v1/admin/stores/${storeId}/activate`, {
    method: "POST",
    accessToken,
  });
}

export function pairStoreKiosk(
  accessToken: string,
  storeId: string,
  input: { pairingCode: string; displayName: string },
): Promise<KioskDevice> {
  return selfxApi<{ device: KioskDevice }>(
    `/api/v1/admin/stores/${storeId}/kiosks/pair`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  ).then((response) => response.device);
}

export function getStoreKioskConfiguration(
  accessToken: string,
  storeId: string,
  deviceId: string,
): Promise<KioskConfiguration> {
  return selfxApi<KioskConfiguration>(
    `/api/v1/admin/stores/${storeId}/kiosks/${deviceId}/configuration`,
    { accessToken },
  );
}

export function updateStoreKioskConfiguration(
  accessToken: string,
  storeId: string,
  deviceId: string,
  input: KioskConfigurationUpdateInput,
): Promise<KioskConfiguration> {
  return selfxApi<KioskConfiguration>(
    `/api/v1/admin/stores/${storeId}/kiosks/${deviceId}/configuration`,
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}

export function createStoreKioskConfigurationAssetUploadIntent(
  accessToken: string,
  storeId: string,
  deviceId: string,
  input: {
    contentType: string;
    sizeBytes: number;
    fileName?: string;
  },
): Promise<KioskConfigurationAssetUploadIntent> {
  return selfxApi<KioskConfigurationAssetUploadIntent>(
    `/api/v1/admin/stores/${storeId}/kiosks/${deviceId}/configuration/assets/upload-intent`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}

export function listStorePermissions(
  accessToken: string,
  storeId: string,
): Promise<{ data: StorePermission[] }> {
  return selfxApi<{ data: StorePermission[] }>(
    `/api/v1/admin/stores/${storeId}/permissions`,
    { accessToken },
  );
}

export function getEffectiveStorePermissions(
  accessToken: string,
  storeId: string,
): Promise<EffectiveStorePermissions> {
  return selfxApi<EffectiveStorePermissions>(
    `/api/v1/admin/stores/${storeId}/effective-permissions`,
    { accessToken },
  );
}

export function listStoreRoles(
  accessToken: string,
  storeId: string,
  query: { page?: number; pageSize?: number; search?: string } = {},
): Promise<StoreRbacListResponse<StoreRole>> {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 25));
  if (query.search) {
    params.set("search", query.search);
  }
  return selfxApi<StoreRbacListResponse<StoreRole>>(
    `/api/v1/admin/stores/${storeId}/roles?${params}`,
    { accessToken },
  );
}

export function createStoreRole(
  accessToken: string,
  storeId: string,
  input: { name: string; description?: string; permissionCodes?: string[] },
): Promise<StoreRole> {
  return selfxApi<StoreRole>(`/api/v1/admin/stores/${storeId}/roles`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export function updateStoreRole(
  accessToken: string,
  storeId: string,
  roleId: string,
  input: { name?: string; description?: string | null; isActive?: boolean },
): Promise<StoreRole> {
  return selfxApi<StoreRole>(
    `/api/v1/admin/stores/${storeId}/roles/${roleId}`,
    {
      method: "PATCH",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}

export function replaceStoreRolePermissions(
  accessToken: string,
  storeId: string,
  roleId: string,
  permissionCodes: string[],
): Promise<StoreRole> {
  return selfxApi<StoreRole>(
    `/api/v1/admin/stores/${storeId}/roles/${roleId}/permissions`,
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify({ permissionCodes }),
    },
  );
}

export function deleteStoreRole(
  accessToken: string,
  storeId: string,
  roleId: string,
): Promise<StoreRole> {
  return selfxApi<StoreRole>(
    `/api/v1/admin/stores/${storeId}/roles/${roleId}`,
    { method: "DELETE", accessToken },
  );
}

export function listStoreUsers(
  accessToken: string,
  storeId: string,
  query: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
  } = {},
): Promise<StoreRbacListResponse<StoreUser>> {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 25));
  if (query.search) {
    params.set("search", query.search);
  }
  if (query.status) {
    params.set("status", query.status);
  }
  return selfxApi<StoreRbacListResponse<StoreUser>>(
    `/api/v1/admin/stores/${storeId}/users?${params}`,
    { accessToken },
  );
}

export function addStoreUser(
  accessToken: string,
  storeId: string,
  input: { email: string; roleIds?: string[] },
): Promise<StoreUser> {
  return selfxApi<StoreUser>(`/api/v1/admin/stores/${storeId}/users`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export function updateStoreUserStatus(
  accessToken: string,
  storeId: string,
  membershipId: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<StoreUser> {
  return selfxApi<StoreUser>(
    `/api/v1/admin/stores/${storeId}/users/${membershipId}/status`,
    {
      method: "PATCH",
      accessToken,
      body: JSON.stringify({ status }),
    },
  );
}

export function replaceStoreUserRoles(
  accessToken: string,
  storeId: string,
  membershipId: string,
  roleIds: string[],
): Promise<StoreUser> {
  return selfxApi<StoreUser>(
    `/api/v1/admin/stores/${storeId}/users/${membershipId}/roles`,
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify({ roleIds }),
    },
  );
}
