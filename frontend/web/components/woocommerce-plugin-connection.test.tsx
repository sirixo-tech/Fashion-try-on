import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WooCommercePluginConnection } from "./woocommerce-plugin-connection";
import {
  createIntegrationCredential,
  revokeIntegrationCredential,
  type IntegrationCredential,
  type StoreIntegration,
} from "@/lib/integrations";
vi.mock("@/lib/integrations", () => ({
  createIntegrationCredential: vi.fn(),
  revokeIntegrationCredential: vi.fn(),
}));
vi.mock("@/lib/regional-settings", () => ({
  RegionalDateTime: ({ value }: { value: string }) => <span>{value}</span>,
}));
const credential: IntegrationCredential = {
  id: "credential-a",
  integrationId: "integration-a",
  name: "WordPress catalog sync",
  tokenPrefix: "prefix",
  scopes: ["catalog:sync"],
  status: "ACTIVE",
  expiresAt: null,
  lastUsedAt: null,
  createdByEmail: "admin@example.com",
  createdAt: "2026-10-22T00:00:00Z",
  revokedAt: null,
};
const integration: StoreIntegration = {
  id: "integration-a",
  storeId: "store-a",
  storeName: "Store A",
  type: "WOOCOMMERCE",
  status: "ACTIVE",
  health: "CONNECTED",
  healthReasons: [],
  externalAccountId: "https://website.example",
  shopDomain: null,
  externalAccountName: "Website",
  connectedAt: null,
  disconnectedAt: null,
  credentials: [],
  createdAt: "2026-10-22T00:00:00Z",
  updatedAt: "2026-10-22T00:00:00Z",
};
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
it("generates a catalog-only credential, shows it once and clears it when dismissed", async () => {
  vi.mocked(createIntegrationCredential).mockResolvedValue({
    credential,
    secret: "selfx_woocommerce_fixture",
  });
  const update = vi.fn();
  render(
    <WooCommercePluginConnection
      accessToken="staff"
      integration={integration}
      canManage
      onCredential={update}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Generate plugin token" }),
  );
  const token = (await screen.findByLabelText(
    "New WooCommerce token",
  )) as HTMLTextAreaElement;
  expect(token.value).toBe("selfx_woocommerce_fixture");
  expect(createIntegrationCredential).toHaveBeenCalledWith(
    "staff",
    "integration-a",
    {
      name: "WordPress catalog sync",
      scopes: ["catalog:sync", "tryon:create"],
    },
  );
  expect(update).toHaveBeenCalledWith(credential);
  fireEvent.click(screen.getByRole("button", { name: "Hide token" }));
  expect(screen.queryByLabelText("New WooCommerce token")).toBeNull();
});
it("keeps viewers read-only and offers the installable plugin", () => {
  render(
    <WooCommercePluginConnection
      accessToken="staff"
      integration={{ ...integration, credentials: [credential] }}
      canManage={false}
      onCredential={vi.fn()}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Generate plugin token" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: /Revoke/ })).toBeNull();
  expect(
    screen
      .getByRole("link", { name: "Download WooCommerce plugin" })
      .getAttribute("href"),
  ).toBe("/downloads/selfx-woocommerce.zip");
});
it("clears a shown secret when management permission is revoked", async () => {
  vi.mocked(createIntegrationCredential).mockResolvedValue({
    credential,
    secret: "secret",
  });
  const props = { accessToken: "staff", integration, onCredential: vi.fn() };
  const view = render(<WooCommercePluginConnection {...props} canManage />);
  fireEvent.click(
    screen.getByRole("button", { name: "Generate plugin token" }),
  );
  await screen.findByLabelText("New WooCommerce token");
  view.rerender(<WooCommercePluginConnection {...props} canManage={false} />);
  expect(screen.queryByLabelText("New WooCommerce token")).toBeNull();
});
it("requires confirmation to revoke and applies the returned status", async () => {
  const update = vi.fn();
  vi.mocked(revokeIntegrationCredential).mockResolvedValue({
    ...credential,
    status: "REVOKED",
  });
  render(
    <WooCommercePluginConnection
      accessToken="staff"
      integration={{ ...integration, credentials: [credential] }}
      canManage
      onCredential={update}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Revoke WordPress catalog sync" }),
  );
  expect(revokeIntegrationCredential).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Revoke token" }));
  await waitFor(() =>
    expect(revokeIntegrationCredential).toHaveBeenCalledWith(
      "staff",
      "credential-a",
    ),
  );
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "REVOKED" }),
    ),
  );
});
it("discards an in-flight credential result when switching away from the connection", async () => {
  let finish!: (value: {
    credential: IntegrationCredential;
    secret: string;
  }) => void;
  vi.mocked(createIntegrationCredential).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const update = vi.fn();
  const view = render(
    <WooCommercePluginConnection
      accessToken="staff"
      integration={integration}
      canManage
      onCredential={update}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Generate plugin token" }),
  );
  view.unmount();
  finish({ credential, secret: "secret" });
  await waitFor(() => expect(update).not.toHaveBeenCalled());
});
