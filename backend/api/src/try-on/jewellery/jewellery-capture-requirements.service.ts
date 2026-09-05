import { Injectable } from "@nestjs/common";

import type {
  SelfxJewelleryCaptureChannel,
  SelfxJewelleryCaptureRequirements,
  SelfxJewelleryPersonInputMethod,
  SelfxJewelleryType,
} from "@selfx/shared";

type JewelleryCapturePolicy = Omit<
  SelfxJewelleryCaptureRequirements,
  | "schemaVersion"
  | "tryOnVertical"
  | "jewelleryType"
  | "channel"
  | "productId"
  | "personInputMethods"
>;

const commonImageChecks = [
  "TECHNICAL_IMAGE_VALIDITY",
  "MINIMUM_RESOLUTION",
  "SHARPNESS",
  "EXPOSURE",
  "CAPTURE_SUBJECT_PRESENT",
  "REQUIRED_REGION_VISIBLE",
] as const;

const capturePolicies: Record<SelfxJewelleryType, JewelleryCapturePolicy> = {
  RING: {
    targetRegion: "HAND",
    guide: "HAND_CLOSE_UP",
    title: "Show your hand clearly",
    instruction:
      "Keep your hand open, steady and fully visible inside the guide.",
    checklist: [
      "Keep every finger visible.",
      "Remove anything covering the target finger.",
      "Use even lighting without strong shadows.",
    ],
    requiredChecks: [...commonImageChecks, "RELEVANT_REGION_UNOBSTRUCTED"],
  },
  BRACELET: {
    targetRegion: "WRIST_AND_LOWER_FOREARM",
    guide: "WRIST_CLOSE_UP",
    title: "Show your wrist clearly",
    instruction:
      "Keep your wrist and lower forearm steady and fully visible inside the guide.",
    checklist: [
      "Keep the wrist facing the camera.",
      "Remove anything covering the wrist.",
      "Use even lighting without strong shadows.",
    ],
    requiredChecks: [...commonImageChecks, "RELEVANT_REGION_UNOBSTRUCTED"],
  },
  NECKLACE: {
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
      ...commonImageChecks,
      "FRONT_FACING",
      "RELEVANT_REGION_UNOBSTRUCTED",
    ],
  },
  EARRING: {
    targetRegion: "FACE_AND_EARS",
    guide: "FACE_AND_EARS",
    title: "Keep your face and ears visible",
    instruction:
      "Face the camera directly and keep both ears clearly visible inside the guide.",
    checklist: [
      "Look directly toward the camera.",
      "Move hair and accessories away from both ears.",
      "Use even lighting across the face and ears.",
    ],
    requiredChecks: [
      ...commonImageChecks,
      "FRONT_FACING",
      "RELEVANT_REGION_UNOBSTRUCTED",
    ],
  },
};

@Injectable()
export class JewelleryCaptureRequirementsService {
  resolve(
    jewelleryType: SelfxJewelleryType,
    channel: SelfxJewelleryCaptureChannel,
    productId?: string,
  ): SelfxJewelleryCaptureRequirements {
    const policy = capturePolicies[jewelleryType];

    return {
      schemaVersion: 1,
      tryOnVertical: "JEWELLERY",
      jewelleryType,
      channel,
      ...(productId ? { productId } : {}),
      personInputMethods: personInputMethods(channel),
      targetRegion: policy.targetRegion,
      guide: policy.guide,
      title: policy.title,
      instruction: policy.instruction,
      checklist: [...policy.checklist],
      requiredChecks: [...policy.requiredChecks],
    };
  }
}

function personInputMethods(
  channel: SelfxJewelleryCaptureChannel,
): SelfxJewelleryPersonInputMethod[] {
  switch (channel) {
    case "KIOSK":
      return ["CAPTURE"];
    case "WEB":
    case "MOBILE":
      return ["CAPTURE", "UPLOAD"];
    case "PUBLIC_API":
    case "TRY_ON_LAB":
      return ["UPLOAD"];
  }
}
