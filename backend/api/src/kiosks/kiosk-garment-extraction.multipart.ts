import { HttpStatus } from "@nestjs/common";
import { SELFX_GARMENT_INTENTS, type SelfxGarmentIntent } from "@selfx/shared";
import { type FastifyRequest } from "fastify";

import { ApiErrorException } from "../common/api-error.exception.js";
import {
  type SupportedImageMimeType,
  validateTechnicalImageBuffer,
} from "../common/image-validation.js";
import { TRY_ON_LAB_MAX_IMAGE_BYTES } from "../try-on-lab/try-on-lab.constants.js";

type MultipartPart = Awaited<ReturnType<FastifyRequest["file"]>>;
type MultipartIteratorPart = NonNullable<MultipartPart> | MultipartField;

interface MultipartField {
  type: "field";
  fieldname: string;
  value: unknown;
}

export interface KioskGarmentExtractionImage {
  fieldName: "garmentImage";
  filename: string;
  mimeType: SupportedImageMimeType;
  sizeBytes: number;
  buffer: Buffer;
}

export interface KioskGarmentExtractionPayload {
  garmentImage: KioskGarmentExtractionImage;
  garmentIntent: SelfxGarmentIntent;
}

const KIOSK_GARMENT_EXTRACTION_LIMITS = {
  files: 1,
  fileSize: TRY_ON_LAB_MAX_IMAGE_BYTES,
  fields: 4,
  parts: 6,
} as const;

export async function parseKioskGarmentExtractionMultipartRequest(
  request: FastifyRequest,
): Promise<KioskGarmentExtractionPayload> {
  if (!request.isMultipart()) {
    throwMultipartInvalid("Garment extraction requests must use multipart/form-data.");
  }

  let image: KioskGarmentExtractionImage | undefined;
  const fields = new Map<string, string>();

  try {
    for await (const part of request.parts({
      limits: KIOSK_GARMENT_EXTRACTION_LIMITS,
    }) as AsyncIterable<MultipartIteratorPart>) {
      if (part.type === "file") {
        if (part.fieldname !== "garmentImage") {
          throwMultipartInvalid("Unexpected image field.");
        }
        if (image) {
          throwMultipartInvalid("Duplicate garment image field.");
        }

        const buffer = await part.toBuffer();
        image = validateGarmentImage(part.filename, part.mimetype, buffer);
        continue;
      }

      if (typeof part.value === "string") {
        fields.set(part.fieldname, part.value);
      }
    }
  } catch (error) {
    if (error instanceof ApiErrorException) {
      throw error;
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      String(error.code).includes("FST_REQ_FILE_TOO_LARGE")
    ) {
      throwImageInvalid("Garment image exceeds the supported size limit.");
    }
    throwMultipartInvalid("Garment extraction request could not be processed.");
  }

  if (!image) {
    throwMultipartInvalid("Garment image is required.");
  }

  return {
    garmentImage: image,
    garmentIntent: parseGarmentIntent(fields.get("garmentIntent") ?? "AUTO"),
  };
}

function validateGarmentImage(
  filename: string,
  declaredContentType: string,
  buffer: Buffer,
): KioskGarmentExtractionImage {
  try {
    const metadata = validateTechnicalImageBuffer({
      buffer,
      declaredContentType,
      maxBytes: TRY_ON_LAB_MAX_IMAGE_BYTES,
    });
    return {
      fieldName: "garmentImage",
      filename,
      mimeType: metadata.mimeType,
      sizeBytes: metadata.sizeBytes,
      buffer,
    };
  } catch {
    throwImageInvalid("Garment image is not a supported image file.");
  }
}

function parseGarmentIntent(value: string): SelfxGarmentIntent {
  if ((SELFX_GARMENT_INTENTS as readonly string[]).includes(value)) {
    return value as SelfxGarmentIntent;
  }
  throwMultipartInvalid("Invalid garment intent.");
}

function throwImageInvalid(message: string): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    "GARMENT_EXTRACTION_IMAGE_INVALID",
    message,
  );
}

function throwMultipartInvalid(message: string): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    "GARMENT_EXTRACTION_MULTIPART_INVALID",
    message,
  );
}
