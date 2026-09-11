import { selfxApi } from "@/lib/api";

export interface ShopifyTryOnProduct {
  id: string;
  name: string;
  handle?: string;
  externalProductId?: string;
  imageUrl?: string;
}

export interface ShopifyTryOnSession {
  session: string;
  garmentAssetId: string;
  expiresAt: string;
  product: ShopifyTryOnProduct;
}

export interface ShopifyTryOnPersonUpload {
  session: string;
  personAssetId: string;
  expiresAt: string;
}

export interface ShopifyTryOnRun {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  session: string;
  product: ShopifyTryOnProduct;
  result?: {
    assetId: string;
    readUrl: string;
    contentType?: string;
    expiresAt: string;
  };
  errorCode?: string;
  errorMessage?: string;
}

export function getShopifyTryOnSession(
  session: string,
): Promise<ShopifyTryOnSession> {
  return selfxApi(
    `/api/v1/public/integrations/shopify/try-on-sessions/${encodeURIComponent(
      session,
    )}`,
  );
}

export function uploadShopifyTryOnPersonImage(
  session: string,
  file: File,
): Promise<ShopifyTryOnPersonUpload> {
  const formData = new FormData();
  formData.append("purpose", "PERSON");
  formData.append("image", file);
  return selfxApi(
    `/api/v1/public/integrations/shopify/try-on-sessions/${encodeURIComponent(
      session,
    )}/person-image`,
    {
      method: "POST",
      body: formData,
    },
  );
}

export function createShopifyTryOnRun(
  session: string,
): Promise<ShopifyTryOnRun> {
  return selfxApi(
    `/api/v1/public/integrations/shopify/try-on-sessions/${encodeURIComponent(
      session,
    )}/runs`,
    {
      method: "POST",
      body: JSON.stringify({
        clientRequestId: crypto.randomUUID(),
      }),
    },
  );
}

export function getShopifyTryOnRun(
  session: string,
  runId: string,
): Promise<ShopifyTryOnRun> {
  return selfxApi(
    `/api/v1/public/integrations/shopify/try-on-sessions/${encodeURIComponent(
      session,
    )}/runs/${encodeURIComponent(runId)}`,
  );
}
