import { describe, expect, it, vi } from "vitest";

import {
  forwardShopifyWebhookToSelfx,
  loadSelfxWebhookForwardingConfig,
} from "./selfx-webhook-forwarder.server";

const signedHeaders = {
  "content-type": "application/json",
  "x-shopify-api-version": "2026-07",
  "x-shopify-hmac-sha256": "signed-body",
  "x-shopify-shop-domain": "merchant.myshopify.com",
  "x-shopify-topic": "customers/data_request",
  "x-shopify-triggered-at": "2026-09-21T10:00:00.000Z",
  "x-shopify-webhook-id": "webhook-1",
};

describe("Shopify webhook forwarding", () => {
  it("forwards the exact body and only the required Shopify headers", async () => {
    const body = '{\n  "shop_id": 123\n}';
    const request = new Request("https://shopify.selfx.test/webhooks/privacy", {
      method: "POST",
      headers: {
        ...signedHeaders,
        authorization: "must-not-be-forwarded",
        cookie: "must-not-be-forwarded",
      },
      body,
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));

    const response = await forwardShopifyWebhookToSelfx({
      request,
      rawBody: await request.clone().arrayBuffer(),
      config: { apiBaseUrl: "https://api.selfx.test" },
      fetchImpl,
    });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.selfx.test/api/v1/integrations/shopify/webhooks",
      expect.any(Object),
    );
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(Buffer.from(init.body as ArrayBuffer).toString("utf8")).toBe(body);
    const headers = new Headers(init.headers);
    expect(headers.get("x-shopify-hmac-sha256")).toBe("signed-body");
    expect(headers.get("x-shopify-topic")).toBe("customers/data_request");
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
  });

  it("passes an upstream failure status through so Shopify retries", async () => {
    const request = new Request("https://shopify.selfx.test/webhooks/privacy", {
      method: "POST",
      headers: signedHeaders,
      body: "{}",
    });

    const response = await forwardShopifyWebhookToSelfx({
      request,
      rawBody: await request.clone().arrayBuffer(),
      config: { apiBaseUrl: "https://api.selfx.test" },
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    });

    expect(response.status).toBe(503);
  });

  it("returns unavailable when the central API cannot be reached", async () => {
    const request = new Request("https://shopify.selfx.test/webhooks/privacy", {
      method: "POST",
      headers: signedHeaders,
      body: "{}",
    });

    const response = await forwardShopifyWebhookToSelfx({
      request,
      rawBody: await request.clone().arrayBuffer(),
      config: { apiBaseUrl: "https://api.selfx.test" },
      fetchImpl: vi.fn().mockRejectedValue(new Error("offline")),
    });

    expect(response.status).toBe(503);
  });
});

describe("loadSelfxWebhookForwardingConfig", () => {
  it("normalizes an HTTPS API base URL", () => {
    expect(
      loadSelfxWebhookForwardingConfig({
        SELFX_API_BASE_URL: "https://api.selfx.test/",
      }),
    ).toEqual({ apiBaseUrl: "https://api.selfx.test" });
  });

  it("rejects insecure non-local API URLs", () => {
    expect(() =>
      loadSelfxWebhookForwardingConfig({
        SELFX_API_BASE_URL: "http://api.selfx.test",
      }),
    ).toThrow("must use HTTPS");
  });
});
