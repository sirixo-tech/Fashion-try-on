import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  SELFX_AI_PROVIDER_ERROR_CODES,
  SelfxAiProviderError,
} from "../ai/provider-errors.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import type { KioskGarmentExtractionPayload } from "./kiosk-garment-extraction.multipart.js";
import { KioskGarmentExtractionService } from "./kiosk-garment-extraction.service.js";

describe("KioskGarmentExtractionService", () => {
  it("preserves the existing kiosk garment extraction response contract", async () => {
    const service = new KioskGarmentExtractionService(
      new FakePreviewService() as never,
    );

    await expect(service.extract({}, payload())).resolves.toEqual({
      imageDataUri: "data:image/png;base64,cHJldmlldw==",
      mimeType: "image/png",
    });
  });

  it("maps normalized preview provider errors to existing public extraction errors", async () => {
    const service = new KioskGarmentExtractionService(
      new FakePreviewService(
        new SelfxAiProviderError(
          SELFX_AI_PROVIDER_ERROR_CODES.invalidImage,
          "provider detail",
          HttpStatus.BAD_REQUEST,
        ),
      ) as never,
    );

    let thrown: unknown;
    try {
      await service.extract({}, payload());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiErrorException);
    expect((thrown as ApiErrorException).getResponse()).toMatchObject({
      error: {
        code: "GARMENT_EXTRACTION_IMAGE_INVALID",
        message: "SelfX could not use this garment image.",
      },
    });
  });
});

class FakePreviewService {
  constructor(private readonly error?: Error) {}

  async generatePreview() {
    if (this.error) {
      throw this.error;
    }

    return {
      imageDataUri: "data:image/png;base64,cHJldmlldw==",
      mimeType: "image/png" as const,
    };
  }
}

function payload(): KioskGarmentExtractionPayload {
  return {
    garmentIntent: "TOP",
    garmentImage: {
      fieldName: "garmentImage",
      filename: "garment.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 7,
      buffer: Buffer.from("garment"),
    },
  };
}
