import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PaymentSettingsPage } from "./payment-settings-page";
import { getCurrentPlatformAccess } from "@/lib/access-control";
import {
  getCurrentStoreImpersonation,
  getEffectiveStorePermissions,
  type StoreImpersonationSession,
} from "@/lib/stores";
vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "fixture" }),
}));
vi.mock("@/lib/access-control", () => ({ getCurrentPlatformAccess: vi.fn() }));
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
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentPlatformAccess).mockResolvedValue({
    isSuperadmin: false,
    permissions: [],
  });
  vi.mocked(getCurrentStoreImpersonation).mockResolvedValue({ session: null });
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
  vi.mocked(getCurrentStoreImpersonation).mockResolvedValue({
    session: { id: "impersonation" } as StoreImpersonationSession,
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
  vi.mocked(getCurrentStoreImpersonation).mockResolvedValue({
    session: { id: "fixture_session" } as StoreImpersonationSession,
  });
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
