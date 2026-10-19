import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { PhonePeDqrAdapter } from "./phonepe-dqr.adapter.js";
import { PhonePeTransport } from "./phonepe.transport.js";
import { phonePeProductionBase } from "./phonepe-endpoints.js";

// A non-operational fixture, not a claimed production endpoint.
const base = "https://fixture.phonepe.com/merchant";
const credentials = {
  environment: "PRODUCTION" as const,
  apiBaseUrl: base,
  merchantId: "LIVE_MERCHANT",
  providerId: "LIVE_PROVIDER",
  providerStoreId: "ASSIGNED_STORE",
  saltKey: "fixture-only-production-salt",
  saltIndex: "2",
};
const expected = {
  transactionId: "LIVE_TX",
  amountMinor: 100,
  currency: "INR" as const,
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("production v3 QR routing", () => {
  it("signs the Store's merchant request and uses its pinned production base", () => {
    const request = new PhonePeDqrAdapter(credentials).createRequest(
      expected,
      "https://callbacks.example.test/live",
      300,
    );
    expect(request.url).toBe(base + "/v3/qr/init");
    const encoded = JSON.parse(request.body!).request;
    expect(JSON.parse(Buffer.from(encoded, "base64").toString())).toMatchObject(
      {
        merchantId: credentials.merchantId,
        storeId: credentials.providerStoreId,
        transactionId: expected.transactionId,
        amount: 100,
        expiresIn: 300,
      },
    );
    expect(request.headers["X-PROVIDER-ID"]).toBe(credentials.providerId);
    expect(request.headers["X-VERIFY"]).toBe(
      createHash("sha256")
        .update(encoded + "/v3/qr/init" + credentials.saltKey)
        .digest("hex") + "###2",
    );
    expect(new PhonePeDqrAdapter(credentials).statusRequest(expected).url).toBe(
      base + "/v3/transaction/LIVE_MERCHANT/LIVE_TX/status",
    );
  });
  it.each([
    "",
    "http://fixture.phonepe.com",
    "https://phonepe.com.evil.test",
    "https://evil.test",
    "https://fixture.phonepe.com@evil.test",
    "https://fixture.phonepe.com:8443",
    "https://fixture.phonepe.com?x=1",
    "https://fixture.phonepe.com/v3",
    "https://mercury-uat.phonepe.com",
    "https://fixture.phonepe.com/../other",
    "https://fixture.phonepe.com/%2fother",
  ])("rejects missing/unsafe/unconfirmed base %s without network", (value) => {
    vi.stubEnv("SELFX_PHONEPE_PRODUCTION_BASE_URL", value);
    expect(() => phonePeProductionBase()).toThrow();
  });
  it("requires a separate production switch and exact configured paths", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response('{"success":true}'));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SELFX_PHONEPE_UAT_ENABLED", "true");
    vi.stubEnv("SELFX_PHONEPE_PRODUCTION_ENABLED", "false");
    vi.stubEnv("SELFX_PHONEPE_PRODUCTION_BASE_URL", base);
    const request = new PhonePeDqrAdapter(credentials).createRequest(
      expected,
      "https://callbacks.example.test/live",
      300,
    );
    await expect(new PhonePeTransport().send(request)).rejects.toThrow();
    vi.stubEnv("SELFX_PHONEPE_PRODUCTION_ENABLED", "true");
    for (const url of [
      base + "/v3/refund",
      request.url + "?redirect=1",
      "https://other.phonepe.com/merchant/v3/qr/init",
    ])
      await expect(
        new PhonePeTransport().send({ ...request, url }),
      ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("SELFX_PHONEPE_UAT_ENABLED", "false");
    await new PhonePeTransport().send(request);
    await new PhonePeTransport().send(
      new PhonePeDqrAdapter(credentials).statusRequest(expected),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
  });
  it("never falls back to production for UAT credentials", () => {
    vi.stubEnv("SELFX_PHONEPE_PRODUCTION_BASE_URL", base);
    const request = new PhonePeDqrAdapter({
      ...credentials,
      environment: "UAT",
    }).statusRequest(expected);
    expect(request.url).toContain(
      "mercury-uat.phonepe.com/enterprise-sandbox/",
    );
  });
});
