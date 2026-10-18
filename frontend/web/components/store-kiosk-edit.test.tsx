import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import KioskEditPage from "../app/app/kiosks/[deviceId]/edit/page";
import { getCurrentMerchantStoreAccess } from "@/lib/current-store";
import {
  getStoreKiosk,
  getStoreKioskConfiguration,
  updateStoreKiosk,
  updateStoreKioskConfiguration,
} from "@/lib/stores";
import { type KioskConfiguration, type KioskDevice } from "@/lib/kiosks";
vi.mock("next/navigation", () => ({
  useParams: () => ({ deviceId: "device-a" }),
}));
vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "identity" }),
}));
vi.mock("@/lib/current-store", async (original) => ({
  ...(await original<typeof import("@/lib/current-store")>()),
  getCurrentMerchantStoreAccess: vi.fn(),
}));
vi.mock("@/lib/stores", () => ({
  getStoreKiosk: vi.fn(),
  getStoreKioskConfiguration: vi.fn(),
  updateStoreKiosk: vi.fn(),
  updateStoreKioskConfiguration: vi.fn(),
  createStoreKioskConfigurationAssetUploadIntent: vi.fn(),
}));
const context = {
  store: { id: "store-a", name: "Avinash stores", status: "ACTIVE" },
  permissions: {
    storeId: "store-a",
    permissions: ["kiosks.view", "kiosks.configure", "kiosks.update"],
    platformBypass: false,
    featureKeys: [],
    membershipId: "member",
  },
  hasMultipleStores: false,
  impersonation: null,
};
const device = {
  status: "ACTIVE",
  id: "device-a",
  displayName: "Front Display",
  assignment: {
    scope: "ORGANIZATION",
    organizationId: "store-a",
    organizationName: "Avinash stores",
    storeId: null,
    storeName: null,
  },
  latestConfigurationVersion: 3,
} as KioskDevice;
const configuration: KioskConfiguration = {
  version: 3,
  display: {
    idleMode: "STATIC",
    slideDurationSeconds: 6,
    title: "SelfX",
    subtitle: null,
    ctaLabel: "Start",
    assets: [
      {
        id: "bundled",
        type: "BUNDLED_IMAGE",
        label: "Default",
        url: null,
        bundledAssetKey: "selfx-default-kiosk-video",
        assetRef: null,
        contentType: null,
        sizeBytes: null,
        durationSeconds: null,
        sortOrder: 0,
      },
    ],
  },
  capture: {
    countdownSeconds: 5,
    soundEnabled: true,
    soundProfile: "SOFT",
    guidanceAudioEnabled: false,
  },
  experience: {
    enabledTryOnCapabilities: ["GARMENT_TRY_ON"],
    enabledGarmentIntents: ["TOP"],
    multiGarmentSelectionEnabled: true,
    maxTryOnPicks: 5,
    sessionIdleTimeoutSeconds: 120,
    garmentPreviewEnabled: false,
  },
  assetUpload: {
    supported: true,
    maxImageBytes: 12000000,
    maxVideoBytes: 80000000,
    maxVideoDurationSeconds: 60,
    supportedContentTypes: ["image/png", "video/mp4"],
  },
  captureUpload: {
    maxImageBytes: 12000000,
    supportedContentTypes: ["image/png"],
  },
  updatedAt: "2026-10-18T00:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue(context);
  vi.mocked(getStoreKiosk).mockResolvedValue(device);
  vi.mocked(getStoreKioskConfiguration).mockResolvedValue(configuration);
  vi.mocked(updateStoreKiosk).mockResolvedValue({
    ...device,
    displayName: "Renamed",
  });
  vi.mocked(updateStoreKioskConfiguration).mockResolvedValue({
    ...configuration,
    version: 4,
  });
});
afterEach(cleanup);

it("loads and saves only the current Store kiosk, with no assignment selector", async () => {
  render(<KioskEditPage />);
  expect(
    ((await screen.findByLabelText("Kiosk Name")) as HTMLInputElement).value,
  ).toBe("Front Display");
  expect(getStoreKiosk).toHaveBeenCalledWith("identity", "store-a", "device-a");
  expect(getStoreKioskConfiguration).toHaveBeenCalledWith(
    "identity",
    "store-a",
    "device-a",
  );
  expect(
    screen.queryByRole("combobox", { name: "Store assignment" }),
  ).toBeNull();
  expect(screen.queryByText("Platform fleet")).toBeNull();
  fireEvent.change(screen.getByLabelText("Kiosk Name"), {
    target: { value: "Renamed" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() =>
    expect(updateStoreKioskConfiguration).toHaveBeenCalledWith(
      "identity",
      "store-a",
      "device-a",
      expect.objectContaining({
        display: expect.objectContaining({ title: "SelfX" }),
      }),
    ),
  );
  expect(updateStoreKiosk).toHaveBeenCalledWith(
    "identity",
    "store-a",
    "device-a",
    { displayName: "Renamed" },
  );
  expect(
    await screen.findByText("Kiosk configuration saved successfully."),
  ).toBeTruthy();
});
it("does not load or expose configuration under platform bypass", async () => {
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
    ...context,
    permissions: {
      ...context.permissions,
      platformBypass: true,
      resourcePermissions: [],
    },
  });
  render(<KioskEditPage />);
  expect(
    await screen.findByText(
      "Store membership and kiosk configuration permission are required.",
    ),
  ).toBeTruthy();
  expect(getStoreKiosk).not.toHaveBeenCalled();
  expect(getStoreKioskConfiguration).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Save Changes" })).toBeNull();
});
it("does not offer a name change when only configuration permission is granted", async () => {
  vi.mocked(getCurrentMerchantStoreAccess).mockResolvedValue({
    ...context,
    permissions: { ...context.permissions, permissions: ["kiosks.configure"] },
  });
  render(<KioskEditPage />);
  expect(
    ((await screen.findByLabelText("Kiosk Name")) as HTMLInputElement).disabled,
  ).toBe(true);
});
