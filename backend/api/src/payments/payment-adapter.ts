// Provider-specific payloads/credentials remain behind adapters. These contracts
// are server-only and must never be serialized as API responses or audit data.
export type PaymentExpectation = {
  transactionId: string;
  amountMinor: number;
  currency: "INR";
};
export type ProviderPaymentStatus = {
  status: "SUCCEEDED" | "FAILED" | "PENDING" | "UNKNOWN";
  transactionId: string;
  amountMinor: number;
  currency: "INR";
  providerReference: string | null;
};
export type ProviderRequest = {
  url: string;
  method: "POST" | "GET";
  headers: Record<string, string>;
  body?: string;
};
export interface PaymentAdapter {
  createRequest(
    expected: PaymentExpectation,
    callbackUrl: string,
    expiresInSeconds: number,
  ): ProviderRequest;
  statusRequest(expected: PaymentExpectation): ProviderRequest;
  parseStatus(
    response: unknown,
    expected: PaymentExpectation,
  ): ProviderPaymentStatus;
}
