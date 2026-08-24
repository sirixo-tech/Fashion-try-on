import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import KiosksPage from "../app/app/kiosks/page";
import {
  deleteKioskDevice,
  listKioskAssignmentOptions,
  listKioskDevices,
  pairExistingKioskDevice,
  unpairKioskDevice,
} from "@/lib/kiosks";
import { useSession } from "@/lib/session";

vi.mock("@/lib/session", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/kiosks", () => ({
  activateKioskDevice: vi.fn(),
  assignKioskDeviceToStore: vi.fn(),
  createKioskConfigurationAssetUploadIntent: vi.fn(),
  deactivateKioskDevice: vi.fn(),
  deleteKioskDevice: vi.fn(),
  getKioskConfiguration: vi.fn(),
  listKioskAssignmentOptions: vi.fn(),
  listKioskDevices: vi.fn(),
  pairExistingKioskDevice: vi.fn(),
  pairKioskDevice: vi.fn(),
  revokeKioskDevice: vi.fn(),
  unpairKioskDevice: vi.fn(),
  updateKioskAssignment: vi.fn(),
  updateKioskConfiguration: vi.fn(),
  updateKioskDevice: vi.fn(),
}));

const activeDevice = {
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

const revokedDevice = {
  ...activeDevice,
  status: "REVOKED",
  revokedAt: "2026-08-16T00:05:00.000Z",
} as const;

describe("Kiosks page lifecycle UI", () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      status: "authenticated",
      accessToken: "staff-token",
      user: { email: "admin@selfx.test", displayName: "Admin" },
    } as never);
    vi.mocked(listKioskDevices).mockResolvedValue([activeDevice] as never);
    vi.mocked(listKioskAssignmentOptions).mockResolvedValue({
      organizations: [],
      stores: [],
    });
    vi.mocked(unpairKioskDevice).mockResolvedValue(revokedDevice as never);
    vi.mocked(pairExistingKioskDevice).mockResolvedValue(
      activeDevice as never,
    );
    vi.mocked(deleteKioskDevice).mockResolvedValue({
      ...activeDevice,
      status: "DELETED",
      deletedAt: "2026-08-16T00:10:00.000Z",
    } as never);
  });

  it("links Edit to the kiosk edit page instead of opening configuration inline", async () => {
    render(<KiosksPage />);

    const editLink = await screen.findByRole("link", { name: /Edit/i });

    expect(editLink.getAttribute("href")).toBe(
      `/app/kiosks/${activeDevice.id}/edit`,
    );
    expect(screen.queryByRole("button", { name: /Configure/i })).toBeNull();
  });

  it("changes Unpair to Pair after the kiosk is unpaired", async () => {
    render(<KiosksPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Unpair/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /^Unpair$/i }).at(-1)!);

    await waitFor(() => expect(unpairKioskDevice).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: /^Pair$/i })).toBeTruthy();
  });

  it("pairs an existing unpaired kiosk with a pairing code", async () => {
    vi.mocked(listKioskDevices).mockResolvedValue([revokedDevice] as never);
    render(<KiosksPage />);

    fireEvent.click(await screen.findByRole("button", { name: /^Pair$/i }));
    fireEvent.change(await screen.findByLabelText("Pairing Code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /^Pair$/i }).at(-1)!);

    await waitFor(() => expect(pairExistingKioskDevice).toHaveBeenCalled());
    expect(pairExistingKioskDevice).toHaveBeenCalledWith(
      "staff-token",
      revokedDevice.id,
      { pairingCode: "123456" },
    );
  });
});
