const requestTimeoutMs = 15_000;

export type SelfxLinkConfig = {
  apiBaseUrl: string;
  webBaseUrl: string;
  serviceToken: string;
};

export type SelfxLinkCreated = {
  linkToken: string;
  approvalUrl: string;
  expiresAt: string;
};

export type SelfxLinkRedeemed = {
  status: "LINKED";
  shopDomain: string;
  storeId: string;
  storeName: string;
  integrationId: string;
  credentialId: string;
  integrationToken: string;
};

export class SelfxLinkApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export class SelfxLinkClient {
  constructor(
    private readonly config: SelfxLinkConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async create(input: {
    shopDomain: string;
    externalAccountId: string;
    externalAccountName: string;
  }): Promise<SelfxLinkCreated> {
    const result = await this.request<SelfxLinkCreated>("", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(result.linkToken) ||
      !validDate(result.expiresAt)
    ) {
      throw invalidResponse();
    }
    assertApprovalUrl(result.approvalUrl, this.config.webBaseUrl);
    return result;
  }

  redeem(linkToken: string): Promise<SelfxLinkRedeemed> {
    return this.request<SelfxLinkRedeemed>(
      `/${encodeURIComponent(linkToken)}/redeem`,
      { method: "POST" },
    );
  }

  approvalUrl(linkToken: string): string {
    const url = new URL(
      "/app/integrations/shopify/link",
      this.config.webBaseUrl,
    );
    url.searchParams.set("token", linkToken);
    return url.toString();
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.config.apiBaseUrl}/api/v1/integrations/shopify/link-sessions${path}`,
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
        "SELFX_LINK_UNAVAILABLE",
        "SelfX could not be reached. Try again shortly.",
        503,
      );
    }
    if (!response.ok) {
      const body = await safeJson(response);
      throw new SelfxLinkApiError(
        body?.error?.code ?? "SELFX_LINK_FAILED",
        body?.error?.message ?? "SelfX could not complete the connection.",
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

export function loadSelfxLinkConfig(
  env: NodeJS.ProcessEnv = process.env,
): SelfxLinkConfig {
  const serviceToken = required(
    env.SELFX_SHOPIFY_APP_SERVICE_TOKEN,
    "SELFX_SHOPIFY_APP_SERVICE_TOKEN",
  );
  if (serviceToken.length < 32) {
    throw new Error(
      "SELFX_SHOPIFY_APP_SERVICE_TOKEN must be at least 32 characters.",
    );
  }
  return {
    apiBaseUrl: validBaseUrl(
      required(env.SELFX_API_BASE_URL, "SELFX_API_BASE_URL"),
      "SELFX_API_BASE_URL",
    ),
    webBaseUrl: validBaseUrl(
      required(env.SELFX_WEB_BASE_URL, "SELFX_WEB_BASE_URL"),
      "SELFX_WEB_BASE_URL",
    ),
    serviceToken,
  };
}

function validBaseUrl(value: string, name: string): string {
  const url = new URL(value);
  const local =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error(`${name} must use HTTPS except on localhost.`);
  }
  url.search = "";
  url.hash = "";
  return (url.origin + url.pathname).replace(/\/+$/, "");
}

function required(value: string | undefined, name: string): string {
  const clean = value?.trim();
  if (!clean) throw new Error(`${name} is required.`);
  return clean;
}

function assertApprovalUrl(value: string, webBaseUrl: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidResponse();
  }
  const expected = new URL(webBaseUrl);
  if (
    url.origin !== expected.origin ||
    url.pathname !== "/app/integrations/shopify/link" ||
    !url.searchParams.get("token")
  ) {
    throw invalidResponse();
  }
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
    "SELFX_LINK_INVALID_RESPONSE",
    "SelfX returned an invalid connection response.",
    502,
  );
}
