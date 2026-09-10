import { selfxApi } from "@/lib/api";

export type IntegrationType = "SHOPIFY" | "WOOCOMMERCE";
export type IntegrationStatus = "ACTIVE" | "DISCONNECTED" | "ERROR";

export type IntegrationCredentialScope =
  | "catalog:sync"
  | "products:read"
  | "tryon:create"
  | "tryon:read"
  | "webhooks:receive";

export type IntegrationCredential = {
  id: string;
  integrationId: string;
  name: string;
  tokenPrefix: string;
  scopes: IntegrationCredentialScope[];
  status: "ACTIVE" | "REVOKED";
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdByEmail: string;
  createdAt: string;
  revokedAt: string | null;
};

export type StoreIntegration = {
  id: string;
  storeId: string;
  storeName: string;
  type: IntegrationType;
  status: IntegrationStatus;
  externalAccountId: string | null;
  externalAccountName: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  credentials: IntegrationCredential[];
  createdAt: string;
  updatedAt: string;
};

export type IntegrationListResponse = {
  data: StoreIntegration[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
};

export type CreateIntegrationCredentialInput = {
  name: string;
  scopes: IntegrationCredentialScope[];
  expiresAt?: string | null;
};

export type CreateIntegrationCredentialResponse = {
  credential: IntegrationCredential;
  secret: string;
};

export type ShopifyLinkDetails = {
  id: string;
  status: "PENDING" | "APPROVED" | "REDEEMED";
  shopDomain: string;
  externalAccountName: string | null;
  expiresAt: string;
};

export type ShopifyLinkApproval = {
  id: string;
  status: "APPROVED" | "REDEEMED";
  shopDomain: string;
  storeId: string;
  storeName: string;
  approvedAt: string;
  expiresAt: string;
};

export function listIntegrations(
  accessToken: string,
  input: {
    storeId?: string;
    type?: IntegrationType;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<IntegrationListResponse> {
  const params = new URLSearchParams();
  if (input.storeId) {
    params.set("storeId", input.storeId);
  }
  if (input.type) {
    params.set("type", input.type);
  }
  if (input.page) {
    params.set("page", String(input.page));
  }
  if (input.pageSize) {
    params.set("pageSize", String(input.pageSize));
  }
  const query = params.toString();
  return selfxApi<IntegrationListResponse>(
    `/api/v1/admin/integrations${query ? `?${query}` : ""}`,
    { accessToken },
  );
}

export function connectIntegration(
  accessToken: string,
  input: {
    storeId: string;
    type: IntegrationType;
    externalAccountId?: string | null;
    externalAccountName?: string | null;
  },
): Promise<StoreIntegration> {
  return selfxApi<StoreIntegration>("/api/v1/admin/integrations", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export function startShopifyOauth(
  accessToken: string,
  input: { storeId: string; shop: string },
): Promise<{ authorizationUrl: string; expiresAt: string }> {
  return selfxApi("/api/v1/admin/integrations/shopify/oauth/start", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export function syncShopifyCatalog(
  accessToken: string,
  integrationId: string,
): Promise<{ productsRead: number; variantsRead: number }> {
  return selfxApi(`/api/v1/admin/integrations/${integrationId}/shopify/sync`, {
    method: "POST",
    accessToken,
  });
}

export function getShopifyLinkDetails(
  accessToken: string,
  linkToken: string,
): Promise<ShopifyLinkDetails> {
  return selfxApi<ShopifyLinkDetails>(
    `/api/v1/admin/integrations/shopify/link-sessions/${encodeURIComponent(linkToken)}`,
    { accessToken },
  );
}

export function approveShopifyLink(
  accessToken: string,
  linkToken: string,
  storeId: string,
): Promise<ShopifyLinkApproval> {
  return selfxApi<ShopifyLinkApproval>(
    `/api/v1/admin/integrations/shopify/link-sessions/${encodeURIComponent(linkToken)}/approve`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify({ storeId }),
    },
  );
}

export function disconnectIntegration(
  accessToken: string,
  integrationId: string,
): Promise<StoreIntegration> {
  return selfxApi<StoreIntegration>(
    `/api/v1/admin/integrations/${integrationId}/disconnect`,
    { method: "POST", accessToken },
  );
}

export function createIntegrationCredential(
  accessToken: string,
  integrationId: string,
  input: CreateIntegrationCredentialInput,
): Promise<CreateIntegrationCredentialResponse> {
  return selfxApi<CreateIntegrationCredentialResponse>(
    `/api/v1/admin/integrations/${integrationId}/credentials`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}

export function revokeIntegrationCredential(
  accessToken: string,
  credentialId: string,
): Promise<IntegrationCredential> {
  return selfxApi<IntegrationCredential>(
    `/api/v1/admin/integrations/credentials/${credentialId}/revoke`,
    { method: "POST", accessToken },
  );
}
