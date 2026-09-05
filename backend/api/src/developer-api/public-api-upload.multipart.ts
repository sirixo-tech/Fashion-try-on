import { HttpStatus } from "@nestjs/common";
import { type FastifyRequest } from "fastify";

import { ApiErrorException } from "../common/api-error.exception.js";
import {
  TechnicalImageValidationError,
  type SupportedImageMimeType,
  validateTechnicalImageBuffer,
} from "../common/image-validation.js";
import {
  publicApiUploadPurposeOptions,
  type PublicApiUploadPurpose,
} from "./dto/public-api-upload.dto.js";

type MultipartPart = Awaited<ReturnType<FastifyRequest["file"]>>;
type MultipartIteratorPart = NonNullable<MultipartPart> | MultipartField;

interface MultipartField {
  type: "field";
  fieldname: string;
  value: unknown;
}

export const PUBLIC_API_UPLOAD_MAX_IMAGE_BYTES = 50 * 1024 * 1024;

export interface PublicApiUploadImage {
  fieldName: "image";
  filename: string;
  mimeType: SupportedImageMimeType;
  sizeBytes: number;
  width: number;
  height: number;
  buffer: Buffer;
}

export interface PublicApiUploadPayload {
  purpose: PublicApiUploadPurpose;
  sessionId?: string;
  image: PublicApiUploadImage;
}

interface PublicApiUploadMultipartOptions {
  maxImageBytes?: number;
}

export async function parsePublicApiUploadMultipartRequest(
  request: FastifyRequest,
  options: PublicApiUploadMultipartOptions = {},
): Promise<PublicApiUploadPayload> {
  if (!request.isMultipart()) {
    throwMultipartInvalid("Public API uploads must use multipart/form-data.");
  }

  let image: PublicApiUploadImage | undefined;
  const fields = new Map<string, string>();
  const maxImageBytes =
    options.maxImageBytes ?? PUBLIC_API_UPLOAD_MAX_IMAGE_BYTES;

  try {
    for await (const part of request.parts({
      limits: {
        files: 1,
        fileSize: maxImageBytes,
        fields: 8,
        parts: 10,
      },
    }) as AsyncIterable<MultipartIteratorPart>) {
      if (part.type === "file") {
        if (part.fieldname !== "image") {
          throwMultipartInvalid("Unexpected image field.");
        }
        if (image) {
          throwMultipartInvalid("Duplicate image field.");
        }

        const buffer = await part.toBuffer();
        image = validateUploadImage(
          part.filename,
          part.mimetype,
          buffer,
          maxImageBytes,
        );
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
    if (isMultipartLimitError(error)) {
      throwImageInvalid("Image exceeds the supported size limit.");
    }
    throwMultipartInvalid("Public API upload request could not be processed.");
  }

  if (!image) {
    throwMultipartInvalid("Image is required.");
  }

  return {
    purpose: parsePurpose(fields.get("purpose")),
    sessionId: parseOptionalSessionId(fields.get("sessionId")),
    image,
  };
}

function validateUploadImage(
  filename: string,
  declaredContentType: string,
  buffer: Buffer,
  maxImageBytes: number,
): PublicApiUploadImage {
  try {
    const metadata = validateTechnicalImageBuffer({
      buffer,
      declaredContentType,
      maxBytes: maxImageBytes,
    });
    return {
      fieldName: "image",
      filename,
      mimeType: metadata.mimeType,
      sizeBytes: metadata.sizeBytes,
      width: metadata.width,
      height: metadata.height,
      buffer,
    };
  } catch (error) {
    const reason =
      error instanceof TechnicalImageValidationError ? ` ${error.message}` : "";
    throwImageInvalid(`Image is not a supported image file.${reason}`);
  }
}

function parsePurpose(value: string | undefined): PublicApiUploadPurpose {
  const normalized = value?.trim().toUpperCase();
  if (
    normalized &&
    publicApiUploadPurposeOptions.includes(normalized as PublicApiUploadPurpose)
  ) {
    return normalized as PublicApiUploadPurpose;
  }
  throwMultipartInvalid("Upload purpose must be PERSON, GARMENT or JEWELLERY.");
}

function parseOptionalSessionId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalized,
    )
  ) {
    return normalized;
  }
  throwMultipartInvalid("Session ID must be a valid UUID.");
}

function isMultipartLimitError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    String(error.code).includes("FST_REQ_FILE_TOO_LARGE"),
  );
}

function throwImageInvalid(message: string): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    "PUBLIC_API_UPLOAD_IMAGE_INVALID",
    message,
  );
}

function throwMultipartInvalid(message: string): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    "PUBLIC_API_UPLOAD_MULTIPART_INVALID",
    message,
  );
}
