import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  deleteMany: vi.fn(),
}));
vi.mock("./shopify.server", () => ({
  authenticate: { admin: mocks.authenticate },
}));
vi.mock("./db.server", () => ({
  default: { session: { deleteMany: mocks.deleteMany } },
}));
import { withShopifyConnectionRecovery } from "./selfx-connection-auth.server";
import { ShopifyAdminApiError } from "../src/shopify-admin.server.js";
const shop = "merchant.myshopify.com";
const initial = {
  session: { id: "offline_merchant", shop, accessToken: "rejected-token" },
};
const fresh = {
  session: { id: "offline_merchant", shop, accessToken: "fresh-token" },
};
describe("Shopify reconnect after a revoked token", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    mocks.authenticate.mockResolvedValue(fresh);
  });
  it("leaves a working session untouched", async () => {
    const operation = vi.fn().mockResolvedValue("pending-approval");
    expect(
      await withShopifyConnectionRecovery(
        new Request("https://app.test/app"),
        initial as never,
        operation,
      ),
    ).toBe("pending-approval");
    expect(operation).toHaveBeenCalledExactlyOnceWith({
      shop,
      shopifyAccessToken: "rejected-token",
    });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });
  it.each(["GET", "POST"])(
    "recovers %s through the SDK and deletes only the exact rejected session",
    async (method) => {
      const request = new Request("https://app.test/app", {
        method,
        headers: { Authorization: "Bearer current-merchant-session" },
      });
      // Connection actions have already consumed the form body.
      if (method === "POST") await request.text();
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new ShopifyAdminApiError(401))
        .mockResolvedValueOnce("pending-approval");
      expect(
        await withShopifyConnectionRecovery(
          request,
          initial as never,
          operation,
        ),
      ).toBe("pending-approval");
      expect(mocks.deleteMany).toHaveBeenCalledExactlyOnceWith({
        where: { id: initial.session.id, shop, accessToken: "rejected-token" },
      });
      expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith(request);
      expect(operation.mock.calls).toEqual([
        [{ shop, shopifyAccessToken: "rejected-token" }],
        [{ shop, shopifyAccessToken: "fresh-token" }],
      ]);
    },
  );
  it("retains a concurrently refreshed session", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new ShopifyAdminApiError(401))
      .mockResolvedValue("pending-approval");
    await withShopifyConnectionRecovery(
      new Request("https://app.test/app"),
      initial as never,
      operation,
    );
    expect(mocks.deleteMany.mock.calls[0][0].where.accessToken).toBe(
      "rejected-token",
    );
    expect(operation.mock.calls[1][0].shopifyAccessToken).toBe("fresh-token");
  });
  it.each([403, 429, 500])(
    "does not discard authentication for HTTP %s",
    async (status) => {
      const failure = new ShopifyAdminApiError(status);
      await expect(
        withShopifyConnectionRecovery(
          new Request("https://app.test/app"),
          initial as never,
          vi.fn().mockRejectedValue(failure),
        ),
      ).rejects.toBe(failure);
      expect(mocks.deleteMany).not.toHaveBeenCalled();
      expect(mocks.authenticate).not.toHaveBeenCalled();
    },
  );
  it("ignores unrelated errors even if they have a 401 status property", async () => {
    const failure = Object.assign(new Error("central connection unavailable"), {
      status: 401,
    });
    await expect(
      withShopifyConnectionRecovery(
        new Request("https://app.test/app"),
        initial as never,
        vi.fn().mockRejectedValue(failure),
      ),
    ).rejects.toBe(failure);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
  it("stops after one retry if the fresh token is also rejected", async () => {
    const failure = new ShopifyAdminApiError(401),
      operation = vi.fn().mockRejectedValue(failure);
    await expect(
      withShopifyConnectionRecovery(
        new Request("https://app.test/app"),
        initial as never,
        operation,
      ),
    ).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(mocks.authenticate).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
  });
  it("preserves failed SDK merchant authentication and its recovery headers", async () => {
    const response = new Response(null, {
      status: 401,
      headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" },
    });
    mocks.authenticate.mockRejectedValue(response);
    const operation = vi.fn().mockRejectedValue(new ShopifyAdminApiError(401));
    await expect(
      withShopifyConnectionRecovery(
        new Request("https://app.test/app"),
        initial as never,
        operation,
      ),
    ).rejects.toBe(response);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(
      response.headers.get("X-Shopify-Retry-Invalid-Session-Request"),
    ).toBe("1");
  });
  it("rejects a different shop returned by the SDK before retrying the link", async () => {
    mocks.authenticate.mockResolvedValue({
      session: { ...fresh.session, shop: "another.myshopify.com" },
    });
    const operation = vi.fn().mockRejectedValue(new ShopifyAdminApiError(401));
    await expect(
      withShopifyConnectionRecovery(
        new Request("https://app.test/app"),
        initial as never,
        operation,
      ),
    ).rejects.toThrow("unexpected shop identity");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
