import { createHash, timingSafeEqual } from "node:crypto";
import type { PaymentEnvironment } from "./payment-gateways.js";
import {
  PaymentProviderError,
  safeProviderCode,
} from "./payment-diagnostics.js";
import type {
  PaymentAdapter,
  PaymentExpectation,
  ProviderPaymentStatus,
  ProviderRequest,
} from "./payment-adapter.js";
import {
  phonePeUatBase,
  validatePhonePeProductionBase,
} from "./phonepe-endpoints.js";

export type PhonePeDqrCredentials = {
  environment: PaymentEnvironment;
  merchantId: string;
  providerId?: string;
  providerStoreId: string;
  saltIndex: string;
  saltKey: string;
  apiBaseUrl?: string;
};

// In-store v3 Dynamic QR. Production endpoint provenance is pinned in the
// encrypted Store verification snapshot, independently from UAT credentials.
export class PhonePeDqrAdapter implements PaymentAdapter {
  constructor(private readonly credentials: PhonePeDqrCredentials) {}
  createRequest(
    expected: PaymentExpectation,
    callbackUrl: string,
    expiresInSeconds: number,
  ): ProviderRequest {
    this.check(expected);
    const callback = new URL(callbackUrl);
    if (
      callback.protocol !== "https:" ||
      callback.username ||
      callback.password ||
      callback.port
    )
      throw new PaymentProviderError("LOCAL_REQUEST_INVALID");
    if (
      !Number.isInteger(expiresInSeconds) ||
      expiresInSeconds < 1 ||
      expiresInSeconds > 300
    )
      throw new PaymentProviderError("LOCAL_REQUEST_INVALID");
    const encoded = Buffer.from(
      JSON.stringify({
        merchantId: this.credentials.merchantId,
        transactionId: expected.transactionId,
        merchantOrderId: expected.transactionId,
        amount: expected.amountMinor,
        storeId: this.credentials.providerStoreId,
        expiresIn: expiresInSeconds,
      }),
    ).toString("base64");
    return {
      url: `${this.base()}/v3/qr/init`,
      method: "POST",
      headers: {
        ...this.headers(encoded + "/v3/qr/init"),
        "X-CALL-MODE": "POST",
        "X-CALLBACK-URL": callback.href,
      },
      body: JSON.stringify({ request: encoded }),
    };
  }
  statusRequest(expected: PaymentExpectation): ProviderRequest {
    this.check(expected);
    const path = `/v3/transaction/${this.credentials.merchantId}/${expected.transactionId}/status`;
    return {
      url: this.base() + path,
      method: "GET",
      headers: this.headers(path),
    };
  }
  cancelRequest(expected: PaymentExpectation): ProviderRequest {
    this.check(expected);
    const path = `/v3/charge/${this.credentials.merchantId}/${expected.transactionId}/cancel`;
    return {
      url: this.base() + path,
      method: "POST",
      headers: this.headers(path),
    };
  }
  parseCancel(response: unknown): "CANCELLED" | "ALREADY_COMPLETED" {
    const root = record(response);
    if (root.success === true && root.code === "SUCCESS") return "CANCELLED";
    if (root.success === false && root.code === "PAYMENT_ALREADY_COMPLETED")
      return "ALREADY_COMPLETED";
    throw new PaymentProviderError(
      "PROVIDER_REJECTED",
      null,
      safeProviderCode(root.code),
    );
  }
  parseQr(response: unknown, expected: PaymentExpectation) {
    this.check(expected);
    const root = record(response);
    if (root.success === false)
      throw new PaymentProviderError(
        "PROVIDER_REJECTED",
        null,
        safeProviderCode(root.code),
      );
    const data = this.match(root, expected);
    if (
      root.success !== true ||
      root.code !== "SUCCESS" ||
      typeof data.qrString !== "string" ||
      data.qrString.length > 8192
    )
      throw new PaymentProviderError("INVALID_QR");
    let qr: URL;
    try {
      qr = new URL(data.qrString);
    } catch {
      throw new PaymentProviderError("INVALID_QR");
    }
    if (
      qr.protocol !== "upi:" ||
      qr.host !== "pay" ||
      qr.searchParams.get("tr") !== expected.transactionId
    )
      throw new PaymentProviderError("INVALID_QR");
    // Compare exact integer minor units; avoid floating-point payment checks.
    const amount = qr.searchParams.get("am") ?? "";
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount))
      throw new PaymentProviderError("INVALID_QR");
    const [whole = "", fraction = ""] = amount.split(".");
    if (
      BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")) !==
      BigInt(expected.amountMinor)
    )
      throw new PaymentProviderError("AMOUNT_MISMATCH");
    return { qrString: data.qrString };
  }
  parseStatus(
    response: unknown,
    expected: PaymentExpectation,
  ): ProviderPaymentStatus {
    this.check(expected);
    const root = record(response);
    if (
      root.success === false &&
      ![
        "PAYMENT_PENDING",
        "PAYMENT_ERROR",
        "PAYMENT_DECLINED",
        "PAYMENT_CANCELLED",
      ].includes(String(root.code))
    )
      throw new PaymentProviderError(
        "PROVIDER_REJECTED",
        null,
        safeProviderCode(root.code),
      );
    const data = this.match(root, expected);
    let status: ProviderPaymentStatus["status"] = "UNKNOWN";
    if (
      root.code === "PAYMENT_SUCCESS" &&
      root.success === true &&
      data.paymentState === "COMPLETED"
    )
      status = "SUCCEEDED";
    else if (root.code === "PAYMENT_PENDING" && data.paymentState === "PENDING")
      status = "PENDING";
    else if (
      ["PAYMENT_ERROR", "PAYMENT_DECLINED", "PAYMENT_CANCELLED"].includes(
        String(root.code),
      ) &&
      ["FAILED", "CANCELLED"].includes(String(data.paymentState))
    )
      status = "FAILED";
    const reference = data.providerReferenceId;
    if (
      reference !== undefined &&
      (typeof reference !== "string" || reference.length > 128)
    )
      invalid();
    return {
      status,
      transactionId: expected.transactionId,
      amountMinor: expected.amountMinor,
      currency: expected.currency,
      providerReference: typeof reference === "string" ? reference : null,
    };
  }
  verifyCallback(
    encoded: string,
    signature: string,
    expected: PaymentExpectation,
  ) {
    this.check(expected);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 32768)
      invalid();
    const wanted = this.checksum(encoded);
    const actualBuffer = Buffer.from(signature),
      expectedBuffer = Buffer.from(wanted);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    )
      invalid();
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.toString("base64") !== encoded) invalid();
    // The caller must additionally query transaction status before fulfillment.
    return this.parseStatus(JSON.parse(decoded.toString("utf8")), expected);
  }
  private match(root: Record<string, unknown>, expected: PaymentExpectation) {
    const data = record(root.data);
    if (data.merchantId !== this.credentials.merchantId)
      throw new PaymentProviderError("MERCHANT_MISMATCH");
    if (data.transactionId !== expected.transactionId)
      throw new PaymentProviderError("TRANSACTION_MISMATCH");
    if (data.amount !== expected.amountMinor)
      throw new PaymentProviderError("AMOUNT_MISMATCH");
    return data;
  }
  private check(expected: PaymentExpectation) {
    if (!["UAT", "PRODUCTION"].includes(this.credentials.environment))
      throw new PaymentProviderError("LOCAL_REQUEST_INVALID");
    this.base();
    if (
      !/^[A-Za-z0-9_-]{1,100}$/.test(this.credentials.merchantId) ||
      !/^[A-Za-z0-9_-]{1,37}$/.test(this.credentials.providerStoreId) ||
      (this.credentials.providerId !== undefined &&
        !/^[A-Za-z0-9_-]{1,100}$/.test(this.credentials.providerId)) ||
      !/^[0-9]{1,10}$/.test(this.credentials.saltIndex) ||
      !/^\S{16,256}$/.test(this.credentials.saltKey) ||
      !/^[A-Za-z0-9_-]{1,34}$/.test(expected.transactionId) ||
      expected.currency !== "INR" ||
      !Number.isSafeInteger(expected.amountMinor) ||
      expected.amountMinor < 1 ||
      expected.amountMinor > 2_000_000_000
    )
      throw new PaymentProviderError("LOCAL_REQUEST_INVALID");
  }
  private checksum(prefix: string) {
    return (
      createHash("sha256")
        .update(prefix + this.credentials.saltKey)
        .digest("hex") +
      "###" +
      this.credentials.saltIndex
    );
  }
  private base() {
    return this.credentials.environment === "UAT"
      ? phonePeUatBase
      : validatePhonePeProductionBase(this.credentials.apiBaseUrl);
  }
  private headers(prefix: string) {
    return {
      "Content-Type": "application/json",
      "X-VERIFY": this.checksum(prefix),
      ...(this.credentials.providerId
        ? { "X-PROVIDER-ID": this.credentials.providerId }
        : {}),
    };
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function invalid(): never {
  throw new PaymentProviderError("INVALID_RESPONSE");
}
