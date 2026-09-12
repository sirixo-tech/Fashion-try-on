import { type SelfxLinkConfig, SelfxLinkApiError } from "./selfx-link.server";

const requestTimeoutMs = 15_000;

export type SelfxStorefrontTryOnCreated = {
  session: string;
  garmentAssetId: string;
  expiresAt: string;
  product: {
    id: string;
    name: string;
    handle?: string;
    externalProductId?: string;
    imageUrl?: string;
  };
};

export type SelfxStorefrontCreditSummary = {
  availableCredits: number;
  subscription: {
    id: string;
    status: string;
    channels: string[];
    includedCredits: number;
    trialCredits: number;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    pricingPlan: {
      id: string;
      code: string;
      name: string;
      currency: string;
      monthlyPriceCents: number;
      includedCredits: number;
      extraCreditPriceCents: number | null;
      kioskMonthlyRentCents: number | null;
      kioskDeviceLimit: number | null;
      channels: string[];
    } | null;
  } | null;
};

export type StorefrontProductReference = {
  externalProductId: string | null;
  productHandle: string | null;
};

export class SelfxStorefrontTryOnClient {
  constructor(
    private readonly config: SelfxLinkConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async createSession(input: {
    source: "shopify";
    shop: string;
    externalProductId?: string;
    productHandle?: string;
  }): Promise<SelfxStorefrontTryOnCreated> {
    const result = await this.request<SelfxStorefrontTryOnCreated>("", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!/^[A-Za-z0-9_-]{43}$/.test(result.session) || !validDate(result.expiresAt)) {
      throw invalidResponse();
    }
    return result;
  }

  async getCreditSummary(shop: string): Promise<SelfxStorefrontCreditSummary> {
    const search = new URLSearchParams({ shop });
    const result = await this.request<SelfxStorefrontCreditSummary>(
      `/credit-summary?${search.toString()}`,
      { method: "GET" },
    );
    if (!Number.isFinite(result.availableCredits)) {
      throw invalidResponse();
    }
    return result;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.config.apiBaseUrl}/api/v1/public/integrations/shopify/try-on-sessions${path}`,
        {
          ...init,
          headers: {
            Accept: "application/json",
            ...(init.body == null
              ? {}
              : { "Content-Type": "application/json" }),
            "x-selfx-shopify-service-token": this.config.serviceToken,
          },
          signal: AbortSignal.timeout(requestTimeoutMs),
        },
      );
    } catch {
      throw new SelfxLinkApiError(
        "SELFX_TRYON_UNAVAILABLE",
        "SelfX Try-On could not be reached. Try again shortly.",
        503,
      );
    }
    if (!response.ok) {
      const body = await safeJson(response);
      throw new SelfxLinkApiError(
        body?.error?.code ?? "SELFX_TRYON_FAILED",
        body?.error?.message ?? "SelfX Try-On could not be started.",
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

export function buildStorefrontTryOnSessionUrl(input: {
  baseUrl: string;
  session: string;
}): string {
  const url = new URL(input.baseUrl);
  url.search = "";
  url.searchParams.set("session", input.session);
  return url.toString();
}

export function productReference(
  searchParams: URLSearchParams,
): StorefrontProductReference {
  const externalProductId = normalizeShopifyProductId(
    searchParams.get("productId"),
  );
  const productHandle = normalizeProductHandle(
    searchParams.get("productHandle"),
  );

  return { externalProductId, productHandle };
}

export function normalizeShopifyProductId(value: string | null): string | null {
  const clean = value?.trim();
  if (!clean) return null;
  if (/^gid:\/\/shopify\/Product\/\d+$/.test(clean)) return clean;
  if (/^\d+$/.test(clean)) return `gid://shopify/Product/${clean}`;
  return null;
}

function normalizeProductHandle(value: string | null): string | null {
  const clean = value?.trim().toLowerCase();
  return clean && /^[a-z0-9][a-z0-9-]*$/.test(clean) ? clean : null;
}

function validDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
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
    "SELFX_TRYON_INVALID_RESPONSE",
    "SelfX returned an invalid Try-On response.",
    502,
  );
}
