import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IntegrationSettingsPage } from "./integration-settings-page";
import { getEffectiveStorePermissions } from "@/lib/stores";
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
        externalAccountId: "https://website.example",
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
  await screen.findByRole("button", { name: "Generate catalog token" });
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
    screen.queryByRole("button", { name: "Generate catalog token" }),
  ).toBeNull();
});
it("keeps the Shopify page on its existing OAuth workflow", async () => {
  render(<IntegrationSettingsPage type="SHOPIFY" title="Shopify" />);
  await screen.findByRole("button", { name: "Reconnect Shopify" });
  expect(
    screen.queryByRole("link", { name: "Download WooCommerce plugin" }),
  ).toBeNull();
  expect(screen.getByText("Shopify Used")).toBeTruthy();
});
