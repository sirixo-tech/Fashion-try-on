import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDashboard } from "./use-dashboard";
import { dashboardFixture } from "./dashboard-fixture";

const mocks = vi.hoisted(() => ({
  platform: vi.fn(),
  merchant: vi.fn(),
  permissions: vi.fn(),
  stores: vi.fn(),
  kiosks: vi.fn(),
  products: vi.fn(),
  users: vi.fn(),
  usage: vi.fn(),
}));
vi.mock("./access-control", () => ({
  getCurrentPlatformAccess: mocks.platform,
}));
vi.mock("./current-store", async (original) => ({
  ...(await original<typeof import("./current-store")>()),
  getCurrentMerchantStoreAccess: mocks.merchant,
}));
vi.mock("./stores", () => ({
  getEffectiveStorePermissions: mocks.permissions,
  listStores: mocks.stores,
  listStoreKiosks: mocks.kiosks,
  listStoreProducts: mocks.products,
  listStoreUsers: mocks.users,
}));
vi.mock("./usage", () => ({ getUsageSummary: mocks.usage }));
const permissions = {
  platformBypass: false,
  permissions: ["analytics.view", "stores.view", "users.view", "kiosks.view"],
  resourcePermissions: ["stores.view", "kiosks.view"],
  featureKeys: ["ANALYTICS", "KIOSK_MANAGEMENT"],
};
describe("Dashboard scope and loading", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.platform.mockResolvedValue({ isSuperadmin: false, permissions: [] });
    mocks.merchant.mockResolvedValue({
      store: { id: "store-a", name: "Store A" },
    });
    mocks.permissions.mockResolvedValue(permissions);
    mocks.stores.mockResolvedValue({
      data: [
        { id: "store-a", name: "Store A" },
        { id: "store-b", name: "Store B" },
      ],
      pagination: { total: 205 },
    });
    mocks.kiosks.mockResolvedValue([]);
    mocks.products.mockResolvedValue({ data: [], pagination: { total: 147 } });
    mocks.users.mockResolvedValue({ data: [], pagination: { total: 23 } });
    mocks.usage.mockImplementation(async (_token, query) =>
      dashboardFixture(query.range === "custom" ? 12 : 18),
    );
  });
  afterEach(cleanup);
  it("resolves merchant scope first and never requests all-Store data", async () => {
    const { result } = renderHook(() =>
      useDashboard("merchant", null, "30d", 0),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.storeId).toBe("store-a");
    expect(result.current.metrics?.growthPercent).toBe(50);
    expect(result.current.data?.products).toBe(147);
    expect(result.current.data?.staff).toBe(23);
    expect(mocks.stores).not.toHaveBeenCalled();
    for (const [, query] of mocks.usage.mock.calls)
      expect(query.storeId).toBe("store-a");
  });
  it("makes no protected usage, product, team or kiosk requests without permissions", async () => {
    mocks.permissions.mockResolvedValue({
      permissions: [],
      resourcePermissions: [],
      featureKeys: [],
      platformBypass: false,
    });
    const { result } = renderHook(() => useDashboard("staff", null, "30d", 0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.metrics).toBeNull();
    for (const method of [
      mocks.usage,
      mocks.kiosks,
      mocks.products,
      mocks.users,
    ])
      expect(method).not.toHaveBeenCalled();
  });
  it("shows platform totals only after resolving Platform usage authority", async () => {
    mocks.platform.mockResolvedValue({ isSuperadmin: true, permissions: [] });
    const { result } = renderHook(() =>
      useDashboard("platform", null, "7d", 0),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.context?.totalStores).toBe(205);
    expect(result.current.canViewAll).toBe(true);
    expect(mocks.usage.mock.calls[0]?.[1]).not.toHaveProperty("storeId");
    expect(mocks.merchant).not.toHaveBeenCalled();
  });
  it("clears previous metrics immediately on scope changes and discards late responses", async () => {
    mocks.platform.mockResolvedValue({ isSuperadmin: true, permissions: [] });
    let finishA: (
      value: ReturnType<typeof dashboardFixture>,
    ) => void = () => {};
    mocks.usage.mockImplementation(async (_token, query) =>
      query.storeId === "store-a"
        ? new Promise((resolve) => {
            finishA = resolve;
          })
        : dashboardFixture(3),
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useDashboard("platform", id, "7d", 0),
      { initialProps: { id: "store-a" } },
    );
    await waitFor(() => expect(mocks.usage).toHaveBeenCalled());
    rerender({ id: "store-b" });
    expect(result.current.metrics).toBeNull();
    await waitFor(() => expect(result.current.metrics?.generated).toBe(3));
    await act(async () => finishA(dashboardFixture(999)));
    expect(result.current.metrics?.generated).toBe(3);
  });
  it("clears the snapshot when permissions change and resolves the new ceiling before reloading", async () => {
    const { result } = renderHook(() =>
      useDashboard("merchant", null, "30d", 0),
    );
    await waitFor(() => expect(result.current.metrics?.generated).toBe(18));
    mocks.permissions.mockResolvedValue({
      permissions: [],
      resourcePermissions: [],
      featureKeys: [],
      platformBypass: false,
    });
    await act(async () => {
      window.dispatchEvent(new Event("selfx:permissions-changed"));
    });
    expect(result.current.metrics).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.metrics).toBeNull();
    expect(result.current.data?.canUsage).toBe(false);
  });
  it("retains permitted usage when a separate resource endpoint fails", async () => {
    mocks.users.mockRejectedValue(new Error("Team unavailable"));
    const { result } = renderHook(() =>
      useDashboard("merchant", null, "30d", 0),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.metrics?.generated).toBe(18);
    expect(result.current.data?.staff).toBeNull();
    expect(result.current.error).toBe("Team unavailable");
  });
});
