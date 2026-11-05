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
  locale?: string;
};

export type SelfxStorefrontCreditSummary = {
  availableCredits: number;
  postpaid?: {
    billingMode: "POSTPAID_PAYG";
    billableCredits: number;
    periodStart: string;
    periodEnd: string;
    currency: string;
    creditUnitPriceCents: number;
    estimatedAmountCents: string;
  } | null;
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
      billingMode: "POSTPAID_PAYG" | "CREDIT_LIMITED";
      currency: string;
      monthlyPriceCents: number;
      includedCredits: number;
      storeLocationLimit: number | null;
      extraCreditPriceCents: number | null;
      kioskMonthlyRentCents: number | null;
      kioskDeviceLimit: number | null;
      channels: string[];
    } | null;
  } | null;
};

export type SelfxStorefrontConnectionHealth = {
  reconciliationOwner?: "SELFX_API" | "SHOPIFY_APP";
  state: "CONNECTED" | "NEEDS_RECONNECT" | "NOT_CONNECTED" | "ERROR";
  shopDomain: string;
  storeName: string | null;
  integrationId: string | null;
  storeId: string | null;
  reasons: string[];
  message: string;
};

export type SelfxStorefrontPricingPlan = {
  billingMode?: "POSTPAID_PAYG" | "CREDIT_LIMITED";
  creditUnitPriceCents?: number | null;
  id: string;
  code: string;
  name: string;
  channels: string[];
  currency: string;
  monthlyPriceCents: number;
  includedCredits: number;
  trialCredits: number;
  storeLocationLimit: number | null;
  extraCreditPriceCents: number | null;
  kioskMonthlyRentCents: number | null;
  kioskDeviceLimit: number | null;
  featureKeys: string[];
};

export type SelfxStorefrontPricingPlans = {
  data: SelfxStorefrontPricingPlan[];
};

export type SelfxStorefrontUsageSummary = {
  totalTryOns: number;
  thisMonth: {
    start: string;
    end: string;
    tryOns: number;
    completedTryOns: number;
    failedTryOns: number;
    generatedImages: number;
    creditsConsumed: number;
  };
  topProducts: Array<{
    productId: string;
    productName: string;
    productSlug?: string;
    imageUrl?: string;
    tryOns: number;
  }>;
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

  async availability(input: {
    source: "shopify";
    shop: string;
    externalProductId?: string;
    productHandle?: string;
  }): Promise<{ available: boolean }> {
    return this.request("/availability", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  async createSession(input: {
    source: "shopify";
    shop: string;
    externalProductId?: string;
    productHandle?: string;
    locale?: string;
    visitorToken?: string;
    visitorTryOnLimit?: number;
    visitorTryOnLimitPeriod?: string;
    monthlyStoreTryOnLimit?: number;
  }): Promise<SelfxStorefrontTryOnCreated> {
    const result = await this.request<SelfxStorefrontTryOnCreated>("", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(result.session) ||
      !validDate(result.expiresAt)
    ) {
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

  async getConnectionHealth(
    shop: string,
  ): Promise<SelfxStorefrontConnectionHealth> {
    const search = new URLSearchParams({ shop });
    const result = await this.request<SelfxStorefrontConnectionHealth>(
      `/connection-health?${search.toString()}`,
      { method: "GET" },
    );
    if (
      !["CONNECTED", "NEEDS_RECONNECT", "NOT_CONNECTED", "ERROR"].includes(
        result.state,
      ) ||
      !Array.isArray(result.reasons)
    ) {
      throw invalidResponse();
    }
    return result;
  }

  async getUsageSummary(shop: string): Promise<SelfxStorefrontUsageSummary> {
    const search = new URLSearchParams({ shop });
    const result = await this.request<SelfxStorefrontUsageSummary>(
      `/usage-summary?${search.toString()}`,
      { method: "GET" },
    );
    if (
      !Number.isFinite(result.totalTryOns) ||
      !Number.isFinite(result.thisMonth?.tryOns)
    ) {
      throw invalidResponse();
    }
    return result;
  }

  async getAvailablePlans(shop: string): Promise<SelfxStorefrontPricingPlans> {
    const search = new URLSearchParams({ shop });
    const result = await this.request<SelfxStorefrontPricingPlans>(
      `/plans?${search.toString()}`,
      { method: "GET" },
    );
    if (!Array.isArray(result.data)) {
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
  shop?: string | null;
  productId?: string | null;
  productHandle?: string | null;
  locale?: string | null;
}): string {
  const url = new URL(input.baseUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("session", input.session);
  setOptionalSearchParam(url, "shop", input.shop);
  setOptionalSearchParam(url, "productId", input.productId);
  setOptionalSearchParam(url, "productHandle", input.productHandle);
  setOptionalSearchParam(url, "locale", input.locale);
  return url.toString();
}

export function storefrontNavigationResponse(targetUrl: string): Response {
  const scriptUrl = JSON.stringify(targetUrl).replace(/</g, "\\u003c");
  const linkUrl = targetUrl
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#fffaf1"><title>SelfX Try-On</title><style>
      :root{color-scheme:light;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#25221f;background:#fffaf1}
      *{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#fffaf1 0%,#fff4e7 100%)}
      main{width:min(100%,420px);padding:48px 32px 36px;text-align:center;background:#fff;border:1px solid #f0e6d9;border-radius:28px;box-shadow:0 18px 60px rgba(78,50,24,.09)}
      .brand{margin:0;color:#f46b13;font-size:34px;font-weight:850;letter-spacing:-1.8px}.brand span{color:#f5aa16}
      .spinner{width:46px;height:46px;margin:34px auto 22px;border:4px solid #ffe3cc;border-top-color:#f46b13;border-radius:50%;animation:spin .8s linear infinite}
      h1{margin:0;font-size:20px;font-weight:700;letter-spacing:-.3px}.message{margin:9px 0 0;color:#77716a;font-size:15px;line-height:1.55}
      .fallback{display:inline-block;margin-top:28px;color:#c9570d;font-size:14px;font-weight:650;text-decoration:none}.fallback:hover{text-decoration:underline}
      @keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinner{animation-duration:2s}}
    </style></head><body><main aria-busy="true" aria-live="polite"><p class="brand" aria-label="SelfX">SELF<span>X</span></p><div class="spinner" role="status" aria-label="Loading"></div><h1>Opening your fitting room</h1><p class="message">Taking you to your SelfX Try-On…</p><a class="fallback" href="${linkUrl}" rel="noreferrer">Continue to SelfX</a></main><script>window.location.replace(${scriptUrl});</script></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}

function setOptionalSearchParam(
  url: URL,
  name: string,
  value: string | null | undefined,
): void {
  const clean = value?.trim();
  if (clean) {
    url.searchParams.set(name, clean);
  }
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
