import { HttpStatus } from "@nestjs/common";
import { type FastifyRequest } from "fastify";

import {
  IMAGE_QUALITY_ISSUE_CODES,
  SELFX_GARMENT_ANALYSIS_REASON_CODES,
  SELFX_GARMENT_BODY_COVERAGES,
  SELFX_GARMENT_CATEGORIES,
  SELFX_GARMENT_PHOTO_TYPES,
  SELFX_GARMENT_INTENTS,
  SELFX_GARMENT_SOURCES,
  SELFX_GENERATION_PROFILES,
  SELFX_GENERATION_POLICY_RESOLUTION_SOURCES,
  TRY_ON_LAB_ERROR_CODES,
  type SelfxGarmentAnalysisReasonCode,
  type SelfxGarmentBodyCoverage,
  type ImageQualityIssueCode,
  type SelfxGarmentCategory,
  type SelfxGarmentIntent,
  type SelfxGarmentPhotoType,
  type SelfxGarmentSource,
  type SelfxGenerationProfile,
  type SelfxGenerationPolicyResolutionSource,
} from "@selfx/shared";

import { ApiErrorException } from "../common/api-error.exception.js";
import {
  TRY_ON_LAB_MAX_IMAGE_BYTES,
  TRY_ON_LAB_MULTIPART_LIMITS,
} from "./try-on-lab.constants.js";

type MultipartPart = Awaited<ReturnType<FastifyRequest["file"]>>;
type MultipartIteratorPart = NonNullable<MultipartPart> | MultipartField;

interface MultipartField {
  type: "field";
  fieldname: string;
  value: unknown;
}

export interface TryOnLabUploadedImage {
  fieldName: "personImage" | "garmentImage";
  filename: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  buffer: Buffer;
  dataUri: string;
}

export interface CreateTryOnLabRunPayload {
  personImage: TryOnLabUploadedImage;
  garmentImage: TryOnLabUploadedImage;
  garmentSource: SelfxGarmentSource;
  garmentIntent: SelfxGarmentIntent;
  category: SelfxGarmentCategory;
  garmentPhotoType: SelfxGarmentPhotoType;
  generationProfile: SelfxGenerationProfile;
  categoryResolutionSource: SelfxGenerationPolicyResolutionSource;
  photoTypeResolutionSource: SelfxGenerationPolicyResolutionSource;
  profileResolutionSource: SelfxGenerationPolicyResolutionSource;
  analysisConfidence?: number;
  disambiguationRequired: boolean;
  disambiguationResolved: boolean;
  garmentAnalysisBodyCoverage?: SelfxGarmentBodyCoverage;
  garmentAnalysisReasonCodes: SelfxGarmentAnalysisReasonCode[];
  qualityWarningCodes: ImageQualityIssueCode[];
  qualityOverrideAccepted: boolean;
}

export async function parseTryOnLabMultipartRequest(
  request: FastifyRequest,
): Promise<CreateTryOnLabRunPayload> {
  if (!request.isMultipart()) {
    throwImageInvalid("Try-On Lab requests must use multipart/form-data.");
  }

  const images = new Map<string, TryOnLabUploadedImage>();
  const fields = new Map<string, string>();

  try {
    for await (const part of request.parts({
      limits: TRY_ON_LAB_MULTIPART_LIMITS,
    }) as AsyncIterable<MultipartIteratorPart>) {
      if (part.type === "file") {
        if (
          part.fieldname !== "personImage" &&
          part.fieldname !== "garmentImage"
        ) {
          throwMultipartInvalid("Unexpected image field.");
        }
        if (images.has(part.fieldname)) {
          throwMultipartInvalid("Duplicate image field.");
        }

        const buffer = await part.toBuffer();
        images.set(
          part.fieldname,
          validateUploadedImage(
            part.fieldname,
            part.filename,
            part.mimetype,
            buffer,
          ),
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
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      String(error.code).includes("FST_REQ_FILE_TOO_LARGE")
    ) {
      throwImageInvalid(
        "One or more images exceeds the Try-On Lab size limit.",
      );
    }
    if (isMultipartLimitError(error)) {
      throwMultipartInvalid(
        "Try-On Lab multipart request exceeds the supported image or metadata limits.",
      );
    }
    throwMultipartInvalid(
      "Try-On Lab multipart request could not be processed.",
    );
  }

  const personImage = images.get("personImage");
  const garmentImage = images.get("garmentImage");
  if (!personImage || !garmentImage) {
    throwMultipartInvalid("Both person and garment images are required.");
  }

  return {
    personImage,
    garmentImage,
    garmentSource: parseEnum(
      fields.get("garmentSource") ?? "DIRECT_UPLOAD",
      SELFX_GARMENT_SOURCES,
      "Invalid garment source.",
    ),
    garmentIntent: parseEnum(
      fields.get("garmentIntent") ?? fields.get("category") ?? "AUTO",
      SELFX_GARMENT_INTENTS,
      "Invalid garment intent.",
    ),
    category: parseEnum(
      fields.get("category") ?? "AUTO",
      SELFX_GARMENT_CATEGORIES,
      "Invalid garment category.",
    ),
    garmentPhotoType: parseEnum(
      fields.get("garmentPhotoType") ?? "AUTO",
      SELFX_GARMENT_PHOTO_TYPES,
      "Invalid garment photo type.",
    ),
    generationProfile: parseEnum(
      fields.get("generationProfile") ?? "BALANCED",
      SELFX_GENERATION_PROFILES,
      "Invalid generation profile.",
    ),
    categoryResolutionSource: parseEnum(
      fields.get("categoryResolutionSource") ?? "AUTO_FALLBACK",
      SELFX_GENERATION_POLICY_RESOLUTION_SOURCES,
      "Invalid category resolution source.",
    ),
    photoTypeResolutionSource: parseEnum(
      fields.get("photoTypeResolutionSource") ?? "AUTO_FALLBACK",
      SELFX_GENERATION_POLICY_RESOLUTION_SOURCES,
      "Invalid garment photo type resolution source.",
    ),
    profileResolutionSource: parseEnum(
      fields.get("profileResolutionSource") ?? "PLATFORM_DEFAULT",
      SELFX_GENERATION_POLICY_RESOLUTION_SOURCES,
      "Invalid generation profile resolution source.",
    ),
    analysisConfidence: parseOptionalConfidence(
      fields.get("analysisConfidence"),
    ),
    disambiguationRequired: fields.get("disambiguationRequired") === "true",
    disambiguationResolved: fields.get("disambiguationResolved") === "true",
    garmentAnalysisBodyCoverage: parseOptionalEnum(
      fields.get("garmentAnalysisBodyCoverage"),
      SELFX_GARMENT_BODY_COVERAGES,
      "Invalid garment analysis body coverage.",
    ),
    garmentAnalysisReasonCodes: parseGarmentAnalysisReasonCodes(
      fields.get("garmentAnalysisReasonCodes"),
    ),
    qualityWarningCodes: parseQualityWarningCodes(
      fields.get("qualityWarningCodes"),
    ),
    qualityOverrideAccepted: fields.get("qualityOverrideAccepted") === "true",
  };
}

function validateUploadedImage(
  fieldName: "personImage" | "garmentImage",
  filename: string,
  mimetype: string,
  buffer: Buffer,
): TryOnLabUploadedImage {
  if (buffer.length === 0) {
    throwImageInvalid("Uploaded image is empty.");
  }
  if (buffer.length > TRY_ON_LAB_MAX_IMAGE_BYTES) {
    throwImageInvalid("Uploaded image exceeds the Try-On Lab size limit.");
  }

  const detected = detectImageMimeType(buffer);
  if (!detected || detected !== mimetype) {
    throwImageInvalid(
      "Uploaded image type is not supported or does not match.",
    );
  }

  const dimensions = readImageDimensions(buffer, detected);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throwImageInvalid("Uploaded image could not be decoded.");
  }

  return {
    fieldName,
    filename,
    mimeType: detected,
    sizeBytes: buffer.length,
    buffer,
    dataUri: `data:${detected};base64,${buffer.toString("base64")}`,
  };
}

export function detectImageMimeType(
  buffer: Buffer,
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

function readImageDimensions(
  buffer: Buffer,
  mimeType: "image/jpeg" | "image/png" | "image/webp",
): { width: number; height: number } | null {
  switch (mimeType) {
    case "image/png":
      return readPngDimensions(buffer);
    case "image/jpeg":
      return readJpegDimensions(buffer);
    case "image/webp":
      return readWebpDimensions(buffer);
  }
}

function readPngDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  if (buffer.length < 24 || buffer.toString("ascii", 12, 16) !== "IHDR") {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) {
      return null;
    }

    if (
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf
    ) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + length;
  }

  return null;
}

function readWebpDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  if (buffer.length < 30) {
    return null;
  }

  const chunkType = buffer.toString("ascii", 12, 16);
  if (chunkType === "VP8X" && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }

  if (chunkType === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunkType === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  return null;
}

function parseEnum<const TValue extends readonly string[]>(
  value: string,
  allowed: TValue,
  message: string,
): TValue[number] {
  if ((allowed as readonly string[]).includes(value)) {
    return value as TValue[number];
  }
  throwResolutionMetadataInvalid(message);
}

function parseOptionalEnum<const TValue extends readonly string[]>(
  value: string | undefined,
  allowed: TValue,
  message: string,
): TValue[number] | undefined {
  if (!value) {
    return undefined;
  }
  return parseEnum(value, allowed, message);
}

function parseOptionalConfidence(
  value: string | undefined,
): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throwResolutionMetadataInvalid("Invalid garment analysis confidence.");
  }
  return parsed;
}

function parseQualityWarningCodes(
  value: string | undefined,
): ImageQualityIssueCode[] {
  if (!value) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throwResolutionMetadataInvalid("Invalid quality warning codes.");
  }

  if (!Array.isArray(parsed)) {
    throwResolutionMetadataInvalid("Invalid quality warning codes.");
  }

  const codes = new Set<ImageQualityIssueCode>();
  for (const item of parsed) {
    if (
      typeof item !== "string" ||
      !IMAGE_QUALITY_ISSUE_CODES.includes(item as ImageQualityIssueCode)
    ) {
      throwResolutionMetadataInvalid("Invalid quality warning codes.");
    }
    codes.add(item as ImageQualityIssueCode);
  }

  return [...codes];
}

function parseGarmentAnalysisReasonCodes(
  value: string | undefined,
): SelfxGarmentAnalysisReasonCode[] {
  if (!value) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throwResolutionMetadataInvalid("Invalid garment analysis reason codes.");
  }

  if (!Array.isArray(parsed)) {
    throwResolutionMetadataInvalid("Invalid garment analysis reason codes.");
  }

  const codes = new Set<SelfxGarmentAnalysisReasonCode>();
  for (const item of parsed) {
    if (
      typeof item !== "string" ||
      !SELFX_GARMENT_ANALYSIS_REASON_CODES.includes(
        item as SelfxGarmentAnalysisReasonCode,
      )
    ) {
      throwResolutionMetadataInvalid("Invalid garment analysis reason codes.");
    }
    codes.add(item as SelfxGarmentAnalysisReasonCode);
  }

  return [...codes];
}

function isMultipartLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  return ["FST_FIELDS_LIMIT", "FST_FILES_LIMIT", "FST_PARTS_LIMIT"].includes(
    String(error.code),
  );
}

function throwImageInvalid(message: string): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    TRY_ON_LAB_ERROR_CODES.imageInvalid,
    message,
  );
}

function throwMultipartInvalid(message: string): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    TRY_ON_LAB_ERROR_CODES.multipartInvalid,
    message,
  );
}

function throwResolutionMetadataInvalid(message: string): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    TRY_ON_LAB_ERROR_CODES.resolutionMetadataInvalid,
    message,
  );
}
