import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StorePaymentsPage from "../app/app/payments/page";
import { getCurrentMerchantStoreAccess } from "@/lib/current-store";
vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "identity" }),
}));
vi.mock("@/lib/current-store", () => ({
  getCurrentMerchantStoreAccess: vi.fn(),
}));
vi.mock("./payment-settings-page", () => ({
  PaymentSettingsPage: ({
    storeId,
    merchantWorkspace,
  }: {
    storeId: string;
    merchantWorkspace: boolean;
  }) => (
    <p>
      Payments for {storeId} {merchantWorkspace ? "Store workspace" : "Other"}
    </p>
  ),
}));
const context = {
  store: { id: "store-a", name: "Avinash stores", status: "ACTIVE" },
  hasMultipleStores: false,
  impersonation: null,
  permissions: {
    storeId: "store-a",
    permissions: ["integrations.view"],
    platformBypass: false,
    membershipId: "membership-a",
    featureKeys: [],
    paymentAccess: { view: true, manage: true },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue(context);
});
afterEach(cleanup);
it("resolves the Store account automatically without a platform lookup or Store picker", async () => {
  render(<StorePaymentsPage />);
  expect(
    await screen.findByText("Payments for store-a Store workspace"),
  ).toBeTruthy();
  expect(getCurrentMerchantStoreAccess).toHaveBeenCalledWith("identity");
});
it("does not use platform bypass to open Store payment configuration", async () => {
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
    ...context,
    permissions: {
      ...context.permissions,
      platformBypass: true,
      paymentAccess: { view: false, manage: false },
    },
  });
  render(<StorePaymentsPage />);
  expect(await screen.findByText("Store access required")).toBeTruthy();
  expect(screen.queryByText("Payments for store-a Store workspace")).toBeNull();
});
it("does not mount payment settings without a Store", async () => {
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
    store: null,
    permissions: null,
    hasMultipleStores: false,
    impersonation: null,
  });
  render(<StorePaymentsPage />);
  await waitFor(() =>
    expect(screen.getByText("Store access required")).toBeTruthy(),
  );
});
