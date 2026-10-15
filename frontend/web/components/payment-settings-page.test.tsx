import { cleanup, render, screen } from "@testing-library/react";
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
  });
});
afterEach(cleanup);
it("keeps integration viewers read-only", async () => {
  render(<PaymentSettingsPage storeId="store-a" />);
  expect(await screen.findByText("Read-only payment settings")).toBeTruthy();
});
it("honors explicit platform integration access without a Store role", async () => {
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
  expect(await screen.findByText("Editable payment settings")).toBeTruthy();
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
