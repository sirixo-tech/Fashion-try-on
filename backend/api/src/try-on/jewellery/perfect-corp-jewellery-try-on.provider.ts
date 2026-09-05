import { HttpStatus, Injectable } from "@nestjs/common";
import sharp from "sharp";

import { TRY_ON_LAB_ERROR_CODES, type TryOnLabErrorCode } from "@selfx/shared";

import type { JewelleryType } from "../../catalog/product-kind.js";
import { ApiErrorException } from "../../common/api-error.exception.js";
import type {
  JewelleryTryOnProvider,
  JewelleryTryOnProviderMetadata,
  JewelleryTryOnProviderStatusResult,
  JewelleryTryOnProviderSubmitInput,
  JewelleryTryOnProviderSubmitResult,
} from "./jewellery-try-on.provider.js";

const DEFAULT_API_BASE_URL = "https://yce-api-01.makeupar.com";
const DEFAULT_MODEL = "2d-vto-v1.0";
const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
const MAX_HTTP_TIMEOUT_MS = 120_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MIN_IMAGE_DIMENSION = 640;
const MIN_PERSON_SOURCE_DIMENSION = 480;
const MAX_IMAGE_DIMENSION = 4_096;
const PREDICTION_TOKEN_PREFIX = "perfect-corp:v1";

type PerfectCorpImageMimeType = "image/jpeg" | "image/png";
interface PerfectCorpInputImage {
  buffer: Buffer;
  contentType: PerfectCorpImageMimeType;
  fileName: string;
}
interface PerfectCorpUploadDescriptor {
  fileId: string;
  request: {
    method: "PUT";
    url: string;
    headers: Record<string, string>;
  };
}

@Injectable()
export class PerfectCorpJewelleryTryOnProvider implements JewelleryTryOnProvider {
  metadata(): JewelleryTryOnProviderMetadata {
    return {
      provider: "perfect-corp",
      providerDisplayName: "Perfect Corp",
      model: readModel(),
    };
  }

  assertConfigured(): void {
    if (!providerEnabled() || !readApiKey()) {
      throw new ApiErrorException(
        HttpStatus.SERVICE_UNAVAILABLE,
        TRY_ON_LAB_ERROR_CODES.configurationError,
        "Jewellery Try-On provider is not configured for this environment.",
      );
    }
    readApiBaseUrl();
  }

  async submit(
    input: JewelleryTryOnProviderSubmitInput,
  ): Promise<JewelleryTryOnProviderSubmitResult> {
    this.assertConfigured();
    const route = perfectCorpRoute(input.jewelleryType);
    const [personImage, jewelleryImage] = await Promise.all([
      normalizePerfectCorpInputImage(input.personImageDataUri, "person"),
      normalizePerfectCorpInputImage(input.jewelleryImageDataUri, "jewellery"),
    ]);
    const descriptors = await this.createUploadDescriptors(route.filePath, [
      personImage,
      jewelleryImage,
    ]);
    await Promise.all([
      this.uploadImage(descriptors[0], personImage),
      this.uploadImage(descriptors[1], jewelleryImage),
    ]);

    const personFileId = descriptors[0].fileId;
    const jewelleryFileId = descriptors[1].fileId;
    const response = await this.requestJson(route.taskPath, {
      method: "POST",
      body: JSON.stringify({
        src_file_id: personFileId,
        ref_file_ids: [jewelleryFileId],
        source_info: { name: personFileId },
        object_infos: [
          {
            name: jewelleryFileId,
            parameter: {
              [`${route.slug}_need_remove_background`]: true,
            },
          },
        ],
      }),
    });
    const taskId = readNestedString(response, "data", "task_id");
    if (!taskId) {
      throwMalformedResponse();
    }
    return {
      providerPredictionId: encodePredictionToken(input.jewelleryType, taskId),
    };
  }

  async poll(
    providerPredictionId: string,
  ): Promise<JewelleryTryOnProviderStatusResult> {
    this.assertConfigured();
    const prediction = decodePredictionToken(providerPredictionId);
    const route = perfectCorpRoute(prediction.jewelleryType);
    const response = await this.requestJson(
      `${route.taskPath}/${encodeURIComponent(prediction.taskId)}`,
      { method: "GET" },
    );
    const taskStatus = readNestedString(response, "data", "task_status");
    if (taskStatus === "running") {
      return { status: "PROCESSING" };
    }
    if (taskStatus === "success") {
      const resultImage = readNestedString(response, "data", "results", "url");
      if (!resultImage || !isHttpUrl(resultImage)) {
        throwMalformedResponse();
      }
      return { status: "COMPLETED", resultImage };
    }
    if (taskStatus === "error") {
      return {
        status: "FAILED",
        ...mapPerfectCorpRuntimeError(readPerfectCorpRuntimeError(response)),
      };
    }
    throwMalformedResponse();
  }

  private async createUploadDescriptors(
    filePath: string,
    images: [PerfectCorpInputImage, PerfectCorpInputImage],
  ): Promise<[PerfectCorpUploadDescriptor, PerfectCorpUploadDescriptor]> {
    const response = await this.requestJson(filePath, {
      method: "POST",
      body: JSON.stringify({
        files: images.map((image) => ({
          content_type: image.contentType,
          file_name: image.fileName,
          file_size: image.buffer.length,
        })),
      }),
    });
    const files = readNestedArray(response, "data", "files");
    if (!files || files.length !== images.length) {
      throwMalformedResponse();
    }
    const descriptors = images.map((image) =>
      parseUploadDescriptor(
        files.find(
          (candidate) => readString(candidate, "file_name") === image.fileName,
        ),
      ),
    );
    const first = descriptors[0];
    const second = descriptors[1];
    if (!first || !second) {
      throwMalformedResponse();
    }
    return [first, second];
  }

  private async uploadImage(
    descriptor: PerfectCorpUploadDescriptor,
    image: PerfectCorpInputImage,
  ): Promise<void> {
    if (!isSecureUploadUrl(descriptor.request.url)) {
      throwMalformedResponse();
    }
    try {
      const response = await this.performFetch(descriptor.request.url, {
        method: descriptor.request.method,
        headers: descriptor.request.headers,
        body: Uint8Array.from(image.buffer),
        signal: AbortSignal.timeout(readHttpTimeoutMs()),
      });
      if (!response.ok) {
        throw new ApiErrorException(
          HttpStatus.SERVICE_UNAVAILABLE,
          TRY_ON_LAB_ERROR_CODES.providerUnavailable,
          "Jewellery Try-On provider image upload failed.",
        );
      }
    } catch (error) {
      if (error instanceof ApiErrorException) {
        throw error;
      }
      throwProviderUnavailable();
    }
  }

  private async requestJson(
    path: string,
    init: Pick<RequestInit, "method" | "body">,
  ): Promise<unknown> {
    const apiKey = readApiKey();
    if (!apiKey) {
      this.assertConfigured();
      throw new Error(
        "PERFECT_CORP_API_KEY missing after configuration check.",
      );
    }
    try {
      const response = await this.performFetch(
        new URL(path, `${readApiBaseUrl()}/`),
        {
          ...init,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
            ...(init.body ? { "Content-Type": "application/json" } : {}),
          },
          signal: AbortSignal.timeout(readHttpTimeoutMs()),
        },
      );
      const payload = await readResponseJson(response);
      const payloadStatus = readNumber(payload, "status");
      if (
        !response.ok ||
        (payloadStatus !== undefined && payloadStatus >= 400)
      ) {
        throwPerfectCorpHttpError(payloadStatus ?? response.status, payload);
      }
      return payload;
    } catch (error) {
      if (error instanceof ApiErrorException) {
        throw error;
      }
      throwProviderUnavailable();
    }
  }

  protected performFetch(
    input: string | URL,
    init: RequestInit,
  ): Promise<Response> {
    return fetch(input, init);
  }
}

export async function normalizePerfectCorpInputImage(
  dataUri: string,
  name: "person" | "jewellery",
): Promise<PerfectCorpInputImage> {
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/u.exec(dataUri);
  if (!match) {
    throwImageInvalid();
  }
  const buffer = Buffer.from(match[2] ?? "", "base64");
  if (buffer.length === 0) {
    throwImageInvalid();
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { failOn: "error" }).metadata();
  } catch {
    throwImageInvalid();
  }
  if (!metadata.width || !metadata.height) {
    throwImageInvalid();
  }

  const sourceShortestEdge = Math.min(metadata.width, metadata.height);
  if (name === "jewellery" && sourceShortestEdge < MIN_IMAGE_DIMENSION) {
    throwImageInvalid(
      "Jewellery product images must be at least 640 x 640 pixels.",
    );
  }
  if (name === "person" && sourceShortestEdge < MIN_PERSON_SOURCE_DIMENSION) {
    throwImageInvalid(
      "Person images must be at least 480 pixels on each side.",
    );
  }

  const outputDimensions = perfectCorpOutputDimensions(
    metadata.width,
    metadata.height,
    name,
  );

  const decodedType = perfectCorpMimeType(metadata.format);
  if (
    decodedType &&
    buffer.length <= MAX_IMAGE_BYTES &&
    outputDimensions.width === metadata.width &&
    outputDimensions.height === metadata.height
  ) {
    return {
      buffer,
      contentType: decodedType,
      fileName: `${name}.${decodedType === "image/png" ? "png" : "jpg"}`,
    };
  }
  return normalizeToJpeg(buffer, name, outputDimensions);
}

export function perfectCorpRoute(jewelleryType: JewelleryType): {
  slug: "ring" | "bracelet" | "necklace" | "earring";
  filePath: string;
  taskPath: string;
} {
  const slug = jewelleryType.toLowerCase() as
    "ring" | "bracelet" | "necklace" | "earring";
  return {
    slug,
    filePath: `/s2s/v2.0/file/2d-vto/${slug}`,
    taskPath: `/s2s/v2.0/task/2d-vto/${slug}`,
  };
}

export function mapPerfectCorpRuntimeError(providerError?: string): {
  errorCode: TryOnLabErrorCode;
  errorMessage: string;
} {
  const error = (providerError ?? "").trim().toLowerCase();
  if (
    error.includes("no_face") ||
    error.includes("pose") ||
    error.includes("face_parsing") ||
    error.includes("photo_detection") ||
    error.includes("photo_check")
  ) {
    return {
      errorCode: TRY_ON_LAB_ERROR_CODES.poseNotDetected,
      errorMessage:
        "The provider could not detect a suitable person pose for this jewellery type.",
    };
  }
  if (error.includes("nsfw")) {
    return {
      errorCode: TRY_ON_LAB_ERROR_CODES.moderationRejected,
      errorMessage: "The provider rejected the image content.",
    };
  }
  if (
    error.includes("image") ||
    error.includes("file") ||
    error.includes("input") ||
    error.includes("resolution") ||
    error.includes("dimension") ||
    error.includes("width") ||
    error.includes("height") ||
    error.includes("object_detection") ||
    error.includes("invalid_parameter")
  ) {
    return {
      errorCode: TRY_ON_LAB_ERROR_CODES.imageInvalid,
      errorMessage: "The provider could not use one of the uploaded images.",
    };
  }
  return {
    errorCode: TRY_ON_LAB_ERROR_CODES.failed,
    errorMessage: "Jewellery Try-On generation failed.",
  };
}

function parseUploadDescriptor(value: unknown): PerfectCorpUploadDescriptor {
  const fileId = readString(value, "file_id");
  const requests = readArray(value, "requests");
  const request = requests?.[0];
  const method = readString(request, "method")?.toUpperCase();
  const url = readString(request, "url");
  const headers = readStringRecord(readProperty(request, "headers"));
  if (!fileId || method !== "PUT" || !url || !headers) {
    throwMalformedResponse();
  }
  return { fileId, request: { method, url, headers } };
}

async function normalizeToJpeg(
  buffer: Buffer,
  name: "person" | "jewellery",
  dimensions: { width: number; height: number },
): Promise<PerfectCorpInputImage> {
  for (const quality of [90, 82, 74, 66]) {
    let output: Buffer;
    try {
      output = await sharp(buffer, { failOn: "error" })
        .rotate()
        .resize({
          width: dimensions.width,
          height: dimensions.height,
          fit: "fill",
        })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality, mozjpeg: true, force: true })
        .toBuffer();
    } catch {
      throwImageInvalid();
    }
    if (output.length < MAX_IMAGE_BYTES) {
      return {
        buffer: output,
        contentType: "image/jpeg",
        fileName: `${name}.jpg`,
      };
    }
  }
  throwImageInvalid();
}

function perfectCorpOutputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  name: "person" | "jewellery",
): { width: number; height: number } {
  let scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(sourceWidth, sourceHeight),
  );
  if (name === "person") {
    const downscaledShortestEdge = Math.min(sourceWidth, sourceHeight) * scale;
    if (downscaledShortestEdge < MIN_IMAGE_DIMENSION) {
      scale *= MIN_IMAGE_DIMENSION / downscaledShortestEdge;
    }
  }

  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  if (
    width < MIN_IMAGE_DIMENSION ||
    height < MIN_IMAGE_DIMENSION ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION
  ) {
    throwImageInvalid(
      "Perfect Corp requires each image side to be between 640 and 4096 pixels.",
    );
  }
  return { width, height };
}

function perfectCorpMimeType(
  format?: string,
): PerfectCorpImageMimeType | undefined {
  return format === "jpeg"
    ? "image/jpeg"
    : format === "png"
      ? "image/png"
      : undefined;
}

function encodePredictionToken(
  jewelleryType: JewelleryType,
  taskId: string,
): string {
  return `${PREDICTION_TOKEN_PREFIX}:${jewelleryType}:${Buffer.from(
    taskId,
    "utf8",
  ).toString("base64url")}`;
}

function decodePredictionToken(providerPredictionId: string): {
  jewelleryType: JewelleryType;
  taskId: string;
} {
  const [provider, version, rawType, encodedTaskId, ...rest] =
    providerPredictionId.split(":");
  if (
    provider !== "perfect-corp" ||
    version !== "v1" ||
    rest.length > 0 ||
    !isJewelleryType(rawType) ||
    !encodedTaskId
  ) {
    throwMalformedResponse();
  }
  const taskId = Buffer.from(encodedTaskId, "base64url").toString("utf8");
  if (!taskId) {
    throwMalformedResponse();
  }
  return { jewelleryType: rawType, taskId };
}

function isJewelleryType(value?: string): value is JewelleryType {
  return (
    value === "RING" ||
    value === "BRACELET" ||
    value === "NECKLACE" ||
    value === "EARRING"
  );
}

async function readResponseJson(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!body) {
    return undefined;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    if (response.ok) {
      throwMalformedResponse();
    }
    return undefined;
  }
}

function throwPerfectCorpHttpError(status: number, payload: unknown): never {
  const providerCode = readPerfectCorpRuntimeError(payload);
  if (
    status === HttpStatus.UNAUTHORIZED ||
    status === HttpStatus.FORBIDDEN ||
    providerCode === "InvalidApiKey" ||
    providerCode === "InactiveApiKey" ||
    providerCode === "ExpiredApiKey"
  ) {
    throw new ApiErrorException(
      HttpStatus.SERVICE_UNAVAILABLE,
      TRY_ON_LAB_ERROR_CODES.configurationError,
      "Jewellery Try-On provider authentication failed.",
    );
  }
  if (status === HttpStatus.TOO_MANY_REQUESTS) {
    throw new ApiErrorException(
      HttpStatus.TOO_MANY_REQUESTS,
      TRY_ON_LAB_ERROR_CODES.providerRateLimited,
      "Jewellery Try-On provider rate limit reached.",
    );
  }
  if (status >= 500) {
    throwProviderUnavailable();
  }
  if (providerCode === "CreditInsufficiency") {
    throw new ApiErrorException(
      HttpStatus.SERVICE_UNAVAILABLE,
      TRY_ON_LAB_ERROR_CODES.configurationError,
      "Jewellery Try-On provider credits are unavailable.",
    );
  }
  const mapped = mapPerfectCorpRuntimeError(providerCode);
  if (mapped.errorCode !== TRY_ON_LAB_ERROR_CODES.failed) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      mapped.errorCode,
      mapped.errorMessage,
    );
  }
  throw new ApiErrorException(
    HttpStatus.BAD_GATEWAY,
    TRY_ON_LAB_ERROR_CODES.failed,
    "Jewellery Try-On provider rejected the request.",
  );
}

function throwProviderUnavailable(): never {
  throw new ApiErrorException(
    HttpStatus.SERVICE_UNAVAILABLE,
    TRY_ON_LAB_ERROR_CODES.providerUnavailable,
    "Jewellery Try-On provider could not be reached.",
  );
}

function throwMalformedResponse(): never {
  throw new ApiErrorException(
    HttpStatus.BAD_GATEWAY,
    TRY_ON_LAB_ERROR_CODES.failed,
    "Jewellery Try-On provider returned an invalid response.",
  );
}

function throwImageInvalid(
  message = "Perfect Corp requires a valid JPEG, PNG or WebP input image.",
): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    TRY_ON_LAB_ERROR_CODES.imageInvalid,
    message,
  );
}

function readPerfectCorpRuntimeError(value: unknown): string | undefined {
  const nestedError = readProperty(readProperty(value, "data"), "error");
  return (
    readString(value, "error_code") ??
    readString(value, "code") ??
    readString(nestedError, "error_code") ??
    readString(nestedError, "code") ??
    readString(nestedError, "message") ??
    readNestedString(value, "data", "error") ??
    readNestedString(value, "data", "message") ??
    readString(value, "message")
  );
}

function readApiBaseUrl(): string {
  const configured =
    process.env.PERFECT_CORP_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throwConfigurationInvalid();
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throwConfigurationInvalid();
  }
  return url.toString().replace(/\/$/u, "");
}

function throwConfigurationInvalid(): never {
  throw new ApiErrorException(
    HttpStatus.SERVICE_UNAVAILABLE,
    TRY_ON_LAB_ERROR_CODES.configurationError,
    "Jewellery Try-On provider configuration is invalid.",
  );
}

function providerEnabled(): boolean {
  return process.env.SELFX_PERFECT_CORP_JEWELLERY_TRY_ON_ENABLED === "true";
}
function readApiKey(): string | undefined {
  return process.env.PERFECT_CORP_API_KEY?.trim() || undefined;
}
function readModel(): string {
  return (
    process.env.PERFECT_CORP_JEWELLERY_TRY_ON_MODEL?.trim() || DEFAULT_MODEL
  );
}
function readHttpTimeoutMs(): number {
  const parsed = Number(process.env.PERFECT_CORP_HTTP_TIMEOUT_MS);
  return !Number.isFinite(parsed) || parsed < 1_000
    ? DEFAULT_HTTP_TIMEOUT_MS
    : Math.min(Math.floor(parsed), MAX_HTTP_TIMEOUT_MS);
}

function readNestedString(
  value: unknown,
  ...keys: string[]
): string | undefined {
  let current = value;
  for (const key of keys) {
    current = readProperty(current, key);
  }
  return typeof current === "string" && current.trim()
    ? current.trim()
    : undefined;
}
function readNestedArray(
  value: unknown,
  ...keys: string[]
): unknown[] | undefined {
  let current = value;
  for (const key of keys) {
    current = readProperty(current, key);
  }
  return Array.isArray(current) ? current : undefined;
}
function readString(value: unknown, key: string): string | undefined {
  const property = readProperty(value, key);
  return typeof property === "string" && property.trim()
    ? property.trim()
    : undefined;
}
function readArray(value: unknown, key: string): unknown[] | undefined {
  const property = readProperty(value, key);
  return Array.isArray(property) ? property : undefined;
}
function readNumber(value: unknown, key: string): number | undefined {
  const property = readProperty(value, key);
  return typeof property === "number" && Number.isFinite(property)
    ? property
    : undefined;
}
function readProperty(value: unknown, key: string): unknown {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}
function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value);
  if (
    entries.some(
      ([, entry]) => typeof entry !== "string" && typeof entry !== "number",
    )
  ) {
    return undefined;
  }
  return Object.fromEntries(
    entries.map(([key, entry]) => [key, String(entry)]),
  );
}
function isHttpUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
function isSecureUploadUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
