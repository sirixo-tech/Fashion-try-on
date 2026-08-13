import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SelfxUiProvider } from "@selfx/ui";
import {
  createUnavailableGarmentInputAnalysisResult,
  type GarmentInputAnalysisResult,
  type ImageQualityResult,
  type ImageQualityTarget,
  type SelfxTryOnTelemetry,
  type TryOnLabRunResponse,
} from "@selfx/shared";

import { TryOnLabClient } from "@/components/try-on-lab-client";
import { createTryOnLabRun, getTryOnLabRun } from "@/lib/try-on-lab-api";

let originalCreateObjectUrl: typeof URL.createObjectURL | undefined;
let originalRevokeObjectUrl: typeof URL.revokeObjectURL | undefined;
let qualityByTarget: Record<ImageQualityTarget, ImageQualityResult>;
let garmentAnalysisResult: GarmentInputAnalysisResult;
let objectUrlCounter = 0;
let qualityAnalysisInputs: Array<{ file: File; target: ImageQualityTarget }> =
  [];
let garmentAnalysisInputs: File[] = [];

vi.mock("@/lib/session", () => ({
  useSession: () => ({
    status: "authenticated",
    user: {
      id: "user-1",
      email: "tester@selfx.local",
      displayName: "Tester",
      status: "ACTIVE",
    },
    accessToken: "access-token",
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/try-on-lab-api", () => ({
  createTryOnLabRun: vi.fn(),
  getTryOnLabRun: vi.fn(),
}));

vi.mock("@/lib/image-quality/opencv-analyzer", () => ({
  createOpenCvImageQualityAnalyzer: () => ({
    analyze: vi.fn(async (file: File, target: ImageQualityTarget) => {
      qualityAnalysisInputs.push({ file, target });
      return qualityByTarget[target];
    }),
  }),
}));

vi.mock("@/lib/garment-analysis/garment-input-analyzer", () => ({
  createGarmentInputAnalyzer: () => ({
    analyze: vi.fn(async (file: File) => {
      garmentAnalysisInputs.push(file);
      return garmentAnalysisResult;
    }),
    dispose: vi.fn(),
  }),
}));

function renderWithUi(element: ReactElement) {
  return render(<SelfxUiProvider>{element}</SelfxUiProvider>);
}

describe("TryOnLabClient", () => {
  beforeEach(() => {
    qualityByTarget = {
      person: qualityPass(),
      garment: qualityWarning("IMAGE_TOO_BLURRY", "Image may be blurry."),
    };
    garmentAnalysisResult = garmentAnalysis("NO_PERSON");
    qualityAnalysisInputs = [];
    garmentAnalysisInputs = [];
    vi.mocked(createTryOnLabRun).mockReset();
    vi.mocked(getTryOnLabRun).mockReset();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    class ResizeObserverStub {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    originalCreateObjectUrl = URL.createObjectURL;
    originalRevokeObjectUrl = URL.revokeObjectURL;
    objectUrlCounter = 0;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => {
        objectUrlCounter += 1;
        return `blob:selfx-preview-${objectUrlCounter}`;
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
  });

  it("keeps generation disabled before required inputs are present", () => {
    renderWithUi(<TryOnLabClient />);

    expect(
      screen.getByRole("button", { name: /generate try-on/i }),
    ).toHaveProperty("disabled", true);
  });

  it("uses automatic settings in the default workflow and keeps advanced controls collapsed", async () => {
    renderWithUi(<TryOnLabClient />);

    expect(
      screen.getByText("Try-On settings are selected automatically."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Top" })).toBeNull();
    expect(screen.getByText("Advanced settings")).toBeTruthy();

    await chooseImages();

    expect(screen.getByText("Automatic garment")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bottom" })).toBeNull();
  });

  it("submits a non-ambiguous upper-body garment without a disambiguation question", async () => {
    qualityByTarget = {
      person: qualityPass(),
      garment: qualityPass(),
    };
    garmentAnalysisResult = garmentAnalysis("UPPER_BODY_MODEL");
    vi.mocked(createTryOnLabRun).mockResolvedValue(completedResponse());
    vi.mocked(getTryOnLabRun).mockResolvedValue(completedResponse());

    renderWithUi(<TryOnLabClient />);
    await chooseImages("Score 100/100");
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));

    await waitFor(() => expect(createTryOnLabRun).toHaveBeenCalledOnce());
    const submittedFormData = vi.mocked(createTryOnLabRun).mock.calls[0]![0];
    expect(submittedFormData.get("garmentSource")).toBe("DIRECT_UPLOAD");
    expect(submittedFormData.get("garmentIntent")).toBe("TOP");
    expect(submittedFormData.get("category")).toBe("TOP");
    expect(submittedFormData.get("garmentPhotoType")).toBe("ON_MODEL");
    expect(submittedFormData.get("categoryResolutionSource")).toBe(
      "BODY_COVERAGE_ANALYSIS",
    );
    expect(
      screen.queryByText(/which item would you like to try on/i),
    ).toBeNull();
  });

  it("asks one focused question for ambiguous full-body garment images", async () => {
    qualityByTarget = {
      person: qualityPass(),
      garment: qualityPass(),
    };
    garmentAnalysisResult = garmentAnalysis("FULL_BODY_MODEL");
    vi.mocked(createTryOnLabRun).mockResolvedValue(
      completedResponse({
        garmentIntent: "FULL_OUTFIT",
        garmentCategory: "AUTO",
        categoryResolutionSource: "USER_DISAMBIGUATION",
        disambiguationRequired: true,
        disambiguationResolved: true,
      }),
    );
    vi.mocked(getTryOnLabRun).mockResolvedValue(completedResponse());

    renderWithUi(<TryOnLabClient />);
    await chooseImages("Score 100/100");
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/which item would you like to try on/i),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /full outfit/i }));

    await waitFor(() => expect(createTryOnLabRun).toHaveBeenCalledOnce());
    const submittedFormData = vi.mocked(createTryOnLabRun).mock.calls[0]![0];
    expect(submittedFormData.get("garmentIntent")).toBe("FULL_OUTFIT");
    expect(submittedFormData.get("category")).toBe("AUTO");
    expect(submittedFormData.get("categoryResolutionSource")).toBe(
      "USER_DISAMBIGUATION",
    );
    expect(submittedFormData.get("disambiguationResolved")).toBe("true");
  });

  it("allows internal advanced overrides while marking their resolution source", async () => {
    qualityByTarget = {
      person: qualityPass(),
      garment: qualityPass(),
    };
    garmentAnalysisResult = garmentAnalysis("UPPER_BODY_MODEL");
    vi.mocked(createTryOnLabRun).mockResolvedValue(completedResponse());
    vi.mocked(getTryOnLabRun).mockResolvedValue(completedResponse());

    renderWithUi(<TryOnLabClient />);
    await chooseImages("Score 100/100");
    fireEvent.click(screen.getByRole("button", { name: /show/i }));
    fireEvent.click(screen.getByRole("radio", { name: "Bottom" }));
    fireEvent.click(screen.getByRole("radio", { name: "Flat lay" }));
    fireEvent.click(screen.getByRole("radio", { name: "Quality" }));
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));

    await waitFor(() => expect(createTryOnLabRun).toHaveBeenCalledOnce());
    const submittedFormData = vi.mocked(createTryOnLabRun).mock.calls[0]![0];
    expect(submittedFormData.get("garmentIntent")).toBe("BOTTOM");
    expect(submittedFormData.get("category")).toBe("BOTTOM");
    expect(submittedFormData.get("garmentPhotoType")).toBe("FLAT_LAY");
    expect(submittedFormData.get("generationProfile")).toBe("QUALITY");
    expect(submittedFormData.get("categoryResolutionSource")).toBe(
      "INTERNAL_LAB_OVERRIDE",
    );
  });

  it("clears stale garment disambiguation and overrides when garment is replaced", async () => {
    qualityByTarget = {
      person: qualityPass(),
      garment: qualityPass(),
    };
    garmentAnalysisResult = garmentAnalysis("FULL_BODY_MODEL");
    vi.mocked(createTryOnLabRun).mockResolvedValue(completedResponse());
    vi.mocked(getTryOnLabRun).mockResolvedValue(completedResponse());

    renderWithUi(<TryOnLabClient />);
    await chooseImages("Score 100/100");
    fireEvent.click(screen.getByRole("button", { name: /show/i }));
    fireEvent.click(screen.getByRole("radio", { name: "Bottom" }));
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));

    await waitFor(() => expect(createTryOnLabRun).toHaveBeenCalledOnce());
    expect(vi.mocked(createTryOnLabRun).mock.calls[0]![0].get("category")).toBe(
      "BOTTOM",
    );

    vi.mocked(createTryOnLabRun).mockClear();
    garmentAnalysisResult = garmentAnalysis("UPPER_BODY_MODEL");
    const fileInputs =
      document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(fileInputs[1]!, {
      target: {
        files: [
          new File(["garment-2"], "garment-2.png", { type: "image/png" }),
        ],
      },
    });
    await waitFor(() =>
      expect(screen.getByAltText("Garment photo preview")).toHaveProperty(
        "src",
        "blob:selfx-preview-3",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));

    await waitFor(() => expect(createTryOnLabRun).toHaveBeenCalledOnce());
    const submittedFormData = vi.mocked(createTryOnLabRun).mock.calls[0]![0];
    expect(submittedFormData.get("garmentIntent")).toBe("TOP");
    expect(submittedFormData.get("category")).toBe("TOP");
    expect(submittedFormData.get("categoryResolutionSource")).toBe(
      "BODY_COVERAGE_ANALYSIS",
    );
    expect(submittedFormData.get("disambiguationResolved")).toBe("false");
  });

  it("asks again after replacing an ambiguous garment instead of reusing stale disambiguation", async () => {
    qualityByTarget = {
      person: qualityPass(),
      garment: qualityPass(),
    };
    garmentAnalysisResult = garmentAnalysis("FULL_BODY_MODEL");
    vi.mocked(createTryOnLabRun).mockResolvedValue(completedResponse());
    vi.mocked(getTryOnLabRun).mockResolvedValue(completedResponse());

    renderWithUi(<TryOnLabClient />);
    await chooseImages("Score 100/100");
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/which item would you like to try on/i),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /top/i }));
    await waitFor(() => expect(createTryOnLabRun).toHaveBeenCalledOnce());

    vi.mocked(createTryOnLabRun).mockClear();
    const fileInputs =
      document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(fileInputs[1]!, {
      target: {
        files: [
          new File(["garment-2"], "garment-2.png", { type: "image/png" }),
        ],
      },
    });
    await waitFor(() =>
      expect(screen.getByAltText("Garment photo preview")).toHaveProperty(
        "src",
        "blob:selfx-preview-3",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/which item would you like to try on/i),
      ).toBeTruthy(),
    );
    expect(createTryOnLabRun).not.toHaveBeenCalled();
  });

  it("continues with automatic resolution when garment analysis is unavailable", async () => {
    qualityByTarget = {
      person: qualityPass(),
      garment: qualityPass(),
    };
    garmentAnalysisResult = createUnavailableGarmentInputAnalysisResult();
    vi.mocked(createTryOnLabRun).mockResolvedValue(completedResponse());
    vi.mocked(getTryOnLabRun).mockResolvedValue(completedResponse());

    renderWithUi(<TryOnLabClient />);
    await chooseImages("Score 100/100");
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));

    await waitFor(() => expect(createTryOnLabRun).toHaveBeenCalledOnce());
    const submittedFormData = vi.mocked(createTryOnLabRun).mock.calls[0]![0];
    expect(submittedFormData.get("garmentIntent")).toBe("AUTO");
    expect(submittedFormData.get("category")).toBe("AUTO");
    expect(submittedFormData.get("garmentPhotoType")).toBe("AUTO");
    expect(submittedFormData.get("categoryResolutionSource")).toBe(
      "AUTO_FALLBACK",
    );
    expect(submittedFormData.get("analysisConfidence")).toBe("");
    expect(submittedFormData.get("garmentAnalysisReasonCodes")).toBe(
      JSON.stringify(["POSE_ANALYSIS_UNAVAILABLE"]),
    );
    expect(
      JSON.parse(String(submittedFormData.get("garmentAnalysisReasonCodes"))),
    ).toEqual(["POSE_ANALYSIS_UNAVAILABLE"]);
  });

  it("submits the original files after OpenCV and MediaPipe analysis", async () => {
    qualityByTarget = {
      person: qualityPass(),
      garment: qualityPass(),
    };
    garmentAnalysisResult = garmentAnalysis("UPPER_BODY_MODEL");
    vi.mocked(createTryOnLabRun).mockResolvedValue(completedResponse());
    vi.mocked(getTryOnLabRun).mockResolvedValue(completedResponse());

    renderWithUi(<TryOnLabClient />);
    const files = await chooseImages("Score 100/100");
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));

    await waitFor(() => expect(createTryOnLabRun).toHaveBeenCalledOnce());
    const submittedFormData = vi.mocked(createTryOnLabRun).mock.calls[0]![0];
    expect(qualityAnalysisInputs).toEqual([
      { file: files.personFile, target: "person" },
      { file: files.garmentFile, target: "garment" },
    ]);
    expect(garmentAnalysisInputs).toEqual([files.garmentFile]);
    expect(submittedFormData.get("personImage")).toBe(files.personFile);
    expect(submittedFormData.get("garmentImage")).toBe(files.garmentFile);
  });

  it("shows previews and quality display; warnings do not block generation", async () => {
    renderWithUi(<TryOnLabClient />);

    await chooseImages();

    await waitFor(() => expect(screen.getByText("Score 100/100")).toBeTruthy());
    expect(screen.getByText("Image may be blurry.")).toBeTruthy();
    expect(screen.getByAltText("Person photo preview")).toHaveProperty(
      "src",
      "blob:selfx-preview-1",
    );
    expect(screen.getByAltText("Garment photo preview")).toHaveProperty(
      "src",
      "blob:selfx-preview-2",
    );
    expect(
      screen.getByRole("button", { name: /generate try-on/i }),
    ).toHaveProperty("disabled", false);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.getByText(/upload only images you are authorized/i),
    ).toBeTruthy();
  });

  it("renders completed result and resets the lab", async () => {
    qualityByTarget = {
      person: qualityPass(),
      garment: qualityPass(),
    };
    const completedRun = completedResponse();
    vi.mocked(createTryOnLabRun).mockResolvedValue(completedRun);
    vi.mocked(getTryOnLabRun).mockResolvedValue(completedRun);

    renderWithUi(<TryOnLabClient />);
    await chooseImages("Score 100/100");
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));

    await waitFor(() =>
      expect(screen.getByText("Result comparison")).toBeTruthy(),
    );
    expect(screen.getByAltText("Person")).toHaveProperty(
      "src",
      "blob:selfx-preview-1",
    );
    expect(screen.getByAltText("Garment")).toHaveProperty(
      "src",
      "blob:selfx-preview-2",
    );
    expect(screen.getByAltText("Generated Try-On")).toBeTruthy();
    expect(screen.getByText("Run summary")).toBeTruthy();
    const diagnostics = screen.getByText("Run diagnostics").closest("details");
    expect(diagnostics?.hasAttribute("open")).toBe(false);
    expect(screen.getByText("FASHN")).toBeTruthy();
    expect(screen.queryByText(/provider-1/i)).toBeNull();
    expect(screen.queryByText(/base64,result/i)).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /new try-on/i })[0]!);
    expect(screen.queryByText("Result comparison")).toBeNull();
  });

  it("keeps person and garment preview URLs valid while generation is submitting", async () => {
    qualityByTarget = {
      person: qualityPass(),
      garment: qualityPass(),
    };
    const pendingRun =
      createDeferred<Awaited<ReturnType<typeof createTryOnLabRun>>>();
    vi.mocked(createTryOnLabRun).mockReturnValue(pendingRun.promise);

    const { unmount } = renderWithUi(<TryOnLabClient />);
    await chooseImages("Score 100/100");
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));

    await waitFor(() => expect(createTryOnLabRun).toHaveBeenCalledOnce());
    expect(screen.getByAltText("Person photo preview")).toHaveProperty(
      "src",
      "blob:selfx-preview-1",
    );
    expect(screen.getByAltText("Garment photo preview")).toHaveProperty(
      "src",
      "blob:selfx-preview-2",
    );
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    unmount();
  });

  it("keeps person preview URL valid while generation is polling", async () => {
    qualityByTarget = {
      person: qualityPass(),
      garment: qualityPass(),
    };
    vi.mocked(createTryOnLabRun).mockResolvedValue({
      ...completedResponse(),
      status: "PROCESSING",
      resultImage: undefined,
    });

    const { unmount } = renderWithUi(<TryOnLabClient />);
    await chooseImages("Score 100/100");
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));

    await waitFor(() => expect(screen.getByText(/SelfX run ID:/)).toBeTruthy());
    expect(screen.getByAltText("Person photo preview")).toHaveProperty(
      "src",
      "blob:selfx-preview-1",
    );
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    unmount();
  });

  it("renders failed generation state", async () => {
    qualityByTarget = {
      person: qualityPass(),
      garment: qualityPass(),
    };
    vi.mocked(createTryOnLabRun).mockResolvedValue({
      ...completedResponse(),
      status: "FAILED",
      resultImage: undefined,
      errorCode: "TRYON_FAILED",
      errorMessage: "Try-On generation failed.",
      telemetry: {
        ...completedResponse().telemetry,
        status: "FAILED",
        failureCode: "TRYON_FAILED",
      },
    });

    renderWithUi(<TryOnLabClient />);
    await chooseImages("Score 100/100");
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));

    await waitFor(() =>
      expect(screen.getByText("Try-On generation failed.")).toBeTruthy(),
    );
  });

  it("shows grouped warnings before submission and allows re-upload", async () => {
    renderWithUi(<TryOnLabClient />);
    await chooseImages();

    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));

    await waitFor(() =>
      expect(screen.getByText("Image quality warning")).toBeTruthy(),
    );
    expect(screen.getAllByText("Garment photo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Image may be blurry.").length).toBeGreaterThan(
      0,
    );

    fireEvent.click(screen.getByRole("button", { name: /re-upload/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(createTryOnLabRun).not.toHaveBeenCalled();
  });

  it("submits the existing Try-On request after Proceed anyway", async () => {
    const completedRun = completedResponse();
    vi.mocked(createTryOnLabRun).mockResolvedValue(completedRun);
    vi.mocked(getTryOnLabRun).mockResolvedValue(completedRun);

    renderWithUi(<TryOnLabClient />);
    await chooseImages();
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));
    await waitFor(() =>
      expect(screen.getByText("Image quality warning")).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /proceed anyway/i }));

    await waitFor(() => expect(createTryOnLabRun).toHaveBeenCalledOnce());
    expect(screen.getByText("Result comparison")).toBeTruthy();
  });

  it("resets warning override when an uploaded image changes", async () => {
    const completedRun = completedResponse();
    vi.mocked(createTryOnLabRun).mockResolvedValue(completedRun);
    vi.mocked(getTryOnLabRun).mockResolvedValue(completedRun);

    renderWithUi(<TryOnLabClient />);
    await chooseImages();
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));
    await waitFor(() =>
      expect(screen.getByText("Image quality warning")).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /proceed anyway/i }));
    await waitFor(() => expect(createTryOnLabRun).toHaveBeenCalledOnce());

    const fileInputs =
      document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(fileInputs[1]!, {
      target: {
        files: [
          new File(["garment-2"], "garment-2.png", { type: "image/png" }),
        ],
      },
    });
    await waitFor(() => expect(screen.getByText("Score 88/100")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));

    await waitFor(() =>
      expect(screen.getByText("Image quality warning")).toBeTruthy(),
    );
  });

  it("replacing person image revokes only the old person preview URL", async () => {
    renderWithUi(<TryOnLabClient />);
    await chooseImages();

    let fileInputs =
      document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(fileInputs[0]!, {
      target: {
        files: [new File(["person-2"], "person-2.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(screen.getByAltText("Person photo preview")).toHaveProperty(
        "src",
        "blob:selfx-preview-3",
      ),
    );

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:selfx-preview-1");
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(
      "blob:selfx-preview-2",
    );

    fileInputs =
      document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    expect(fileInputs).toHaveLength(2);
  });

  it("replacing garment image revokes only the old garment preview URL", async () => {
    renderWithUi(<TryOnLabClient />);
    await chooseImages();

    const fileInputs =
      document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(fileInputs[1]!, {
      target: {
        files: [
          new File(["garment-2"], "garment-2.png", { type: "image/png" }),
        ],
      },
    });
    await waitFor(() =>
      expect(screen.getByAltText("Garment photo preview")).toHaveProperty(
        "src",
        "blob:selfx-preview-3",
      ),
    );

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:selfx-preview-2");
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(
      "blob:selfx-preview-1",
    );
  });

  it("reset revokes both active preview URLs and clears result state", async () => {
    qualityByTarget = {
      person: qualityPass(),
      garment: qualityPass(),
    };
    vi.mocked(createTryOnLabRun).mockResolvedValue(completedResponse());
    vi.mocked(getTryOnLabRun).mockResolvedValue(completedResponse());

    renderWithUi(<TryOnLabClient />);
    await chooseImages("Score 100/100");
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));
    await waitFor(() =>
      expect(screen.getByText("Result comparison")).toBeTruthy(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: /new try-on/i })[0]!);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:selfx-preview-1");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:selfx-preview-2");
    expect(screen.queryByAltText("Person photo preview")).toBeNull();
    expect(screen.queryByAltText("Generated Try-On")).toBeNull();
  });

  it("component unmount revokes remaining preview URLs", async () => {
    const { unmount } = renderWithUi(<TryOnLabClient />);
    await chooseImages();

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:selfx-preview-1");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:selfx-preview-2");
  });

  it("renders analysis-unavailable warnings without fake zero metrics", async () => {
    qualityByTarget = {
      person: qualityPass(),
      garment: {
        status: "WARNING",
        passed: true,
        score: 75,
        metrics: {
          width: 640,
          height: 640,
          sharpness: null,
          brightness: null,
          contrast: null,
        },
        issues: [
          {
            code: "IMAGE_QUALITY_ANALYSIS_UNAVAILABLE",
            severity: "WARNING",
            message:
              "Image quality analysis could not be completed. You can upload another image or continue with this image.",
          },
        ],
      },
    };

    renderWithUi(<TryOnLabClient />);
    await chooseImages("Score unavailable");

    expect(
      screen.getByText(/quality analysis could not be completed/i),
    ).toBeTruthy();
    expect(screen.getByText(/sharpness not analyzed/i)).toBeTruthy();
    expect(screen.queryByText(/0x0/)).toBeNull();
  });

  it("opens an image preview modal from the result comparison", async () => {
    qualityByTarget = {
      person: qualityPass(),
      garment: qualityPass(),
    };
    vi.mocked(createTryOnLabRun).mockResolvedValue(completedResponse());
    vi.mocked(getTryOnLabRun).mockResolvedValue(completedResponse());

    renderWithUi(<TryOnLabClient />);
    await chooseImages("Score 100/100");
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));
    await waitFor(() =>
      expect(screen.getByText("Result comparison")).toBeTruthy(),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /open generated try-on larger preview/i,
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByAltText("Generated Try-On enlarged preview"),
      ).toBeTruthy(),
    );
  });

  it("tries another garment while preserving the person image", async () => {
    qualityByTarget = {
      person: qualityPass(),
      garment: qualityPass(),
    };
    vi.mocked(createTryOnLabRun).mockResolvedValue(completedResponse());
    vi.mocked(getTryOnLabRun).mockResolvedValue(completedResponse());

    renderWithUi(<TryOnLabClient />);
    await chooseImages("Score 100/100");
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));
    await waitFor(() =>
      expect(screen.getByText("Result comparison")).toBeTruthy(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /try another garment/i }),
    );

    expect(screen.getByAltText("Person photo preview")).toHaveProperty(
      "src",
      "blob:selfx-preview-1",
    );
    expect(screen.queryByAltText("Garment photo preview")).toBeNull();
    expect(screen.queryByText("Result comparison")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:selfx-preview-2");
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(
      "blob:selfx-preview-1",
    );
  });

  it("sends safe telemetry warning fields without consent acknowledgement", async () => {
    const completedRun = {
      ...completedResponse({
        qualityWarningCodes: ["IMAGE_TOO_BLURRY"],
        qualityOverrideAccepted: true,
      }),
    };
    vi.mocked(createTryOnLabRun).mockResolvedValue(completedRun);
    vi.mocked(getTryOnLabRun).mockResolvedValue(completedRun);

    renderWithUi(<TryOnLabClient />);
    await chooseImages();
    fireEvent.click(screen.getByRole("button", { name: /generate try-on/i }));
    await waitFor(() =>
      expect(screen.getByText("Image quality warning")).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /proceed anyway/i }));

    await waitFor(() => expect(createTryOnLabRun).toHaveBeenCalledOnce());
    const submittedFormData = vi.mocked(createTryOnLabRun).mock.calls[0]![0];
    expect(submittedFormData.get("acknowledgement")).toBeNull();
    expect(submittedFormData.get("qualityOverrideAccepted")).toBe("true");
    expect(submittedFormData.get("qualityWarningCodes")).toBe(
      JSON.stringify(["IMAGE_TOO_BLURRY"]),
    );
    expect(screen.getByText("IMAGE_TOO_BLURRY")).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
  });
});

async function chooseImages(
  garmentScore = "Score 88/100",
): Promise<{ personFile: File; garmentFile: File }> {
  const personFile = new File(["person"], "person.png", { type: "image/png" });
  const garmentFile = new File(["garment"], "garment.png", {
    type: "image/png",
  });

  let fileInputs =
    document.querySelectorAll<HTMLInputElement>('input[type="file"]');

  fireEvent.change(fileInputs[0]!, {
    target: { files: [personFile] },
  });

  await waitFor(() => expect(screen.getByText("Score 100/100")).toBeTruthy());

  fileInputs =
    document.querySelectorAll<HTMLInputElement>('input[type="file"]');
  fireEvent.change(fileInputs[1]!, {
    target: { files: [garmentFile] },
  });

  if (garmentScore === "Score 100/100") {
    await waitFor(() =>
      expect(
        screen.getAllByText("Score 100/100").length,
      ).toBeGreaterThanOrEqual(2),
    );
    return { personFile, garmentFile };
  }

  await waitFor(() => expect(screen.getByText(garmentScore)).toBeTruthy());
  return { personFile, garmentFile };
}

function qualityPass(): ImageQualityResult {
  return {
    status: "PASS",
    passed: true,
    score: 100,
    metrics: {
      width: 640,
      height: 640,
      sharpness: 120,
      brightness: 120,
      contrast: 36,
    },
    issues: [],
  };
}

function qualityWarning(
  code: ImageQualityResult["issues"][number]["code"],
  message: string,
): ImageQualityResult {
  return {
    status: "WARNING",
    passed: true,
    score: 88,
    metrics: {
      width: 640,
      height: 640,
      sharpness: code === "IMAGE_TOO_BLURRY" ? 12 : 120,
      brightness: code === "IMAGE_TOO_DARK" ? 20 : 120,
      contrast: code === "IMAGE_LOW_CONTRAST" ? 8 : 36,
    },
    issues: [
      {
        code,
        severity: "WARNING",
        message,
      },
    ],
  };
}

function garmentAnalysis(
  bodyCoverage: GarmentInputAnalysisResult["bodyCoverage"],
): GarmentInputAnalysisResult {
  return {
    personPresent: bodyCoverage !== "NO_PERSON" && bodyCoverage !== "UNKNOWN",
    bodyCoverage,
    ambiguity: bodyCoverage === "FULL_BODY_MODEL",
    suggestedCategory:
      bodyCoverage === "UPPER_BODY_MODEL"
        ? "TOP"
        : bodyCoverage === "LOWER_BODY_MODEL"
          ? "BOTTOM"
          : "AUTO",
    confidence: bodyCoverage === "UNKNOWN" ? 0.2 : 0.82,
    reasonCodes:
      bodyCoverage === "UPPER_BODY_MODEL"
        ? ["POSE_UPPER_BODY_COVERAGE"]
        : bodyCoverage === "LOWER_BODY_MODEL"
          ? ["POSE_LOWER_BODY_COVERAGE"]
          : bodyCoverage === "FULL_BODY_MODEL"
            ? ["POSE_FULL_BODY_COVERAGE"]
            : bodyCoverage === "NO_PERSON"
              ? ["POSE_PERSON_NOT_DETECTED", "PRODUCT_ONLY_AUTO_FALLBACK"]
              : ["POSE_LOW_CONFIDENCE"],
  };
}

function completedResponse(
  telemetryOverrides: Partial<SelfxTryOnTelemetry> = {},
): TryOnLabRunResponse {
  const response = completedResponseBase();
  return {
    ...response,
    telemetry: {
      ...response.telemetry,
      ...telemetryOverrides,
    },
  };
}

function completedResponseBase(): TryOnLabRunResponse {
  const createdAt = new Date().toISOString();
  const startedAt = new Date().toISOString();
  const completedAt = new Date().toISOString();
  return {
    id: "0198a9b3-d0bc-7000-8000-000000000001",
    status: "COMPLETED",
    garmentSource: "DIRECT_UPLOAD",
    garmentIntent: "TOP",
    category: "TOP",
    garmentPhotoType: "FLAT_LAY",
    generationProfile: "BALANCED",
    createdAt,
    updatedAt: completedAt,
    resultImage: "data:image/jpeg;base64,result",
    telemetry: {
      selfxRunId: "0198a9b3-d0bc-7000-8000-000000000001",
      channel: "WEB_LAB",
      provider: "fashn",
      providerDisplayName: "FASHN",
      model: "tryon-v1.6",
      profile: "BALANCED",
      garmentSource: "DIRECT_UPLOAD",
      garmentIntent: "TOP",
      garmentCategory: "TOP",
      garmentPhotoType: "FLAT_LAY",
      categoryResolutionSource: "BODY_COVERAGE_ANALYSIS",
      photoTypeResolutionSource: "AUTO_FALLBACK",
      profileResolutionSource: "PLATFORM_DEFAULT",
      analysisConfidence: 0.82,
      disambiguationRequired: false,
      disambiguationResolved: false,
      garmentAnalysisBodyCoverage: "UPPER_BODY_MODEL",
      garmentAnalysisReasonCodes: ["POSE_UPPER_BODY_COVERAGE"],
      createdAt,
      startedAt,
      completedAt,
      elapsedMs: 1200,
      status: "COMPLETED",
      qualityWarningCodes: [],
      qualityOverrideAccepted: false,
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}
