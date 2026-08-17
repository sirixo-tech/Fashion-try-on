import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import StoreDashboardPage from "../app/app/stores/[storeId]/page";
import StoresPage from "../app/app/stores/page";
import {
  createStore,
  getStore,
  getStoreKioskConfiguration,
  listStores,
  pairStoreKiosk,
  updateStoreKioskConfiguration,
} from "@/lib/stores";
import { useSession } from "@/lib/session";

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
}));

vi.mock("@/lib/session", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/stores", () => ({
  activateStore: vi.fn(),
  createStore: vi.fn(),
  createStoreKioskConfigurationAssetUploadIntent: vi.fn(),
  deactivateStore: vi.fn(),
  getStore: vi.fn(),
  getStoreKioskConfiguration: vi.fn(),
  listStores: vi.fn(),
  pairStoreKiosk: vi.fn(),
  updateStore: vi.fn(),
  updateStoreKioskConfiguration: vi.fn(),
}));

const store = {
  id: "store-1",
  name: "SelfX Demo Store",
  slug: "selfx-demo-store",
  status: "ACTIVE",
  contactEmail: "ops@example.com",
  contactPhone: null,
  website: null,
  address: null,
  city: "Bengaluru",
  stateRegion: "KA",
  postalCode: null,
  country: "India",
  timezone: "Asia/Kolkata",
  totalKiosks: 1,
  activeKiosks: 1,
  offlineKiosks: 0,
  lastActivityAt: "2026-08-16T00:00:00.000Z",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-16T00:00:00.000Z",
  internalLegacyModel: "ORGANIZATION_AS_STORE",
} as const;

const kiosk = {
  id: "kiosk-1",
  displayName: "Front Display",
  status: "ACTIVE",
  assignment: {
    scope: "ORGANIZATION",
    organizationId: "store-1",
    organizationName: "SelfX Demo Store",
    storeId: null,
    storeName: null,
  },
  platform: "android",
  appVersion: "1.0.0",
  installationId: "install-1",
  pairedAt: "2026-08-16T00:00:00.000Z",
  lastSeenAt: "2026-08-16T00:01:00.000Z",
  inactiveAt: null,
  revokedAt: null,
  deletedAt: null,
  createdAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T00:00:00.000Z",
  latestConfigurationVersion: 3,
} as const;

const configuration = {
  version: 3,
  display: {
    idleMode: "STATIC",
    slideDurationSeconds: 6,
    title: "SelfX Virtual Try-On",
    subtitle: "Find your perfect fit in seconds.",
    ctaLabel: "Start Try-On",
    assets: [
      {
        id: "asset-1",
        type: "BUNDLED_IMAGE",
        label: "SelfX default wallpaper",
        url: null,
        bundledAssetKey: "selfx-default-kiosk-wallpaper",
        assetRef: null,
        contentType: null,
        sizeBytes: null,
        sortOrder: 0,
      },
    ],
  },
  capture: {
    countdownSeconds: 10,
    soundEnabled: true,
    soundProfile: "SELFX_SIGNATURE",
    guidanceAudioEnabled: false,
  },
  experience: {
    enabledGarmentIntents: ["TOP", "BOTTOM", "FULL_OUTFIT"],
    sessionIdleTimeoutSeconds: 120,
  },
  assetUpload: {
    supported: true,
    maxImageBytes: 12 * 1024 * 1024,
    supportedContentTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  updatedAt: "2026-08-16T00:00:00.000Z",
} as const;

describe("STORE-1 web Store management", () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      status: "authenticated",
      accessToken: "staff-token",
      user: { email: "admin@selfx.test", displayName: "Admin" },
    } as never);
    vi.mocked(listStores).mockResolvedValue({
      data: [store],
      pagination: {
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
        hasMore: false,
      },
    } as never);
    vi.mocked(createStore).mockResolvedValue(store as never);
    vi.mocked(getStore).mockResolvedValue({
      ...store,
      kiosks: { data: [kiosk] },
    } as never);
    vi.mocked(pairStoreKiosk).mockResolvedValue(kiosk as never);
    vi.mocked(getStoreKioskConfiguration).mockResolvedValue(
      configuration as never,
    );
    vi.mocked(updateStoreKioskConfiguration).mockResolvedValue({
      ...configuration,
      version: 4,
    } as never);
  });

  it("renders the Store directory with product Store terminology", async () => {
    render(<StoresPage />);

    expect(await screen.findByText("SelfX Demo Store")).toBeTruthy();
    expect(screen.getByText("Store directory")).toBeTruthy();
    expect(screen.queryByText(/Organization/i)).toBeNull();
  });

  it("creates a Store from the directory dialog", async () => {
    render(<StoresPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Add Store/i }));
    fireEvent.change(screen.getByText("Store Name *").nextElementSibling!, {
      target: { value: "New Retail Store" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Store" }));

    await waitFor(() => expect(createStore).toHaveBeenCalled());
    expect(createStore).toHaveBeenCalledWith(
      "staff-token",
      expect.objectContaining({ name: "New Retail Store" }),
    );
  });

  it("uses nested Store kiosk configuration APIs from the Store dashboard", async () => {
    render(<StoreDashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Manage/i }));

    await waitFor(() =>
      expect(getStoreKioskConfiguration).toHaveBeenCalledWith(
        "staff-token",
        "store-1",
        "kiosk-1",
      ),
    );
    fireEvent.change(await screen.findByDisplayValue("Start Try-On"), {
      target: { value: "Begin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Configuration" }));

    await waitFor(() =>
      expect(updateStoreKioskConfiguration).toHaveBeenCalledWith(
        "staff-token",
        "store-1",
        "kiosk-1",
        expect.objectContaining({
          display: expect.objectContaining({ ctaLabel: "Begin" }),
        }),
      ),
    );
  });
});
