import { SelfxLinkApiError, type SelfxLinkConfig } from "./selfx-link.server";

const requestTimeoutMs = 15_000;

export type SelfxProductTryOnStatus =
  | "READY"
  | "DISABLED"
  | "INACTIVE"
  | "MISSING_IMAGE"
  | "MISSING_JEWELLERY_TYPE"
  | "NEEDS_CLASSIFICATION";

export type SelfxProductControl = {
  id: string;
  externalProductId: string;
  handle: string | null;
  name: string;
  active: boolean;
  vtoEnabled: boolean;
  productVertical: string;
  jewelleryType: string | null;
  imageUrl: string | null;
  tryOnStatus: SelfxProductTryOnStatus;
  updatedAt: string;
};

export type SelfxProductControlsResponse = {
  data: SelfxProductControl[];
  hasMore: boolean;
  summary: {
    total: number;
    ready: number;
    disabled: number;
    needsAttention: number;
  };
};

export type SelfxShopifyTryOnMode = "GARMENT" | "JEWELLERY" | "BOTH";

export class SelfxProductControlsClient {
  constructor(
    private readonly config: SelfxLinkConfig,
    private readonly integrationToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async listProducts(
    limit = 25,
    query: { search?: string; offset?: number } = {},
  ): Promise<SelfxProductControlsResponse> {
    const search = new URLSearchParams({ limit: String(limit) });
    if (query.search) search.set("search", query.search);
    if (query.offset != null) search.set("offset", String(query.offset));
    const result = await this.request<SelfxProductControlsResponse>(
      `/products?${search.toString()}`,
      { method: "GET" },
    );
    if (!Array.isArray(result.data) || !result.summary) {
      throw invalidResponse();
    }
    return result;
  }

  async setProductVto(input: {
    externalProductId: string;
    enabled: boolean;
  }): Promise<SelfxProductControl> {
    const result = await this.request<SelfxProductControl>("/products/vto", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    if (!result.externalProductId || !result.tryOnStatus) {
      throw invalidResponse();
    }
    return result;
  }

  async setProductKind(input: {
    externalProductId: string;
    productVertical: string;
    jewelleryType: string | null;
  }): Promise<SelfxProductControl> {
    const result = await this.request<SelfxProductControl>("/products/kind", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    if (!result.externalProductId || !result.productVertical) {
      throw invalidResponse();
    }
    return result;
  }

  async updateShopifySettings(input: {
    tryOnMode: SelfxShopifyTryOnMode;
  }): Promise<{ tryOnMode: SelfxShopifyTryOnMode }> {
    const result = await this.request<{ tryOnMode: SelfxShopifyTryOnMode }>(
      "/settings/shopify",
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
    if (
      result.tryOnMode !== "GARMENT" &&
      result.tryOnMode !== "JEWELLERY" &&
      result.tryOnMode !== "BOTH"
    ) {
      throw invalidResponse();
    }
    return result;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.config.apiBaseUrl}/api/v1/integrations${path}`,
        {
          ...init,
          headers: {
            Accept: "application/json",
            ...(init.body == null
              ? {}
              : { "Content-Type": "application/json" }),
            "x-selfx-integration-token": this.integrationToken,
          },
          signal: AbortSignal.timeout(requestTimeoutMs),
        },
      );
    } catch {
      throw new SelfxLinkApiError(
        "SELFX_PRODUCTS_UNAVAILABLE",
        "SelfX product controls could not be reached. Try again shortly.",
        503,
      );
    }
    if (!response.ok) {
      const body = await safeJson(response);
      throw new SelfxLinkApiError(
        body?.error?.code ?? "SELFX_PRODUCTS_FAILED",
        body?.error?.message ?? "SelfX product controls failed.",
        response.status,
      );
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw invalidResponse();
    }
  }
}

async function safeJson(
  response: Response,
): Promise<{ error?: { code?: string; message?: string } } | null> {
  try {
    return (await response.json()) as {
      error?: { code?: string; message?: string };
    };
  } catch {
    return null;
  }
}

function invalidResponse(): SelfxLinkApiError {
  return new SelfxLinkApiError(
    "SELFX_PRODUCTS_INVALID_RESPONSE",
    "SelfX returned an invalid product controls response.",
    502,
  );
}
