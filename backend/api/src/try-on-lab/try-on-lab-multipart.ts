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
  SELFX_MODEL_COVERAGES,
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
  type SelfxModelCoverage,
} from "@selfx/shared";

import { ApiErrorException } from "../common/api-error.exception.js";
import {
  detectImageMimeType as detectSharedImageMimeType,
  readImageDimensions as readSharedImageDimensions,
} from "../common/image-validation.js";
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

export type TryOnLabImageFieldName =
  | "personImage"
  | "garmentImage"
  | "jewelleryImage";

export interface TryOnLabUploadedImage {
  fieldName: TryOnLabImageFieldName;
  filename: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  buffer: Buffer;
  dataUri: string;
}

export interface CreateTryOnLabRunPayload {
  clientRequestId?: string;
  personImage: TryOnLabUploadedImage;
  garmentImage: TryOnLabUploadedImage;
  garmentSource: SelfxGarmentSource;
  garmentIntent: SelfxGarmentIntent;
  category: SelfxGarmentCategory;
  garmentPhotoType: SelfxGarmentPhotoType;
  modelCoverage?: SelfxModelCoverage;
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
            validateTryOnLabUploadedImage(
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
    clientRequestId: parseOptionalClientRequestId(fields.get("clientRequestId")),
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
    modelCoverage: parseOptionalEnum(
      fields.get("modelCoverage"),
      SELFX_MODEL_COVERAGES,
      "Invalid model coverage.",
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

function parseOptionalClientRequestId(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160) {
    throwResolutionMetadataInvalid("Invalid client request ID.");
  }
  return trimmed;
}

export function validateTryOnLabUploadedImage(
  fieldName: TryOnLabImageFieldName,
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

  const dimensions = readSharedImageDimensions(buffer, detected);
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
  return detectSharedImageMimeType(buffer);
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
