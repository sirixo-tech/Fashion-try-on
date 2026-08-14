import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CustomerUploadPageClient } from "@/app/upload/[capability]/upload-page-client";
import {
  completeCustomerUpload,
  createCustomerUploadIntent,
  getCustomerUploadStatus,
  uploadCustomerPhotoToStorage,
} from "@/lib/customer-upload-api";

vi.mock("@/lib/customer-upload-api", () => ({
  getCustomerUploadStatus: vi.fn(),
  createCustomerUploadIntent: vi.fn(),
  uploadCustomerPhotoToStorage: vi.fn(),
  completeCustomerUpload: vi.fn(),
}));

const statusMock = vi.mocked(getCustomerUploadStatus);
const intentMock = vi.mocked(createCustomerUploadIntent);
const uploadMock = vi.mocked(uploadCustomerPhotoToStorage);
const completeMock = vi.mocked(completeCustomerUpload);

describe("CustomerUploadPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:selfx-preview"),
      revokeObjectURL: vi.fn(),
    });
    statusMock.mockResolvedValue({
      status: "WAITING",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      serverTime: new Date().toISOString(),
      maxImageBytes: 8 * 1024 * 1024,
    });
    intentMock.mockResolvedValue({
      uploadUrl: "https://storage.selfx.test/upload",
      method: "PUT",
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      headers: { "Content-Type": "image/png" },
      maxImageBytes: 8 * 1024 * 1024,
    });
    uploadMock.mockResolvedValue(undefined);
    completeMock.mockResolvedValue({
      status: "READY",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      serverTime: new Date().toISOString(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders public upload actions without requiring SessionProvider", async () => {
    render(<CustomerUploadPageClient capability="capability-token" />);

    expect(await screen.findByText("Take Photo")).toBeTruthy();
    expect(screen.getByText("Choose From Gallery")).toBeTruthy();
  });

  it("previews a selected file before upload", async () => {
    const view = render(<CustomerUploadPageClient capability="capability-token" />);
    const file = new File(["png"], "photo.png", { type: "image/png" });
    const inputs = view.container.querySelectorAll("input");

    fireEvent.change(inputs[1]!, {
      target: { files: [file] },
    });

    expect(
      (await screen.findByAltText("Selected photo preview")).getAttribute("src"),
    ).toBe("blob:selfx-preview");
    expect(intentMock).not.toHaveBeenCalled();
  });

  it("shows expired state safely", async () => {
    statusMock.mockResolvedValueOnce({
      status: "EXPIRED",
      expiresAt: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      maxImageBytes: 8 * 1024 * 1024,
    });

    render(<CustomerUploadPageClient capability="expired-token" />);

    expect(await screen.findByText("Upload link expired")).toBeTruthy();
    expect(
      screen.getByText("Return to the kiosk and scan a new QR code."),
    ).toBeTruthy();
  });

  it("uploads only after explicit confirmation and shows success", async () => {
    const view = render(<CustomerUploadPageClient capability="capability-token" />);
    const file = new File(["png"], "photo.png", { type: "image/png" });
    const inputs = view.container.querySelectorAll("input");

    fireEvent.change(inputs[1]!, {
      target: { files: [file] },
    });
    fireEvent.click(await screen.findByText("Upload Photo"));

    await waitFor(() => {
      expect(intentMock).toHaveBeenCalledWith("capability-token", file);
      expect(uploadMock).toHaveBeenCalled();
      expect(completeMock).toHaveBeenCalledWith("capability-token");
    });
    expect(await screen.findByText("Photo sent to the kiosk")).toBeTruthy();
  });
});
