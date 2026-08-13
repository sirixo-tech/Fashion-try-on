import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOpenCvImageQualityAnalyzer } from "./opencv-analyzer";

vi.mock("@techstark/opencv-js", () => ({
  default: Promise.reject(new Error("OpenCV unavailable.")),
}));

describe("OpenCvImageQualityAnalyzer", () => {
  const originalCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({
        width: 640,
        height: 640,
        close: vi.fn(),
      })),
    );
    vi.stubGlobal(
      "ImageData",
      class {
        data: Uint8ClampedArray;
        width: number;
        height: number;

        constructor(data: Uint8ClampedArray, width: number, height: number) {
          this.data = data;
          this.width = width;
          this.height = height;
        }
      },
    );

    vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName !== "canvas") {
        return originalCreateElement(tagName);
      }

      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: vi.fn(),
          getImageData: () =>
            new ImageData(new Uint8ClampedArray(640 * 640 * 4), 640, 640),
        }),
      } as unknown as HTMLCanvasElement;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns an advisory warning when OpenCV fails after browser decode", async () => {
    const analyzer = createOpenCvImageQualityAnalyzer();

    const result = await analyzer.analyze(
      new File(["image"], "person.png", { type: "image/png" }),
      "person",
    );

    expect(result.status).toBe("WARNING");
    expect(result.passed).toBe(true);
    expect(result.metrics).toMatchObject({
      width: 640,
      height: 640,
      sharpness: null,
      brightness: null,
      contrast: null,
    });
    expect(result.issues[0]).toMatchObject({
      code: "IMAGE_QUALITY_ANALYSIS_UNAVAILABLE",
      severity: "WARNING",
    });
  });

  it("blocks when the browser cannot decode the uploaded image", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => Promise.reject()),
    );
    const analyzer = createOpenCvImageQualityAnalyzer();

    const result = await analyzer.analyze(
      new File(["broken"], "person.png", { type: "image/png" }),
      "person",
    );

    expect(result.status).toBe("BLOCKED");
    expect(result.passed).toBe(false);
    expect(result.metrics.width).toBeNull();
    expect(result.issues[0]).toMatchObject({
      code: "IMAGE_DECODE_FAILED",
      severity: "BLOCKING",
    });
  });
});
