import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  sync: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("../shopify.server", () => ({
  authenticate: { admin: mocks.authenticate },
}));
vi.mock("../selfx-billing.server", () => ({ syncShopifyBilling: mocks.sync }));
import { loader } from "./app.billing.return";

describe("authenticated billing return", () => {
  const shop = "merchant.myshopify.com",
    admin = {};
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authenticate.mockResolvedValue({
      session: { shop },
      admin,
      redirect: mocks.redirect,
    });
    mocks.redirect.mockReturnValue(
      new Response(null, {
        status: 302,
        headers: { Location: "/app?panel=plans" },
      }),
    );
  });
  it("verifies the authenticated shop before returning to Plans and does not trust URL charge IDs", async () => {
    const request = new Request(
      "https://app.test/app/billing/return?agreement=untrusted&charge_id=untrusted",
    );
    const response = await loader({ request } as never);
    expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith(request);
    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith(shop, admin);
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/app?panel=plans");
    expect(response.headers.get("Location")).toBe("/app?panel=plans");
  });
  it("preserves SDK authentication control responses before any billing operation", async () => {
    const response = new Response(null, {
      status: 401,
      headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" },
    });
    mocks.authenticate.mockRejectedValue(response);
    await expect(
      loader({
        request: new Request("https://app.test/app/billing/return"),
      } as never),
    ).rejects.toBe(response);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("does not present an unverified approval as a successful plan change", async () => {
    const failure = new Error("Native verification unavailable");
    mocks.sync.mockRejectedValue(failure);
    await expect(
      loader({
        request: new Request("https://app.test/app/billing/return"),
      } as never),
    ).rejects.toBe(failure);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
