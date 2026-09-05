import { describe, expect, it } from "vitest";

import { analyzeJewelleryPersonLandmarks } from "./jewellery-person-analyzer";

describe("jewellery person landmark analysis", () => {
  it("accepts a fully framed hand for a ring", () => {
    const landmarks = Array.from({ length: 21 }, (_, index) => ({
      x: 0.2 + (index % 5) * 0.1,
      y: 0.2 + Math.floor(index / 5) * 0.1,
    }));

    expect(analyzeJewelleryPersonLandmarks("RING", landmarks)).toMatchObject({
      analyzer: "MEDIAPIPE_HAND_LANDMARKER",
      analysisAvailable: true,
      subjectPresent: true,
      requiredRegionVisible: true,
      relevantRegionUnobstructed: true,
    });
  });

  it("rejects earring framing when an ear is outside the image", () => {
    const landmarks = Array.from({ length: 13 }, () => ({
      x: 0.5,
      y: 0.5,
      visibility: 0.9,
      presence: 0.9,
    }));
    landmarks[0] = { x: 0.5, y: 0.3, visibility: 0.9, presence: 0.9 };
    landmarks[7] = { x: -0.1, y: 0.3, visibility: 0.9, presence: 0.9 };
    landmarks[8] = { x: 0.7, y: 0.3, visibility: 0.9, presence: 0.9 };

    expect(analyzeJewelleryPersonLandmarks("EARRING", landmarks)).toMatchObject(
      {
        analyzer: "MEDIAPIPE_POSE_LANDMARKER",
        subjectPresent: true,
        requiredRegionVisible: false,
        frontFacing: false,
      },
    );
  });
});
