// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { bindStorefrontVisitor } from "./storefront-visitor-route";

const session = "s".repeat(43);
const visitor = "v".repeat(43);
function request(
  body: unknown = { session },
  origin = "https://selfx.example",
  cookie?: string,
) {
  return new NextRequest("https://selfx.example/try-on/commerce/visitor", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
describe("SelfX first-party visitor bridge", () => {
  const upstream = vi.fn();
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SELFX_API_UPSTREAM_URL", "https://api.selfx.example");
    vi.stubGlobal("fetch", upstream);
    upstream.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("sets the API-issued HttpOnly cookie on the web origin, without caching", async () => {
    const cookie = `__Host-selfx_storefront_visitor=${visitor}; Path=/; HttpOnly; Secure; SameSite=Lax`;
    upstream.mockResolvedValue(
      Response.json({ bound: true }, { headers: { "Set-Cookie": cookie } }),
    );
    const response = await bindStorefrontVisitor(request());
    expect(response.headers.get("set-cookie")).toBe(cookie);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(upstream).toHaveBeenCalledWith(
      `https://api.selfx.example/api/v1/public/integrations/commerce/try-on-sessions/${session}/visitor`,
      expect.objectContaining({
        method: "POST",
        headers: {},
        redirect: "error",
      }),
    );
  });
  it("forwards only the visitor cookie, never staff or other browser cookies", async () => {
    upstream.mockResolvedValue(Response.json({ bound: true }));
    await bindStorefrontVisitor(
      request(
        { session },
        undefined,
        `staff=private; __Host-selfx_storefront_visitor=${visitor}; other=secret`,
      ),
    );
    expect(upstream.mock.calls[0]?.[1].headers).toEqual({
      Cookie: `__Host-selfx_storefront_visitor=${visitor}`,
    });
  });
  it("refuses cross-origin requests and client-selected identities or Stores", async () => {
    for (const input of [
      request({ session }, "https://other.example"),
      request({ session, visitorToken: visitor }),
      request({ session, storeId: "other" }),
      request({ session: "invalid" }),
    ]) {
      expect(
        (await bindStorefrontVisitor(input)).status,
      ).toBeGreaterThanOrEqual(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it("preserves a binding rejection without overwriting the browser cookie", async () => {
    upstream.mockResolvedValue(
      Response.json(
        { error: { code: "STOREFRONT_VISITOR_MISMATCH" } },
        { status: 409, headers: { "Set-Cookie": "unwanted=value" } },
      ),
    );
    const response = await bindStorefrontVisitor(request());
    expect(response.status).toBe(409);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("fails safely on API outage without returning credentials or capability URLs", async () => {
    upstream.mockRejectedValue(new Error("sensitive upstream URL"));
    const response = await bindStorefrontVisitor(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(session);
  });
});
