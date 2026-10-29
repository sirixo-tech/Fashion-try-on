import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMobileCheckout,
  mobileCheckoutStatus,
} from "./phonepe-mobile-checkout.js";

const credentials = {
  merchantId: "SELFX",
  clientId: "client_1",
  clientVersion: "1",
  clientSecret: "secret_123456789",
  environment: "SANDBOX" as const,
};
const response = (value: unknown) =>
  new Response(JSON.stringify(value), { status: 200 });
afterEach(() => vi.unstubAllGlobals());

describe("mobile PhonePe checkout", () => {
  it("creates a constrained UPI checkout without passing credentials to the client", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ access_token: "token" }))
      .mockResolvedValueOnce(
        response({
          state: "PENDING",
          orderId: "OMO1",
          redirectUrl: "https://mercury-uat.phonepe.com/pay?id=1",
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const checkout = await createMobileCheckout(
      credentials,
      "SELFX_order1",
      500,
    );
    expect(checkout.checkoutUrl).toContain("phonepe.com");
    const body = JSON.parse(fetcher.mock.calls[1]![1].body as string);
    expect(body.amount).toBe(500);
    expect(body.paymentFlow.paymentModeConfig.enabledPaymentModes).toEqual([
      { type: "UPI_INTENT" },
      { type: "UPI_QR" },
    ]);
  });

  it("rejects a status whose amount differs from the purchase snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({ access_token: "token" }))
        .mockResolvedValueOnce(
          response({ state: "COMPLETED", amount: 100, orderId: "OMO1" }),
        ),
    );
    await expect(
      mobileCheckoutStatus(credentials, "SELFX_order1", 500),
    ).rejects.toThrow();
  });

  it("rejects a checkout redirect outside PhonePe", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({ access_token: "token" }))
        .mockResolvedValueOnce(
          response({
            state: "PENDING",
            orderId: "OMO1",
            redirectUrl: "https://evil.example/pay",
          }),
        ),
    );
    await expect(
      createMobileCheckout(credentials, "SELFX_order1", 500),
    ).rejects.toThrow();
  });
});
