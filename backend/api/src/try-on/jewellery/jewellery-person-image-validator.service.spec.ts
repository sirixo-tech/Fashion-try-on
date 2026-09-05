import { describe, expect, it } from "vitest";

import type { SelfxJewelleryPersonSemanticEvidence } from "@selfx/shared";

import { JewelleryCaptureRequirementsService } from "./jewellery-capture-requirements.service.js";
import { JewelleryPersonImageValidatorService } from "./jewellery-person-image-validator.service.js";

describe("JewelleryPersonImageValidatorService", () => {
  it("allows a clear necklace image with the required semantic evidence", async () => {
    const validator = createValidator();

    await expect(
      validator.validate({
        ...baseInput(),
        jewelleryType: "NECKLACE",
        semanticEvidence: poseEvidence(),
      }),
    ).resolves.toEqual({ canProceed: true, outcome: "PROCEED" });
  });

  it("allows a small but technically valid image when framing passes", async () => {
    const validator = createValidator();

    await expect(
      validator.validate({
        ...baseInput(96, 96),
        jewelleryType: "NECKLACE",
        semanticEvidence: poseEvidence(),
      }),
    ).resolves.toEqual({ canProceed: true, outcome: "PROCEED" });
  });

  it("rejects an invalid image file", async () => {
    const validator = createValidator();

    await expect(
      validator.validate({
        ...baseInput(),
        buffer: Buffer.from("not an image"),
        jewelleryType: "NECKLACE",
        semanticEvidence: poseEvidence(),
      }),
    ).resolves.toMatchObject({
      canProceed: false,
      reasonCode: "JEWELLERY_PERSON_IMAGE_INVALID",
    });
  });

  it("rejects an earring photo when both ears are not visible", async () => {
    const validator = createValidator();

    const result = await validator.validate({
      ...baseInput(),
      jewelleryType: "EARRING",
      semanticEvidence: {
        ...poseEvidence(),
        requiredRegionVisible: false,
      },
    });

    expect(result).toMatchObject({
      canProceed: false,
      reasonCode: "JEWELLERY_PERSON_REQUIRED_REGION_NOT_VISIBLE",
    });
  });

  it("rejects semantic evidence from the wrong analyzer", async () => {
    const validator = createValidator();

    const result = await validator.validate({
      ...baseInput(),
      jewelleryType: "RING",
      semanticEvidence: poseEvidence(),
    });

    expect(result).toMatchObject({
      canProceed: false,
      reasonCode: "JEWELLERY_PERSON_ANALYSIS_UNAVAILABLE",
    });
  });

  it("returns a subject correction when analysis ran but found no person", async () => {
    const validator = createValidator();

    const result = await validator.validate({
      ...baseInput(),
      jewelleryType: "NECKLACE",
      semanticEvidence: {
        ...poseEvidence(),
        subjectPresent: false,
        requiredRegionVisible: false,
        confidence: 0,
      },
    });

    expect(result).toMatchObject({
      canProceed: false,
      reasonCode: "JEWELLERY_PERSON_SUBJECT_NOT_DETECTED",
      message: "Keep your face clearly visible and try again.",
    });
  });
});

function createValidator() {
  return new JewelleryPersonImageValidatorService(
    new JewelleryCaptureRequirementsService(),
  );
}

function baseInput(width = 640, height = 800) {
  return {
    buffer: validPngHeader(width, height),
    declaredContentType: "image/png" as const,
    channel: "TRY_ON_LAB" as const,
  };
}

function poseEvidence(): SelfxJewelleryPersonSemanticEvidence {
  return {
    analyzer: "MEDIAPIPE_POSE_LANDMARKER",
    analysisAvailable: true,
    subjectPresent: true,
    requiredRegionVisible: true,
    frontFacing: true,
    relevantRegionUnobstructed: true,
    confidence: 0.9,
  };
}

function validPngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}
