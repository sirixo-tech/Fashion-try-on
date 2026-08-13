import type { TryOnLabRunResponse } from "@selfx/shared";

import { SafeApiError, type ApiErrorBody, selfxApiBaseUrl } from "@/lib/api";

export async function createTryOnLabRun(
  formData: FormData,
  accessToken: string,
): Promise<TryOnLabRunResponse> {
  return fetchTryOnLab<TryOnLabRunResponse>("/api/v1/try-on-lab/runs", {
    method: "POST",
    body: formData,
    accessToken,
  });
}

export async function getTryOnLabRun(
  runId: string,
  accessToken: string,
): Promise<TryOnLabRunResponse> {
  return fetchTryOnLab<TryOnLabRunResponse>(
    `/api/v1/try-on-lab/runs/${runId}`,
    {
      method: "GET",
      accessToken,
    },
  );
}

async function fetchTryOnLab<T>(
  path: string,
  init: RequestInit & { accessToken: string },
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${init.accessToken}`);

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
