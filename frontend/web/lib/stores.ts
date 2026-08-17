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
