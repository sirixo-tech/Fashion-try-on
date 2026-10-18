import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KiosksPage from "../app/app/kiosks/page";
import { getCurrentMerchantStoreAccess } from "@/lib/current-store";
import {
  changeStoreKioskState,
  listStoreKiosks,
  pairExistingStoreKiosk,
  pairStoreKiosk,
} from "@/lib/stores";
import { type KioskDevice } from "@/lib/kiosks";

vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "identity" }),
}));
vi.mock("@/lib/current-store", async (original) => ({
  ...(await original<typeof import("@/lib/current-store")>()),
  getCurrentMerchantStoreAccess: vi.fn(),
}));
vi.mock("@/lib/stores", () => ({
  changeStoreKioskState: vi.fn(),
  listStoreKiosks: vi.fn(),
  pairExistingStoreKiosk: vi.fn(),
  pairStoreKiosk: vi.fn(),
}));

const device: KioskDevice = {
  id: "device-a",
  displayName: "Front Display",
  status: "ACTIVE",
  assignment: {
    scope: "ORGANIZATION",
    organizationId: "store-a",
    organizationName: "Avinash stores",
    storeId: null,
    storeName: null,
  },
  platform: "android",
  appVersion: "1.0",
  installationId: "install-a",
  pairedAt: "2026-10-18T00:00:00Z",
  lastSeenAt: null,
  inactiveAt: null,
  revokedAt: null,
  deletedAt: null,
  createdAt: "2026-10-18T00:00:00Z",
  updatedAt: "2026-10-18T00:00:00Z",
  latestConfigurationVersion: 1,
};
const context = {
  store: { id: "store-a", name: "Avinash stores", status: "ACTIVE" },
  permissions: {
    storeId: "store-a",
    permissions: [
      "kiosks.view",
      "kiosks.pair",
      "kiosks.configure",
      "kiosks.update",
      "kiosks.revoke",
    ],
    platformBypass: false,
    membershipId: "membership",
    featureKeys: ["KIOSK_MANAGEMENT"],
  },
  hasMultipleStores: false,
  impersonation: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue(context);
  vi.mocked(listStoreKiosks).mockResolvedValue([device]);
  vi.mocked(pairStoreKiosk).mockResolvedValue(device);
  vi.mocked(pairExistingStoreKiosk).mockResolvedValue(device);
  vi.mocked(changeStoreKioskState).mockResolvedValue(device);
});
afterEach(cleanup);

describe("Store-only kiosk lifecycle", () => {
  it("loads only the current Store and links its configuration page", async () => {
    render(<KiosksPage />);
    expect(await screen.findByText("Front Display")).toBeTruthy();
    expect(listStoreKiosks).toHaveBeenCalledWith("identity", "store-a");
    expect(
      screen.getByRole("link", { name: "Configure" }).getAttribute("href"),
    ).toBe("/app/kiosks/device-a/edit");
    expect(screen.queryByText("Platform fleet")).toBeNull();
  });
  it("pairs the first kiosk without a tenant selector or platform assignment", async () => {
    vi.mocked(listStoreKiosks).mockResolvedValue([]);
    render(<KiosksPage />);
    await screen.findByText("No kiosks paired yet.");
    fireEvent.click(screen.getByRole("button", { name: "Pair New Kiosk" }));
    fireEvent.change(screen.getByLabelText("Pairing Code"), {
      target: { value: "004281" },
    });
    fireEvent.change(screen.getByLabelText("Kiosk name"), {
      target: { value: "New screen" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pair Kiosk" }));
    await waitFor(() =>
      expect(pairStoreKiosk).toHaveBeenCalledWith("identity", "store-a", {
        pairingCode: "004281",
        displayName: "New screen",
      }),
    );
    expect(screen.queryByRole("combobox")).toBeNull();
  });
  it("unpairs through the Store endpoint and then offers re-pairing", async () => {
    vi.mocked(changeStoreKioskState).mockImplementation(async () => {
      vi.mocked(listStoreKiosks).mockResolvedValue([
        { ...device, status: "REVOKED" },
      ]);
      return { ...device, status: "REVOKED" };
    });
    render(<KiosksPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Unpair" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Unpair" }).at(-1)!);
    await waitFor(() =>
      expect(changeStoreKioskState).toHaveBeenCalledWith(
        "identity",
        "store-a",
        "device-a",
        "revoke",
      ),
    );
    expect(
      await screen.findByRole("button", { name: "Pair again" }),
    ).toBeTruthy();
  });
  it("pairs an existing Store kiosk using its new physical code", async () => {
    vi.mocked(listStoreKiosks).mockResolvedValue([
      { ...device, status: "REVOKED" },
    ]);
    render(<KiosksPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Pair again" }));
    fireEvent.change(screen.getByLabelText("Pairing Code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pair Kiosk" }));
    await waitFor(() =>
      expect(pairExistingStoreKiosk).toHaveBeenCalledWith(
        "identity",
        "store-a",
        "device-a",
        "123456",
      ),
    );
  });
  it("keeps Staff operations separate from Admin pairing/removal", async () => {
    vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
      ...context,
      permissions: {
        ...context.permissions,
        permissions: ["kiosks.view", "kiosks.configure", "kiosks.update"],
      },
    });
    render(<KiosksPage />);
    await screen.findByText("Front Display");
    expect(
      (
        screen.getByRole("button", {
          name: "Pair New Kiosk",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Unpair" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() =>
      expect(changeStoreKioskState).toHaveBeenCalledWith(
        "identity",
        "store-a",
        "device-a",
        "deactivate",
      ),
    );
  });
  it("does not turn platform bypass into kiosk membership", async () => {
    vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
      ...context,
      permissions: {
        ...context.permissions,
        platformBypass: true,
        resourcePermissions: [],
      },
    });
    render(<KiosksPage />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(listStoreKiosks).not.toHaveBeenCalled();
    expect(
      (
        screen.getByRole("button", {
          name: "Pair New Kiosk",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("has no global fallback when there is no Store", async () => {
    vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
      store: null,
      permissions: null,
      hasMultipleStores: false,
      impersonation: null,
    });
    render(<KiosksPage />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(listStoreKiosks).not.toHaveBeenCalled();
  });
});
