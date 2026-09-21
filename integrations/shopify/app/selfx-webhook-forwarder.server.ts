const requestTimeoutMs = 15_000;
const centralWebhookPath = "/api/v1/integrations/shopify/webhooks";

const forwardedHeaderNames = [
  "content-type",
  "x-shopify-api-version",
  "x-shopify-hmac-sha256",
  "x-shopify-shop-domain",
  "x-shopify-topic",
  "x-shopify-triggered-at",
  "x-shopify-webhook-id",
] as const;

export type SelfxWebhookForwardingConfig = {
  apiBaseUrl: string;
};

export async function forwardShopifyWebhookToSelfx(input: {
  request: Request;
  rawBody: ArrayBuffer;
  config?: SelfxWebhookForwardingConfig;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const config = input.config ?? loadSelfxWebhookForwardingConfig();
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = forwardedHeaders(input.request.headers);

  try {
    const response = await fetchImpl(
      `${config.apiBaseUrl}${centralWebhookPath}`,
      {
        method: "POST",
        headers,
        body: input.rawBody,
        redirect: "manual",
        signal: AbortSignal.timeout(requestTimeoutMs),
      },
    );

    return new Response(null, { status: response.status });
  } catch {
    // A non-2xx response makes Shopify retry instead of losing the delivery.
    return new Response(null, { status: 503 });
  }
}

export function loadSelfxWebhookForwardingConfig(
  env: NodeJS.ProcessEnv = process.env,
): SelfxWebhookForwardingConfig {
  const value = env.SELFX_API_BASE_URL?.trim();
  if (!value) {
    throw new Error("SELFX_API_BASE_URL is required.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SELFX_API_BASE_URL must be a valid URL.");
  }

  const local =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("SELFX_API_BASE_URL must use HTTPS except on localhost.");
  }

  url.search = "";
  url.hash = "";
  return {
    apiBaseUrl: (url.origin + url.pathname).replace(/\/+$/, ""),
  };
}

function forwardedHeaders(source: Headers): Headers {
  const headers = new Headers();
  for (const name of forwardedHeaderNames) {
    const value = source.get(name);
    if (value != null) headers.set(name, value);
  }
  return headers;
}
