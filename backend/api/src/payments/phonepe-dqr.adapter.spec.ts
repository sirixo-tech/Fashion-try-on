import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PhonePeDqrAdapter,
  type PhonePeDqrCredentials,
} from "./phonepe-dqr.adapter.js";
const credentials: PhonePeDqrCredentials = {
  environment: "UAT",
  merchantId: "fixture_merchant",
  providerId: "fixture_partner",
  providerStoreId: "fixture_store",
  saltIndex: "1",
  saltKey: "fixture-key-not-a-real-secret",
};
const expected = {
  transactionId: "fixture_tx",
  amountMinor: 12345,
  currency: "INR" as const,
};
const adapter = new PhonePeDqrAdapter(credentials);
const status = (
  code = "PAYMENT_SUCCESS",
  paymentState = "COMPLETED",
  success = true,
) => ({
  success,
  code,
  data: {
    merchantId: credentials.merchantId,
    transactionId: expected.transactionId,
    amount: expected.amountMinor,
    paymentState,
    providerReferenceId: "fixture_reference",
  },
});
describe("PhonePe in-store DQR protocol (no network)", () => {
  it("creates an order-specific five-minute UAT request using the documented signing path", () => {
    const request = adapter.createRequest(
      expected,
      "https://payments.example.test/callback",
      300,
    );
    expect(request.url).toBe(
      "https://mercury-uat.phonepe.com/enterprise-sandbox/v3/qr/init",
    );
    const { request: encoded } = JSON.parse(request.body!);
    expect(JSON.parse(Buffer.from(encoded, "base64").toString())).toEqual({
      merchantId: credentials.merchantId,
      transactionId: "fixture_tx",
      merchantOrderId: "fixture_tx",
      amount: 12345,
      storeId: "fixture_store",
      expiresIn: 300,
    });
    expect(request.headers["X-VERIFY"]).toBe(
      createHash("sha256")
        .update(encoded + "/v3/qr/init" + credentials.saltKey)
        .digest("hex") + "###1",
    );
    expect(request.headers["X-PROVIDER-ID"]).toBe("fixture_partner");
    expect(request.headers["X-CALLBACK-URL"]).toBe(
      "https://payments.example.test/callback",
    );
    expect(request.body).not.toContain(credentials.saltKey);
  });
  it("signs status requests independently from QR requests", () => {
    const request = adapter.statusRequest(expected);
    expect(request.method).toBe("GET");
    expect(request.headers["X-VERIFY"]).toBe(
      createHash("sha256")
        .update(
          "/v3/transaction/fixture_merchant/fixture_tx/status" +
            credentials.saltKey,
        )
        .digest("hex") + "###1",
    );
  });
  it("signs cancellation using PhonePe's Dynamic QR cancel path", () => {
    const request = adapter.cancelRequest(expected);
    const path = "/v3/charge/fixture_merchant/fixture_tx/cancel";
    expect(request.url).toBe(`https://mercury-uat.phonepe.com/enterprise-sandbox${path}`);
    expect(request.method).toBe("POST");
    expect(request.body).toBeUndefined();
    expect(request.headers["X-VERIFY"]).toBe(
      createHash("sha256").update(path + credentials.saltKey).digest("hex") + "###1",
    );
    expect(adapter.parseCancel({ success: true, code: "SUCCESS" })).toBe("CANCELLED");
    expect(adapter.parseCancel({ success: false, code: "PAYMENT_ALREADY_COMPLETED" })).toBe("ALREADY_COMPLETED");
    expect(() => adapter.parseCancel({ success: false, code: "INTERNAL_SERVER_ERROR" })).toThrow();
  });
  it.each(["UNCONFIRMED", "PRODUCTION"] as const)(
    "rejects %s configuration before request creation",
    (environment) => {
      const other = new PhonePeDqrAdapter({ ...credentials, environment });
      expect(() =>
        other.createRequest(expected, "https://example.test/callback", 300),
      ).toThrow(
        expect.objectContaining({
          code:
            environment === "UNCONFIRMED"
              ? "LOCAL_REQUEST_INVALID"
              : "PRODUCTION_ENDPOINT_UNCONFIGURED",
        }),
      );
      expect(() => other.statusRequest(expected)).toThrow(
        expect.objectContaining({
          code:
            environment === "UNCONFIRMED"
              ? "LOCAL_REQUEST_INVALID"
              : "PRODUCTION_ENDPOINT_UNCONFIGURED",
        }),
      );
    },
  );
  it.each([0, -1, 1.5, NaN, 2_000_000_001])(
    "rejects unsafe amount %s",
    (amountMinor) => {
      expect(() =>
        adapter.statusRequest({ ...expected, amountMinor }),
      ).toThrow();
    },
  );
  it.each(["../other", "x".repeat(35), "with space"])(
    "rejects unsafe transaction reference %s",
    (transactionId) => {
      expect(() =>
        adapter.statusRequest({ ...expected, transactionId }),
      ).toThrow();
    },
  );
  it.each([
    "http://example.test/callback",
    "https://user:pass@example.test/callback",
    "https://example.test:8443/callback",
  ])("rejects unsuitable callback %s", (callback) => {
    expect(() => adapter.createRequest(expected, callback, 300)).toThrow();
  });
  it("validates the QR amount and order reference", () => {
    const response = {
      success: true,
      code: "SUCCESS",
      data: {
        merchantId: credentials.merchantId,
        transactionId: expected.transactionId,
        amount: 12345,
        qrString: "upi://pay?pa=fixture@ybl&am=123.45&tr=fixture_tx",
      },
    };
    expect(adapter.parseQr(response, expected).qrString).toContain("am=123.45");
    for (const qrString of [
      "https://evil.test",
      "upi://pay?am=123.44&tr=fixture_tx",
      "upi://pay?am=123.45&tr=other",
    ])
      expect(() =>
        adapter.parseQr(
          { ...response, data: { ...response.data, qrString } },
          expected,
        ),
      ).toThrow();
  });
  it.each([
    ["PAYMENT_SUCCESS", "COMPLETED", true, "SUCCEEDED"],
    ["PAYMENT_PENDING", "PENDING", true, "PENDING"],
    ["PAYMENT_ERROR", "FAILED", false, "FAILED"],
    ["PAYMENT_CANCELLED", "CANCELLED", true, "FAILED"],
    ["PAYMENT_SUCCESS", "FAILED", true, "UNKNOWN"],
    ["NEW_CODE", "COMPLETED", true, "UNKNOWN"],
  ])(
    "normalizes code=%s state=%s success=%s as %s",
    (code, state, success, result) => {
      expect(
        adapter.parseStatus(
          status(String(code), String(state), Boolean(success)),
          expected,
        ).status,
      ).toBe(result);
    },
  );
  it("rejects contradictory success evidence instead of confirming a payment", () => {
    expect(() =>
      adapter.parseStatus(
        status("PAYMENT_SUCCESS", "COMPLETED", false),
        expected,
      ),
    ).toThrow(expect.objectContaining({ code: "PROVIDER_REJECTED" }));
  });
  it.each([
    { merchantId: "other_store" },
    { transactionId: "other_order" },
    { amount: 12344 },
  ])("rejects payment evidence mismatches: %j", (override) => {
    const response = status();
    expect(() =>
      adapter.parseStatus(
        { ...response, data: { ...response.data, ...override } },
        expected,
      ),
    ).toThrow();
  });
  it("verifies callback signatures and rejects tampering, wrong key/index, and wrong amounts", () => {
    const encoded = Buffer.from(JSON.stringify(status())).toString("base64");
    const signature =
      createHash("sha256")
        .update(encoded + credentials.saltKey)
        .digest("hex") + "###1";
    expect(adapter.verifyCallback(encoded, signature, expected).status).toBe(
      "SUCCEEDED",
    );
    for (const invalid of [
      "",
      signature.replace("###1", "###2"),
      "a".repeat(signature.length),
    ])
      expect(() =>
        adapter.verifyCallback(encoded, invalid, expected),
      ).toThrow();
    expect(() =>
      adapter.verifyCallback(encoded, signature, {
        ...expected,
        amountMinor: 9999,
      }),
    ).toThrow();
    expect(() =>
      adapter.verifyCallback(encoded + "A", signature, expected),
    ).toThrow();
  });
});
