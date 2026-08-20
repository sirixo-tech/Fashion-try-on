import { selfxApi } from "@/lib/api";

export type PlatformVirtualTryOnSettings = {
  garmentPreviewEnabled: boolean;
};

export function getPlatformVirtualTryOnSettings(
  accessToken: string,
): Promise<PlatformVirtualTryOnSettings> {
  return selfxApi<PlatformVirtualTryOnSettings>(
    "/api/v1/admin/platform-settings/virtual-try-on",
    { accessToken },
  );
}

export function updatePlatformVirtualTryOnSettings(
  accessToken: string,
  input: PlatformVirtualTryOnSettings,
): Promise<PlatformVirtualTryOnSettings> {
  return selfxApi<PlatformVirtualTryOnSettings>(
    "/api/v1/admin/platform-settings/virtual-try-on",
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}

