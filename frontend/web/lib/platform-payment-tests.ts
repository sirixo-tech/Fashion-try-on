import { selfxApi } from "@/lib/api";
import type { PhonePeSetup } from "./payments";

export type PlatformPaymentTest = {
  id: string;
  provider: string;
  environment: "UAT";
  connectionVersion: number;
  status: "PREPARING" | "PENDING" | "UNKNOWN" | "FAILED" | "SUCCEEDED";
  amountMinor: number;
  currency: string;
  createdAt: string;
  expiresAt: string;
  confirmedAt: string | null;
  checkedAt: string | null;
  nextCheckAt: string | null;
  providerReference: string | null;
  failureCode: string | null;
  callbackReceived: boolean;
  verificationPending: boolean;
  testOnly: true;
};
export type PlatformPaymentTestDetail = PlatformPaymentTest & {
  diagnostics?: {
    initialization: PaymentTestDiagnostic | null;
    status: PaymentTestDiagnostic | null;
  };
  qrString: string | null;
  serverTime: string;
};
export type PaymentTestDiagnostic = {
  code: string;
  message: string;
  httpStatus: number | null;
  providerCode: string | null;
  at: string;
};
export type PlatformPaymentWorkspace = {
  connection: {
    provider: string;
    environment: "UAT";
    version: number;
    dqrAccessConfirmed: boolean;
    updatedAt: string;
  } | null;
  executionEnabled: boolean;
  callbackConfigured: boolean;
  testStatus:
    | "NOT_CONFIGURED"
    | "NOT_TESTED"
    | "PENDING"
    | "PASSED"
    | "FAILED"
    | "UNKNOWN";
  tests: PlatformPaymentTest[];
};
const base = "/api/v1/admin/payment-gateways/PHONEPE/testing";
export const getPlatformPaymentWorkspace = (accessToken: string) =>
  selfxApi<PlatformPaymentWorkspace>(base, { accessToken, cache: "no-store" });
export const savePlatformPhonePeTest = (
  accessToken: string,
  expectedVersion: number,
  input: PhonePeSetup,
) =>
  selfxApi<PlatformPaymentWorkspace>(`${base}/connection`, {
    accessToken,
    method: "PUT",
    body: JSON.stringify({ ...input, expectedVersion }),
  });
export const startPlatformPaymentTest = (
  accessToken: string,
  expectedVersion: number,
  idempotencyKey: string,
) =>
  selfxApi<PlatformPaymentTestDetail>(`${base}/tests`, {
    accessToken,
    method: "POST",
    body: JSON.stringify({ expectedVersion, idempotencyKey }),
  });
export const getPlatformPaymentTest = (accessToken: string, id: string) =>
  selfxApi<PlatformPaymentTestDetail>(`${base}/tests/${id}`, {
    accessToken,
    cache: "no-store",
  });
export const checkPlatformPaymentTest = (accessToken: string, id: string) =>
  selfxApi<PlatformPaymentTestDetail>(`${base}/tests/${id}/check`, {
    accessToken,
    method: "POST",
  });
