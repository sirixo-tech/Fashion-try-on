import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import KiosksPage from "../app/app/kiosks/page";
import {
  createKioskConfigurationAssetUploadIntent,
  getKioskConfiguration,
  listKioskAssignmentOptions,
  listKioskDevices,
  updateKioskConfiguration,
  updateKioskDevice,
} from "@/lib/kiosks";
import { useSession } from "@/lib/session";

vi.mock("@/lib/session", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/kiosks", () => ({
  activateKioskDevice: vi.fn(),
  createKioskConfigurationAssetUploadIntent: vi.fn(),
  deactivateKioskDevice: vi.fn(),
  deleteKioskDevice: vi.fn(),
  getKioskConfiguration: vi.fn(),
  listKioskAssignmentOptions: vi.fn(),
  listKioskDevices: vi.fn(),
  pairKioskDevice: vi.fn(),
  revokeKioskDevice: vi.fn(),
  unpairKioskDevice: vi.fn(),
  updateKioskConfiguration: vi.fn(),
  updateKioskDevice: vi.fn(),
}));

const device = {
  id: "01a0006a-0000-7000-8000-000000000001",
  displayName: "Front Display",
  status: "ACTIVE",
  assignment: {
    scope: "PLATFORM",
    organizationId: null,
    organizationName: null,
    storeId: null,
    storeName: null,
  },
  platform: "windows",
  appVersion: "1.0.0",
  installationId: "install-1",
  pairedAt: "2026-08-16T00:00:00.000Z",
  lastSeenAt: "2026-08-16T00:01:00.000Z",
  inactiveAt: null,
  revokedAt: null,
  deletedAt: null,
  createdAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T00:00:00.000Z",
  latestConfigurationVersion: 4,
} as const;

const configuration = {
  version: 4,
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

describe("Kiosks configuration UI", () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      status: "authenticated",
      accessToken: "staff-token",
      user: { email: "admin@selfx.test", displayName: "Admin" },
    } as never);
    vi.mocked(listKioskDevices).mockResolvedValue([device] as never);
    vi.mocked(listKioskAssignmentOptions).mockResolvedValue({
      organizations: [],
      stores: [],
    });
    vi.mocked(getKioskConfiguration).mockResolvedValue(configuration as never);
    vi.mocked(updateKioskConfiguration).mockResolvedValue({
      ...configuration,
      version: 5,
    } as never);
    vi.mocked(updateKioskDevice).mockResolvedValue(device as never);
    vi.mocked(createKioskConfigurationAssetUploadIntent).mockResolvedValue({
      assetRef: "asset-ref",
      type: "UPLOADED_IMAGE",
      label: "hero",
      uploadUrl: "https://storage.selfx.test/upload",
      method: "PUT",
      expiresAt: "2026-08-16T00:05:00.000Z",
      headers: { "Content-Type": "image/png" },
      maxImageBytes: 12 * 1024 * 1024,
      supportedContentTypes: ["image/jpeg", "image/png", "image/webp"],
    });
  });

  it("loads and displays the selected kiosk configuration", async () => {
    render(<KiosksPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Configure/i }));

    expect(await screen.findByText(/Current version 4/i)).toBeTruthy();
    expect(screen.getByDisplayValue("SelfX Virtual Try-On")).toBeTruthy();
    expect(screen.getByDisplayValue("Start Try-On")).toBeTruthy();
  });

  it("shows validation feedback and does not submit invalid slide durations", async () => {
    render(<KiosksPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Configure/i }));
    const durationInput = await screen.findByDisplayValue("6");
    fireEvent.change(durationInput, { target: { value: "2" } });
    fireEvent.click(
      screen.getByRole("button", { name: /Save Changes/i }),
    );

    expect(
      await screen.findByText(
        "Slide duration must be between 3 and 60 seconds.",
      ),
    ).toBeTruthy();
    expect(updateKioskConfiguration).not.toHaveBeenCalled();
  });

  it("submits the expected save payload", async () => {
    render(<KiosksPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Configure/i }));
    await screen.findByText(/Current version 4/i);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Guidance audio enabled" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Full Outfit" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Save Changes/i }),
    );

    await waitFor(() => expect(updateKioskConfiguration).toHaveBeenCalled());
    expect(updateKioskConfiguration).toHaveBeenCalledWith(
      "staff-token",
      device.id,
      expect.objectContaining({
        display: expect.objectContaining({
          assets: [
            {
              type: "BUNDLED_IMAGE",
              label: "SelfX default wallpaper",
              bundledAssetKey: "selfx-default-kiosk-wallpaper",
            },
          ],
        }),
        capture: expect.objectContaining({
          guidanceAudioEnabled: true,
        }),
        experience: expect.objectContaining({
          enabledGarmentIntents: ["TOP", "BOTTOM"],
        }),
      }),
    );
  });
});
