import type {
  SelfxJewelleryCaptureRequirements,
  SelfxJewelleryType,
  JewelleryTryOnLabRunResponse,
  TryOnLabRunResponse,
} from "@selfx/shared";

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

export async function getJewelleryCaptureRequirements(
  jewelleryType: SelfxJewelleryType,
  accessToken: string,
): Promise<SelfxJewelleryCaptureRequirements> {
  return selfxApi<SelfxJewelleryCaptureRequirements>(
    `/api/v1/try-on-lab/jewellery/capture-requirements/${jewelleryType}`,
    {
      method: "GET",
      accessToken,
    },
  );
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

export async function createJewelleryTryOnLabRun(
  formData: FormData,
  accessToken: string,
): Promise<JewelleryTryOnLabRunResponse> {
  return selfxApi<JewelleryTryOnLabRunResponse>(
    "/api/v1/try-on-lab/jewellery/runs",
    {
      method: "POST",
      body: formData,
      accessToken,
    },
  );
}

export async function getJewelleryTryOnLabRun(
  runId: string,
  accessToken: string,
): Promise<JewelleryTryOnLabRunResponse> {
  return selfxApi<JewelleryTryOnLabRunResponse>(
    `/api/v1/try-on-lab/jewellery/runs/${runId}`,
    {
      method: "GET",
      accessToken,
    },
  );
}
