import { selfxApi, SafeApiError } from "@/lib/api";

export interface ShopifyTryOnProduct {
  id: string;
  returnUrl?: string;
  name: string;
  tryOnVertical: "GARMENT" | "JEWELLERY";
  jewelleryType?: "RING" | "EARRING" | "NECKLACE" | "BRACELET" | null;
  handle?: string;
  externalProductId?: string;
  imageUrl?: string;
  priceAmountCents?: number | null;
  priceCurrency?: string | null;
}

export interface ShopifyTryOnSession {
  session: string;
  garmentAssetId: string;
  expiresAt: string;
  locale?: string;
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
    downloadUrl?: string;
    contentType?: string;
    expiresAt: string;
  };
  errorCode?: string;
  errorMessage?: string;
}

const pendingVisitorBindings = new Map<string, Promise<void>>();

function bindVisitor(session: string): Promise<void> {
  const pending = pendingVisitorBindings.get(session);
  if (pending) return pending;
  const establish = async () => {
    const response = await fetch("/try-on/commerce/visitor", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new SafeApiError(
        body?.error?.code ?? "STOREFRONT_VISITOR_UNAVAILABLE",
        body?.error?.message ?? "Try-On is temporarily unavailable.",
        response.status,
      );
    }
  };
  // Also serialize first-time cookie establishment across tabs where supported.
  const promise = (
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks
          .request("selfx-storefront-visitor", establish)
          .then(() => undefined)
      : establish()
  ).finally(() => {
    pendingVisitorBindings.delete(session);
  });
  pendingVisitorBindings.set(session, promise);
  return promise;
}

export async function getShopifyTryOnSession(
  session: string,
): Promise<ShopifyTryOnSession> {
  await bindVisitor(session);
  return selfxApi(
    `/api/v1/public/integrations/commerce/try-on-sessions/${encodeURIComponent(
      session,
    )}`,
  );
}

export async function uploadShopifyTryOnPersonImage(
  session: string,
  file: File,
): Promise<ShopifyTryOnPersonUpload> {
  await selfxApi(
    `/api/v1/public/integrations/commerce/try-on-sessions/${encodeURIComponent(session)}/consent`,
    {
      method: "POST",
      body: JSON.stringify({
        accepted: true,
        policyVersion: "selfx-photo-2026-10-23",
      }),
    },
  );
  const formData = new FormData();
  formData.append("purpose", "PERSON");
  formData.append("image", file);
  return selfxApi(
    `/api/v1/public/integrations/commerce/try-on-sessions/${encodeURIComponent(
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
  clientRequestId: string = crypto.randomUUID(),
): Promise<ShopifyTryOnRun> {
  return selfxApi(
    `/api/v1/public/integrations/commerce/try-on-sessions/${encodeURIComponent(
      session,
    )}/runs`,
    {
      method: "POST",
      body: JSON.stringify({
        clientRequestId,
      }),
    },
  );
}

export function getShopifyTryOnRun(
  session: string,
  runId: string,
): Promise<ShopifyTryOnRun> {
  return selfxApi(
    `/api/v1/public/integrations/commerce/try-on-sessions/${encodeURIComponent(
      session,
    )}/runs/${encodeURIComponent(runId)}`,
  );
}
