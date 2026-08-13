import {
  createInvalidImageQualityResult,
  createUnavailableImageQualityResult,
  normalizeImageQualityResult,
  type ImageQualityResult,
  type ImageQualityTarget,
} from "@selfx/shared";

import {
  validateBrowserImageFile,
  type ImageQualityAnalyzer,
} from "./analyzer";

type OpenCvMat = {
  data64F?: Float64Array;
  delete: () => void;
};

type OpenCvModule = {
  Mat: new () => OpenCvMat;
  matFromImageData: (imageData: ImageData) => OpenCvMat;
  cvtColor: (src: OpenCvMat, dst: OpenCvMat, code: number) => void;
  Laplacian: (
    src: OpenCvMat,
    dst: OpenCvMat,
    depth: number,
    kernelSize?: number,
  ) => void;
  meanStdDev: (src: OpenCvMat, mean: OpenCvMat, stddev: OpenCvMat) => void;
  COLOR_RGBA2GRAY: number;
  CV_64F: number;
};

type OpenCvModuleLoader =
  | OpenCvModule
  | Promise<OpenCvModule>
  | (Partial<OpenCvModule> & {
      onRuntimeInitialized?: () => void;
    });

export class OpenCvImageQualityAnalyzer implements ImageQualityAnalyzer {
  async analyze(
    file: File,
    target: ImageQualityTarget,
  ): Promise<ImageQualityResult> {
    const fileValidation = validateBrowserImageFile(file);
    if (fileValidation) {
      return fileValidation;
    }

    let decodedSize: { width: number; height: number } | null = null;

    try {
      const imageData = await createAnalysisImageData(file);
      decodedSize = { width: imageData.width, height: imageData.height };
      const cv = await getOpenCv();
      const src = cv.matFromImageData(imageData);
      const gray = new cv.Mat();
      const laplacian = new cv.Mat();
      const mean = new cv.Mat();
      const stddev = new cv.Mat();
      const lapMean = new cv.Mat();
      const lapStddev = new cv.Mat();

      try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.meanStdDev(gray, mean, stddev);
        cv.Laplacian(gray, laplacian, cv.CV_64F, 3);
        cv.meanStdDev(laplacian, lapMean, lapStddev);

        const brightness = mean.data64F?.[0] ?? 0;
        const contrast = stddev.data64F?.[0] ?? 0;
        const laplacianStddev = lapStddev.data64F?.[0] ?? 0;

        return normalizeImageQualityResult(
          {
            width: imageData.width,
            height: imageData.height,
            brightness: roundMetric(brightness),
            contrast: roundMetric(contrast),
            sharpness: roundMetric(laplacianStddev * laplacianStddev),
          },
          target,
        );
      } finally {
        src.delete();
        gray.delete();
        laplacian.delete();
        mean.delete();
        stddev.delete();
        lapMean.delete();
        lapStddev.delete();
      }
    } catch (error) {
      if (error instanceof ImageDecodeError) {
        return createInvalidImageQualityResult(
          "IMAGE_DECODE_FAILED",
          "Image could not be decoded.",
        );
      }

      return createUnavailableImageQualityResult({
        width: decodedSize?.width ?? null,
        height: decodedSize?.height ?? null,
      });
    }
  }
}

export function createOpenCvImageQualityAnalyzer(): ImageQualityAnalyzer {
  return new OpenCvImageQualityAnalyzer();
}

async function getOpenCv(): Promise<OpenCvModule> {
  const imported = (await import("@techstark/opencv-js")) as unknown as {
    default: OpenCvModuleLoader;
  };
  const cvModule = imported.default;

  if (cvModule instanceof Promise) {
    return cvModule;
  }

  if ("Mat" in cvModule && cvModule.Mat) {
    return cvModule as OpenCvModule;
  }

  const runtimeModule = cvModule as Partial<OpenCvModule> & {
    onRuntimeInitialized?: () => void;
  };
  return new Promise<OpenCvModule>((resolve) => {
    runtimeModule.onRuntimeInitialized = () => {
      resolve(runtimeModule as OpenCvModule);
    };
  });
}

async function createAnalysisImageData(file: File): Promise<ImageData> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageDecodeError();
  }

  if (bitmap.width <= 0 || bitmap.height <= 0) {
    bitmap.close();
    throw new ImageDecodeError();
  }

  const maxDimension = 640;
  const scale = Math.min(
    1,
    maxDimension / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!context) {
    throw new Error("Canvas unavailable.");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return context.getImageData(0, 0, width, height);
}

class ImageDecodeError extends Error {
  constructor() {
    super("Image decode failed.");
  }
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}
