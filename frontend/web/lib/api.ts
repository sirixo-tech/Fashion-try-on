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

export type AuthSessionHooks = {
  getAccessToken: () => string | null;
  refreshSession: () => Promise<string | null>;
  handleTerminalAuthFailure: (accessToken: string | null) => void;
};

let authSessionHooks: AuthSessionHooks | null = null;

export function setAuthSessionHooks(hooks: AuthSessionHooks | null): void {
  authSessionHooks = hooks;
}

export interface BrowserApiBaseInput {
  publicApiUrl?: string;
  legacyPublicApiUrl?: string;
  nodeEnv?: string;
}

export function resolveBrowserApiBase(input: BrowserApiBaseInput): string {
  const explicit = input.publicApiUrl ?? input.legacyPublicApiUrl;

  if (explicit?.trim()) {
    const normalized = explicit.trim().replace(/\/+$/, "");
    if (input.nodeEnv === "production" && isLocalhostApiUrl(normalized)) {
      throw new Error(
        "Production web API URL must not point to localhost. Remove NEXT_PUBLIC_API_URL to use the same-origin API proxy.",
      );
    }
    return normalized;
  }

  if (input.nodeEnv === "production") {
    return "";
  }

  return "http://localhost:3001";
}

export function selfxApiBaseUrl(): string {
  return resolveBrowserApiBase({
    publicApiUrl: process.env.NEXT_PUBLIC_API_URL,
    legacyPublicApiUrl: process.env.NEXT_PUBLIC_SELFX_API_BASE_URL,
    nodeEnv: process.env.NODE_ENV,
  });
}

export function selfxApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${selfxApiBaseUrl()}${normalizedPath}`;
}

export async function selfxApi<T>(
  path: string,
  init: RequestInit & { accessToken?: string | null } = {},
): Promise<T> {
  const isAuthEndpoint = isAuthenticationEndpoint(path);
  const initialAccessToken = init.accessToken ?? null;
  const response = await sendSelfxApiRequest(path, init, initialAccessToken);

  if (
    !response.ok &&
    !isAuthEndpoint &&
    authSessionHooks &&
    isRecoverableAccessTokenFailure(await cloneErrorBody(response), response)
  ) {
    console.debug("AUTH_ACCESS_REFRESH_STARTED");
    let refreshedAccessToken: string | null;
    try {
      refreshedAccessToken = await authSessionHooks.refreshSession();
    } catch (error) {
      console.debug("AUTH_ACCESS_REFRESH_FAILED");
      if (error instanceof SafeApiError) {
        throw error;
      }
      throw new SafeApiError(
        "AUTH_REFRESH_UNAVAILABLE",
        "SelfX session could not be refreshed. Check your connection and try again.",
      );
    }
    if (refreshedAccessToken) {
      console.debug("AUTH_ACCESS_REFRESH_SUCCEEDED");
      const retried = await sendSelfxApiRequest(
        path,
        init,
        refreshedAccessToken,
      );
      if (retried.ok) {
        return readJson<T>(retried);
      }
      if (
        isRecoverableAccessTokenFailure(await cloneErrorBody(retried), retried)
      ) {
        authSessionHooks.handleTerminalAuthFailure(refreshedAccessToken);
      }
      return throwSafeApiError(retried);
    }
    console.debug("AUTH_ACCESS_REFRESH_FAILED");
    authSessionHooks.handleTerminalAuthFailure(initialAccessToken);
  }

  if (!response.ok) {
    return throwSafeApiError(response);
  }

  return readJson<T>(response);
}

async function sendSelfxApiRequest(
  path: string,
  init: RequestInit & { accessToken?: string | null } = {},
  accessToken: string | null,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  if (shouldUseJsonContentType(init.body) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  } else {
    headers.delete("Authorization");
  }

  return fetch(selfxApiUrl(path), {
    ...init,
    headers,
    credentials: "include",
  });
}

async function throwSafeApiError(response: Response): Promise<never> {
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

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function cloneErrorBody(
  response: Response,
): Promise<ApiErrorBody | null> {
  try {
    return (await response.clone().json()) as ApiErrorBody;
  } catch {
    return null;
  }
}

export function isRecoverableAccessTokenFailure(
  body: ApiErrorBody | null | undefined,
  response: Pick<Response, "status">,
): boolean {
  if (response.status !== 401) {
    return false;
  }

  const code = body?.error?.code;
  return (
    code === "AUTH_ACCESS_TOKEN_INVALID" ||
    code === "AUTH_UNAUTHORIZED" ||
    code === undefined
  );
}

function isAuthenticationEndpoint(path: string): boolean {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return (
    normalized === "/api/v1/auth/login" ||
    normalized === "/api/v1/auth/refresh" ||
    normalized === "/api/v1/auth/logout"
  );
}

function shouldUseJsonContentType(body: BodyInit | null | undefined): boolean {
  if (!body) {
    return false;
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return false;
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return false;
  }
  if (
    typeof URLSearchParams !== "undefined" &&
    body instanceof URLSearchParams
  ) {
    return false;
  }
  if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) {
    return false;
  }

  return typeof body === "string";
}

function isLocalhostApiUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    );
  } catch {
    return false;
  }
}
