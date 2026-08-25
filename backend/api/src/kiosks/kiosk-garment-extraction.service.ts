import { HttpStatus, Injectable } from "@nestjs/common";
import { type SelfxGarmentIntent } from "@selfx/shared";

import { ApiErrorException } from "../common/api-error.exception.js";
import {
  SELFX_AI_PROVIDER_ERROR_CODES,
  SelfxAiProviderError,
} from "../ai/provider-errors.js";
import { GarmentIntentClassifierService } from "../ai/garment-intent/garment-intent-classifier.service.js";
import { GarmentPreviewService } from "../ai/garment-preview/garment-preview.service.js";
import { type KioskGarmentExtractionPayload } from "./kiosk-garment-extraction.multipart.js";

type ResolvedKioskGarmentIntent = Exclude<SelfxGarmentIntent, "AUTO">;

export interface KioskGarmentExtractionResponse {
  imageDataUri: string;
  mimeType: "image/png";
  garmentIntent: ResolvedKioskGarmentIntent;
}

@Injectable()
export class KioskGarmentExtractionService {
  constructor(
    private readonly preview: GarmentPreviewService,
    private readonly classifier: GarmentIntentClassifierService,
  ) {}

  async extract(
    _device: unknown,
    payload: KioskGarmentExtractionPayload,
  ): Promise<KioskGarmentExtractionResponse> {
    try {
      const garmentIntent = await this.resolveGarmentIntent(payload);
      const preview = await this.preview.generatePreview({
        image: payload.garmentImage,
        garmentIntent,
      });
      return { ...preview, garmentIntent };
    } catch (error) {
      if (error instanceof SelfxAiProviderError) {
        const mapped = mapPreviewError(error);
        throw new ApiErrorException(mapped.status, mapped.code, mapped.message);
      }
      throw new ApiErrorException(
        HttpStatus.BAD_GATEWAY,
        "GARMENT_EXTRACTION_FAILED",
        "SelfX could not prepare the garment image.",
      );
    }
  }

  private async resolveGarmentIntent(
    payload: KioskGarmentExtractionPayload,
  ): Promise<ResolvedKioskGarmentIntent> {
    if (payload.garmentIntent !== "AUTO") {
      return payload.garmentIntent;
    }
    const classification = await this.classifier.classify(payload.garmentImage);
    return classification.intent;
  }
}

function mapPreviewError(error: SelfxAiProviderError): {
  status: HttpStatus;
  code: string;
  message: string;
} {
  switch (error.code) {
    case SELFX_AI_PROVIDER_ERROR_CODES.configurationError:
    case SELFX_AI_PROVIDER_ERROR_CODES.providerAuthFailed:
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: "GARMENT_EXTRACTION_NOT_CONFIGURED",
        message: "Garment extraction is not configured.",
      };
    case SELFX_AI_PROVIDER_ERROR_CODES.invalidImage:
      return {
        status: HttpStatus.BAD_REQUEST,
        code: "GARMENT_EXTRACTION_IMAGE_INVALID",
        message: "SelfX could not use this garment image.",
      };
    case SELFX_AI_PROVIDER_ERROR_CODES.garmentNotDetected:
    case SELFX_AI_PROVIDER_ERROR_CODES.unsupportedInput:
      return {
        status: HttpStatus.BAD_REQUEST,
        code: "GARMENT_EXTRACTION_GARMENT_UNCLEAR",
        message: "SelfX could not identify the garment clearly.",
      };
    case SELFX_AI_PROVIDER_ERROR_CODES.rateLimited:
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: "GARMENT_EXTRACTION_PROVIDER_RATE_LIMITED",
        message: "Garment extraction is temporarily busy.",
      };
    case SELFX_AI_PROVIDER_ERROR_CODES.providerUnavailable:
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: "GARMENT_EXTRACTION_PROVIDER_UNAVAILABLE",
        message: "SelfX could not reach the garment extraction provider.",
      };
    case SELFX_AI_PROVIDER_ERROR_CODES.generationTimeout:
      return {
        status: HttpStatus.GATEWAY_TIMEOUT,
        code: "GARMENT_EXTRACTION_PROVIDER_TIMEOUT",
        message: "Garment extraction timed out.",
      };
    case SELFX_AI_PROVIDER_ERROR_CODES.generationFailed:
    default:
      return {
        status: HttpStatus.BAD_GATEWAY,
        code: "GARMENT_EXTRACTION_PROVIDER_FAILED",
        message: "SelfX could not prepare the garment image.",
      };
  }
}
