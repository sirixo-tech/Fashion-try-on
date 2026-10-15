import { selfxApi } from "@/lib/api";
export type PaymentProvider =
  "PHONEPE" | "RAZORPAY" | "STRIPE" | "PAYTM" | "PAYPAL";
export type PaymentEnvironment = "UNCONFIRMED" | "UAT" | "PRODUCTION";
export type Gateway = {
  provider: PaymentProvider;
  name: string;
  setupAvailable: boolean;
  enabled: boolean;
  version: number;
  paymentAvailable: false;
};
export type StorePaymentSettings = {
  version: number;
  selectedProvider: PaymentProvider | null;
  paymentAvailable: false;
  gateways: Gateway[];
  connections: {
    provider: PaymentProvider;
    environment: PaymentEnvironment;
    status: "UNVERIFIED";
    dqrAccessConfirmed?: boolean;
    updatedAt: string;
  }[];
};
export type PhonePeSetup = {
  dqrAccessConfirmed?: boolean;
  environment: PaymentEnvironment;
  merchantId: string;
  providerId?: string;
  providerStoreId?: string;
  saltIndex: string;
  saltKey: string;
};
const base = (storeId: string) => `/api/v1/admin/stores/${storeId}/payments`;
export const listPaymentGateways = (accessToken: string) =>
  selfxApi<{ data: Gateway[] }>("/api/v1/admin/payment-gateways", {
    accessToken,
    cache: "no-store",
  });
export const updatePaymentGateway = (
  accessToken: string,
  gateway: Gateway,
  enabled: boolean,
) =>
  selfxApi<{ data: Gateway[] }>(
    `/api/v1/admin/payment-gateways/${gateway.provider}`,
    {
      accessToken,
      method: "PUT",
      body: JSON.stringify({ expectedVersion: gateway.version, enabled }),
    },
  );
export const getStorePayments = (accessToken: string, storeId: string) =>
  selfxApi<StorePaymentSettings>(base(storeId), {
    accessToken,
    cache: "no-store",
  });
export const savePhonePeSetup = (
  accessToken: string,
  storeId: string,
  expectedVersion: number,
  input: PhonePeSetup,
) =>
  selfxApi<StorePaymentSettings>(`${base(storeId)}/connections/phonepe`, {
    accessToken,
    method: "PUT",
    body: JSON.stringify({ ...input, expectedVersion }),
  });
export const selectStoreGateway = (
  accessToken: string,
  storeId: string,
  expectedVersion: number,
  provider: PaymentProvider | null,
) =>
  selfxApi<StorePaymentSettings>(`${base(storeId)}/selection`, {
    accessToken,
    method: "PUT",
    body: JSON.stringify({ expectedVersion, provider }),
  });
