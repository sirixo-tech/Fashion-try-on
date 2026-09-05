import type {
  PoseLandmarkLike,
  SelfxJewelleryPersonSemanticEvidence,
  SelfxJewellerySemanticAnalyzer,
  SelfxJewelleryType,
} from "@selfx/shared";

const MEDIAPIPE_TASKS_VISION_VERSION = "0.10.35";
const MEDIAPIPE_WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_TASKS_VISION_VERSION}/wasm`;
const HAND_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const POSE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

type LandmarkDetector = {
  detect: (image: ImageBitmap) => unknown;
  close?: () => void;
};

type MediaPipeTasksVisionModule = {
  FilesetResolver: {
    forVisionTasks: (baseUrl: string) => Promise<unknown>;
  };
  HandLandmarker: {
    createFromOptions: (
      vision: unknown,
      options: {
        baseOptions: { modelAssetPath: string };
        runningMode: "IMAGE";
        numHands: number;
        minHandDetectionConfidence: number;
        minHandPresenceConfidence: number;
      },
    ) => Promise<LandmarkDetector>;
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
    ) => Promise<LandmarkDetector>;
  };
};

export interface JewelleryPersonAnalyzer {
  analyze(
    file: File,
    jewelleryType: SelfxJewelleryType,
  ): Promise<SelfxJewelleryPersonSemanticEvidence>;
  dispose(): void;
}

export class MediaPipeJewelleryPersonAnalyzer implements JewelleryPersonAnalyzer {
  private vision: unknown | null = null;
  private handLandmarker: LandmarkDetector | null = null;
  private poseLandmarker: LandmarkDetector | null = null;

  async analyze(
    file: File,
    jewelleryType: SelfxJewelleryType,
  ): Promise<SelfxJewelleryPersonSemanticEvidence> {
    const analyzer = analyzerFor(jewelleryType);
    let image: ImageBitmap | null = null;
    try {
      image = await createImageBitmap(file);
      const detector = await this.detectorFor(jewelleryType);
      const landmarks = firstLandmarkSet(detector.detect(image));
      return analyzeJewelleryPersonLandmarks(jewelleryType, landmarks);
    } catch {
      return unavailableEvidence(analyzer);
    } finally {
      image?.close();
    }
  }

  dispose(): void {
    this.handLandmarker?.close?.();
    this.poseLandmarker?.close?.();
    this.handLandmarker = null;
    this.poseLandmarker = null;
    this.vision = null;
  }

  private async detectorFor(
    jewelleryType: SelfxJewelleryType,
  ): Promise<LandmarkDetector> {
    const imported =
      (await import("@mediapipe/tasks-vision")) as MediaPipeTasksVisionModule;
    this.vision ??= await imported.FilesetResolver.forVisionTasks(
      MEDIAPIPE_WASM_BASE_URL,
    );

    if (jewelleryType === "RING" || jewelleryType === "BRACELET") {
      this.handLandmarker ??= await imported.HandLandmarker.createFromOptions(
        this.vision,
        {
          baseOptions: { modelAssetPath: HAND_LANDMARKER_MODEL_URL },
          runningMode: "IMAGE",
          numHands: 1,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
        },
      );
      return this.handLandmarker;
    }

    this.poseLandmarker ??= await imported.PoseLandmarker.createFromOptions(
      this.vision,
      {
        baseOptions: { modelAssetPath: POSE_LANDMARKER_MODEL_URL },
        runningMode: "IMAGE",
        numPoses: 1,
        minPoseDetectionConfidence: 0.55,
        minPosePresenceConfidence: 0.55,
      },
    );
    return this.poseLandmarker;
  }
}

export function createJewelleryPersonAnalyzer(): JewelleryPersonAnalyzer {
  return new MediaPipeJewelleryPersonAnalyzer();
}

export function analyzeJewelleryPersonLandmarks(
  jewelleryType: SelfxJewelleryType,
  landmarks: readonly PoseLandmarkLike[] | null,
): SelfxJewelleryPersonSemanticEvidence {
  const analyzer = analyzerFor(jewelleryType);
  return jewelleryType === "RING" || jewelleryType === "BRACELET"
    ? analyzeHand(landmarks, jewelleryType, analyzer)
    : analyzeUpperBody(landmarks, jewelleryType, analyzer);
}

function analyzeHand(
  landmarks: readonly PoseLandmarkLike[] | null,
  jewelleryType: "RING" | "BRACELET",
  analyzer: SelfxJewellerySemanticAnalyzer,
): SelfxJewelleryPersonSemanticEvidence {
  const subjectPresent = Boolean(landmarks && landmarks.length >= 21);
  const requiredIndices =
    jewelleryType === "RING" ? [0, 4, 8, 12, 16, 20] : [0, 1, 5, 9, 13, 17];
  const requiredRegionVisible =
    subjectPresent &&
    requiredIndices.every((index) => isLandmarkInFrame(landmarks?.[index]));
  const inFrameCount =
    landmarks?.filter((landmark) => isLandmarkInFrame(landmark)).length ?? 0;

  return {
    analyzer,
    analysisAvailable: true,
    subjectPresent,
    requiredRegionVisible,
    frontFacing: null,
    relevantRegionUnobstructed: requiredRegionVisible && inFrameCount >= 18,
    confidence: landmarks ? roundConfidence(inFrameCount / 21) : 0,
  };
}

function analyzeUpperBody(
  landmarks: readonly PoseLandmarkLike[] | null,
  jewelleryType: "NECKLACE" | "EARRING",
  analyzer: SelfxJewellerySemanticAnalyzer,
): SelfxJewelleryPersonSemanticEvidence {
  const subjectPresent = Boolean(landmarks && landmarks.length >= 13);
  const nose = landmarks?.[0];
  const leftEar = landmarks?.[7];
  const rightEar = landmarks?.[8];
  const leftShoulder = landmarks?.[11];
  const rightShoulder = landmarks?.[12];
  const requiredLandmarks =
    jewelleryType === "EARRING"
      ? [nose, leftEar, rightEar]
      : [nose, leftEar, rightEar, leftShoulder, rightShoulder];
  const requiredRegionVisible =
    subjectPresent && requiredLandmarks.every(isVisibleLandmark);
  const frontFacing =
    requiredRegionVisible &&
    isHorizontallyCentered(nose, leftEar, rightEar) &&
    (jewelleryType === "EARRING" ||
      shouldersAreLevel(leftShoulder, rightShoulder));
  const confidence = averageConfidence(requiredLandmarks);

  return {
    analyzer,
    analysisAvailable: true,
    subjectPresent,
    requiredRegionVisible,
    frontFacing,
    relevantRegionUnobstructed: requiredRegionVisible,
    confidence,
  };
}

function firstLandmarkSet(result: unknown): readonly PoseLandmarkLike[] | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const candidate = (result as Record<string, unknown>).landmarks;
  if (!Array.isArray(candidate) || !Array.isArray(candidate[0])) {
    return null;
  }
  return candidate[0].filter(
    (landmark): landmark is PoseLandmarkLike =>
      Boolean(landmark) && typeof landmark === "object",
  );
}

function analyzerFor(
  jewelleryType: SelfxJewelleryType,
): SelfxJewellerySemanticAnalyzer {
  return jewelleryType === "RING" || jewelleryType === "BRACELET"
    ? "MEDIAPIPE_HAND_LANDMARKER"
    : "MEDIAPIPE_POSE_LANDMARKER";
}

function unavailableEvidence(
  analyzer: SelfxJewellerySemanticAnalyzer,
): SelfxJewelleryPersonSemanticEvidence {
  return {
    analyzer,
    analysisAvailable: false,
    subjectPresent: false,
    requiredRegionVisible: false,
    frontFacing: null,
    relevantRegionUnobstructed: null,
    confidence: null,
  };
}

function isLandmarkInFrame(landmark: PoseLandmarkLike | undefined): boolean {
  return (
    typeof landmark?.x === "number" &&
    typeof landmark.y === "number" &&
    landmark.x >= 0.02 &&
    landmark.x <= 0.98 &&
    landmark.y >= 0.02 &&
    landmark.y <= 0.98
  );
}

function isVisibleLandmark(landmark: PoseLandmarkLike | undefined): boolean {
  const confidence = Math.min(
    landmark?.visibility ?? 1,
    landmark?.presence ?? 1,
  );
  return isLandmarkInFrame(landmark) && confidence >= 0.5;
}

function isHorizontallyCentered(
  center: PoseLandmarkLike | undefined,
  left: PoseLandmarkLike | undefined,
  right: PoseLandmarkLike | undefined,
): boolean {
  if (
    typeof center?.x !== "number" ||
    typeof left?.x !== "number" ||
    typeof right?.x !== "number"
  ) {
    return false;
  }
  const minimum = Math.min(left.x, right.x);
  const maximum = Math.max(left.x, right.x);
  const span = Math.max(maximum - minimum, 0.01);
  const midpoint = (minimum + maximum) / 2;
  return (
    center.x >= minimum &&
    center.x <= maximum &&
    Math.abs(center.x - midpoint) / span <= 0.35
  );
}

function shouldersAreLevel(
  left: PoseLandmarkLike | undefined,
  right: PoseLandmarkLike | undefined,
): boolean {
  return (
    typeof left?.y === "number" &&
    typeof right?.y === "number" &&
    Math.abs(left.y - right.y) <= 0.12
  );
}

function averageConfidence(
  landmarks: Array<PoseLandmarkLike | undefined>,
): number {
  const values = landmarks
    .filter((landmark): landmark is PoseLandmarkLike => Boolean(landmark))
    .map((landmark) =>
      Math.min(landmark.visibility ?? 1, landmark.presence ?? 1),
    );
  if (values.length === 0) {
    return 0;
  }
  return roundConfidence(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

function roundConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}
