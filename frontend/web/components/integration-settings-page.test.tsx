import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IntegrationSettingsPage } from "./integration-settings-page";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import { listIntegrations } from "@/lib/integrations";
import { getEffectiveStorePermissions, listStores } from "@/lib/stores";
vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "staff" }),
}));
vi.mock("@/lib/regional-settings", () => ({
  RegionalDateTime: () => <span>Date</span>,
}));
vi.mock("@/lib/access-control", () => ({
  getCurrentPlatformAccess: vi
    .fn()
    .mockResolvedValue({ isSuperadmin: false, permissions: [] }),
}));
vi.mock("@/lib/current-store", () => ({
  getCurrentMerchantStore: vi
    .fn()
    .mockResolvedValue({ id: "store-a", name: "Store A" }),
}));
vi.mock("@/lib/stores", () => ({
  getEffectiveStorePermissions: vi.fn(),
  listStores: vi.fn(),
  getStoreCreditDiagnostics: vi.fn().mockResolvedValue({
    availableCredits: 10,
    totals: { grantedCredits: 10, consumedCredits: 3 },
    byChannel: [
      { channel: "SHOPIFY", consumedCredits: 2 },
      { channel: "WOOCOMMERCE", consumedCredits: 1 },
    ],
    topProducts: [],
  }),
}));
vi.mock("@/lib/integrations", () => ({
  connectIntegration: vi.fn(),
  disconnectIntegration: vi.fn(),
  startShopifyOauth: vi.fn(),
  syncShopifyCatalog: vi.fn(),
  createIntegrationCredential: vi.fn(),
  revokeIntegrationCredential: vi.fn(),
  listIntegrations: vi.fn().mockImplementation(async (_token, query) => ({
    data: [
      {
        id: "integration-a",
        storeId: "store-a",
        storeName: "Store A",
        type: query.type,
        status: "ACTIVE",
        health: "CONNECTED",
        credentials: [],
        externalAccountId:
          query.type === "SHOPIFY"
            ? "gid://shopify/Shop/123"
            : "https://website.example",
        shopDomain: query.type === "SHOPIFY" ? "merchant.myshopify.com" : null,
      },
    ],
  })),
}));
beforeEach(() => {
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    permissions: ["integrations.view", "integrations.manage"],
  } as never);
});
afterEach(cleanup);
it("offers WooCommerce setup to the authorized Store without Shopify instructions", async () => {
  render(<IntegrationSettingsPage type="WOOCOMMERCE" title="WooCommerce" />);
  await screen.findByRole("button", { name: "Generate plugin token" });
  expect(
    screen.getByRole("link", { name: "Download WooCommerce plugin" }),
  ).toBeTruthy();
  expect(screen.queryByText("Shopify Used")).toBeNull();
  expect(screen.getByText("WooCommerce Used")).toBeTruthy();
  expect(
    screen.getByText(/Sync progress is shown in WooCommerce/),
  ).toBeTruthy();
});
it("hides token mutations from Store integration viewers", async () => {
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    permissions: ["integrations.view"],
  } as never);
  render(<IntegrationSettingsPage type="WOOCOMMERCE" title="WooCommerce" />);
  await screen.findByRole("link", { name: "Download WooCommerce plugin" });
  expect(
    screen.queryByRole("button", { name: "Generate plugin token" }),
  ).toBeNull();
});
it("keeps the Shopify page on its existing OAuth workflow", async () => {
  render(<IntegrationSettingsPage type="SHOPIFY" title="Shopify" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Reconnect Shopify" }),
  );
  expect(screen.getByText("merchant.myshopify.com")).toBeTruthy();
  expect(screen.queryByText("gid://shopify/Shop/123")).toBeNull();
  expect(screen.getByRole("textbox", { name: "Shop domain" })).toHaveProperty(
    "value",
    "merchant.myshopify.com",
  );
  expect(
    screen.queryByRole("link", { name: "Download WooCommerce plugin" }),
  ).toBeNull();
  expect(screen.getByText("Shopify Used")).toBeTruthy();
});

it("shows the domain rather than Shop GID in the platform overview", async () => {
  vi.mocked(getCurrentPlatformAccess).mockResolvedValueOnce({
    isSuperadmin: true,
    permissions: [],
  } as never);
  vi.mocked(listStores).mockResolvedValueOnce({ data: [] } as never);
  render(<IntegrationSettingsPage type="SHOPIFY" title="Shopify" />);

  await screen.findByText("merchant.myshopify.com");
  expect(screen.queryByText("gid://shopify/Shop/123")).toBeNull();
  expect(listIntegrations).toHaveBeenCalledWith("staff", {
    type: "SHOPIFY",
    pageSize: 100,
  });
});
