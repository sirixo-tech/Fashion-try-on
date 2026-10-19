// Only fixed codes and numeric HTTP status may leave the provider boundary.
// Never persist/log response bodies, headers, URLs, credentials or Error.message.
const reasons = {
  REQUEST_DISABLED:
    "PhonePe UAT requests are disabled or the endpoint is not allowed.",
  TIMEOUT: "PhonePe did not respond before the request timed out.",
  NETWORK_ERROR:
    "SelfX could not obtain a response from PhonePe. Check API connectivity.",
  HTTP_REJECTED:
    "PhonePe returned an unsuccessful HTTP response. Check the HTTP status and account setup.",
  RESPONSE_TOO_LARGE: "The PhonePe response exceeded the permitted size.",
  INVALID_RESPONSE: "PhonePe returned an unreadable or unsupported response.",
  UNRECOGNIZED_STATUS:
    "PhonePe's response did not establish a recognized payment outcome. Confirmation is still pending.",
  PROVIDER_REJECTED:
    "PhonePe rejected the request. Check that the saved credentials and Dynamic QR access match the UAT account.",
  MERCHANT_MISMATCH: "The response merchant did not match this test's account.",
  TRANSACTION_MISMATCH: "The response transaction did not match this test.",
  AMOUNT_MISMATCH: "The response amount did not match the test amount.",
  INVALID_QR: "PhonePe did not return a valid QR matching this test.",
  LOCAL_REQUEST_INVALID:
    "SelfX could not prepare a valid PhonePe test request. Review the account configuration.",
  UNCLASSIFIED:
    "The request could not be verified. Use the test ID to investigate in SelfX support logs.",
} as const;
export type PaymentDiagnosticCode = keyof typeof reasons;
const providerCodes = new Set([
  "SUCCESS",
  "PAYMENT_SUCCESS",
  "PAYMENT_PENDING",
  "PAYMENT_ERROR",
  "PAYMENT_DECLINED",
  "PAYMENT_CANCELLED",
  "AUTHORIZATION_FAILED",
  "INVALID_MERCHANT_ID",
  "INVALID_CHECKSUM",
  "INVALID_TRANSACTION_ID",
  "INVALID_REQUEST",
  "BAD_REQUEST",
  "INTERNAL_SERVER_ERROR",
  "TRANSACTION_NOT_FOUND",
  "DUPLICATE_TRANSACTION",
]);
export function safeProviderCode(value: unknown): string | null {
  return typeof value === "string" && providerCodes.has(value) ? value : null;
}
export class PaymentProviderError extends Error {
  constructor(
    readonly code: PaymentDiagnosticCode,
    readonly httpStatus: number | null = null,
    readonly providerCode: string | null = null,
  ) {
    super(reasons[code]);
    this.name = "PaymentProviderError";
  }
}
export function paymentDiagnostic(error: unknown) {
  const typed =
    error instanceof PaymentProviderError
      ? error
      : new PaymentProviderError("UNCLASSIFIED");
  return {
    code: typed.code,
    httpStatus: validHttp(typed.httpStatus),
    providerCode: safeProviderCode(typed.providerCode),
    at: new Date().toISOString(),
  };
}
export function readPaymentDiagnostic(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.code !== "string" ||
    !Object.hasOwn(reasons, row.code) ||
    typeof row.at !== "string" ||
    !Number.isFinite(Date.parse(row.at))
  )
    return null;
  const code = row.code as PaymentDiagnosticCode;
  const httpStatus = validHttp(row.httpStatus);
  const message =
    code === "HTTP_REJECTED" && [401, 403].includes(httpStatus ?? 0)
      ? "PhonePe denied API access. Confirm the UAT account, credentials and Dynamic QR permissions."
      : code === "HTTP_REJECTED" && httpStatus === 429
        ? "PhonePe is limiting requests. Wait before checking this same test again."
        : reasons[code];
  return {
    code,
    message,
    httpStatus,
    providerCode: safeProviderCode(row.providerCode),
    at: new Date(row.at).toISOString(),
  };
}
function validHttp(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : null;
}
