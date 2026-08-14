import { selfxApi } from "@/lib/api";

export type CustomerUploadStatus =
  | "WAITING"
  | "UPLOADING"
  | "VALIDATING"
  | "READY"
  | "REJECTED"
  | "EXPIRED"
  | "CONSUMED"
  | "CANCELLED";

export interface CustomerUploadPublicStatus {
  status: CustomerUploadStatus;
  expiresAt: string;
  serverTime: string;
  maxImageBytes: number;
}

export interface CustomerUploadIntent {
  uploadUrl: string;
  method: "PUT";
  expiresAt: string;
  headers: Record<string, string>;
  maxImageBytes: number;
}

export function getCustomerUploadStatus(
  capability: string,
): Promise<CustomerUploadPublicStatus> {
  return selfxApi<CustomerUploadPublicStatus>(
    `/api/v1/customer-uploads/${encodeURIComponent(capability)}/status`,
  );
}

export function createCustomerUploadIntent(
  capability: string,
  file: File,
): Promise<CustomerUploadIntent> {
  return selfxApi<CustomerUploadIntent>(
    `/api/v1/customer-uploads/${encodeURIComponent(capability)}/upload-intent`,
    {
      method: "POST",
      body: JSON.stringify({
        contentType: file.type,
        sizeBytes: file.size,
      }),
    },
  );
}

export async function uploadCustomerPhotoToStorage(
  intent: CustomerUploadIntent,
  file: File,
): Promise<void> {
  const response = await fetch(intent.uploadUrl, {
    method: intent.method,
    headers: intent.headers,
    body: file,
  });
  if (!response.ok) {
    throw new Error("UPLOAD_FAILED");
  }
}

export function completeCustomerUpload(
  capability: string,
): Promise<{
  status: CustomerUploadStatus;
  expiresAt: string;
  serverTime: string;
}> {
  return selfxApi(
    `/api/v1/customer-uploads/${encodeURIComponent(capability)}/complete`,
    { method: "POST" },
  );
}
