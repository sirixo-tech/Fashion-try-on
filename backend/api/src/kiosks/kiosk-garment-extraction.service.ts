import { HttpStatus, Injectable } from "@nestjs/common";

import { ApiErrorException } from "../common/api-error.exception.js";
import {
  GarmentExtractionProvider,
  GarmentExtractionProviderError,
} from "./garment-extraction.provider.js";
import {
  type KioskGarmentExtractionPayload,
} from "./kiosk-garment-extraction.multipart.js";

export interface KioskGarmentExtractionResponse {
  imageDataUri: string;
  mimeType: "image/png";
}

@Injectable()
export class KioskGarmentExtractionService {
  constructor(private readonly provider: GarmentExtractionProvider) {}

  async extract(
    _device: unknown,
    payload: KioskGarmentExtractionPayload,
  ): Promise<KioskGarmentExtractionResponse> {
    try {
      return await this.provider.extract({
        garmentImage: payload.garmentImage,
        garmentIntent: payload.garmentIntent,
      });
    } catch (error) {
      if (error instanceof GarmentExtractionProviderError) {
        throw new ApiErrorException(
          error.status as HttpStatus,
          error.code,
          error.message,
        );
      }
      throw new ApiErrorException(
        HttpStatus.BAD_GATEWAY,
        "GARMENT_EXTRACTION_FAILED",
        "SelfX could not prepare the garment image.",
      );
    }
  }
}
