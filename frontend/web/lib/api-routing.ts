const apiPathPrefix = "/api/v1";

export function normalizeApiUpstreamUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("SELFX_API_UPSTREAM_URL must not be empty.");
  }

  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("SELFX_API_UPSTREAM_URL must be an HTTP(S) URL.");
  }

  return parsed.toString().replace(/\/$/, "");
}

export function resolveApiRewriteDestination(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const upstream = env.SELFX_API_UPSTREAM_URL;
  if (upstream?.trim()) {
    const normalized = normalizeApiUpstreamUrl(upstream);
    if (env.NODE_ENV === "production" && isLocalhostUrl(normalized)) {
      throw new Error(
        "SELFX_API_UPSTREAM_URL must not point to localhost in production.",
      );
    }
    return `${normalized}${apiPathPrefix}/:path*`;
  }

  if (
    env.NODE_ENV === "production" &&
    !hasExplicitPublicApiBaseUrl(env)
  ) {
    throw new Error(
      "SELFX_API_UPSTREAM_URL is required for production same-origin API proxying.",
    );
  }

  return null;
}

export function apiRewriteConfig(env: NodeJS.ProcessEnv = process.env) {
  const destination = resolveApiRewriteDestination(env);
  return destination
    ? [
        {
          source: `${apiPathPrefix}/:path*`,
          destination,
        },
      ]
    : [];
}

function hasExplicitPublicApiBaseUrl(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.NEXT_PUBLIC_API_URL?.trim() ||
      env.NEXT_PUBLIC_SELFX_API_BASE_URL?.trim(),
  );
}

function isLocalhostUrl(value: string): boolean {
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
