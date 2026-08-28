import { selfxApi } from "@/lib/api";

export type PlatformVirtualTryOnSettings = {
  garmentPreviewEnabled: boolean;
  defaultCurrency: string;
};

export type PlatformMediaUploadSettings = {
  captureImageMaxMb: number;
  captureImageMaxBytes: number;
  presentationImageMaxMb: number;
  presentationImageMaxBytes: number;
  presentationVideoMaxMb: number;
  presentationVideoMaxBytes: number;
  imageHardMaxBytes: number;
  videoHardMaxBytes: number;
};

export type LoginPageMediaType = "VIDEO" | "IMAGE" | "GIF";

export type LoginPageCard = {
  title: string;
  description: string;
};

export type LoginPageSettings = {
  eyebrow: string;
  headline: string;
  body: string;
  mediaType: LoginPageMediaType;
  mediaUrl: string;
  mediaPosterUrl: string | null;
  mediaMuted: boolean;
  cards: LoginPageCard[];
  bullets: string[];
};

export function getPublicLoginPageSettings(): Promise<LoginPageSettings> {
  return selfxApi<LoginPageSettings>(
    "/api/v1/admin/platform-settings/login-page/public",
  );
}

export function getLoginPageSettings(
  accessToken: string,
): Promise<LoginPageSettings> {
  return selfxApi<LoginPageSettings>(
    "/api/v1/admin/platform-settings/login-page",
    { accessToken },
  );
}

export function updateLoginPageSettings(
  accessToken: string,
  input: Partial<LoginPageSettings>,
): Promise<LoginPageSettings> {
  return selfxApi<LoginPageSettings>(
    "/api/v1/admin/platform-settings/login-page",
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}

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
  input: Partial<PlatformVirtualTryOnSettings>,
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

export function getPlatformMediaUploadSettings(
  accessToken: string,
): Promise<PlatformMediaUploadSettings> {
  return selfxApi<PlatformMediaUploadSettings>(
    "/api/v1/admin/platform-settings/media-uploads",
    { accessToken },
  );
}

export function updatePlatformMediaUploadSettings(
  accessToken: string,
  input: Pick<
    PlatformMediaUploadSettings,
    "captureImageMaxMb" | "presentationImageMaxMb" | "presentationVideoMaxMb"
  >,
): Promise<PlatformMediaUploadSettings> {
  return selfxApi<PlatformMediaUploadSettings>(
    "/api/v1/admin/platform-settings/media-uploads",
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}
