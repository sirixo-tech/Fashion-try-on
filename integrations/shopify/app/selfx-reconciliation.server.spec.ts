import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  admin: vi.fn(),
  runSync: vi.fn(),
  health: vi.fn(),
}));
vi.mock("./db.server", () => ({
  default: {
    selfxConnection: { findMany: deps.findMany, updateMany: deps.updateMany },
  },
}));
vi.mock("./shopify.server", () => ({ unauthenticated: { admin: deps.admin } }));
vi.mock("./selfx-connection.server", () => ({
  runSelfxCatalogSync: deps.runSync,
}));
vi.mock("./selfx-billing.server", () => ({ billingEnabled: () => false }));
vi.mock("./selfx-storefront-tryon.server", () => ({
  SelfxStorefrontTryOnClient: class {
    getConnectionHealth = deps.health;
  },
}));
vi.mock("./selfx-link.server", () => ({ loadSelfxLinkConfig: () => ({}) }));
import { reconcileConnectedShops } from "./selfx-reconciliation.server";
describe("Embedded Shopify catalog recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    deps.findMany.mockResolvedValue([
      { shop: "one.myshopify.com", syncAttempts: 0 },
    ]);
    deps.health.mockResolvedValue({ reconciliationOwner: "SHOPIFY_APP" });
    deps.admin.mockResolvedValue({ session: { accessToken: "server-only" } });
  });
  afterEach(() => vi.restoreAllMocks());
  it("runs without an open merchant browser, using authenticated offline shop sessions", async () => {
    await reconcileConnectedShops();
    expect(deps.runSync).toHaveBeenCalledWith({
      shop: "one.myshopify.com",
      shopifyAccessToken: "server-only",
    });
    expect(deps.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
        where: expect.objectContaining({ status: "CONNECTED" }),
      }),
    );
  });
  it("leaves OAuth-owned jobs to the central API scheduler", async () => {
    deps.health.mockResolvedValue({ reconciliationOwner: "SELFX_API" });
    await reconcileConnectedShops();
    expect(deps.runSync).not.toHaveBeenCalled();
    expect(deps.admin).not.toHaveBeenCalled();
    expect(deps.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shop: "one.myshopify.com" },
        data: { nextSyncAt: expect.any(Date) },
      }),
    );
  });
  it("backs off safely if offline authorization is unavailable", async () => {
    deps.admin.mockRejectedValue(new Error("credentials unavailable"));
    await reconcileConnectedShops();
    expect(deps.runSync).not.toHaveBeenCalled();
    expect(deps.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastErrorCode: "SHOPIFY_RECONNECT_REQUIRED",
          nextSyncAt: expect.any(Date),
          syncAttempts: { increment: 1 },
        }),
      }),
    );
  });
});
