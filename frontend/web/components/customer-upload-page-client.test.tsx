import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
    vi.stubGlobal(
      "URL",
      Object.assign(class extends URL {}, {
        createObjectURL: vi.fn(() => "blob:selfx-preview"),
        revokeObjectURL: vi.fn(),
      }),
    );
    statusMock.mockResolvedValue({
      status: "WAITING",
      purpose: "MODEL",
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
      purpose: "MODEL",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      serverTime: new Date().toISOString(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders public upload actions without requiring SessionProvider", async () => {
    render(<CustomerUploadPageClient capability="capability-token" />);

    expect(await screen.findByText("Take Photo")).toBeTruthy();
    expect(screen.getByText("Choose from Phone")).toBeTruthy();
  });

  it("previews a selected file before upload", async () => {
    const view = render(
      <CustomerUploadPageClient capability="capability-token" />,
    );
    const file = new File(["png"], "photo.png", { type: "image/png" });
    const inputs = view.container.querySelectorAll("input");
    await uploadActionsReady();

    fireEvent.change(inputs[1]!, {
      target: { files: [file] },
    });

    expect(
      (await screen.findByAltText("Selected photo preview")).getAttribute(
        "src",
      ),
    ).toBe("blob:selfx-preview");
    expect(intentMock).not.toHaveBeenCalled();
  });

  it("shows ring framing and uses the rear camera for a person upload", async () => {
    const view = render(
      <CustomerUploadPageClient
        capability="ring-upload"
        jewelleryType="RING"
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "Add Your Hand Photo" }),
    ).toBeTruthy();
    await screen.findByText("Take Photo");
    expect(
      view.container.querySelector("input[capture]")?.getAttribute("capture"),
    ).toBe("environment");
    expect(statusMock).toHaveBeenCalledWith("ring-upload");
  });

  it("shows relaxed earring guidance for a person upload", async () => {
    render(
      <CustomerUploadPageClient
        capability="earring-upload"
        jewelleryType="EARRING"
      />,
    );

    expect(
      await screen.findByText(
        "Keep your face and at least one ear clearly visible. Move hair away from the visible ear.",
      ),
    ).toBeTruthy();
  });

  it("ignores jewellery guidance for a garment-image upload", async () => {
    statusMock.mockResolvedValueOnce({
      status: "WAITING",
      purpose: "GARMENT",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      serverTime: new Date().toISOString(),
      maxImageBytes: 8 * 1024 * 1024,
    });
    render(
      <CustomerUploadPageClient
        capability="garment-upload"
        jewelleryType="RING"
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "Add Garment Photo" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Add Your Hand Photo" }),
    ).toBeNull();
  });

  it("shows expired state safely", async () => {
    const camera = mockCamera();
    statusMock.mockResolvedValueOnce({
      status: "EXPIRED",
      purpose: "MODEL",
      expiresAt: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      maxImageBytes: 8 * 1024 * 1024,
    });

    render(<CustomerUploadPageClient capability="expired-token" />);

    expect(await screen.findByText("Upload link expired")).toBeTruthy();
    expect(
      screen.getByText("Return to the kiosk and scan a new QR code."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Take Photo" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Choose from Phone" }),
    ).toBeNull();
    expect(camera.getUserMedia).not.toHaveBeenCalled();
  });

  it("uploads only after explicit confirmation and shows success", async () => {
    const view = render(
      <CustomerUploadPageClient capability="capability-token" />,
    );
    const file = new File(["png"], "photo.png", { type: "image/png" });
    const inputs = view.container.querySelectorAll("input");
    await uploadActionsReady();

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

  it("connects camera and gallery buttons to their respective inputs", async () => {
    render(<CustomerUploadPageClient capability="camera-upload" />);
    await uploadActionsReady();
    const camera = screen.getByLabelText(
      "Take a photo with your camera",
    ) as HTMLInputElement;
    const gallery = screen.getByLabelText(
      "Choose a photo from your phone",
    ) as HTMLInputElement;
    const cameraClick = vi.spyOn(camera, "click");
    const galleryClick = vi.spyOn(gallery, "click");
    fireEvent.click(screen.getByRole("button", { name: "Take Photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose from Phone" }));
    expect(cameraClick).toHaveBeenCalledOnce();
    expect(galleryClick).toHaveBeenCalledOnce();
    expect(camera.getAttribute("capture")).toBe("user");
    expect(gallery.hasAttribute("capture")).toBe(false);
    expect(intentMock).not.toHaveBeenCalled();
  });

  it("releases local preview URLs when replacing photos and leaving", async () => {
    const view = render(
      <CustomerUploadPageClient capability="preview-upload" />,
    );
    await uploadActionsReady();
    const gallery = screen.getByLabelText("Choose a photo from your phone");
    const first = new File(["first"], "first.png", { type: "image/png" });
    const second = new File(["second"], "second.png", { type: "image/png" });
    vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    fireEvent.change(gallery, { target: { files: [first] } });
    expect(
      (await screen.findByAltText("Selected photo preview")).getAttribute(
        "src",
      ),
    ).toBe("blob:first");
    fireEvent.change(gallery, { target: { files: [second] } });
    expect(
      (await screen.findByAltText("Selected photo preview")).getAttribute(
        "src",
      ),
    ).toBe("blob:second");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first");
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:second");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("retains invalid-image feedback and does not upload automatically", async () => {
    render(<CustomerUploadPageClient capability="invalid-upload" />);
    await uploadActionsReady();
    fireEvent.change(screen.getByLabelText("Choose a photo from your phone"), {
      target: {
        files: [new File(["text"], "file.txt", { type: "text/plain" })],
      },
    });
    expect(await screen.findByRole("status")).toHaveProperty(
      "textContent",
      "Invalid image.",
    );
    expect(screen.queryByAltText("Selected photo preview")).toBeNull();
    expect(intentMock).not.toHaveBeenCalled();
  });

  it("Back provides guidance when a QR opens in a fresh browser tab", async () => {
    const length = vi.spyOn(window.history, "length", "get").mockReturnValue(1);
    render(<CustomerUploadPageClient capability="back-upload" />);
    await uploadActionsReady();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      await screen.findByText(
        "You can close this page and return to the kiosk.",
      ),
    ).toBeTruthy();
    expect(intentMock).not.toHaveBeenCalled();
    length.mockRestore();
  });

  it("opens a video-only preview, captures once locally, retakes and explicitly uploads", async () => {
    const camera = mockCamera();
    const view = render(<CustomerUploadPageClient capability="live-photo" />);
    await screen.findByRole("button", { name: "Switch Camera" });
    expect(camera.getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    const video = screen.getByLabelText(
      "Live camera preview",
    ) as HTMLVideoElement;
    expect(video.srcObject).toBe(camera.streams[0]!.stream);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Take Photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Capturing…" }));
    await screen.findByAltText("Selected photo preview");
    expect(camera.drawImage).toHaveBeenCalledOnce();
    expect(camera.drawImage).toHaveBeenCalledWith(video, 0, 0, 1080, 1920);
    expect(camera.streams[0]!.stop).toHaveBeenCalled();
    expect(intentMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retake Photo" }));
    await screen.findByRole("button", { name: "Switch Camera" });
    expect(camera.getUserMedia).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:selfx-preview");
    fireEvent.click(screen.getByRole("button", { name: "Take Photo" }));
    await screen.findByAltText("Selected photo preview");
    fireEvent.click(screen.getByRole("button", { name: "Upload Photo" }));
    await screen.findByText("Photo sent to the kiosk");
    const file = intentMock.mock.calls[0]![1];
    expect(file.name).toBe("selfx-camera-photo.jpg");
    expect(file.type).toBe("image/jpeg");
    expect(intentMock).toHaveBeenCalledOnce();
    expect(uploadMock).toHaveBeenCalledWith(expect.anything(), file);
    view.unmount();
  });

  it("stops the previous camera before switching and releases the new stream on leaving", async () => {
    const camera = mockCamera();
    const view = render(
      <CustomerUploadPageClient
        capability="camera-switch"
        jewelleryType="RING"
      />,
    );
    await screen.findByRole("button", { name: "Switch Camera" });
    expect(camera.getUserMedia.mock.calls[0]![0].video).toMatchObject({
      facingMode: { ideal: "environment" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Switch Camera" }));
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: "Switch Camera" });
    expect(camera.streams[0]!.stop).toHaveBeenCalled();
    expect(camera.streams[0]!.stop.mock.invocationCallOrder[0]).toBeLessThan(
      camera.getUserMedia.mock.invocationCallOrder[1]!,
    );
    expect(camera.getUserMedia.mock.calls[1]![0].video).toMatchObject({
      facingMode: { ideal: "user" },
    });
    view.unmount();
    expect(camera.streams[1]!.stop).toHaveBeenCalled();
  });

  it("denied camera access keeps the native camera and gallery fallbacks usable", async () => {
    const camera = mockCamera();
    camera.getUserMedia.mockRejectedValueOnce(
      new DOMException("Denied", "NotAllowedError"),
    );
    render(<CustomerUploadPageClient capability="denied" />);
    await screen.findByText(
      "Camera access was not allowed. Use Take Photo or choose from your phone.",
    );
    const cameraInput = screen.getByLabelText(
      "Take a photo with your camera",
    ) as HTMLInputElement;
    const galleryInput = screen.getByLabelText(
      "Choose a photo from your phone",
    ) as HTMLInputElement;
    const nativeCamera = vi.spyOn(cameraInput, "click");
    const gallery = vi.spyOn(galleryInput, "click");
    fireEvent.click(screen.getByRole("button", { name: "Take Photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose from Phone" }));
    expect(nativeCamera).toHaveBeenCalledOnce();
    expect(gallery).toHaveBeenCalledOnce();
    expect(intentMock).not.toHaveBeenCalled();
  });

  it("stops permission results that arrive after choosing a gallery photo or leaving", async () => {
    const camera = mockCamera();
    let resolve!: (stream: MediaStream) => void;
    camera.getUserMedia.mockImplementationOnce(
      () =>
        new Promise<MediaStream>((done) => {
          resolve = done;
        }),
    );
    const view = render(
      <CustomerUploadPageClient capability="late-permission" />,
    );
    await screen.findByText("Allow camera access to see your live preview…");
    fireEvent.change(screen.getByLabelText("Choose a photo from your phone"), {
      target: {
        files: [new File(["png"], "gallery.png", { type: "image/png" })],
      },
    });
    await screen.findByAltText("Selected photo preview");
    const late = fakeStream();
    await act(async () => resolve(late.stream));
    expect(late.stop).toHaveBeenCalled();
    expect(screen.queryByLabelText("Live camera preview")).toBeNull();
    expect(intentMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retake Photo" }));
    await screen.findByRole("button", { name: "Switch Camera" });
    expect(camera.getUserMedia).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(camera.streams[0]!.stop).toHaveBeenCalled();
  });

  it("stops live capture when hidden and discards a late JPEG result", async () => {
    const camera = mockCamera();
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    let encoded!: BlobCallback;
    camera.toBlob.mockImplementation((callback) => {
      encoded = callback;
    });
    const view = render(
      <CustomerUploadPageClient capability="hidden-capture" />,
    );
    await screen.findByRole("button", { name: "Switch Camera" });
    fireEvent.click(screen.getByRole("button", { name: "Take Photo" }));
    expect(camera.toBlob).toHaveBeenCalledOnce();
    hidden = true;
    fireEvent(document, new Event("visibilitychange"));
    expect(camera.streams[0]!.stop).toHaveBeenCalled();
    await act(async () => encoded(new Blob(["jpeg"], { type: "image/jpeg" })));
    expect(screen.queryByAltText("Selected photo preview")).toBeNull();
    expect(intentMock).not.toHaveBeenCalled();
    hidden = false;
    fireEvent(document, new Event("visibilitychange"));
    await screen.findByRole("button", { name: "Switch Camera" });
    expect(camera.getUserMedia).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it("stops a camera when the QR link expires and never opens an already expired link", async () => {
    const camera = mockCamera();
    vi.useFakeTimers();
    statusMock.mockResolvedValueOnce({
      status: "WAITING",
      purpose: "MODEL",
      maxImageBytes: 8 * 1024 * 1024,
      serverTime: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    });
    const view = render(<CustomerUploadPageClient capability="expiring" />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(camera.getUserMedia).toHaveBeenCalledOnce();
    await act(async () => {
      vi.advanceTimersByTime(1001);
    });
    expect(screen.getByText("Upload link expired")).toBeTruthy();
    expect(camera.streams[0]!.stop).toHaveBeenCalled();
    view.unmount();
    statusMock.mockResolvedValueOnce({
      status: "WAITING",
      purpose: "MODEL",
      maxImageBytes: 8 * 1024 * 1024,
      serverTime: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    render(<CustomerUploadPageClient capability="already-expired" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Upload link expired")).toBeTruthy();
    expect(camera.getUserMedia).toHaveBeenCalledOnce();
  });
});

async function uploadActionsReady() {
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Choose from Phone",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
}

function fakeStream() {
  const stop = vi.fn();
  const track = {
    stop,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  return {
    stop,
    stream: {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream,
  };
}

function mockCamera() {
  const streams: ReturnType<typeof fakeStream>[] = [];
  const getUserMedia = vi.fn<
    (constraints: MediaStreamConstraints) => Promise<MediaStream>
  >(async () => {
    const stream = fakeStream();
    streams.push(stream);
    return stream.stream;
  });
  vi.stubGlobal(
    "navigator",
    Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia } }),
  );
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(
    1080,
  );
  vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(
    1920,
  );
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation((callback) => {
      queueMicrotask(() =>
        callback(new Blob(["jpeg"], { type: "image/jpeg" })),
      );
    });
  return { streams, getUserMedia, drawImage, toBlob };
}
