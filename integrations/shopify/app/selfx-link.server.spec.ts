import { describe, expect, it, vi } from "vitest";

import { SelfxLinkClient, loadSelfxLinkConfig } from "./selfx-link.server";

const config = {
  apiBaseUrl: "https://api.selfx.test",
  webBaseUrl: "https://app.selfx.test",
  serviceToken: "s".repeat(32),
};

describe("SelfxLinkClient", () => {
  it("creates a link with server authentication and a JSON body", async () => {
    const linkToken = "a".repeat(43);
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        linkToken,
        approvalUrl: `https://app.selfx.test/app/integrations/shopify/link?token=${linkToken}`,
        expiresAt: "2026-09-10T12:10:00.000Z",
      }),
    );

    const client = new SelfxLinkClient(config, fetchImpl);

    await client.create({
      shopDomain: "merchant.myshopify.com",
      externalAccountId: "gid://shopify/Shop/1001",
      externalAccountName: "Merchant",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.selfx.test/api/v1/integrations/shopify/link-sessions",
      expect.any(Object),
    );

    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(request.headers);

    expect(request.method).toBe("POST");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("x-selfx-shopify-service-token")).toBe("s".repeat(32));
    expect(request.body).toBeTruthy();
  });

  it("redeems a link without sending an empty JSON request body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "SHOPIFY_LINK_SESSION_PENDING_APPROVAL",
            message: "Approval is pending.",
          },
        },
        409,
      ),
    );

    const client = new SelfxLinkClient(config, fetchImpl);

    await expect(client.redeem("a".repeat(43))).rejects.toMatchObject({
      code: "SHOPIFY_LINK_SESSION_PENDING_APPROVAL",
      message: "Approval is pending.",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.selfx.test/api/v1/integrations/shopify/link-sessions/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/redeem",
      expect.any(Object),
    );

    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(request.headers);

    expect(request.method).toBe("POST");
    expect(request.body).toBeUndefined();
    expect(headers.has("Content-Type")).toBe(false);
    expect(headers.get("x-selfx-shopify-service-token")).toBe("s".repeat(32));
  });

  it("rejects an approval URL outside the configured SelfX web origin", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        linkToken: "a".repeat(43),
        approvalUrl:
          "https://attacker.test/app/integrations/shopify/link?token=stolen",
        expiresAt: "2026-09-10T12:10:00.000Z",
      }),
    );

    await expect(
      new SelfxLinkClient(config, fetchImpl).create({
        shopDomain: "merchant.myshopify.com",
        externalAccountId: "gid://shopify/Shop/1001",
        externalAccountName: "Merchant",
      }),
    ).rejects.toMatchObject({ code: "SELFX_LINK_INVALID_RESPONSE" });
  });
});

describe("loadSelfxLinkConfig", () => {
  it("accepts HTTPS services and a long server token", () => {
    expect(
      loadSelfxLinkConfig({
        SELFX_API_BASE_URL: "https://api.selfx.test/",
        SELFX_WEB_BASE_URL: "https://app.selfx.test/",
        SELFX_SHOPIFY_APP_SERVICE_TOKEN: "s".repeat(32),
      }),
    ).toEqual(config);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
