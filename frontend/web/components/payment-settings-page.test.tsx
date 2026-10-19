import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PaymentSettingsPage } from "./payment-settings-page";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import {
  getCurrentMerchantStoreAccess,
  type CurrentStoreAccess,
} from "@/lib/current-store";
import StorePaymentsPage from "../app/app/payments/page";
import {
  getCurrentStoreImpersonation,
  getEffectiveStorePermissions,
  type StoreImpersonationSession,
} from "@/lib/stores";
vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "fixture" }),
}));
vi.mock("@/lib/access-control", () => ({ getCurrentPlatformAccess: vi.fn() }));
vi.mock("@/lib/current-store", () => ({
  getCurrentMerchantStoreAccess: vi.fn(),
}));
vi.mock("@/lib/stores", () => ({
  getCurrentStoreImpersonation: vi.fn(),
  getEffectiveStorePermissions: vi.fn(),
}));
vi.mock("./payment-settings", () => ({
  PaymentSettings: ({ canEdit }: { canEdit: boolean }) => (
    <p>
      {canEdit ? "Editable payment settings" : "Read-only payment settings"}
    </p>
  ),
}));
const context: CurrentStoreAccess = {
  store: { id: "store-a", name: "Avinash stores", status: "ACTIVE" },
  hasMultipleStores: false,
  impersonation: null,
  permissions: {
    storeId: "store-a",
    platformBypass: false,
    membershipId: "member",
    featureKeys: [],
    permissions: ["integrations.view", "integrations.manage"],
    paymentAccess: { view: true, manage: true },
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: [],
  });
  vi.mocked(getCurrentStoreImpersonation).mockRejectedValue(
    new Error("Platform permission denied."),
  );
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue(context);
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    storeId: "store-a",
    platformBypass: false,
    membershipId: "fixture_member",
    featureKeys: [],
    permissions: ["integrations.view"],
    paymentAccess: { view: true, manage: false },
  });
});
afterEach(cleanup);
it("keeps integration viewers read-only", async () => {
  render(<PaymentSettingsPage storeId="store-a" />);
  expect(await screen.findByText("Read-only payment settings")).toBeTruthy();
});
it("allows explicit Store Admin payment access and uses merchant back navigation", async () => {
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    storeId: "store-a",
    platformBypass: false,
    membershipId: "member",
    featureKeys: [],
    permissions: ["integrations.view", "integrations.manage"],
    paymentAccess: { view: true, manage: true },
  });
  render(<PaymentSettingsPage storeId="store-a" merchantWorkspace />);
  expect(await screen.findByText("Editable payment settings")).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Back to Dashboard" })
      .getAttribute("href"),
  ).toBe("/app/dashboard");
  expect(getCurrentPlatformAccess).not.toHaveBeenCalled();
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
    ...context,
    impersonation: { id: "impersonation" } as StoreImpersonationSession,
  });
  fireEvent(window, new Event("selfx:impersonation-changed"));
  expect(await screen.findByText("Read-only payment settings")).toBeTruthy();
});
it("denies platform integration access without a Store membership", async () => {
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: ["INTEGRATIONS_VIEW", "INTEGRATIONS_MANAGE"],
  });
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    storeId: "store-a",
    platformBypass: false,
    membershipId: null,
    featureKeys: [],
    permissions: [],
  });
  render(<PaymentSettingsPage storeId="store-a" />);
  expect(
    await screen.findByText(
      "You do not have permission to view payment settings.",
    ),
  ).toBeTruthy();
});
it("keeps support impersonation read-only even for superadmins", async () => {
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: true,
    permissions: [],
  });
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
    ...context,
    impersonation: { id: "fixture_session" } as StoreImpersonationSession,
  });
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue(
    context.permissions!,
  );
  render(<PaymentSettingsPage storeId="store-a" />);
  expect(await screen.findByText("Read-only payment settings")).toBeTruthy();
});
it("does not grant platform gateway access to Store integration managers", async () => {
  render(<PaymentSettingsPage />);
  expect(
    await screen.findByText(
      "You do not have permission to view payment settings.",
    ),
  ).toBeTruthy();
});
it("opens the Store workspace without requesting platform-only access or impersonation APIs", async () => {
  vi.mocked(getCurrentPlatformAccess).mockRejectedValue(
    new Error("Platform permission denied."),
  );
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue(
    context.permissions!,
  );
  render(<StorePaymentsPage />);
  expect(await screen.findByText("Editable payment settings")).toBeTruthy();
  expect(getCurrentMerchantStoreAccess).toHaveBeenCalledWith("fixture");
  expect(getEffectiveStorePermissions).toHaveBeenCalledWith(
    "fixture",
    "store-a",
  );
  expect(getCurrentPlatformAccess).not.toHaveBeenCalled();
  expect(getCurrentStoreImpersonation).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
});
it("uses the requested Store's permission result instead of the default Store's permissions", async () => {
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue({
    ...context.permissions!,
    storeId: "store-b",
    membershipId: null,
    permissions: [],
    paymentAccess: { view: false, manage: false },
  });
  render(<PaymentSettingsPage storeId="store-b" />);
  expect(
    await screen.findByText(
      "You do not have permission to view payment settings.",
    ),
  ).toBeTruthy();
  expect(getEffectiveStorePermissions).toHaveBeenCalledWith(
    "fixture",
    "store-b",
  );
  expect(screen.queryByText("Editable payment settings")).toBeNull();
});
it("keeps context failures closed and allows retry without falling back to platform APIs", async () => {
  vi.mocked(getCurrentMerchantStoreAccess).mockRejectedValueOnce(
    new Error("Store context unavailable."),
  );
  vi.mocked(getEffectiveStorePermissions).mockResolvedValue(
    context.permissions!,
  );
  render(<PaymentSettingsPage storeId="store-a" />);
  expect(await screen.findByText("Store context unavailable.")).toBeTruthy();
  expect(screen.queryByText("Editable payment settings")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Editable payment settings")).toBeTruthy();
  expect(getCurrentStoreImpersonation).not.toHaveBeenCalled();
});
it("allows authorized platform gateway viewing without platform impersonation permission", async () => {
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: ["INTEGRATIONS_VIEW"],
  });
  render(<PaymentSettingsPage />);
  expect(await screen.findByText("Read-only payment settings")).toBeTruthy();
  expect(getCurrentStoreImpersonation).not.toHaveBeenCalled();
  expect(getEffectiveStorePermissions).not.toHaveBeenCalled();
});
it("hides platform gateways while impersonating even with platform integration authority", async () => {
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: true,
    permissions: [],
  });
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
    ...context,
    impersonation: { id: "session" } as StoreImpersonationSession,
  });
  render(<PaymentSettingsPage />);
  expect(
    await screen.findByText(
      "You do not have permission to view payment settings.",
    ),
  ).toBeTruthy();
  await waitFor(() =>
    expect(screen.queryByText("Editable payment settings")).toBeNull(),
  );
});
