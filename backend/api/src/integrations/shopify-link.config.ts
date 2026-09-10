export type ShopifyLinkConfig = {
  serviceToken: string;
  webBaseUrl: string;
};

export function loadShopifyLinkConfig(
  env: NodeJS.ProcessEnv = process.env,
): ShopifyLinkConfig {
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
    serviceToken,
    webBaseUrl: validBaseUrl(
      required(env.SELFX_WEB_BASE_URL, "SELFX_WEB_BASE_URL"),
      "SELFX_WEB_BASE_URL",
    ),
  };
}

function required(value: string | undefined, name: string): string {
  const clean = value?.trim();
  if (!clean) throw new Error(`${name} is required for Shopify Store linking.`);
  return clean;
}

function validBaseUrl(value: string, name: string): string {
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error(`${name} must use HTTPS except on localhost.`);
  }
  return url.origin + url.pathname.replace(/\/$/, "");
}
