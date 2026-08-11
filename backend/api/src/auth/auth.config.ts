export type CookieSameSite = "lax" | "strict" | "none";

export interface AuthConfig {
  nodeEnv: string;
  jwtAccessSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenPepper: string;
  refreshSessionTtlSeconds: number;
  refreshCookieName: string;
  cookieDomain?: string;
  cookieSecure: boolean;
  cookieSameSite: CookieSameSite;
  corsAllowedOrigins: string[];
  loginRateLimitMax: number;
  loginRateLimitWindowMs: number;
  refreshRateLimitMax: number;
  refreshRateLimitWindowMs: number;
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim() === "") {
    throw new Error(`${key} is required`);
  }
  return value;
}

function readPositiveInt(
  env: NodeJS.ProcessEnv,
  key: string,
  minimum = 1,
): number {
  const raw = requireEnv(env, key);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${key} must be an integer >= ${minimum}`);
  }
  return value;
}

function readBoolean(env: NodeJS.ProcessEnv, key: string): boolean {
  const raw = requireEnv(env, key).toLowerCase();
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new Error(`${key} must be true or false`);
}

function readSameSite(env: NodeJS.ProcessEnv): CookieSameSite {
  const value = requireEnv(env, "COOKIE_SAME_SITE").toLowerCase();
  if (value === "lax" || value === "strict" || value === "none") {
    return value;
  }
  throw new Error("COOKIE_SAME_SITE must be lax, strict, or none");
}

function ensureSecretQuality(
  key: string,
  value: string,
  nodeEnv: string,
): void {
  if (value.length < 32) {
    throw new Error(`${key} must be at least 32 characters`);
  }
  if (
    nodeEnv === "production" &&
    (value.includes("CHANGE_ME") || value.startsWith("local_dev_"))
  ) {
    throw new Error(`${key} must be a production secret`);
  }
}

export function loadAuthConfig(env = process.env): AuthConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  const jwtAccessSecret = requireEnv(env, "JWT_ACCESS_SECRET");
  const refreshTokenPepper = requireEnv(env, "REFRESH_TOKEN_PEPPER");
  const corsOrigins = env.CORS_ORIGINS ?? env.CORS_ALLOWED_ORIGINS;
  if (!corsOrigins || corsOrigins.trim() === "") {
    throw new Error("CORS_ORIGINS or CORS_ALLOWED_ORIGINS is required");
  }

  ensureSecretQuality("JWT_ACCESS_SECRET", jwtAccessSecret, nodeEnv);
  ensureSecretQuality("REFRESH_TOKEN_PEPPER", refreshTokenPepper, nodeEnv);

  const cookieSecure = readBoolean(env, "COOKIE_SECURE");
  const cookieSameSite = readSameSite(env);
  if (nodeEnv === "production" && !cookieSecure) {
    throw new Error("COOKIE_SECURE must be true in production");
  }
  if (cookieSameSite === "none" && !cookieSecure) {
    throw new Error("COOKIE_SAME_SITE=none requires COOKIE_SECURE=true");
  }

  return {
    nodeEnv,
    jwtAccessSecret,
    accessTokenTtlSeconds: readPositiveInt(env, "JWT_ACCESS_TOKEN_TTL_SECONDS"),
    refreshTokenPepper,
    refreshSessionTtlSeconds: readPositiveInt(
      env,
      "REFRESH_SESSION_TTL_SECONDS",
    ),
    refreshCookieName: requireEnv(env, "AUTH_REFRESH_COOKIE_NAME"),
    cookieDomain:
      env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== "localhost"
        ? env.COOKIE_DOMAIN
        : undefined,
    cookieSecure,
    cookieSameSite,
    corsAllowedOrigins: corsOrigins
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    loginRateLimitMax: readPositiveInt(env, "AUTH_LOGIN_RATE_LIMIT_MAX"),
    loginRateLimitWindowMs:
      readPositiveInt(env, "AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS") * 1000,
    refreshRateLimitMax: readPositiveInt(env, "AUTH_REFRESH_RATE_LIMIT_MAX"),
    refreshRateLimitWindowMs:
      readPositiveInt(env, "AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS") * 1000,
  };
}
