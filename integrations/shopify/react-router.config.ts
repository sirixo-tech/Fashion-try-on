import type { Config } from "@react-router/dev/config";

const configuredAppHost = (() => {
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!appUrl) return null;

  try {
    return new URL(appUrl).host;
  } catch {
    return null;
  }
})();

export default {
  allowedActionOrigins: [
    "fashion-try-on-production.up.railway.app",
    ...(configuredAppHost ? [configuredAppHost] : []),
  ],
} satisfies Config;
