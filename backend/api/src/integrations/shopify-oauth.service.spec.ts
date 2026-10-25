import { createHmac } from "node:crypto";

import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { encryptProviderSecret } from "./provider-secret-cipher.js";

import {
  normalizeShopDomain,
  validateShopifyScopes,
  verifyShopifyCallbackHmac,
  ShopifyOauthService,
} from "./shopify-oauth.service.js";

describe("Shopify OAuth security helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates a short-lived server-side state and requests only read_products", async () => {
    vi.stubEnv("SHOPIFY_CLIENT_ID", "client-id");
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", "client-secret");
    vi.stubEnv(
      "SELFX_INTEGRATION_ENCRYPTION_KEY",
      Buffer.alloc(32, 9).toString("base64"),
    );
    vi.stubEnv("SELFX_API_BASE_URL", "https://api.selfx.test");
    vi.stubEnv("SELFX_WEB_BASE_URL", "https://app.selfx.test");
    const created: Array<Record<string, unknown>> = [];
    const transaction = {
      integrationOauthState: {
        deleteMany: vi.fn(),
        create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
        }),
      },
    };
    const prisma = {
      organization: {
        findFirst: vi.fn().mockResolvedValue({ id: "store-1" }),
      },
      $transaction: vi.fn(
        (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const service = new ShopifyOauthService(prisma as never, {} as never);

    const result = await service.start(
      "user-1",
      "store-1",
      "merchant.myshopify.com",
    );
    const url = new URL(result.authorizationUrl);

    expect(url.origin).toBe("https://merchant.myshopify.com");
    expect(url.searchParams.get("scope")).toBe("read_products");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://api.selfx.test/api/v1/admin/integrations/shopify/oauth/callback",
    );
    expect(created[0]?.stateHash).not.toBe(url.searchParams.get("state"));
    expect(created[0]).toMatchObject({
      organizationId: "store-1",
      provider: "SHOPIFY",
      createdByUserId: "user-1",
    });
  });

  it("verifies Shopify callback HMAC and rejects changed parameters", () => {
    const secret = "shopify-client-secret";
    const query = {
      code: "authorization-code",
      host: "bWVyY2hhbnQubXlzaG9waWZ5LmNvbQ",
      shop: "merchant.myshopify.com",
      state: "12345678901234567890123456789012",
      timestamp: "1788768000",
    };
    const message = Object.entries(query)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    const hmac = createHmac("sha256", secret).update(message).digest("hex");

    expect(verifyShopifyCallbackHmac({ ...query, hmac }, secret)).toBe(true);
    expect(
      verifyShopifyCallbackHmac(
        { ...query, shop: "attacker.myshopify.com", hmac },
        secret,
      ),
    ).toBe(false);
  });

  it("accepts only canonical myshopify domains", () => {
    expect(normalizeShopDomain(" Merchant-Store.MyShopify.com ")).toBe(
      "merchant-store.myshopify.com",
    );
    expect(() => normalizeShopDomain("merchant.example.com")).toThrow();
    expect(() =>
      normalizeShopDomain("merchant.myshopify.com.attacker.test"),
    ).toThrow();
  });

  it("accepts the app proxy scope alongside read-only product access", () => {
    expect(
      validateShopifyScopes("read_products,read_themes,write_app_proxy"),
    ).toEqual(["read_products", "read_themes", "write_app_proxy"]);
    expect(
      validateShopifyScopes(undefined, ["read_products", "write_app_proxy"]),
    ).toEqual(["read_products", "write_app_proxy"]);
  });

  it("rejects missing product access and unrelated write scopes", () => {
    for (const [scopes, message] of [
      [
        "read_themes,write_app_proxy",
        "Shopify did not grant the required read_products scope.",
      ],
      [
        "read_products,write_products",
        "Shopify granted an unsupported write scope.",
      ],
    ]) {
      try {
        validateShopifyScopes(scopes);
        throw new Error("Expected Shopify scope validation to fail.");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiErrorException);
        expect((error as ApiErrorException).getResponse()).toMatchObject({
          error: { code: "SHOPIFY_OAUTH_SCOPE_INVALID", message },
        });
      }
    }
  });

  it("logs only safe Shopify renewal rejection fields and preserves the 502", async () => {
    const { service, fetchMock } = renewalService();
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "The refresh token is invalid or expired.",
        }),
        { status: 400 },
      ),
    );

    await expect(service.sync("user-1", "integration-1")).rejects.toMatchObject(
      {
        status: 502,
        response: {
          error: {
            code: "SHOPIFY_OAUTH_TOKEN_EXCHANGE_FAILED",
            message: "Shopify rejected the access-token request.",
          },
        },
      },
    );
    expect(warn).toHaveBeenCalledWith({
      httpStatus: 400,
      shopifyErrorCode: "invalid_grant",
      shopifyErrorMessage: "The refresh token is invalid or expired.",
      timestamp: expect.any(String),
      shopDomain: "merchant.myshopify.com",
      integrationId: "integration-1",
    });
    expect(Number.isFinite(Date.parse(warn.mock.calls[0]?.[0].timestamp))).toBe(
      true,
    );
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(
      /access-secret|refresh-secret|client-secret|client-id/,
    );
  });

  it("redacts reflected credentials and ignores unstructured renewal errors", async () => {
    const { service, fetchMock } = renewalService();
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "invalid_client",
            error_description:
              "client_secret=client-secret refresh_token=refresh-secret Authorization: Bearer access-secret https://shopify.test?access_token=access-secret",
          }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(new Response("not JSON", { status: 403 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "client-secret" }), {
          status: 401,
        }),
      );

    await expect(
      service.sync("user-1", "integration-1"),
    ).rejects.toBeInstanceOf(ApiErrorException);
    await expect(
      service.sync("user-1", "integration-1"),
    ).rejects.toBeInstanceOf(ApiErrorException);
    await expect(
      service.sync("user-1", "integration-1"),
    ).rejects.toBeInstanceOf(ApiErrorException);

    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      httpStatus: 401,
      shopifyErrorCode: "invalid_client",
    });
    expect(warn.mock.calls[1]?.[0]).toMatchObject({
      httpStatus: 403,
      shopifyErrorCode: null,
      shopifyErrorMessage: null,
    });
    expect(warn.mock.calls[2]?.[0]).toMatchObject({
      httpStatus: 401,
      shopifyErrorCode: null,
      shopifyErrorMessage: null,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(
      /access-secret|refresh-secret|client-secret|client-id|shopify\.test/,
    );
  });
});

function renewalService() {
  vi.stubEnv("SHOPIFY_CLIENT_ID", "client-id");
  vi.stubEnv("SHOPIFY_CLIENT_SECRET", "client-secret");
  const key = Buffer.alloc(32, 9);
  vi.stubEnv("SELFX_INTEGRATION_ENCRYPTION_KEY", key.toString("base64"));
  vi.stubEnv("SELFX_API_BASE_URL", "https://api.selfx.test");
  vi.stubEnv("SELFX_WEB_BASE_URL", "https://app.selfx.test");
  const prisma = {
    integration: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({
          id: "integration-1",
          organizationId: "store-1",
          metadata: { shopDomain: "merchant.myshopify.com" },
          catalogSyncAttempts: 0,
          catalogSyncCheckpoint: null,
        }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue({
        id: "integration-1",
        metadata: { shopDomain: "merchant.myshopify.com" },
        organization: { name: "Test Store" },
        providerCredential: {
          ...encryptProviderSecret(
            { accessToken: "access-secret", refreshToken: "refresh-secret" },
            key,
          ),
          accessTokenExpiresAt: new Date(Date.now() - 1_000),
          scopes: ["read_products"],
        },
      }),
    },
  };
  const fetchMock = vi.fn();
  prisma.integration.findUniqueOrThrow.mockImplementation(async () => ({
    ...(await prisma.integration.findFirst()),
    organizationId: "store-1",
    catalogSyncAttempts: 0,
    catalogSyncCheckpoint: null,
  }));
  Object.assign(prisma, { auditLog: { create: vi.fn() } });
  vi.stubGlobal("fetch", fetchMock);
  return {
    service: new ShopifyOauthService(prisma as never, {} as never),
    fetchMock,
  };
}
