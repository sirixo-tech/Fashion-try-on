import { describe, expect, it } from "vitest";

import { JewelleryCaptureRequirementsService } from "./jewellery-capture-requirements.service.js";

describe("JewelleryCaptureRequirementsService", () => {
  const service = new JewelleryCaptureRequirementsService();

  it("returns necklace-specific kiosk guidance for a selected product", () => {
    expect(service.resolve("NECKLACE", "KIOSK", "product-1")).toEqual({
      schemaVersion: 1,
      tryOnVertical: "JEWELLERY",
      jewelleryType: "NECKLACE",
      channel: "KIOSK",
      productId: "product-1",
      personInputMethods: ["CAPTURE"],
      targetRegion: "NECK_SHOULDERS_AND_UPPER_CHEST",
      guide: "NECK_AND_UPPER_CHEST",
      title: "Keep your neckline visible",
      instruction:
        "Face the camera and keep your neck, shoulders and upper chest visible inside the guide.",
      checklist: [
        "Look directly toward the camera.",
        "Move hair or clothing away from the neckline.",
        "Use even lighting across the face and neck.",
      ],
      requiredChecks: [
        "TECHNICAL_IMAGE_VALIDITY",
        "MINIMUM_RESOLUTION",
        "SHARPNESS",
        "EXPOSURE",
        "CAPTURE_SUBJECT_PRESENT",
        "REQUIRED_REGION_VISIBLE",
        "FRONT_FACING",
        "RELEVANT_REGION_UNOBSTRUCTED",
      ],
    });
  });

  it("allows capture or upload on customer web while the Lab remains upload-only", () => {
    expect(service.resolve("RING", "WEB").personInputMethods).toEqual([
      "CAPTURE",
      "UPLOAD",
    ]);
    expect(service.resolve("EARRING", "TRY_ON_LAB").personInputMethods).toEqual(
      ["UPLOAD"],
    );
  });

  it.each([
    ["RING", "HAND", "HAND_CLOSE_UP"],
    ["BRACELET", "WRIST_AND_LOWER_FOREARM", "WRIST_CLOSE_UP"],
    ["NECKLACE", "NECK_SHOULDERS_AND_UPPER_CHEST", "NECK_AND_UPPER_CHEST"],
    ["EARRING", "FACE_AND_EARS", "FACE_AND_EARS"],
  ] as const)(
    "maps %s to its required region and guide",
    (jewelleryType, targetRegion, guide) => {
      const requirements = service.resolve(jewelleryType, "MOBILE");

      expect(requirements.targetRegion).toBe(targetRegion);
      expect(requirements.guide).toBe(guide);
    },
  );
});
