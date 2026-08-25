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
      new FakeClassifierService() as never,
    );

    await expect(service.extract({}, payload())).resolves.toEqual({
      imageDataUri: "data:image/png;base64,cHJldmlldw==",
      mimeType: "image/png",
      garmentIntent: "TOP",
    });
  });

  it("classifies automatic kiosk garment captures before preview generation", async () => {
    const preview = new FakePreviewService();
    const service = new KioskGarmentExtractionService(
      preview as never,
      new FakeClassifierService("BOTTOM") as never,
    );

    await expect(
      service.extract({}, payload({ garmentIntent: "AUTO" })),
    ).resolves.toMatchObject({
      garmentIntent: "BOTTOM",
    });
    expect(preview.lastIntent).toBe("BOTTOM");
  });

  it("maps failed automatic classification to a garment-specific image error", async () => {
    const service = new KioskGarmentExtractionService(
      new FakePreviewService() as never,
      new FakeClassifierService(
        new SelfxAiProviderError(
          SELFX_AI_PROVIDER_ERROR_CODES.garmentNotDetected,
          "unclear",
          HttpStatus.BAD_REQUEST,
        ),
      ) as never,
    );

    let thrown: unknown;
    try {
      await service.extract({}, payload({ garmentIntent: "AUTO" }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiErrorException);
    expect((thrown as ApiErrorException).getResponse()).toMatchObject({
      error: {
        code: "GARMENT_EXTRACTION_GARMENT_UNCLEAR",
        message: "SelfX could not identify the garment clearly.",
      },
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
      new FakeClassifierService() as never,
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

  lastIntent?: string;

  async generatePreview(input: { garmentIntent: string }) {
    this.lastIntent = input.garmentIntent;
    if (this.error) {
      throw this.error;
    }

    return {
      imageDataUri: "data:image/png;base64,cHJldmlldw==",
      mimeType: "image/png" as const,
    };
  }
}

class FakeClassifierService {
  constructor(private readonly result: "TOP" | "BOTTOM" | Error = "TOP") {}

  async classify() {
    if (this.result instanceof Error) {
      throw this.result;
    }
    return { intent: this.result, confidence: 0.9 };
  }
}

function payload(
  overrides: Partial<KioskGarmentExtractionPayload> = {},
): KioskGarmentExtractionPayload {
  return {
    garmentIntent: overrides.garmentIntent ?? "TOP",
    garmentImage: {
      fieldName: "garmentImage",
      filename: "garment.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 7,
      buffer: Buffer.from("garment"),
    },
  };
}
