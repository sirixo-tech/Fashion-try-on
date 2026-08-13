import {
  analyzeGarmentBodyCoverageFromPoseLandmarks,
  createUnavailableGarmentInputAnalysisResult,
  type GarmentInputAnalysisResult,
  type PoseLandmarkLike,
} from "@selfx/shared";

const MEDIAPIPE_TASKS_VISION_VERSION = "0.10.35";
const MEDIAPIPE_WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_TASKS_VISION_VERSION}/wasm`;
const POSE_LANDMARKER_LITE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export interface GarmentInputAnalyzer {
  analyze(file: File): Promise<GarmentInputAnalysisResult>;
  dispose?: () => void;
}

type PoseLandmarkerLike = {
  detect: (image: HTMLImageElement | ImageBitmap) => unknown;
  close?: () => void;
};

type MediaPipeTasksVisionModule = {
  FilesetResolver: {
    forVisionTasks: (baseUrl: string) => Promise<unknown>;
  };
  PoseLandmarker: {
    createFromOptions: (
      vision: unknown,
      options: {
        baseOptions: { modelAssetPath: string };
        runningMode: "IMAGE";
        numPoses: number;
        minPoseDetectionConfidence: number;
        minPosePresenceConfidence: number;
      },
    ) => Promise<PoseLandmarkerLike>;
  };
};

export class MediaPipeGarmentInputAnalyzer implements GarmentInputAnalyzer {
  private poseLandmarker: PoseLandmarkerLike | null = null;

  async analyze(file: File): Promise<GarmentInputAnalysisResult> {
    let image: HTMLImageElement | null = null;

    try {
      image = await createImageElement(file);
      const poseLandmarker = await this.getPoseLandmarker();
      const result = poseLandmarker.detect(image);
      const landmarks = extractFirstPoseLandmarks(result);
      return analyzeGarmentBodyCoverageFromPoseLandmarks(landmarks);
    } catch {
      return createUnavailableGarmentInputAnalysisResult();
    } finally {
      image?.remove();
    }
  }

  dispose(): void {
    this.poseLandmarker?.close?.();
    this.poseLandmarker = null;
  }

  private async getPoseLandmarker(): Promise<PoseLandmarkerLike> {
    if (this.poseLandmarker) {
      return this.poseLandmarker;
    }

    const imported =
      (await import("@mediapipe/tasks-vision")) as MediaPipeTasksVisionModule;
    const vision = await imported.FilesetResolver.forVisionTasks(
      MEDIAPIPE_WASM_BASE_URL,
    );
    this.poseLandmarker = await imported.PoseLandmarker.createFromOptions(
      vision,
      {
        baseOptions: {
          modelAssetPath: POSE_LANDMARKER_LITE_MODEL_URL,
        },
        runningMode: "IMAGE",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
      },
    );

    return this.poseLandmarker;
  }
}

export function createGarmentInputAnalyzer(): GarmentInputAnalyzer {
  return new MediaPipeGarmentInputAnalyzer();
}

function extractFirstPoseLandmarks(
  result: unknown,
): readonly PoseLandmarkLike[] | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const record = result as Record<string, unknown>;
  const candidates = [record.landmarks, record.poseLandmarks];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    const firstPose = candidate[0];
    if (Array.isArray(firstPose)) {
      return firstPose.filter(isPoseLandmarkLike);
    }
  }

  return null;
}

function isPoseLandmarkLike(value: unknown): value is PoseLandmarkLike {
  return Boolean(value) && typeof value === "object";
}

function createImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = document.createElement("img");
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Garment image could not be decoded for analysis."));
    };
    image.decoding = "async";
    image.src = objectUrl;
  });
}
