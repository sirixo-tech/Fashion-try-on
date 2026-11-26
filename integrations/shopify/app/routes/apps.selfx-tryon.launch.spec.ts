import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  find: vi.fn(),
  availability: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../shopify.server", () => ({
  authenticate: { public: { appProxy: mocks.auth } },
}));
vi.mock("../db.server", () => ({
  default: { selfxConnection: { findUnique: mocks.find } },
}));
vi.mock("../selfx-link.server", async (original) => ({
  ...(await original<typeof import("../selfx-link.server")>()),
  loadSelfxLinkConfig: () => ({
    apiBaseUrl: "https://api.test",
    webBaseUrl: "https://app.test",
    serviceToken: "s".repeat(32),
  }),
}));
vi.mock("../selfx-storefront-tryon.server", async (original) => ({
  ...(await original<typeof import("../selfx-storefront-tryon.server")>()),
  SelfxStorefrontTryOnClient: class {
    availability = mocks.availability;
    createSession = mocks.create;
  },
}));
import { loader } from "./apps.selfx-tryon.launch";
describe("authenticated storefront launch readiness", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("SELFX_STOREFRONT_TRYON_URL", "https://app.test/try-on/shopify");
    vi.stubEnv("SELFX_WEB_BASE_URL", "https://app.test");
    mocks.auth.mockResolvedValue({
      session: { shop: "merchant.myshopify.com" },
    });
    mocks.find.mockResolvedValue({
      status: "CONNECTED",
      storefrontLocale: "auto",
    });
  });
  afterEach(() => vi.unstubAllEnvs());
  function run(extra = "") {
    return loader({
      request: new Request(
        `https://merchant.myshopify.com/apps/selfx-tryon/launch?productId=123${extra}`,
      ),
    } as never);
  }
  it("returns unavailable JSON before Store approval without creating a session", async () => {
    mocks.find.mockResolvedValue({ status: "PENDING_APPROVAL" });
    const response = await run("&availability=1");
    expect(await response.json()).toEqual({ available: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rechecks availability on click and creates no session when unavailable", async () => {
    mocks.availability.mockResolvedValue({ available: false });
    expect((await run()).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("opens the fitting room for an eligible connected product", async () => {
    mocks.availability.mockResolvedValue({ available: true });
    mocks.create.mockResolvedValue({ session: "t".repeat(43) });
    const response = await run();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("window.location.replace");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("rejects an unauthenticated proxy request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.auth.mockRejectedValue(new Error("bad signature"));
    expect((await run()).status).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
