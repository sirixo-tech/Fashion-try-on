export type ShopifyConnectorConfig = {
  shopDomain: string;
  adminAccessToken: string;
  apiVersion: string;
  selfxApiBaseUrl: string;
  selfxIntegrationToken: string;
  productPageSize: number;
  selfxBatchSize: number;
};

export function loadShopifyConnectorConfig(
  env: NodeJS.ProcessEnv = process.env,
): ShopifyConnectorConfig {
  return {
    shopDomain: normalizeShopDomain(required(env, "SHOPIFY_SHOP_DOMAIN")),
    adminAccessToken: required(env, "SHOPIFY_ADMIN_ACCESS_TOKEN"),
    apiVersion: normalizeApiVersion(env.SHOPIFY_API_VERSION ?? "2026-07"),
    selfxApiBaseUrl: normalizeSelfxBaseUrl(required(env, "SELFX_API_BASE_URL")),
    selfxIntegrationToken: required(env, "SELFX_INTEGRATION_TOKEN"),
    productPageSize: boundedInteger(
      env.SHOPIFY_PRODUCT_PAGE_SIZE,
      50,
      1,
      100,
      "SHOPIFY_PRODUCT_PAGE_SIZE",
    ),
    selfxBatchSize: boundedInteger(
      env.SELFX_CATALOG_BATCH_SIZE,
      25,
      1,
      100,
      "SELFX_CATALOG_BATCH_SIZE",
    ),
  };
}

export function normalizeShopDomain(value: string): string {
  const domain = value.trim().toLowerCase();
  if (
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain) ||
    domain.length > 255
  ) {
    throw new Error(
      "SHOPIFY_SHOP_DOMAIN must be a valid merchant .myshopify.com domain.",
    );
  }
  return domain;
}

function normalizeApiVersion(value: string): string {
  const version = value.trim();
  if (!/^\d{4}-(01|04|07|10)$/.test(version)) {
    throw new Error("SHOPIFY_API_VERSION must use Shopify's YYYY-MM format.");
  }
  return version;
}

function normalizeSelfxBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("SELFX_API_BASE_URL must be a valid HTTP(S) URL.");
  }
  const local =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error(
      "SELFX_API_BASE_URL must use HTTPS, except for a local development URL.",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(key + " is required.");
  }
  return value;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  key: string,
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      key + " must be an integer from " + minimum + " to " + maximum + ".",
    );
  }
  return parsed;
}
