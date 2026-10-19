import { afterEach, describe, expect, it, vi } from "vitest";
import { PhonePeTransport } from "./phonepe.transport.js";
import { PhonePeDqrAdapter } from "./phonepe-dqr.adapter.js";
import {
  paymentDiagnostic,
  readPaymentDiagnostic,
  PaymentProviderError,
} from "./payment-diagnostics.js";

const secret = "do-not-copy-private-response-value";
const request = {
  url: "https://mercury-uat.phonepe.com/enterprise-sandbox/v3/qr/init",
  method: "POST" as const,
  headers: { "X-VERIFY": secret },
  body: secret,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("redacted PhonePe diagnostics", () => {
  it.each([
    [401, "AUTHORIZATION_FAILED"],
    [403, "INVALID_MERCHANT_ID"],
    [429, "INTERNAL_SERVER_ERROR"],
    [500, secret],
  ])(
    "preserves only numeric HTTP status and allowed provider codes for HTTP %s",
    async (status, code) => {
      vi.stubEnv("SELFX_PHONEPE_UAT_ENABLED", "true");
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(
              JSON.stringify({
                code,
                message: secret,
                data: { saltKey: secret },
              }),
              { status },
            ),
          ),
      );
      let caught: unknown;
      try {
        await new PhonePeTransport().send(request);
      } catch (error) {
        caught = error;
      }
      const diagnostic = paymentDiagnostic(caught);
      expect(diagnostic).toMatchObject({
        code: "HTTP_REJECTED",
        httpStatus: status,
        providerCode: code === secret ? null : code,
      });
      expect(JSON.stringify(readPaymentDiagnostic(diagnostic))).not.toContain(
        secret,
      );
      expect(String(caught)).not.toContain(secret);
    },
  );
  it.each([
    [new Response("not JSON " + secret), "INVALID_RESPONSE"],
    [new Response("x".repeat(65537)), "RESPONSE_TOO_LARGE"],
  ])(
    "classifies unusable responses without exposing their contents",
    async (response, code) => {
      vi.stubEnv("SELFX_PHONEPE_UAT_ENABLED", "true");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(new PhonePeTransport().send(request)).rejects.toMatchObject({
        code,
      });
    },
  );
  it.each([
    ["TimeoutError", "TIMEOUT"],
    ["AbortError", "TIMEOUT"],
    ["TypeError", "NETWORK_ERROR"],
  ])(
    "classifies %s without storing raw exception details",
    async (name, code) => {
      vi.stubEnv("SELFX_PHONEPE_UAT_ENABLED", "true");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(Object.assign(new Error(secret), { name })),
      );
      await expect(new PhonePeTransport().send(request)).rejects.toMatchObject({
        code,
      });
      expect(
        JSON.stringify(paymentDiagnostic(new Error(secret))),
      ).not.toContain(secret);
    },
  );
  it("ignores stored extra fields and unsafe provider codes", () => {
    const safe = readPaymentDiagnostic({
      code: "HTTP_REJECTED",
      httpStatus: 401,
      providerCode: secret,
      message: secret,
      rawBody: secret,
      at: new Date().toISOString(),
    });
    expect(safe).toMatchObject({
      code: "HTTP_REJECTED",
      providerCode: null,
      httpStatus: 401,
    });
    expect(JSON.stringify(safe)).not.toContain(secret);
    expect(
      readPaymentDiagnostic({ code: secret, at: new Date().toISOString() }),
    ).toBeNull();
    expect(readPaymentDiagnostic({ code: "TIMEOUT", at: secret })).toBeNull();
    expect(
      paymentDiagnostic(new PaymentProviderError("TIMEOUT", 1000)),
    ).toMatchObject({ httpStatus: null });
  });
  const adapter = new PhonePeDqrAdapter({
    environment: "UAT",
    merchantId: "TEST_MERCHANT",
    saltKey: secret,
    saltIndex: "1",
    providerStoreId: "STORE_TEST",
  });
  const expected = {
    transactionId: "TX_TEST",
    amountMinor: 100,
    currency: "INR" as const,
  };
  const valid = {
    success: true,
    code: "SUCCESS",
    data: {
      merchantId: "TEST_MERCHANT",
      transactionId: "TX_TEST",
      amount: 100,
      qrString: "upi://pay?pa=fixture@ybl&tr=TX_TEST&am=1.00",
    },
  };
  it("distinguishes provider rejection from an invalid successful QR", () => {
    expect(() =>
      adapter.parseQr(
        { success: false, code: "INVALID_CHECKSUM", message: secret },
        expected,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "PROVIDER_REJECTED",
        providerCode: "INVALID_CHECKSUM",
      }),
    );
    expect(() =>
      adapter.parseQr(
        { ...valid, data: { ...valid.data, qrString: "invalid" } },
        expected,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_QR" }));
  });
  it.each([
    ["merchantId", "OTHER", "MERCHANT_MISMATCH"],
    ["transactionId", "OTHER", "TRANSACTION_MISMATCH"],
    ["amount", 200, "AMOUNT_MISMATCH"],
  ])("retains strict %s checks", (field, value, code) => {
    expect(() =>
      adapter.parseQr(
        { ...valid, data: { ...valid.data, [field]: value } },
        expected,
      ),
    ).toThrowError(expect.objectContaining({ code }));
  });
  it("still accepts a matching QR and matching terminal payment evidence", () => {
    expect(adapter.parseQr(valid, expected)).toEqual({
      qrString: valid.data.qrString,
    });
    expect(
      adapter.parseStatus(
        {
          ...valid,
          code: "PAYMENT_SUCCESS",
          data: { ...valid.data, paymentState: "COMPLETED" },
        },
        expected,
      ).status,
    ).toBe("SUCCEEDED");
  });
});
