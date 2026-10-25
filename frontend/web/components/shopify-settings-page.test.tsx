import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ShopifySettingsPage } from "./shopify-settings-page";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { getCurrentMerchantStoreAccess } from "@/lib/current-store";
import {
  disconnectIntegration,
  getShopifyOverview,
  listIntegrations,
  startShopifyOauth,
  syncShopifyCatalog,
  type CommerceOverviewResponse,
  type StoreIntegration,
} from "@/lib/integrations";
import {
  getEffectiveStorePermissions,
  getStore,
  getStoreCreditDiagnostics,
  listStores,
} from "@/lib/stores";

vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "staff" }),
}));
vi.mock("@/lib/access-control", () => ({ getCurrentPlatformAccess: vi.fn() }));
vi.mock("@/lib/current-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-store")>()),
  getCurrentMerchantStoreAccess: vi.fn(),
}));
vi.mock("@/lib/regional-settings", () => ({
  RegionalDateTime: ({ value }: { value: string }) => <span>{value}</span>,
}));
vi.mock("@/lib/stores", () => ({
  getEffectiveStorePermissions: vi.fn(),
  getStore: vi.fn(),
  getStoreCreditDiagnostics: vi.fn().mockResolvedValue(null),
  listStores: vi.fn(),
}));
vi.mock("@/lib/integrations", () => ({
  getShopifyOverview: vi.fn(),
  getWooCommerceOverview: vi.fn(),
  listIntegrations: vi.fn(),
  disconnectIntegration: vi.fn(),
  startShopifyOauth: vi.fn(),
  syncShopifyCatalog: vi.fn(),
}));

const row = {
  id: "shopify-a",
  storeId: "store-a",
  storeName: "Store A",
  website: "https://merchant.myshopify.com",
  externalAccountName: "Merchant",
  health: "CONNECTED" as const,
  healthReasons: [],
  productCount: 8,
  successfulTryOns: 6,
  lastCatalogSyncAt: "2026-10-25T00:00:00Z",
};
const integration: StoreIntegration = {
  id: row.id,
  storeId: row.storeId,
  storeName: row.storeName,
  type: "SHOPIFY",
  status: "ACTIVE",
  health: "CONNECTED",
  healthReasons: [],
  shopDomain: "merchant.myshopify.com",
  externalAccountId: null,
  externalAccountName: "Merchant",
  connectedAt: "2026-10-20T00:00:00Z",
  disconnectedAt: null,
  credentials: [],
  createdAt: "2026-10-20T00:00:00Z",
  updatedAt: "2026-10-25T00:00:00Z",
};
const overview: CommerceOverviewResponse = {
  data: [row],
  summary: {
    total: 21,
    connected: 20,
    needsAttention: 1,
    disconnected: 0,
    successfulTryOns: 6,
  },
  period: {
    from: "2026-09-25T00:00:00Z",
    to: "2026-10-25T00:00:00Z",
    days: 30,
  },
  pagination: {
    page: 1,
    pageSize: 20,
    total: 21,
    totalPages: 2,
    hasMore: true,
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/app/integrations/shopify");
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: true,
    permissions: [],
  } as never);
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
    store: { id: "store-a", name: "Store A" },
    permissions: null,
  } as never);
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    storeId: "store-a",
    platformBypass: false,
    permissions: [
      "integrations.view",
      "integrations.manage",
      "products.manage",
    ],
    resourcePermissions: ["products.manage"],
  } as never);
  vi.mocked(listIntegrations).mockResolvedValue({
    data: [integration],
  } as never);
  vi.mocked(getShopifyOverview).mockResolvedValue(overview);
  vi.mocked(getStore).mockResolvedValue(null as never);
  vi.mocked(getStoreCreditDiagnostics).mockResolvedValue(null as never);
});
afterEach(cleanup);
function detail() {
  window.history.replaceState(
    null,
    "",
    "/app/integrations/shopify?storeId=store-a",
  );
  render(<ShopifySettingsPage />);
}

it("shows connection content before slow credit diagnostics finish", async () => {
  let finish!: () => void;
  vi.mocked(getStoreCreditDiagnostics).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(null as never);
      }),
  );
  detail();
  await screen.findByText("Shopify setup");
  expect(screen.getByText("6")).toBeTruthy();
  expect(screen.queryByText("Loading Store connection…")).toBeNull();
  expect(getStoreCreditDiagnostics).toHaveBeenCalledTimes(1);
  await act(async () => finish());
});

it("opens the platform overview without Store enumeration or credential requests", async () => {
  render(<ShopifySettingsPage />);
  await screen.findByRole("button", { name: "View Store A details" });
  expect(getShopifyOverview).toHaveBeenCalledWith(
    "staff",
    expect.objectContaining({ page: 1, pageSize: 20 }),
  );
  expect(listStores).not.toHaveBeenCalled();
  expect(listIntegrations).not.toHaveBeenCalled();
  expect(screen.getAllByText("merchant.myshopify.com").length).toBeGreaterThan(
    0,
  );
  expect(screen.queryByText(/gid:\/\//)).toBeNull();
});

it("opens Store details for a platform viewer without mutation controls", async () => {
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: ["INTEGRATIONS_VIEW"],
  } as never);
  render(<ShopifySettingsPage />);
  fireEvent.click(
    await screen.findByRole("button", { name: "View Store A details" }),
  );
  await screen.findByText("Shopify setup");
  expect(screen.getByText("6")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Reconnect Shopify" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Sync Catalog" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
  expect(screen.queryByText(/WordPress/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "All Shopify Stores" }));
  await screen.findByRole("button", { name: "View Store A details" });
});

it("keeps a merchant on their own Store despite another Store ID in the URL", async () => {
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: [],
  } as never);
  window.history.replaceState(
    null,
    "",
    "/app/integrations/shopify?storeId=other-store",
  );
  render(<ShopifySettingsPage />);
  await screen.findByText("Shopify setup");
  expect(listIntegrations).toHaveBeenCalledWith("staff", {
    storeId: "store-a",
    type: "SHOPIFY",
  });
  expect(getShopifyOverview).toHaveBeenCalledWith("staff", {
    storeId: "store-a",
  });
  expect(
    screen.queryByRole("button", { name: "All Shopify Stores" }),
  ).toBeNull();
});

it("keeps reconnect bound to the current Store and preserves the OAuth action", async () => {
  vi.mocked(startShopifyOauth).mockRejectedValue(
    new Error("Approval temporarily unavailable"),
  );
  detail();
  fireEvent.click(
    await screen.findByRole("button", { name: "Reconnect Shopify" }),
  );
  expect(screen.getByRole("textbox", { name: "Shop domain" })).toHaveProperty(
    "value",
    "merchant.myshopify.com",
  );
  expect(screen.queryByRole("combobox", { name: "Store" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Continue to Shopify" }));
  await screen.findByText("Approval temporarily unavailable");
  expect(startShopifyOauth).toHaveBeenCalledWith("staff", {
    storeId: "store-a",
    shop: "merchant.myshopify.com",
  });
});

it("refreshes metrics after catalog sync without changing the existing sync endpoint", async () => {
  vi.mocked(syncShopifyCatalog).mockResolvedValue({} as never);
  detail();
  fireEvent.click(await screen.findByRole("button", { name: "Sync Catalog" }));
  await screen.findByText("Shopify catalog sync completed.");
  expect(syncShopifyCatalog).toHaveBeenCalledWith("staff", "shopify-a");
  expect(getShopifyOverview).toHaveBeenCalledTimes(2);
});

it("keeps a failed sync actionable without claiming success", async () => {
  vi.mocked(syncShopifyCatalog).mockRejectedValue(
    new Error("Retry this catalog sync"),
  );
  detail();
  fireEvent.click(await screen.findByRole("button", { name: "Sync Catalog" }));
  await screen.findByText("Retry this catalog sync");
  expect(screen.queryByText("Shopify catalog sync completed.")).toBeNull();
});

it("requires confirmation to disconnect and preserves server billing protection", async () => {
  vi.mocked(disconnectIntegration).mockRejectedValue(
    new Error("Cancel the active Shopify subscription before disconnecting."),
  );
  detail();
  fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
  expect(disconnectIntegration).not.toHaveBeenCalled();
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Disconnect",
    }),
  );
  await screen.findByText(
    "Cancel the active Shopify subscription before disconnecting.",
  );
  expect(disconnectIntegration).toHaveBeenCalledWith("staff", "shopify-a");
  expect(
    screen.getByRole("button", { name: "Reconnect Shopify" }),
  ).toBeTruthy();
});

it("requires product management for OAuth and sync while keeping disconnect available to integration managers", async () => {
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    permissions: ["integrations.manage"],
    resourcePermissions: [],
    platformBypass: false,
  } as never);
  detail();
  await screen.findByText("Shopify setup");
  expect(
    screen.queryByRole("button", { name: "Reconnect Shopify" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Sync Catalog" })).toBeNull();
  expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
});

it("supports server pagination, search and health filters", async () => {
  render(<ShopifySettingsPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(getShopifyOverview).toHaveBeenLastCalledWith(
      "staff",
      expect.objectContaining({ page: 2 }),
    ),
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Search Stores or websites" }),
    { target: { value: "merchant" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() =>
    expect(getShopifyOverview).toHaveBeenLastCalledWith(
      "staff",
      expect.objectContaining({ search: "merchant", page: 1 }),
    ),
  );
  fireEvent.click(screen.getByRole("combobox", { name: "Connection status" }));
  const option = await screen.findByRole("option", { name: "Disconnected" });
  fireEvent.pointerDown(option, { pointerType: "mouse" });
  fireEvent.click(option);
  await waitFor(() =>
    expect(getShopifyOverview).toHaveBeenLastCalledWith(
      "staff",
      expect.objectContaining({ health: "DISCONNECTED", page: 1 }),
    ),
  );
});

it("clears Store details after permission changes", async () => {
  detail();
  await screen.findByText("Shopify setup");
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: [],
  } as never);
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    permissions: [],
  } as never);
  act(() => window.dispatchEvent(new Event("selfx:permissions-changed")));
  expect(screen.queryByText("Shopify setup")).toBeNull();
  await screen.findByRole("alert");
});

it("retains the failed OAuth callback recovery message on its Store", async () => {
  window.history.replaceState(
    null,
    "",
    "/app/integrations/shopify?storeId=store-a&oauth=sync_failed",
  );
  render(<ShopifySettingsPage />);
  await screen.findByText("Shopify setup");
  expect(screen.getByRole("alert").textContent).toContain("Use Sync Catalog");
});

it("discards a late detail response after returning to the overview", async () => {
  let finish!: (value: Awaited<ReturnType<typeof listIntegrations>>) => void;
  vi.mocked(listIntegrations).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  detail();
  await waitFor(() => expect(listIntegrations).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "All Shopify Stores" }));
  finish({ data: [integration] } as never);
  await screen.findByRole("button", { name: "View Store A details" });
  expect(screen.queryByText("Shopify setup")).toBeNull();
});
