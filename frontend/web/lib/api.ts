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

export function selfxApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_SELFX_API_BASE_URL ??
    "http://localhost:3001"
  ).replace(/\/$/, "");
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

  const response = await fetch(`${selfxApiBaseUrl()}${path}`, {
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
