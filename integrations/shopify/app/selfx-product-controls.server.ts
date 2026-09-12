import {
  SelfxLinkApiError,
  type SelfxLinkConfig,
} from "./selfx-link.server";

const requestTimeoutMs = 15_000;

export type SelfxProductTryOnStatus =
  | "READY"
  | "DISABLED"
  | "INACTIVE"
  | "MISSING_IMAGE"
  | "NOT_GARMENT";

export type SelfxProductControl = {
  id: string;
  externalProductId: string;
  handle: string | null;
  name: string;
  active: boolean;
  vtoEnabled: boolean;
  productVertical: string;
  imageUrl: string | null;
  tryOnStatus: SelfxProductTryOnStatus;
  updatedAt: string;
};

export type SelfxProductControlsResponse = {
  data: SelfxProductControl[];
  summary: {
    total: number;
    ready: number;
    disabled: number;
    needsAttention: number;
  };
};

export class SelfxProductControlsClient {
  constructor(
    private readonly config: SelfxLinkConfig,
    private readonly integrationToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async listProducts(limit = 25): Promise<SelfxProductControlsResponse> {
    const search = new URLSearchParams({ limit: String(limit) });
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
