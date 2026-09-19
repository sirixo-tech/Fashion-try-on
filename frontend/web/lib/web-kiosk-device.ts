import { SafeApiError, selfxApi } from "@/lib/api";
import type { KioskDevice } from "@/lib/kiosks";

export type KioskPairingSession = {
  pairingSessionId: string;
  pairingCode: string;
  provisioningSecret: string;
  expiresAt: string;
  serverTime: string;
  ttlSeconds: number;
  pollIntervalSeconds: number;
};

export type KioskPairingStatus = {
  status: "WAITING" | "PAIRED" | "EXPIRED";
  serverTime: string;
  expiresAt: string;
  provisioningGrant?: string;
};

export type KioskDeviceAuth = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  device: KioskDevice;
};

export type KioskTryOnSession = {
  sessionId: string;
  status: "ACTIVE" | "COMPLETED" | "EXPIRED";
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  currentPersonAssetId?: string;
};

export type KioskTryOnAsset = {
  assetId: string;
  purpose: "PERSON" | "GARMENT" | "RESULT";
  contentType: string;
  sizeBytes: number;
  width: number;
  height: number;
  expiresAt: string;
};

export type KioskCustomerUploadPurpose = "MODEL" | "GARMENT";

export type KioskCustomerUploadStatus =
  | "WAITING"
  | "UPLOADING"
  | "VALIDATING"
  | "READY"
  | "REJECTED"
  | "EXPIRED"
  | "CONSUMED"
  | "CANCELLED";

export type KioskCustomerUploadPhoto = {
  readUrl: string;
  contentType: string;
  sizeBytes: number;
  width: number;
  height: number;
};

export type KioskCustomerUploadSession = {
  sessionId: string;
  status: KioskCustomerUploadStatus;
  purpose: KioskCustomerUploadPurpose;
  publicUploadUrl?: string;
  expiresAt: string;
  serverTime: string;
  pollIntervalSeconds?: number;
  rejectionCode?: string | null;
  photo?: KioskCustomerUploadPhoto;
};

export type KioskCatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  productVertical: "GARMENT" | "JEWELLERY";
  jewelleryType: string | null;
  audience: string;
  category: {
    id: string;
    name: string;
    slug: string;
    audience: string | null;
  };
  garmentIntent: string;
  garmentCategory: string;
  garmentPhotoType: string;
  priceAmountCents: number | null;
  priceCurrency: string | null;
  image: {
    url: string | null;
    contentType: string | null;
    width: number | null;
    height: number | null;
    cacheKey: string;
  };
  updatedAt: string;
};

export type KioskCatalogProductList = {
  data: KioskCatalogProduct[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
};

export type KioskTryOnRun = {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  tryOnVertical: "GARMENT" | "JEWELLERY";
  jewelleryType?: string;
  createdAt: string;
  updatedAt: string;
  resultImage?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type KioskTryOnShare = {
  shareUrl: string;
  expiresAt: string;
};

export type KioskJewelleryCaptureRequirements = {
  schemaVersion: 1;
  tryOnVertical: "JEWELLERY";
  jewelleryType: string;
  channel: string;
  productId?: string;
  personInputMethods: string[];
  targetRegion: string;
  guide: string;
  title: string;
  instruction: string;
  checklist: string[];
  requiredChecks: string[];
};

export type CreateKioskPairingSessionInput = {
  installationId?: string;
  platform?: string;
  appVersion?: string;
};

export function createKioskPairingSession(
  input: CreateKioskPairingSessionInput,
): Promise<KioskPairingSession> {
  return selfxApi<KioskPairingSession>("/api/v1/kiosk/provisioning/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getKioskPairingStatus(
  session: Pick<KioskPairingSession, "pairingSessionId" | "provisioningSecret">,
): Promise<KioskPairingStatus> {
  return selfxApi<KioskPairingStatus>(
    `/api/v1/kiosk/provisioning/sessions/${session.pairingSessionId}`,
    {
      headers: {
        "x-selfx-provisioning-secret": session.provisioningSecret,
      },
    },
  );
}

export function exchangeKioskProvisioningGrant(
  session: Pick<KioskPairingSession, "pairingSessionId" | "provisioningSecret">,
  provisioningGrant: string,
): Promise<KioskDeviceAuth> {
  return selfxApi<KioskDeviceAuth>("/api/v1/kiosk/session/exchange", {
    method: "POST",
    body: JSON.stringify({
      pairingSessionId: session.pairingSessionId,
      provisioningSecret: session.provisioningSecret,
      provisioningGrant,
    }),
  });
}

export function refreshKioskDeviceSession(
  refreshToken: string,
): Promise<KioskDeviceAuth> {
  return selfxApi<KioskDeviceAuth>("/api/v1/kiosk/session/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export function getCurrentKioskDevice(accessToken: string): Promise<KioskDevice> {
  return selfxApi<KioskDevice>("/api/v1/kiosk/session/me", { accessToken });
}

export function sendKioskHeartbeat(accessToken: string): Promise<KioskDevice> {
  return selfxApi<KioskDevice>("/api/v1/kiosk/heartbeat", {
    method: "POST",
    accessToken,
    body: JSON.stringify({
      platform: "web-pwa",
      appVersion: "web-kiosk-pwa",
    }),
  });
}

export function createKioskTryOnSession(
  accessToken: string,
): Promise<KioskTryOnSession> {
  return selfxApi<KioskTryOnSession>("/api/v1/kiosk/try-on/sessions", {
    method: "POST",
    accessToken,
  });
}

export function setKioskTryOnSessionPerson(
  accessToken: string,
  sessionId: string,
  personImage: Blob,
): Promise<KioskTryOnAsset> {
  const formData = new FormData();
  formData.append("personImage", personImage, "selfx-person-capture.jpg");

  return selfxApi<KioskTryOnAsset>(
    `/api/v1/kiosk/try-on/sessions/${encodeURIComponent(sessionId)}/person`,
    {
      method: "POST",
      accessToken,
      body: formData,
    },
  );
}

export function setKioskTryOnSessionPersonFromCustomerUpload(
  accessToken: string,
  sessionId: string,
  customerUploadSessionId: string,
): Promise<KioskTryOnAsset> {
  return selfxApi<KioskTryOnAsset>(
    `/api/v1/kiosk/try-on/sessions/${encodeURIComponent(sessionId)}/person`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify({ customerUploadSessionId }),
    },
  );
}

export function completeKioskTryOnSession(
  accessToken: string,
  sessionId: string,
  reason: "FINISHED" | "IDLE_TIMEOUT" = "FINISHED",
): Promise<KioskTryOnSession> {
  return selfxApi<KioskTryOnSession>(
    `/api/v1/kiosk/try-on/sessions/${encodeURIComponent(sessionId)}/complete`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify({ reason }),
    },
  );
}

export function createKioskCustomerUploadSession(
  accessToken: string,
  purpose: KioskCustomerUploadPurpose = "MODEL",
): Promise<KioskCustomerUploadSession> {
  return selfxApi<KioskCustomerUploadSession>(
    `/api/v1/kiosk/customer-upload-sessions?purpose=${encodeURIComponent(purpose)}`,
    {
      method: "POST",
      accessToken,
    },
  );
}

export function getKioskCustomerUploadSession(
  accessToken: string,
  sessionId: string,
): Promise<KioskCustomerUploadSession> {
  return selfxApi<KioskCustomerUploadSession>(
    `/api/v1/kiosk/customer-upload-sessions/${encodeURIComponent(sessionId)}`,
    { accessToken },
  );
}

export function cancelKioskCustomerUploadSession(
  accessToken: string,
  sessionId: string,
): Promise<KioskCustomerUploadSession> {
  return selfxApi<KioskCustomerUploadSession>(
    `/api/v1/kiosk/customer-upload-sessions/${encodeURIComponent(sessionId)}/cancel`,
    {
      method: "POST",
      accessToken,
    },
  );
}

export function listKioskCatalogProducts(
  accessToken: string,
  input: { productVertical?: "GARMENT" | "JEWELLERY"; pageSize?: number } = {},
): Promise<KioskCatalogProductList> {
  const params = new URLSearchParams();
  params.set("productVertical", input.productVertical ?? "GARMENT");
  params.set("pageSize", String(input.pageSize ?? 12));

  return selfxApi<KioskCatalogProductList>(
    `/api/v1/kiosk/catalog/products?${params.toString()}`,
    { accessToken },
  );
}

export function getKioskJewelleryCaptureRequirements(
  accessToken: string,
  productId: string,
): Promise<KioskJewelleryCaptureRequirements> {
  return selfxApi<KioskJewelleryCaptureRequirements>(
    `/api/v1/kiosk/catalog/products/${encodeURIComponent(productId)}/capture-requirements`,
    { accessToken },
  );
}

export function createKioskTryOnRun(
  accessToken: string,
  input: {
    sessionId: string;
    personAssetId: string;
    productId: string;
    clientRequestId: string;
    tryOnVertical?: "GARMENT" | "JEWELLERY";
  },
): Promise<KioskTryOnRun> {
  const tryOnVertical = input.tryOnVertical ?? "GARMENT";
  const formData = new FormData();
  formData.append("clientRequestId", input.clientRequestId);
  formData.append("sessionId", input.sessionId);
  formData.append("personAssetId", input.personAssetId);
  formData.append("tryOnVertical", tryOnVertical);
  formData.append("productId", input.productId);
  if (tryOnVertical === "GARMENT") {
    formData.append("garmentSource", "SELFX_CATALOG");
  } else {
    formData.append("catalogSource", "SELFX_CATALOG");
  }
  formData.append("generationProfile", "BALANCED");

  return selfxApi<KioskTryOnRun>("/api/v1/kiosk/try-on/runs", {
    method: "POST",
    accessToken,
    body: formData,
  });
}

export function getKioskTryOnRun(
  accessToken: string,
  runId: string,
): Promise<KioskTryOnRun> {
  return selfxApi<KioskTryOnRun>(
    `/api/v1/kiosk/try-on/runs/${encodeURIComponent(runId)}`,
    { accessToken },
  );
}

export function createKioskTryOnShare(
  accessToken: string,
  sessionId: string,
): Promise<KioskTryOnShare> {
  return selfxApi<KioskTryOnShare>(
    `/api/v1/kiosk/try-on/sessions/${encodeURIComponent(sessionId)}/share`,
    {
      method: "POST",
      accessToken,
    },
  );
}

export function isKioskAccessTokenExpiredError(error: unknown): boolean {
  return (
    error instanceof SafeApiError &&
    error.status === 401 &&
    (error.code === "DEVICE_TOKEN_EXPIRED" ||
      error.code === "DEVICE_TOKEN_INVALID" ||
      error.code === "REQUEST_FAILED")
  );
}
