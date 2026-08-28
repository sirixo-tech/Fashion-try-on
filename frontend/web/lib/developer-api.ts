import { selfxApi } from "@/lib/api";

export type DeveloperApiKeyEnvironment = "TEST" | "LIVE";

export type DeveloperApiKeyScope =
  "tryon:create" | "tryon:read" | "usage:read" | "webhooks:manage";

export type DeveloperApiKey = {
  id: string;
  storeId: string;
  storeName: string;
  name: string;
  keyPrefix: string;
  environment: DeveloperApiKeyEnvironment;
  status: "ACTIVE" | "REVOKED";
  scopes: DeveloperApiKeyScope[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdByEmail: string;
  createdAt: string;
  revokedAt: string | null;
};

export type DeveloperApiKeyListResponse = {
  data: DeveloperApiKey[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
};

export type CreateDeveloperApiKeyInput = {
  storeId: string;
  name: string;
  environment: DeveloperApiKeyEnvironment;
  scopes: DeveloperApiKeyScope[];
  expiresAt?: string | null;
};

export type CreateDeveloperApiKeyResponse = {
  apiKey: DeveloperApiKey;
  secret: string;
};

export function listDeveloperApiKeys(
  accessToken: string,
  input: { storeId?: string; page?: number; pageSize?: number } = {},
): Promise<DeveloperApiKeyListResponse> {
  const params = new URLSearchParams();
  if (input.storeId) {
    params.set("storeId", input.storeId);
  }
  if (input.page) {
    params.set("page", String(input.page));
  }
  if (input.pageSize) {
    params.set("pageSize", String(input.pageSize));
  }
  const query = params.toString();
  return selfxApi<DeveloperApiKeyListResponse>(
    `/api/v1/admin/developer/api-keys${query ? `?${query}` : ""}`,
    { accessToken },
  );
}

export function createDeveloperApiKey(
  accessToken: string,
  input: CreateDeveloperApiKeyInput,
): Promise<CreateDeveloperApiKeyResponse> {
  return selfxApi<CreateDeveloperApiKeyResponse>(
    "/api/v1/admin/developer/api-keys",
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}

export function revokeDeveloperApiKey(
  accessToken: string,
  keyId: string,
): Promise<DeveloperApiKey> {
  return selfxApi<DeveloperApiKey>(
    `/api/v1/admin/developer/api-keys/${keyId}/revoke`,
    {
      method: "POST",
      accessToken,
    },
  );
}
