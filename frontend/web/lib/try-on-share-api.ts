import { selfxApi, selfxApiUrl } from "@/lib/api";

export interface PublicTryOnShareLook {
  lookId: string;
  imageReadUrl: string;
  createdAt: string;
  expiresAt: string;
  productName?: string;
}

export interface PublicTryOnShare {
  expiresAt: string;
  serverTime: string;
  looks: PublicTryOnShareLook[];
}

export function getPublicTryOnShare(
  capability: string,
): Promise<PublicTryOnShare> {
  return selfxApi<PublicTryOnShare>(
    `/api/v1/public/try-on-shares/${encodeURIComponent(capability)}`,
  );
}

export function publicTryOnLookDownloadUrl(
  capability: string,
  lookId: string,
): string {
  return selfxApiUrl(
    `/api/v1/public/try-on-shares/${encodeURIComponent(
      capability,
    )}/looks/${encodeURIComponent(lookId)}/download`,
  );
}
