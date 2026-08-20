import { HttpStatus } from "@nestjs/common";
import { type FastifyRequest } from "fastify";

import {
  IMAGE_QUALITY_ISSUE_CODES,
  SELFX_GARMENT_ANALYSIS_REASON_CODES,
  SELFX_GARMENT_BODY_COVERAGES,
  SELFX_GARMENT_CATEGORIES,
  SELFX_GARMENT_INTENTS,
  SELFX_GARMENT_PHOTO_TYPES,
  SELFX_GARMENT_SOURCES,
  SELFX_GENERATION_PROFILES,
  SELFX_GENERATION_POLICY_RESOLUTION_SOURCES,
  SELFX_MODEL_COVERAGES,
  TRY_ON_LAB_ERROR_CODES,
  type ImageQualityIssueCode,
  type SelfxGarmentAnalysisReasonCode,
  type SelfxGarmentBodyCoverage,
  type SelfxGarmentCategory,
  type SelfxGarmentIntent,
  type SelfxGarmentPhotoType,
  type SelfxGarmentSource,
  type SelfxGenerationPolicyResolutionSource,
  type SelfxGenerationProfile,
  type SelfxModelCoverage,
} from "@selfx/shared";

import { ApiErrorException } from "../common/api-error.exception.js";
import {
  type SupportedImageMimeType,
  validateTechnicalImageBuffer,
} from "../common/image-validation.js";
import {
  TRY_ON_LAB_MAX_IMAGE_BYTES,
  TRY_ON_LAB_MULTIPART_LIMITS,
} from "../try-on-lab/try-on-lab.constants.js";

type MultipartPart = Awaited<ReturnType<FastifyRequest["file"]>>;
type MultipartIteratorPart = NonNullable<MultipartPart> | MultipartField;

interface MultipartField {
  type: "field";
  fieldname: string;
  value: unknown;
}

export interface KioskTryOnUploadedImage {
  fieldName: "personImage" | "garmentImage";
  filename: string;
  mimeType: SupportedImageMimeType;
  sizeBytes: number;
  buffer: Buffer;
  dataUri: string;
  width: number;
  height: number;
}

export interface CreateKioskTryOnRunPayload {
  clientRequestId?: string;
  sessionId?: string;
  personAssetId?: string;
  personImage?: KioskTryOnUploadedImage;
  garmentImage?: KioskTryOnUploadedImage;
  productId?: string;
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

export interface KioskSessionImagePayload {
  personImage?: KioskTryOnUploadedImage;
  customerUploadSessionId?: string;
}

export async function parseKioskTryOnRunMultipartRequest(
  request: FastifyRequest,
): Promise<CreateKioskTryOnRunPayload> {
  if (!request.isMultipart()) {
    throwImageInvalid("Kiosk Try-On requests must use multipart/form-data.");
  }

  const images = new Map<string, KioskTryOnUploadedImage>();
  const fields = new Map<string, string>();

  try {
    for await (const part of request.parts({
      limits: { ...TRY_ON_LAB_MULTIPART_LIMITS, files: 2 },
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
        images.set(
          part.fieldname,
          validateImage(part.fieldname, part.filename, part.mimetype, await part.toBuffer()),
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
      throwImageInvalid("One or more images exceeds the supported size limit.");
    }
    throwMultipartInvalid("Kiosk Try-On multipart request could not be processed.");
  }

  const sessionId = parseOptionalUuid(fields.get("sessionId"), "Invalid session ID.");
  const personImage = images.get("personImage");
  if (!personImage && !sessionId) {
    throwMultipartInvalid("Person image is required for legacy Try-On requests.");
  }
  const garmentImage = images.get("garmentImage");
  const productId = parseOptionalUuid(
    fields.get("productId"),
    "Invalid catalog product ID.",
  );
  if (garmentImage && productId) {
    throwMultipartInvalid("Provide either a garment image or catalog product.");
  }
  if (!garmentImage && !productId) {
    throwMultipartInvalid("Garment image or catalog product is required.");
  }
  const garmentSource = parseEnum(
    fields.get("garmentSource") ?? (productId ? "SELFX_CATALOG" : "DIRECT_UPLOAD"),
    SELFX_GARMENT_SOURCES,
    "Invalid garment source.",
  );
  if (productId && garmentSource !== "SELFX_CATALOG") {
    throwResolutionMetadataInvalid("Catalog product requires SelfX catalog source.");
  }
  if (garmentImage && garmentSource === "SELFX_CATALOG") {
    throwResolutionMetadataInvalid("SelfX catalog source requires a product ID.");
  }

  return {
    clientRequestId: parseOptionalClientRequestId(fields.get("clientRequestId")),
    sessionId,
    personAssetId: parseOptionalUuid(
      fields.get("personAssetId"),
      "Invalid person asset ID.",
    ),
    personImage,
    garmentImage,
    productId,
    garmentSource,
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
    garmentAnalysisReasonCodes: parseStringArray(
      fields.get("garmentAnalysisReasonCodes"),
      SELFX_GARMENT_ANALYSIS_REASON_CODES,
      "Invalid garment analysis reason codes.",
    ),
    qualityWarningCodes: parseStringArray(
      fields.get("qualityWarningCodes"),
      IMAGE_QUALITY_ISSUE_CODES,
      "Invalid quality warning codes.",
    ),
    qualityOverrideAccepted: fields.get("qualityOverrideAccepted") === "true",
  };
}

export async function parseKioskPersonMultipartRequest(
  request: FastifyRequest,
): Promise<KioskSessionImagePayload> {
  if (!request.isMultipart()) {
    const body = request.body as { customerUploadSessionId?: unknown } | undefined;
    if (typeof body?.customerUploadSessionId === "string") {
      return {
        customerUploadSessionId: parseOptionalUuid(
          body.customerUploadSessionId,
          "Invalid customer upload session ID.",
        ),
      };
    }
    throwMultipartInvalid("Person image or customer upload session is required.");
  }

  let personImage: KioskTryOnUploadedImage | undefined;
  let customerUploadSessionId: string | undefined;

  try {
    for await (const part of request.parts({
      limits: { files: 1, fileSize: TRY_ON_LAB_MAX_IMAGE_BYTES, fields: 2, parts: 3 },
    }) as AsyncIterable<MultipartIteratorPart>) {
      if (part.type === "file") {
        if (part.fieldname !== "personImage") {
          throwMultipartInvalid("Unexpected image field.");
        }
        if (personImage) {
          throwMultipartInvalid("Duplicate person image field.");
        }
        personImage = validateImage(
          "personImage",
          part.filename,
          part.mimetype,
          await part.toBuffer(),
        );
        continue;
      }
      if (
        part.fieldname === "customerUploadSessionId" &&
        typeof part.value === "string"
      ) {
        customerUploadSessionId = parseOptionalUuid(
          part.value,
          "Invalid customer upload session ID.",
        );
      }
    }
  } catch (error) {
    if (error instanceof ApiErrorException) {
      throw error;
    }
    throwMultipartInvalid("Person image request could not be processed.");
  }

  if (personImage && customerUploadSessionId) {
    throwMultipartInvalid("Provide either a person image or a customer upload session.");
  }
  if (!personImage && !customerUploadSessionId) {
    throwMultipartInvalid("Person image or customer upload session is required.");
  }
  return { personImage, customerUploadSessionId };
}

function validateImage(
  fieldName: "personImage" | "garmentImage",
  filename: string,
  declaredContentType: string,
  buffer: Buffer,
): KioskTryOnUploadedImage {
  try {
    const metadata = validateTechnicalImageBuffer({
      buffer,
      declaredContentType,
      maxBytes: TRY_ON_LAB_MAX_IMAGE_BYTES,
    });
    return {
      fieldName,
      filename,
      mimeType: metadata.mimeType,
      sizeBytes: metadata.sizeBytes,
      buffer,
      dataUri: `data:${metadata.mimeType};base64,${buffer.toString("base64")}`,
      width: metadata.width,
      height: metadata.height,
    };
  } catch {
    throwImageInvalid("Uploaded image is not a supported image file.");
  }
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

function parseOptionalUuid(value: string | undefined, message: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    throwResolutionMetadataInvalid(message);
  }
  return trimmed;
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

function parseOptionalConfidence(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throwResolutionMetadataInvalid("Invalid garment analysis confidence.");
  }
  return parsed;
}

function parseStringArray<const TValue extends readonly string[]>(
  value: string | undefined,
  allowed: TValue,
  message: string,
): TValue[number][] {
  if (!value) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throwResolutionMetadataInvalid(message);
  }
  if (!Array.isArray(parsed)) {
    throwResolutionMetadataInvalid(message);
  }
  const values = new Set<TValue[number]>();
  for (const item of parsed) {
    if (
      typeof item !== "string" ||
      !(allowed as readonly string[]).includes(item)
    ) {
      throwResolutionMetadataInvalid(message);
    }
    values.add(item as TValue[number]);
  }
  return [...values];
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
