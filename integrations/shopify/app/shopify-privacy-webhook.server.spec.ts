import { describe, expect, it, vi } from "vitest";

import { processShopifyPrivacyWebhook } from "./shopify-privacy-webhook.server";

describe("Shopify privacy webhook processing", () => {
  it("deletes local Shopify records after central shop redaction succeeds", async () => {
    const request = privacyRequest("shop/redact");
    const deleteLocalShopData = vi.fn().mockResolvedValue(undefined);

    const response = await processShopifyPrivacyWebhook({
      request,
      rawBody: await request.clone().arrayBuffer(),
      shop: "merchant.myshopify.com",
      forward: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
      deleteLocalShopData,
    });

    expect(response.status).toBe(200);
    expect(deleteLocalShopData).toHaveBeenCalledWith("merchant.myshopify.com");
  });

  it("keeps local records when central redaction fails", async () => {
    const request = privacyRequest("shop/redact");
    const deleteLocalShopData = vi.fn();

    const response = await processShopifyPrivacyWebhook({
      request,
      rawBody: await request.clone().arrayBuffer(),
      shop: "merchant.myshopify.com",
      forward: vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
      deleteLocalShopData,
    });

    expect(response.status).toBe(503);
    expect(deleteLocalShopData).not.toHaveBeenCalled();
  });

  it("returns unavailable when local cleanup fails so Shopify retries", async () => {
    const request = privacyRequest("shop/redact");

    const response = await processShopifyPrivacyWebhook({
      request,
      rawBody: await request.clone().arrayBuffer(),
      shop: "merchant.myshopify.com",
      forward: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
      deleteLocalShopData: vi.fn().mockRejectedValue(new Error("database")),
    });

    expect(response.status).toBe(503);
  });

  it("does not delete local records for customer privacy topics", async () => {
    const request = privacyRequest("customers/redact");
    const deleteLocalShopData = vi.fn();

    await processShopifyPrivacyWebhook({
      request,
      rawBody: await request.clone().arrayBuffer(),
      shop: "merchant.myshopify.com",
      forward: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
      deleteLocalShopData,
    });

    expect(deleteLocalShopData).not.toHaveBeenCalled();
  });
});

function privacyRequest(topic: string): Request {
  return new Request("https://shopify.selfx.test/webhooks/privacy", {
    method: "POST",
    headers: { "x-shopify-topic": topic },
    body: "{}",
  });
}
