import { Injectable } from "@nestjs/common";
import sharp from "sharp";

import type {
  SelfxGarmentPreprocessingProviderInputImage,
  SelfxGarmentPreprocessingStatus,
} from "@selfx/shared";

import {
  readGarmentMaskGenerationEnabled,
  readGarmentPreprocessingEnabled,
} from "./providers/virtual-try-on.config.js";

export type GarmentPreprocessingStatus = SelfxGarmentPreprocessingStatus;

export type GarmentPreprocessingProviderInputImage =
  SelfxGarmentPreprocessingProviderInputImage;

type SupportedGarmentMimeType = "image/jpeg" | "image/png" | "image/webp";

const GARMENT_PREPROCESSING_MAX_DIMENSION = 2048;
const GARMENT_PREPROCESSING_JPEG_QUALITY = 90;

export interface GarmentPreprocessingInput {
  garmentImageDataUri: string;
}

export interface GarmentPreprocessingResult {
  originalGarmentImageDataUri: string;
  providerGarmentImageDataUri: string;
  preprocessingEnabled: boolean;
  status: GarmentPreprocessingStatus;
  providerInputImage: GarmentPreprocessingProviderInputImage;
  maskImageDataUri?: string;
  fallbackReason?: string;
}

export interface GarmentPreprocessingTelemetry {
  enabled: boolean;
  status: GarmentPreprocessingStatus;
  providerInputImage: GarmentPreprocessingProviderInputImage;
  maskGenerated: boolean;
  fallbackReason?: string;
}

@Injectable()
export class GarmentPreprocessingService {
  async prepare(
    input: GarmentPreprocessingInput,
  ): Promise<GarmentPreprocessingResult> {
    if (!this.preprocessingEnabled()) {
      return this.originalResult(input, "DISABLED");
    }

    try {
      return await this.prepareEnabled(input);
    } catch {
      return this.originalResult(
        input,
        "FALLBACK",
        "Garment preprocessing failed; original garment image was used.",
      );
    }
  }

  protected async prepareEnabled(
    input: GarmentPreprocessingInput,
  ): Promise<GarmentPreprocessingResult> {
    const parsed = parseImageDataUri(input.garmentImageDataUri);
    const metadata = await sharp(parsed.buffer, { failOn: "error" }).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("Garment image dimensions are unavailable.");
    }

    const normalized = await normalizeGarmentImage(parsed.buffer, metadata);
    const maskImageDataUri = await this.safePlaceholderMask(normalized);
    return {
      originalGarmentImageDataUri: input.garmentImageDataUri,
      providerGarmentImageDataUri: dataUriFor(
        normalized.mimeType,
        normalized.buffer,
      ),
      ...(maskImageDataUri ? { maskImageDataUri } : {}),
      preprocessingEnabled: true,
      status: "NORMALIZED",
      providerInputImage: "PREPROCESSED",
    };
  }

  protected preprocessingEnabled(): boolean {
    return readGarmentPreprocessingEnabled();
  }

  protected maskGenerationEnabled(): boolean {
    return readGarmentMaskGenerationEnabled();
  }

  private async safePlaceholderMask(input: {
    width: number;
    height: number;
  }): Promise<string | undefined> {
    if (!this.maskGenerationEnabled()) {
      return undefined;
    }

    try {
      const buffer = await createPlaceholderMaskPng(input.width, input.height);
      return dataUriFor("image/png", buffer);
    } catch {
      return undefined;
    }
  }

  private originalResult(
    input: GarmentPreprocessingInput,
    status: GarmentPreprocessingStatus,
    fallbackReason?: string,
  ): GarmentPreprocessingResult {
    return {
      originalGarmentImageDataUri: input.garmentImageDataUri,
      providerGarmentImageDataUri: input.garmentImageDataUri,
      preprocessingEnabled: status !== "DISABLED",
      status,
      providerInputImage: "ORIGINAL",
      fallbackReason,
    };
  }
}

export function garmentPreprocessingTelemetry(
  result: GarmentPreprocessingResult,
): GarmentPreprocessingTelemetry {
  const telemetry: GarmentPreprocessingTelemetry = {
    enabled: result.preprocessingEnabled,
    status: result.status,
    providerInputImage: result.providerInputImage,
    maskGenerated:
      typeof result.maskImageDataUri === "string" &&
      result.maskImageDataUri.trim().length > 0,
  };
  if (result.fallbackReason) {
    telemetry.fallbackReason = result.fallbackReason;
  }

  return telemetry;
}

function parseImageDataUri(dataUri: string): {
  mimeType: SupportedGarmentMimeType;
  buffer: Buffer;
} {
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/u.exec(
      dataUri.trim(),
    );
  if (!match) {
    throw new Error("Garment image data URI is invalid.");
  }

  const mimeType = match[1] as SupportedGarmentMimeType;
  const buffer = Buffer.from(
    (match[2] ?? "").replaceAll(/\s/gu, ""),
    "base64",
  );
  if (buffer.length === 0) {
    throw new Error("Garment image data URI is empty.");
  }

  return { mimeType, buffer };
}

async function normalizeGarmentImage(
  buffer: Buffer,
  metadata: sharp.Metadata,
): Promise<{
  mimeType: "image/jpeg" | "image/png";
  buffer: Buffer;
  width: number;
  height: number;
}> {
  const pipeline = sharp(buffer, { failOn: "error" })
    .rotate()
    .resize({
      width: GARMENT_PREPROCESSING_MAX_DIMENSION,
      height: GARMENT_PREPROCESSING_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });

  if (metadata.hasAlpha) {
    const output = await pipeline
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        force: true,
      })
      .toBuffer({ resolveWithObject: true });
    return {
      mimeType: "image/png",
      buffer: output.data,
      width: output.info.width,
      height: output.info.height,
    };
  }

  const output = await pipeline
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({
      quality: GARMENT_PREPROCESSING_JPEG_QUALITY,
      mozjpeg: true,
      force: true,
    })
    .toBuffer({ resolveWithObject: true });

  return {
    mimeType: "image/jpeg",
    buffer: output.data,
    width: output.info.width,
    height: output.info.height,
  };
}

async function createPlaceholderMaskPng(
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png({
      compressionLevel: 9,
      force: true,
    })
    .toBuffer();
}

function dataUriFor(mimeType: string, buffer: Buffer): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
