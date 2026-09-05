import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { JewelleryTryOnLabService } from "./jewellery-try-on-lab.service.js";

describe("JewelleryTryOnLabService person preflight", () => {
  const previousLabEnabled = process.env.TRYON_LAB_ENABLED;

  afterEach(() => {
    if (previousLabEnabled === undefined) {
      delete process.env.TRYON_LAB_ENABLED;
    } else {
      process.env.TRYON_LAB_ENABLED = previousLabEnabled;
    }
  });

  it("does not reserve provider work when person preflight is rejected", async () => {
    process.env.TRYON_LAB_ENABLED = "true";
    const assertConfigured = vi.fn();
    const processRun = vi.fn();
    const service = new JewelleryTryOnLabService(
      { create: vi.fn() } as never,
      { assertConfigured, process: processRun } as never,
      {
        validate: vi.fn().mockResolvedValue({
          canProceed: false,
          outcome: "RETAKE_OR_UPLOAD",
          reasonCode: "JEWELLERY_PERSON_REQUIRED_REGION_NOT_VISIBLE",
          message:
            "Face the camera and keep your neck, shoulders and upper chest visible inside the guide.",
        }),
      } as never,
    );

    let caught: unknown;
    try {
      await service.createRun("user-1", payload());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiErrorException);
    expect((caught as ApiErrorException).getStatus()).toBe(422);
    expect((caught as ApiErrorException).getResponse()).toEqual({
      error: {
        code: "JEWELLERY_PERSON_REQUIRED_REGION_NOT_VISIBLE",
        message:
          "Face the camera and keep your neck, shoulders and upper chest visible inside the guide.",
      },
    });
    expect(assertConfigured).not.toHaveBeenCalled();
    expect(processRun).not.toHaveBeenCalled();
  });
});

function payload() {
  return {
    personImage: uploadedImage("personImage"),
    jewelleryImage: uploadedImage("jewelleryImage"),
    jewelleryType: "NECKLACE" as const,
    personSemanticEvidence: {
      analyzer: "MEDIAPIPE_POSE_LANDMARKER" as const,
      analysisAvailable: true,
      subjectPresent: true,
      requiredRegionVisible: true,
      frontFacing: true,
      relevantRegionUnobstructed: true,
      confidence: 0.9,
    },
  };
}

function uploadedImage(fieldName: "personImage" | "jewelleryImage") {
  return {
    fieldName,
    filename: `${fieldName}.png`,
    mimeType: "image/png" as const,
    sizeBytes: 24,
    buffer: Buffer.alloc(24),
    dataUri: "data:image/png;base64,",
  };
}
