export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  webOrigin: string;
}

export function loadGoogleAuthConfig(
  env = process.env,
): GoogleAuthConfig | null {
  if (env.SELFX_GOOGLE_AUTH_ENABLED !== "true") return null;
  const clientId = env.GOOGLE_AUTH_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_AUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret)
    throw new Error(
      "Google sign-in requires GOOGLE_AUTH_CLIENT_ID and GOOGLE_AUTH_CLIENT_SECRET.",
    );
  const web = new URL(env.SELFX_PUBLIC_WEB_BASE_URL ?? "");
  const redirect = new URL(env.GOOGLE_AUTH_REDIRECT_URI ?? "");
  const allowed = (url: URL) =>
    url.protocol === "https:" ||
    (env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname));
  if (
    !allowed(web) ||
    web.href !== `${web.origin}/` ||
    web.username ||
    web.password ||
    !allowed(redirect) ||
    redirect.username ||
    redirect.password ||
    redirect.search ||
    redirect.hash ||
    redirect.pathname !== "/api/v1/auth/google/callback" ||
    (env.NODE_ENV === "production" && redirect.origin !== web.origin)
  ) {
    throw new Error(
      "Google sign-in requires a valid public web origin and registered /api/v1/auth/google/callback URL (same web origin in production).",
    );
  }
  return {
    clientId,
    clientSecret,
    redirectUri: redirect.href,
    webOrigin: web.origin,
  };
}

export function googleReturnPath(value?: string): string {
  if (
    !value ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  )
    return "/app/dashboard";
  const url = new URL(value, "https://selfx.local");
  return url.origin === "https://selfx.local" &&
    (url.pathname === "/app" || url.pathname.startsWith("/app/"))
    ? `${url.pathname}${url.search}${url.hash}`
    : "/app/dashboard";
}
