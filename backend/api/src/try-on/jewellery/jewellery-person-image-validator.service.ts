import { Injectable } from "@nestjs/common";

import type {
  SelfxJewelleryCaptureRequirements,
  SelfxJewelleryPersonPreflightReasonCode,
  SelfxJewelleryPersonPreflightResult,
  SelfxJewelleryPersonSemanticEvidence,
  SelfxJewelleryType,
} from "@selfx/shared";

import {
  TechnicalImageValidationError,
  validateTechnicalImageBuffer,
  type SupportedImageMimeType,
} from "../../common/image-validation.js";
import { TRY_ON_LAB_MAX_IMAGE_BYTES } from "../../try-on-lab/try-on-lab.constants.js";
import { JewelleryCaptureRequirementsService } from "./jewellery-capture-requirements.service.js";

export interface JewelleryPersonImageValidationInput {
  buffer: Buffer;
  declaredContentType: SupportedImageMimeType;
  jewelleryType: SelfxJewelleryType;
  channel: "KIOSK" | "WEB" | "MOBILE" | "PUBLIC_API" | "TRY_ON_LAB";
  semanticEvidence: SelfxJewelleryPersonSemanticEvidence;
}

@Injectable()
export class JewelleryPersonImageValidatorService {
  constructor(
    private readonly requirements: JewelleryCaptureRequirementsService,
  ) {}

  async validate(
    input: JewelleryPersonImageValidationInput,
  ): Promise<SelfxJewelleryPersonPreflightResult> {
    try {
      validateTechnicalImageBuffer({
        buffer: input.buffer,
        declaredContentType: input.declaredContentType,
        maxBytes: TRY_ON_LAB_MAX_IMAGE_BYTES,
      });
    } catch (error) {
      if (error instanceof TechnicalImageValidationError) {
        return reject(
          "JEWELLERY_PERSON_IMAGE_INVALID",
          "Use a valid JPEG, PNG or WebP photo and try again.",
        );
      }
      throw error;
    }

    const requirements = this.requirements.resolve(
      input.jewelleryType,
      input.channel,
    );
    return validateSemanticEvidence(requirements, input.semanticEvidence);
  }
}

function validateSemanticEvidence(
  requirements: SelfxJewelleryCaptureRequirements,
  evidence: SelfxJewelleryPersonSemanticEvidence,
): SelfxJewelleryPersonPreflightResult {
  const expectedAnalyzer =
    requirements.jewelleryType === "RING" ||
    requirements.jewelleryType === "BRACELET"
      ? "MEDIAPIPE_HAND_LANDMARKER"
      : "MEDIAPIPE_POSE_LANDMARKER";
  if (evidence.analyzer !== expectedAnalyzer) {
    return reject(
      "JEWELLERY_PERSON_ANALYSIS_UNAVAILABLE",
      "We could not verify this photo. Retake it or upload another photo.",
    );
  }
  if (!evidence.analysisAvailable) {
    return reject(
      "JEWELLERY_PERSON_ANALYSIS_UNAVAILABLE",
      "We could not verify this photo. Retake it or upload another photo.",
    );
  }
  if (!evidence.subjectPresent) {
    return reject(
      "JEWELLERY_PERSON_SUBJECT_NOT_DETECTED",
      subjectNotDetectedMessage(requirements.jewelleryType),
    );
  }
  if (evidence.confidence === null || evidence.confidence < 0.55) {
    return reject(
      "JEWELLERY_PERSON_ANALYSIS_UNAVAILABLE",
      "We could not verify this photo. Retake it or upload another photo.",
    );
  }
  if (!evidence.requiredRegionVisible) {
    return reject(
      "JEWELLERY_PERSON_REQUIRED_REGION_NOT_VISIBLE",
      requirements.instruction,
    );
  }
  if (
    requirements.requiredChecks.includes("FRONT_FACING") &&
    evidence.frontFacing !== true
  ) {
    return reject(
      "JEWELLERY_PERSON_NOT_FRONT_FACING",
      "Face the camera directly and retake the photo.",
    );
  }
  if (
    requirements.requiredChecks.includes("RELEVANT_REGION_UNOBSTRUCTED") &&
    evidence.relevantRegionUnobstructed !== true
  ) {
    return reject(
      "JEWELLERY_PERSON_REGION_OBSTRUCTED",
      obstructedRegionMessage(requirements.jewelleryType),
    );
  }

  return { canProceed: true, outcome: "PROCEED" };
}

function reject(
  reasonCode: SelfxJewelleryPersonPreflightReasonCode,
  message: string,
): SelfxJewelleryPersonPreflightResult {
  return {
    canProceed: false,
    outcome: "RETAKE_OR_UPLOAD",
    reasonCode,
    message,
  };
}

function subjectNotDetectedMessage(type: SelfxJewelleryType): string {
  return type === "RING" || type === "BRACELET"
    ? "Keep your hand and wrist clearly visible and try again."
    : "Keep your face clearly visible and try again.";
}

function obstructedRegionMessage(type: SelfxJewelleryType): string {
  switch (type) {
    case "RING":
      return "Remove anything covering your fingers and retake the photo.";
    case "BRACELET":
      return "Remove anything covering your wrist and retake the photo.";
    case "NECKLACE":
      return "Move hair or clothing away from your neckline and retake the photo.";
    case "EARRING":
      return "Move hair and accessories away from both ears and retake the photo.";
  }
}
