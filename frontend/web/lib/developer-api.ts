import { selfxApi } from "@/lib/api";

export type DeveloperApiKeyEnvironment = "TEST" | "LIVE";

export type DeveloperApiKeyScope =
  "tryon:create" | "tryon:read" | "usage:read" | "webhooks:manage";

export type DeveloperApiUsageRangePreset =
  "today" | "7d" | "30d" | "90d" | "custom";

export type DeveloperApiCatalogSource =
  | "SELFX_CATALOG"
  | "STORE_CATALOG"
  | "SHOPIFY"
  | "WOOCOMMERCE"
  | "CUSTOM_API"
  | "PUBLIC_API";

export type DeveloperApiWebhookEvent = "try_on.completed" | "try_on.failed";

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

export type DeveloperApiUsageSummary = {
  range: {
    preset: DeveloperApiUsageRangePreset;
    from: string;
    to: string;
  };
  scope: {
    storeId: string | null;
    storeName: string | null;
    apiKeyId: string | null;
    keyPrefix: string | null;
  };
  totals: {
    runsCreated: number;
    queuedRuns: number;
    processingRuns: number;
    completedRuns: number;
    failedRuns: number;
    generatedLooks: number;
    downloadsCompleted: number;
  };
  providerUsage: Array<{
    provider: string;
    providerModel: string | null;
    runsCreated: number;
    completedRuns: number;
    failedRuns: number;
  }>;
  catalogSourceUsage: Array<{
    catalogSource: DeveloperApiCatalogSource | null;
    runsCreated: number;
    completedRuns: number;
    failedRuns: number;
    generatedLooks: number;
    downloadsCompleted: number;
  }>;
  productUsage: Array<{
    selfxProductId?: string;
    catalogSource?: DeveloperApiCatalogSource;
    externalProductId?: string;
    externalVariantId?: string;
    sku?: string;
    productName?: string;
    price?: string;
    currency?: string;
    runsCreated: number;
    completedRuns: number;
    failedRuns: number;
    generatedLooks: number;
    downloadsCompleted: number;
  }>;
};

export type DeveloperApiWebhookDelivery = {
  id: string;
  webhookEndpointId: string;
  endpointUrl: string;
  eventId: string;
  eventType: DeveloperApiWebhookEvent | string;
  attemptNumber: number;
  status: string;
  httpStatus: number | null;
  errorMessage: string | null;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

export type DeveloperApiWebhookEndpoint = {
  id: string;
  storeId: string;
  storeName: string;
  url: string;
  status: "ACTIVE" | "DISABLED";
  subscribedEvents: DeveloperApiWebhookEvent[];
  latestDelivery: DeveloperApiWebhookDelivery | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateDeveloperApiWebhookInput = {
  storeId: string;
  url: string;
  subscribedEvents?: DeveloperApiWebhookEvent[];
};

export type UpdateDeveloperApiWebhookInput = {
  url?: string;
  subscribedEvents?: DeveloperApiWebhookEvent[];
  enabled?: boolean;
};

export type CreateDeveloperApiWebhookResponse = DeveloperApiWebhookEndpoint & {
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

export function getDeveloperApiUsageSummary(
  accessToken: string,
  input: {
    storeId?: string;
    apiKeyId?: string;
    range?: DeveloperApiUsageRangePreset;
    limit?: number;
    catalogSource?: DeveloperApiCatalogSource;
    productQuery?: string;
  } = {},
): Promise<DeveloperApiUsageSummary> {
  const params = new URLSearchParams();
  if (input.storeId) {
    params.set("storeId", input.storeId);
  }
  if (input.apiKeyId) {
    params.set("apiKeyId", input.apiKeyId);
  }
  if (input.range) {
    params.set("range", input.range);
  }
  if (input.limit) {
    params.set("limit", String(input.limit));
  }
  if (input.catalogSource) {
    params.set("catalogSource", input.catalogSource);
  }
  if (input.productQuery) {
    params.set("productQuery", input.productQuery);
  }
  const query = params.toString();
  return selfxApi<DeveloperApiUsageSummary>(
    `/api/v1/admin/developer/usage${query ? `?${query}` : ""}`,
    { accessToken },
  );
}

export function listDeveloperApiWebhooks(
  accessToken: string,
  input: { storeId?: string } = {},
): Promise<{ data: DeveloperApiWebhookEndpoint[] }> {
  const params = new URLSearchParams();
  if (input.storeId) {
    params.set("storeId", input.storeId);
  }
  const query = params.toString();
  return selfxApi<{ data: DeveloperApiWebhookEndpoint[] }>(
    `/api/v1/admin/developer/webhooks${query ? `?${query}` : ""}`,
    { accessToken },
  );
}

export function createDeveloperApiWebhook(
  accessToken: string,
  input: CreateDeveloperApiWebhookInput,
): Promise<CreateDeveloperApiWebhookResponse> {
  return selfxApi<CreateDeveloperApiWebhookResponse>(
    "/api/v1/admin/developer/webhooks",
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}

export function updateDeveloperApiWebhook(
  accessToken: string,
  endpointId: string,
  input: UpdateDeveloperApiWebhookInput,
): Promise<DeveloperApiWebhookEndpoint> {
  return selfxApi<DeveloperApiWebhookEndpoint>(
    `/api/v1/admin/developer/webhooks/${endpointId}`,
    {
      method: "PATCH",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}

export function disableDeveloperApiWebhook(
  accessToken: string,
  endpointId: string,
): Promise<void> {
  return updateDeveloperApiWebhook(accessToken, endpointId, {
    enabled: false,
  }).then(() => undefined);
}

export function listDeveloperApiWebhookDeliveries(
  accessToken: string,
  input: { storeId?: string; endpointId?: string; limit?: number } = {},
): Promise<{ data: DeveloperApiWebhookDelivery[] }> {
  const params = new URLSearchParams();
  if (input.storeId) {
    params.set("storeId", input.storeId);
  }
  if (input.endpointId) {
    params.set("endpointId", input.endpointId);
  }
  if (input.limit) {
    params.set("limit", String(input.limit));
  }
  const query = params.toString();
  return selfxApi<{ data: DeveloperApiWebhookDelivery[] }>(
    `/api/v1/admin/developer/webhook-deliveries${query ? `?${query}` : ""}`,
    { accessToken },
  );
}
