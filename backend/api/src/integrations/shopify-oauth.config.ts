export type ShopifyOauthConfig = {
  clientId: string;
  clientSecret: string;
  encryptionKey: Buffer;
  encryptionKeyVersion: string;
  apiVersion: string;
  callbackUrl: string;
  webBaseUrl: string;
};

export function loadShopifyOauthConfig(
  env: NodeJS.ProcessEnv = process.env,
): ShopifyOauthConfig {
  const clientId = required(env.SHOPIFY_CLIENT_ID, "SHOPIFY_CLIENT_ID");
  const clientSecret = required(
    env.SHOPIFY_CLIENT_SECRET,
    "SHOPIFY_CLIENT_SECRET",
  );
  const apiBaseUrl = validBaseUrl(
    required(env.SELFX_API_BASE_URL, "SELFX_API_BASE_URL"),
    "SELFX_API_BASE_URL",
  );
  const webBaseUrl = validBaseUrl(
    required(env.SELFX_WEB_BASE_URL, "SELFX_WEB_BASE_URL"),
    "SELFX_WEB_BASE_URL",
  );
  const encodedKey = required(
    env.SELFX_INTEGRATION_ENCRYPTION_KEY,
    "SELFX_INTEGRATION_ENCRYPTION_KEY",
  );
  const encryptionKey = Buffer.from(encodedKey, "base64");
  if (encryptionKey.length !== 32) {
    throw new Error(
      "SELFX_INTEGRATION_ENCRYPTION_KEY must be a Base64-encoded 32-byte key.",
    );
  }
  const apiVersion = env.SHOPIFY_API_VERSION?.trim() || "2026-07";
  if (!/^\d{4}-(01|04|07|10)$/.test(apiVersion)) {
    throw new Error("SHOPIFY_API_VERSION must be a Shopify quarterly version.");
  }
  return {
    clientId,
    clientSecret,
    encryptionKey,
    encryptionKeyVersion:
      env.SELFX_INTEGRATION_ENCRYPTION_KEY_VERSION?.trim() || "v1",
    apiVersion,
    callbackUrl:
      apiBaseUrl + "/api/v1/admin/integrations/shopify/oauth/callback",
    webBaseUrl,
  };
}

function required(value: string | undefined, name: string): string {
  const clean = value?.trim();
  if (!clean) {
    throw new Error(`${name} is required for Shopify OAuth.`);
  }
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
