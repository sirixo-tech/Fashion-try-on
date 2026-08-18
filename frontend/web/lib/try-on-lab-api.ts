import type { TryOnLabRunResponse } from "@selfx/shared";

import { selfxApi } from "@/lib/api";

export async function createTryOnLabRun(
  formData: FormData,
  accessToken: string,
): Promise<TryOnLabRunResponse> {
  return selfxApi<TryOnLabRunResponse>("/api/v1/try-on-lab/runs", {
    method: "POST",
    body: formData,
    accessToken,
  });
}

export async function getTryOnLabRun(
  runId: string,
  accessToken: string,
): Promise<TryOnLabRunResponse> {
  return selfxApi<TryOnLabRunResponse>(`/api/v1/try-on-lab/runs/${runId}`, {
    method: "GET",
    accessToken,
  });
}
