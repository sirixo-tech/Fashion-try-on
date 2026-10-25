import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WooCommerceSettingsPage } from "./woocommerce-settings-page";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { getCurrentMerchantStoreAccess } from "@/lib/current-store";
import { getEffectiveStorePermissions, listStores } from "@/lib/stores";
import {
  createIntegrationCredential,
  getWooCommerceOverview,
  listIntegrations,
  type WooCommerceOverviewResponse,
} from "@/lib/integrations";

vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "staff" }),
}));
vi.mock("@/lib/access-control", () => ({ getCurrentPlatformAccess: vi.fn() }));
vi.mock("@/lib/current-store", () => ({
  getCurrentMerchantStoreAccess: vi.fn(),
}));
vi.mock("@/lib/stores", () => ({
  getEffectiveStorePermissions: vi.fn(),
  listStores: vi.fn(),
}));
vi.mock("@/lib/regional-settings", () => ({
  RegionalDateTime: ({ value }: { value: string }) => <span>{value}</span>,
}));
vi.mock("@/lib/integrations", () => ({
  getWooCommerceOverview: vi.fn(),
  listIntegrations: vi.fn(),
  disconnectIntegration: vi.fn(),
  createIntegrationCredential: vi.fn(),
  revokeIntegrationCredential: vi.fn(),
}));

const row = {
  id: "integration-a",
  storeId: "store-a",
  storeName: "Store A",
  website: "https://website.example",
  externalAccountName: "Website",
  health: "CONNECTED" as const,
  healthReasons: [],
  productCount: 12,
  successfulTryOns: 7,
  lastCatalogSyncAt: null,
};
const overview: WooCommerceOverviewResponse = {
  data: [row],
  summary: {
    total: 21,
    connected: 20,
    needsAttention: 1,
    disconnected: 0,
    successfulTryOns: 7,
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
  window.history.replaceState(null, "", "/app/integrations/woocommerce");
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: true,
    permissions: [],
  } as never);
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
    store: { id: "store-a", name: "Store A" },
    permissions: null,
  } as never);
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    permissions: ["integrations.view"],
    platformBypass: false,
  } as never);
  vi.mocked(getWooCommerceOverview).mockResolvedValue(overview);
  vi.mocked(listIntegrations).mockResolvedValue({
    data: [
      {
        id: row.id,
        storeId: row.storeId,
        storeName: row.storeName,
        type: "WOOCOMMERCE",
        status: "ACTIVE",
        health: "CONNECTED",
        healthReasons: [],
        externalAccountId: row.website,
        externalAccountName: row.externalAccountName,
        connectedAt: null,
        updatedAt: "2026-10-25T00:00:00Z",
        credentials: [],
      },
    ],
  } as never);
});
afterEach(cleanup);

it("uses the merchant permissions supplied by shared Store context", async () => {
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: [],
  });
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
    store: { id: "store-a", name: "Store A", status: "ACTIVE" },
    permissions: { permissions: ["integrations.view"], platformBypass: false },
  } as never);
  render(<WooCommerceSettingsPage />);
  await screen.findByText("Imported products");
  expect(getEffectiveStorePermissions).not.toHaveBeenCalled();
});

it("opens Superadmin on a platform overview without choosing a Store or requesting credential details", async () => {
  render(<WooCommerceSettingsPage />);
  await screen.findByRole("button", { name: "View Store A details" });
  expect(screen.getByText("Store connections")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /Advanced connection/ }),
  ).toBeNull();
  expect(listIntegrations).not.toHaveBeenCalled();
  expect(listStores).not.toHaveBeenCalled();
  expect(getCurrentMerchantStoreAccess).not.toHaveBeenCalled();
});

it("lets a platform viewer inspect one Store while keeping management read-only", async () => {
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: ["INTEGRATIONS_VIEW"],
  } as never);
  render(<WooCommerceSettingsPage />);
  fireEvent.click(
    await screen.findByRole("button", { name: "View Store A details" }),
  );
  await screen.findByRole("link", { name: "Download WooCommerce plugin" });
  expect(listIntegrations).toHaveBeenCalledWith("staff", {
    storeId: "store-a",
    type: "WOOCOMMERCE",
  });
  expect(getWooCommerceOverview).toHaveBeenCalledWith("staff", {
    storeId: "store-a",
  });
  expect(screen.getByText("7")).toBeTruthy();
  expect(screen.queryByText("Total Used")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Advanced connection/ }));
  expect(
    screen.queryByRole("button", { name: "Generate plugin token" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "All WooCommerce Stores" }),
  );
  await screen.findByRole("button", { name: "View Store A details" });
  expect(window.location.search).toBe("");
});

it("keeps merchants on their authorized Store even when a different Store ID is in the URL", async () => {
  window.history.replaceState(
    null,
    "",
    "/app/integrations/woocommerce?storeId=other-store",
  );
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: [],
  } as never);
  render(<WooCommerceSettingsPage />);
  await screen.findByRole("link", { name: "Download WooCommerce plugin" });
  expect(getEffectiveStorePermissions).toHaveBeenCalledWith("staff", "store-a");
  expect(getWooCommerceOverview).toHaveBeenCalledWith("staff", {
    storeId: "store-a",
  });
  expect(listIntegrations).toHaveBeenCalledWith("staff", {
    storeId: "store-a",
    type: "WOOCOMMERCE",
  });
  expect(
    screen.queryByRole("button", { name: "All WooCommerce Stores" }),
  ).toBeNull();
});

it("does not read Store integration data after a permission denial", async () => {
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: [],
  } as never);
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    permissions: [],
    platformBypass: false,
  } as never);
  render(<WooCommerceSettingsPage />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "permission",
  );
  expect(getWooCommerceOverview).not.toHaveBeenCalled();
  expect(listIntegrations).not.toHaveBeenCalled();
});

it("sends search, health and pagination to the server and resets the page after filtering", async () => {
  render(<WooCommerceSettingsPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(getWooCommerceOverview).toHaveBeenLastCalledWith(
      "staff",
      expect.objectContaining({ page: 2 }),
    ),
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Search Stores or websites" }),
    { target: { value: "New Store" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() =>
    expect(getWooCommerceOverview).toHaveBeenLastCalledWith(
      "staff",
      expect.objectContaining({ search: "New Store", page: 1 }),
    ),
  );
  fireEvent.click(screen.getByRole("combobox", { name: "Connection status" }));
  const option = await screen.findByRole("option", { name: "Needs attention" });
  fireEvent.pointerDown(option, { pointerType: "mouse" });
  fireEvent.click(option);
  await waitFor(() =>
    expect(getWooCommerceOverview).toHaveBeenLastCalledWith(
      "staff",
      expect.objectContaining({ health: "NEEDS_ATTENTION", page: 1 }),
    ),
  );
});

it("shows a load failure without inventing zero usage or an empty-success state", async () => {
  vi.mocked(getWooCommerceOverview).mockRejectedValue(
    new Error("Connection overview unavailable"),
  );
  render(<WooCommerceSettingsPage />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Connection overview unavailable",
  );
  expect(screen.queryByText("No WooCommerce connections yet")).toBeNull();
  expect(screen.queryByText("0")).toBeNull();
});

it("discards an old Store response after navigating back to the overview", async () => {
  let finish!: (value: Awaited<ReturnType<typeof listIntegrations>>) => void;
  vi.mocked(listIntegrations).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<WooCommerceSettingsPage />);
  fireEvent.click(
    await screen.findByRole("button", { name: "View Store A details" }),
  );
  await waitFor(() => expect(listIntegrations).toHaveBeenCalled());
  fireEvent.click(
    screen.getByRole("button", { name: "All WooCommerce Stores" }),
  );
  finish({ data: [] } as never);
  await screen.findByRole("button", { name: "View Store A details" });
  expect(
    screen.queryByRole("link", { name: "Download WooCommerce plugin" }),
  ).toBeNull();
});

it("clears Store details and management controls when permissions change", async () => {
  window.history.replaceState(
    null,
    "",
    "/app/integrations/woocommerce?storeId=store-a",
  );
  render(<WooCommerceSettingsPage />);
  await screen.findByRole("link", { name: "Download WooCommerce plugin" });
  fireEvent.click(screen.getByRole("button", { name: /Advanced connection/ }));
  expect(
    screen.getByRole("button", { name: "Generate plugin token" }),
  ).toBeTruthy();
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: [],
  } as never);
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    permissions: [],
  } as never);
  act(() => window.dispatchEvent(new Event("selfx:permissions-changed")));
  expect(
    screen.queryByRole("button", { name: "Generate plugin token" }),
  ).toBeNull();
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("link", { name: "Download WooCommerce plugin" }),
  ).toBeNull();
});

it("refreshes connection health after a token changes while keeping the one-time secret visible", async () => {
  window.history.replaceState(
    null,
    "",
    "/app/integrations/woocommerce?storeId=store-a",
  );
  vi.mocked(listIntegrations).mockResolvedValue({
    data: [
      {
        id: row.id,
        storeId: row.storeId,
        storeName: row.storeName,
        type: "WOOCOMMERCE",
        status: "ACTIVE",
        health: "NEEDS_ATTENTION",
        healthReasons: ["INTEGRATION_CREDENTIAL_MISSING"],
        externalAccountId: row.website,
        credentials: [],
      },
    ],
  } as never);
  vi.mocked(getWooCommerceOverview).mockResolvedValueOnce({
    ...overview,
    data: [
      {
        ...row,
        health: "NEEDS_ATTENTION",
        healthReasons: ["INTEGRATION_CREDENTIAL_MISSING"],
      },
    ],
  });
  vi.mocked(createIntegrationCredential).mockResolvedValue({
    credential: {
      id: "new-credential",
      name: "WordPress catalog sync",
      status: "ACTIVE",
    },
    secret: "one-time-secret",
  } as never);
  render(<WooCommerceSettingsPage />);
  await screen.findByText("This connection needs attention");
  fireEvent.click(screen.getByRole("button", { name: /Advanced connection/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "Generate plugin token" }),
  );
  await screen.findByLabelText("New WooCommerce token");
  await waitFor(() =>
    expect(screen.queryByText("This connection needs attention")).toBeNull(),
  );
  expect(screen.getByLabelText("New WooCommerce token")).toHaveProperty(
    "value",
    "one-time-secret",
  );
  expect(getWooCommerceOverview).toHaveBeenCalledTimes(2);
});
