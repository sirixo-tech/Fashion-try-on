import { HttpStatus } from "@nestjs/common";
import { type FastifyRequest } from "fastify";

import {
  SELFX_JEWELLERY_SEMANTIC_ANALYZERS,
  TRY_ON_LAB_ERROR_CODES,
  type SelfxJewelleryPersonSemanticEvidence,
  type SelfxJewellerySemanticAnalyzer,
} from "@selfx/shared";

import {
  JEWELLERY_TYPES,
  type JewelleryType,
} from "../catalog/product-kind.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { TRY_ON_LAB_MULTIPART_LIMITS } from "./try-on-lab.constants.js";
import {
  type TryOnLabUploadedImage,
  validateTryOnLabUploadedImage,
} from "./try-on-lab-multipart.js";

type MultipartPart = Awaited<ReturnType<FastifyRequest["file"]>>;
type MultipartIteratorPart = NonNullable<MultipartPart> | MultipartField;

interface MultipartField {
  type: "field";
  fieldname: string;
  value: unknown;
}

export interface CreateJewelleryTryOnLabRunPayload {
  clientRequestId?: string;
  personImage: TryOnLabUploadedImage;
  jewelleryImage: TryOnLabUploadedImage;
  jewelleryType: JewelleryType;
  personSemanticEvidence: SelfxJewelleryPersonSemanticEvidence;
  productReference?: {
    productId?: string;
    productName?: string;
    sku?: string;
  };
}

export async function parseJewelleryTryOnLabMultipartRequest(
  request: FastifyRequest,
): Promise<CreateJewelleryTryOnLabRunPayload> {
  if (!request.isMultipart()) {
    throwImageInvalid("Jewellery Lab requests must use multipart/form-data.");
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
          part.fieldname !== "jewelleryImage"
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
        "One or more images exceeds the Jewellery Lab size limit.",
      );
    }
    if (isMultipartLimitError(error)) {
      throwMultipartInvalid(
        "Jewellery Lab multipart request exceeds the supported image or metadata limits.",
      );
    }
    throwMultipartInvalid(
      "Jewellery Lab multipart request could not be processed.",
    );
  }

  const personImage = images.get("personImage");
  const jewelleryImage = images.get("jewelleryImage");
  if (!personImage || !jewelleryImage) {
    throwMultipartInvalid("Both person and jewellery images are required.");
  }

  return {
    clientRequestId: parseOptionalString(
      fields.get("clientRequestId"),
      "Invalid client request ID.",
    ),
    personImage,
    jewelleryImage,
    jewelleryType: parseJewelleryType(fields.get("jewelleryType")),
    personSemanticEvidence: parsePersonSemanticEvidence(
      fields.get("personSemanticEvidence"),
    ),
    productReference: parseProductReference(fields),
  };
}

function parsePersonSemanticEvidence(
  value: string | undefined,
): SelfxJewelleryPersonSemanticEvidence {
  if (!value || value.length > 2_048) {
    throwResolutionMetadataInvalid(
      "Valid person semantic evidence is required.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throwResolutionMetadataInvalid(
      "Valid person semantic evidence is required.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throwResolutionMetadataInvalid(
      "Valid person semantic evidence is required.",
    );
  }

  const evidence = parsed as Record<string, unknown>;
  const allowedKeys = new Set([
    "analyzer",
    "analysisAvailable",
    "subjectPresent",
    "requiredRegionVisible",
    "frontFacing",
    "relevantRegionUnobstructed",
    "confidence",
  ]);
  if (Object.keys(evidence).some((key) => !allowedKeys.has(key))) {
    throwResolutionMetadataInvalid(
      "Valid person semantic evidence is required.",
    );
  }
  if (
    typeof evidence.analyzer !== "string" ||
    !SELFX_JEWELLERY_SEMANTIC_ANALYZERS.includes(
      evidence.analyzer as SelfxJewellerySemanticAnalyzer,
    ) ||
    typeof evidence.analysisAvailable !== "boolean" ||
    typeof evidence.subjectPresent !== "boolean" ||
    typeof evidence.requiredRegionVisible !== "boolean" ||
    !isBooleanOrNull(evidence.frontFacing) ||
    !isBooleanOrNull(evidence.relevantRegionUnobstructed) ||
    !isConfidenceOrNull(evidence.confidence)
  ) {
    throwResolutionMetadataInvalid(
      "Valid person semantic evidence is required.",
    );
  }

  return evidence as unknown as SelfxJewelleryPersonSemanticEvidence;
}

function isBooleanOrNull(value: unknown): value is boolean | null {
  return typeof value === "boolean" || value === null;
}

function isConfidenceOrNull(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1)
  );
}

function parseJewelleryType(value: string | undefined): JewelleryType {
  const normalized = value?.trim().toUpperCase();
  if (
    normalized &&
    (JEWELLERY_TYPES as readonly string[]).includes(normalized)
  ) {
    return normalized as JewelleryType;
  }
  throwResolutionMetadataInvalid(
    "Jewellery type must be RING, BRACELET, NECKLACE or EARRING.",
  );
}

function parseProductReference(
  fields: Map<string, string>,
): CreateJewelleryTryOnLabRunPayload["productReference"] {
  const productId = parseOptionalString(
    fields.get("productId"),
    "Invalid product ID.",
  );
  const productName = parseOptionalString(
    fields.get("productName"),
    "Invalid product name.",
  );
  const sku = parseOptionalString(fields.get("sku"), "Invalid SKU.");

  if (!productId && !productName && !sku) {
    return undefined;
  }

  return { productId, productName, sku };
}

function parseOptionalString(
  value: string | undefined,
  errorMessage: string,
): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160) {
    throwResolutionMetadataInvalid(errorMessage);
  }
  return trimmed;
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
