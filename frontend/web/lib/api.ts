export type ApiErrorCode =
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_UNAUTHORIZED"
  | "ORGANIZATION_NOT_ACTIVE"
  | "ORGANIZATION_SUSPENDED"
  | "PLATFORM_PERMISSION_DENIED"
  | string;

export type ApiErrorBody = {
  error?: {
    code?: ApiErrorCode;
    message?: string;
  };
};

export class SafeApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message = "The request could not be completed.",
    public readonly status?: number,
  ) {
    super(message);
  }
}

export function selfxApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit =
    env.NEXT_PUBLIC_API_URL ?? env.NEXT_PUBLIC_SELFX_API_BASE_URL;

  if (explicit?.trim()) {
    const normalized = explicit.trim().replace(/\/+$/, "");
    if (env.NODE_ENV === "production" && isLocalhostApiUrl(normalized)) {
      throw new Error(
        "Production web API URL must not point to localhost. Remove NEXT_PUBLIC_API_URL to use the same-origin API proxy.",
      );
    }
    return normalized;
  }

  if (env.NODE_ENV === "production") {
    return "";
  }

  return "http://localhost:3001";
}

export function selfxApiUrl(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${selfxApiBaseUrl(env)}${normalizedPath}`;
}

export async function selfxApi<T>(
  path: string,
  init: RequestInit & { accessToken?: string | null } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (init.accessToken) {
    headers.set("Authorization", `Bearer ${init.accessToken}`);
  }

  const response = await fetch(selfxApiUrl(path), {
    ...init,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = undefined;
    }

    throw new SafeApiError(
      body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? "The request could not be completed.",
      response.status,
    );
  }

  return (await response.json()) as T;
}

function isLocalhostApiUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}
