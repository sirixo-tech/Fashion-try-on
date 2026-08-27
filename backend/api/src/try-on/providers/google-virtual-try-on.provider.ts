import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { GoogleAuth, type AuthClient } from "google-auth-library";
import sharp from "sharp";

import { TRY_ON_LAB_ERROR_CODES, type TryOnLabErrorCode } from "@selfx/shared";

import { ApiErrorException } from "../../common/api-error.exception.js";
import {
  type VirtualTryOnProvider,
  type VirtualTryOnProviderMetadata,
  type VirtualTryOnProviderStatusResult,
  type VirtualTryOnProviderSubmitInput,
  type VirtualTryOnProviderSubmitResult,
} from "./virtual-try-on.provider.js";

const GOOGLE_VTO_DEFAULT_LOCATION = "us-central1";
const GOOGLE_VTO_DEFAULT_MODEL = "virtual-try-on-001";
const GOOGLE_CLOUD_PLATFORM_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform";
const TOKEN_EXPIRY_SAFETY_MS = 60_000;
const MAX_COMPLETED_RESULTS = 100;
const GOOGLE_VTO_TARGET_MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const GOOGLE_VTO_NORMALIZE_MAX_DIMENSION = 2048;
const GOOGLE_VTO_JPEG_QUALITY_STEPS = [85, 80, 75, 70, 65, 60] as const;
const GOOGLE_VTO_RESIZE_DIMENSION_STEPS = [
  2048, 1792, 1536, 1280, 1024, 768,
] as const;

type GoogleImageMimeType = "image/jpeg" | "image/png";

interface GoogleImagePayload {
  mimeType: GoogleImageMimeType;
  bytesBase64Encoded: string;
}

export interface GoogleServiceAccountCredentials {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
  project_id?: string;
  quota_project_id?: string;
  type?: string;
  [key: string]: unknown;
}

export interface GoogleVirtualTryOnConfig {
  projectId: string;
  location: string;
  model: string;
  storageUri?: string;
  credentials?: GoogleServiceAccountCredentials;
  credentialsFile?: string;
}

interface CachedGoogleResult {
  status: VirtualTryOnProviderStatusResult;
  createdAtMs: number;
}

export type GooglePredictResponse = Record<string, unknown>;

interface GoogleNormalizedInputDiagnostics {
  mimeType: GoogleImageMimeType;
  sizeBytes: number;
}

interface GoogleNormalizedImage
  extends GoogleImagePayload, GoogleNormalizedInputDiagnostics {}

interface GooglePredictDiagnostics {
  endpoint: string;
  location: string;
  model: string;
  personImage: GoogleNormalizedInputDiagnostics;
  garmentImage: GoogleNormalizedInputDiagnostics;
}

@Injectable()
export class GoogleVirtualTryOnProvider implements VirtualTryOnProvider {
  private readonly logger = new Logger(GoogleVirtualTryOnProvider.name);
  private readonly completedResults = new Map<string, CachedGoogleResult>();
  private accessToken?: { value: string; expiresAtMs: number };

  metadata(): VirtualTryOnProviderMetadata {
    return {
      provider: "google",
      providerDisplayName: "Google Virtual Try-On",
      model: readGoogleModel(),
    };
  }

  assertConfigured(): void {
    readGoogleTryOnConfig();
  }

  async submit(
    input: VirtualTryOnProviderSubmitInput,
  ): Promise<VirtualTryOnProviderSubmitResult> {
    const config = readGoogleTryOnConfig();
    let diagnostics: GooglePredictDiagnostics | undefined;
    let httpRequestSent = false;

    try {
      const prepared = await buildGooglePredictRequestWithDiagnostics(
        input,
        config,
      );
      diagnostics = prepared.diagnostics;
      const accessToken = await this.getAccessToken(config);
      httpRequestSent = true;
      const response = await this.predict(
        config,
        accessToken,
        prepared.request,
      );
      const status = normalizeGooglePredictResponse(response);
      const providerPredictionId = `google-vto-${randomUUID()}`;
      this.storeCompletedResult(providerPredictionId, status);
      return { providerPredictionId };
    } catch (error) {
      this.logSafeFailureDiagnostics(error, httpRequestSent, diagnostics);
      throwGoogleProviderError(error);
    }
  }

  async poll(
    providerPredictionId: string,
  ): Promise<VirtualTryOnProviderStatusResult> {
    const cached = this.completedResults.get(providerPredictionId);
    if (!cached) {
      return {
        status: "FAILED",
        errorCode: TRY_ON_LAB_ERROR_CODES.failed,
        errorMessage: "Try-On provider result is no longer available.",
      };
    }

    return cached.status;
  }

  protected async predict(
    config: GoogleVirtualTryOnConfig,
    accessToken: string,
    request: unknown,
  ): Promise<GooglePredictResponse> {
    const response = await fetch(buildGooglePredictUrl(config), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw await GoogleProviderHttpError.fromResponse(response);
    }

    return readJsonObject(response);
  }

  protected async requestAccessToken(
    config: GoogleVirtualTryOnConfig,
  ): Promise<{ accessToken: string; expiresInSeconds: number }> {
    try {
      const client = await this.createGoogleAuth(config).getClient();
      const token = await client.getAccessToken();
      if (!token.token) {
        throw new Error("GoogleAuth did not return an access token.");
      }

      return {
        accessToken: token.token,
        expiresInSeconds: 3600,
      };
    } catch (error) {
      throw new ApiErrorException(
        HttpStatus.SERVICE_UNAVAILABLE,
        TRY_ON_LAB_ERROR_CODES.configurationError,
        googleAuthenticationErrorMessage(error),
      );
    }
  }

  protected createGoogleAuth(
    config: GoogleVirtualTryOnConfig,
  ): GoogleAuth<AuthClient> {
    return new GoogleAuth({
      credentials: config.credentials,
      keyFilename: config.credentialsFile,
      projectId: config.projectId,
      scopes: GOOGLE_CLOUD_PLATFORM_SCOPE,
    });
  }

  private async getAccessToken(
    config: GoogleVirtualTryOnConfig,
  ): Promise<string> {
    if (
      this.accessToken &&
      this.accessToken.expiresAtMs - TOKEN_EXPIRY_SAFETY_MS > Date.now()
    ) {
      return this.accessToken.value;
    }

    const token = await this.requestAccessToken(config);
    this.accessToken = {
      value: token.accessToken,
      expiresAtMs: Date.now() + token.expiresInSeconds * 1000,
    };

    return token.accessToken;
  }

  private storeCompletedResult(
    providerPredictionId: string,
    status: VirtualTryOnProviderStatusResult,
  ): void {
    this.completedResults.set(providerPredictionId, {
      status,
      createdAtMs: Date.now(),
    });

    while (this.completedResults.size > MAX_COMPLETED_RESULTS) {
      const oldest = [...this.completedResults.entries()].sort(
        (left, right) => left[1].createdAtMs - right[1].createdAtMs,
      )[0]?.[0];
      if (!oldest) {
        return;
      }
      this.completedResults.delete(oldest);
    }
  }

  private logSafeFailureDiagnostics(
    error: unknown,
    httpRequestSent: boolean,
    diagnostics: GooglePredictDiagnostics | undefined,
  ): void {
    const providerError =
      error instanceof GoogleProviderHttpError
        ? {
            googleHttpStatus: error.status,
            googleErrorCode: error.googleErrorCode,
            googleErrorMessage: error.googleErrorMessage,
            googleErrorBody: error.sanitizedBody,
          }
        : {};

    this.logger.warn({
      event: "google_vto_failure_audit",
      httpRequestSent,
      endpoint: diagnostics?.endpoint,
      location: diagnostics?.location,
      model: diagnostics?.model,
      normalizedPersonMimeType: diagnostics?.personImage.mimeType,
      normalizedPersonSizeBytes: diagnostics?.personImage.sizeBytes,
      normalizedGarmentMimeType: diagnostics?.garmentImage.mimeType,
      normalizedGarmentSizeBytes: diagnostics?.garmentImage.sizeBytes,
      mappedSelfxErrorCode: selfxErrorCodeForAudit(error),
      mappedBy: selfxMappingPathForAudit(error),
      ...providerError,
    });
  }
}

export async function buildGooglePredictRequest(
  input: VirtualTryOnProviderSubmitInput,
  config: Pick<GoogleVirtualTryOnConfig, "storageUri">,
): Promise<unknown> {
  const normalizedImages = await normalizeGoogleInputImages(input);
  return buildGooglePredictRequestFromImages(input, config, normalizedImages);
}

async function buildGooglePredictRequestWithDiagnostics(
  input: VirtualTryOnProviderSubmitInput,
  config: GoogleVirtualTryOnConfig,
): Promise<{ request: unknown; diagnostics: GooglePredictDiagnostics }> {
  const normalizedImages = await normalizeGoogleInputImages(input);
  const request = buildGooglePredictRequestFromImages(
    input,
    config,
    normalizedImages,
  );

  return {
    request,
    diagnostics: {
      endpoint: buildGooglePredictUrl(config),
      location: config.location,
      model: config.model,
      personImage: {
        mimeType: normalizedImages.personImage.mimeType,
        sizeBytes: normalizedImages.personImage.sizeBytes,
      },
      garmentImage: {
        mimeType: normalizedImages.garmentImage.mimeType,
        sizeBytes: normalizedImages.garmentImage.sizeBytes,
      },
    },
  };
}

async function normalizeGoogleInputImages(
  input: VirtualTryOnProviderSubmitInput,
): Promise<{
  personImage: GoogleNormalizedImage;
  garmentImage: GoogleNormalizedImage;
}> {
  const [personImage, garmentImage] = await Promise.all([
    normalizeGoogleInputImage(input.personImageDataUri),
    normalizeGoogleInputImage(input.garmentImageDataUri),
  ]);

  return { personImage, garmentImage };
}

function buildGooglePredictRequestFromImages(
  _input: VirtualTryOnProviderSubmitInput,
  config: Pick<GoogleVirtualTryOnConfig, "storageUri">,
  images: {
    personImage: GoogleNormalizedImage;
    garmentImage: GoogleNormalizedImage;
  },
): unknown {
  const parameters: Record<string, unknown> = {
    sampleCount: 1,
  };

  if (config.storageUri) {
    parameters.storageUri = config.storageUri;
  }

  const request = {
    instances: [
      {
        personImage: {
          image: googleImagePayload(images.personImage),
        },
        productImages: [
          {
            image: googleImagePayload(images.garmentImage),
          },
        ],
      },
    ],
    parameters,
  };

  return request;
}

function googleImagePayload(image: GoogleNormalizedImage): GoogleImagePayload {
  return {
    mimeType: image.mimeType,
    bytesBase64Encoded: image.bytesBase64Encoded,
  };
}

export function normalizeGooglePredictResponse(
  response: GooglePredictResponse,
): VirtualTryOnProviderStatusResult {
  const predictions = asArray(response.predictions);
  const firstPrediction = predictions[0];
  const image = firstImageFromPrediction(firstPrediction);

  if (image?.raiFilteredReason) {
    return {
      status: "FAILED",
      errorCode: TRY_ON_LAB_ERROR_CODES.moderationRejected,
      errorMessage: "The provider rejected the image content.",
    };
  }

  if (image?.bytesBase64Encoded) {
    return {
      status: "COMPLETED",
      resultImage: `data:${image.mimeType ?? "image/jpeg"};base64,${
        image.bytesBase64Encoded
      }`,
    };
  }

  if (image?.gcsUri) {
    return {
      status: "COMPLETED",
      resultImage: image.gcsUri,
    };
  }

  return {
    status: "FAILED",
    errorCode: TRY_ON_LAB_ERROR_CODES.failed,
    errorMessage: "Try-On generation failed.",
  };
}

export function readGoogleTryOnConfig(): GoogleVirtualTryOnConfig {
  const credentials = readGoogleServiceAccountCredentials();
  const projectId =
    firstConfiguredValue("GOOGLE_CLOUD_PROJECT", "GOOGLE_PROJECT_ID") ??
    credentials?.project_id ??
    credentials?.quota_project_id;

  if (!projectId) {
    throw new ApiErrorException(
      HttpStatus.SERVICE_UNAVAILABLE,
      TRY_ON_LAB_ERROR_CODES.configurationError,
      "Google Try-On provider project is not configured.",
    );
  }

  return {
    projectId,
    location: readGoogleLocation(),
    model: readGoogleModel(),
    storageUri: firstConfiguredValue("GOOGLE_VTO_OUTPUT_STORAGE_URI"),
    credentials,
    credentialsFile: firstConfiguredValue("GOOGLE_APPLICATION_CREDENTIALS"),
  };
}

export function buildGooglePredictUrl(
  config: Pick<GoogleVirtualTryOnConfig, "projectId" | "location" | "model">,
): string {
  return `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.location}/publishers/google/models/${config.model}:predict`;
}

function readGoogleServiceAccountCredentials():
  GoogleServiceAccountCredentials | undefined {
  const inlineJson = firstConfiguredValue(
    "GOOGLE_APPLICATION_CREDENTIALS_JSON",
  );
  const base64Json = firstConfiguredValue(
    "GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64",
  );

  if (!inlineJson && !base64Json) {
    return undefined;
  }

  try {
    const raw = inlineJson
      ? inlineJson
      : base64Json
        ? Buffer.from(base64Json, "base64").toString("utf8")
        : undefined;

    if (!raw) {
      return undefined;
    }

    return parseGoogleServiceAccountCredentials(JSON.parse(raw));
  } catch {
    throw new ApiErrorException(
      HttpStatus.SERVICE_UNAVAILABLE,
      TRY_ON_LAB_ERROR_CODES.configurationError,
      "Google Try-On provider explicit credentials are invalid.",
    );
  }
}

function parseGoogleServiceAccountCredentials(
  value: unknown,
): GoogleServiceAccountCredentials {
  if (!value || typeof value !== "object") {
    throw new Error("credentials must be an object");
  }

  const record = value as Record<string, unknown>;
  return record as GoogleServiceAccountCredentials;
}

export async function normalizeGoogleInputImage(
  dataUri: string,
): Promise<GoogleNormalizedImage> {
  const parsed = parseInputDataUri(dataUri);
  const metadata = await readDecodedImageMetadata(parsed.buffer);
  const decodedMimeType = mimeTypeFromSharpFormat(metadata.format);
  if (!decodedMimeType || !metadata.width || !metadata.height) {
    throwGoogleImageInvalid();
  }

  if (
    (decodedMimeType === "image/jpeg" || decodedMimeType === "image/png") &&
    parsed.buffer.length <= GOOGLE_VTO_TARGET_MAX_IMAGE_BYTES
  ) {
    return {
      mimeType: decodedMimeType,
      bytesBase64Encoded: parsed.buffer.toString("base64"),
      sizeBytes: parsed.buffer.length,
    };
  }

  const normalized =
    decodedMimeType === "image/png"
      ? await normalizeOversizedPng(parsed.buffer)
      : await normalizeToJpeg(parsed.buffer);

  return {
    mimeType: normalized.mimeType,
    bytesBase64Encoded: normalized.buffer.toString("base64"),
    sizeBytes: normalized.buffer.length,
  };
}

function parseInputDataUri(dataUri: string): { buffer: Buffer } {
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/u.exec(dataUri);

  if (!match) {
    throwGoogleImageInvalid();
  }

  const buffer = Buffer.from(match[2] ?? "", "base64");
  if (buffer.length === 0) {
    throwGoogleImageInvalid();
  }

  return { buffer };
}

async function readDecodedImageMetadata(
  buffer: Buffer,
): Promise<sharp.Metadata> {
  try {
    return await sharp(buffer, { failOn: "error" }).metadata();
  } catch {
    throwGoogleImageInvalid();
  }
}

async function normalizeOversizedPng(
  buffer: Buffer,
): Promise<{ mimeType: GoogleImageMimeType; buffer: Buffer }> {
  const png = await sharp(buffer, { failOn: "error" })
    .rotate()
    .resize({
      width: GOOGLE_VTO_NORMALIZE_MAX_DIMENSION,
      height: GOOGLE_VTO_NORMALIZE_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      force: true,
    })
    .toBuffer();

  if (png.length <= GOOGLE_VTO_TARGET_MAX_IMAGE_BYTES) {
    return { mimeType: "image/png", buffer: png };
  }

  return normalizeToJpeg(buffer);
}

async function normalizeToJpeg(
  buffer: Buffer,
): Promise<{ mimeType: "image/jpeg"; buffer: Buffer }> {
  let smallest: Buffer | undefined;

  for (const dimension of GOOGLE_VTO_RESIZE_DIMENSION_STEPS) {
    for (const quality of GOOGLE_VTO_JPEG_QUALITY_STEPS) {
      const output = await sharp(buffer, { failOn: "error" })
        .rotate()
        .resize({
          width: dimension,
          height: dimension,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({
          quality,
          mozjpeg: true,
          force: true,
        })
        .toBuffer();

      if (!smallest || output.length < smallest.length) {
        smallest = output;
      }

      if (output.length <= GOOGLE_VTO_TARGET_MAX_IMAGE_BYTES) {
        return { mimeType: "image/jpeg", buffer: output };
      }
    }
  }

  if (smallest && smallest.length <= GOOGLE_VTO_TARGET_MAX_IMAGE_BYTES) {
    return { mimeType: "image/jpeg", buffer: smallest };
  }

  throwGoogleImageInvalid();
}

function mimeTypeFromSharpFormat(
  format: string | undefined,
): "image/jpeg" | "image/png" | "image/webp" | undefined {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return undefined;
  }
}

function throwGoogleImageInvalid(): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    TRY_ON_LAB_ERROR_CODES.imageInvalid,
    "The provider could not use one of the uploaded images.",
  );
}

function firstImageFromPrediction(prediction: unknown):
  | {
      mimeType?: string;
      bytesBase64Encoded?: string;
      gcsUri?: string;
      raiFilteredReason?: string;
    }
  | undefined {
  const record = asRecord(prediction);
  if (!record) {
    return undefined;
  }

  const images = asArray(record.images);
  const imageRecord = asRecord(images[0]) ?? record;
  const bytesBase64Encoded =
    typeof imageRecord.bytesBase64Encoded === "string"
      ? imageRecord.bytesBase64Encoded
      : undefined;
  const gcsUri =
    typeof imageRecord.gcsUri === "string" ? imageRecord.gcsUri : undefined;
  const raiFilteredReason =
    typeof imageRecord.raiFilteredReason === "string"
      ? imageRecord.raiFilteredReason
      : undefined;
  const mimeType =
    typeof imageRecord.mimeType === "string" ? imageRecord.mimeType : undefined;

  return { mimeType, bytesBase64Encoded, gcsUri, raiFilteredReason };
}

function throwGoogleProviderError(error: unknown): never {
  if (error instanceof ApiErrorException) {
    throw error;
  }

  if (error instanceof GoogleProviderHttpError) {
    if (error.status === 401 || error.status === 403) {
      throw new ApiErrorException(
        HttpStatus.SERVICE_UNAVAILABLE,
        TRY_ON_LAB_ERROR_CODES.configurationError,
        "Try-On provider authentication failed.",
      );
    }

    if (error.status === 429) {
      throw new ApiErrorException(
        HttpStatus.TOO_MANY_REQUESTS,
        TRY_ON_LAB_ERROR_CODES.providerRateLimited,
        "Try-On provider rate limit reached.",
      );
    }

    if (error.status >= 500) {
      throw new ApiErrorException(
        HttpStatus.SERVICE_UNAVAILABLE,
        TRY_ON_LAB_ERROR_CODES.providerUnavailable,
        "Try-On provider is temporarily unavailable.",
      );
    }

    const runtime = mapGoogleRuntimeError(error.message);
    throw new ApiErrorException(
      HttpStatus.BAD_GATEWAY,
      runtime.errorCode,
      runtime.errorMessage,
    );
  }

  throw new ApiErrorException(
    HttpStatus.SERVICE_UNAVAILABLE,
    TRY_ON_LAB_ERROR_CODES.providerUnavailable,
    "Try-On provider could not be reached.",
  );
}

function mapGoogleRuntimeError(message: string): {
  errorCode: TryOnLabErrorCode;
  errorMessage: string;
} {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("safety") ||
    normalized.includes("rai") ||
    normalized.includes("responsible ai") ||
    normalized.includes("policy") ||
    normalized.includes("content")
  ) {
    return {
      errorCode: TRY_ON_LAB_ERROR_CODES.moderationRejected,
      errorMessage: "The provider rejected the image content.",
    };
  }

  if (
    normalized.includes("image") ||
    normalized.includes("mime") ||
    normalized.includes("base64")
  ) {
    return {
      errorCode: TRY_ON_LAB_ERROR_CODES.imageInvalid,
      errorMessage: "The provider could not use one of the uploaded images.",
    };
  }

  return {
    errorCode: TRY_ON_LAB_ERROR_CODES.failed,
    errorMessage: "Try-On provider rejected the request.",
  };
}

function readGoogleLocation(): string {
  return (
    firstConfiguredValue("GOOGLE_CLOUD_LOCATION", "GOOGLE_VTO_LOCATION") ??
    GOOGLE_VTO_DEFAULT_LOCATION
  );
}

function readGoogleModel(): string {
  return firstConfiguredValue("GOOGLE_VTO_MODEL") ?? GOOGLE_VTO_DEFAULT_MODEL;
}

function firstConfiguredValue(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

async function readJsonObject(
  response: Response,
): Promise<Record<string, unknown>> {
  try {
    const value = (await response.json()) as unknown;
    if (value && typeof value === "object") {
      return value as Record<string, unknown>;
    }
  } catch {
    // Fall through to the normalized provider error below.
  }

  throw new ApiErrorException(
    HttpStatus.BAD_GATEWAY,
    TRY_ON_LAB_ERROR_CODES.failed,
    "Try-On provider returned an invalid response.",
  );
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function googleAuthenticationErrorMessage(error: unknown): string {
  const detail =
    error instanceof Error && error.message
      ? ` ${sanitizeProviderDetail(error.message)}`
      : "";
  return `Google Try-On provider authentication failed.${detail}`;
}

function sanitizeProviderDetail(message: string): string {
  return message.replace(/\s+/g, " ").slice(0, 240);
}

class GoogleProviderHttpError extends Error {
  private constructor(
    readonly status: number,
    readonly googleErrorCode: string | undefined,
    readonly googleErrorMessage: string | undefined,
    readonly sanitizedBody: unknown,
    message: string,
  ) {
    super(message);
  }

  static async fromResponse(
    response: Response,
  ): Promise<GoogleProviderHttpError> {
    const body = await response.text();
    const parsed = parseGoogleErrorBody(body);
    return new GoogleProviderHttpError(
      response.status,
      parsed.googleErrorCode,
      parsed.googleErrorMessage,
      parsed.sanitizedBody,
      parsed.googleErrorMessage ?? providerErrorMessage(body),
    );
  }
}

function selfxErrorCodeForAudit(error: unknown): string {
  if (error instanceof ApiErrorException) {
    return apiErrorCodeForAudit(error);
  }

  if (error instanceof GoogleProviderHttpError) {
    if (error.status === 401 || error.status === 403) {
      return TRY_ON_LAB_ERROR_CODES.configurationError;
    }
    if (error.status === 429) {
      return TRY_ON_LAB_ERROR_CODES.providerRateLimited;
    }
    if (error.status >= 500) {
      return TRY_ON_LAB_ERROR_CODES.providerUnavailable;
    }
    return mapGoogleRuntimeError(error.message).errorCode;
  }

  return TRY_ON_LAB_ERROR_CODES.providerUnavailable;
}

function selfxMappingPathForAudit(error: unknown): string {
  if (error instanceof ApiErrorException) {
    const code = apiErrorCodeForAudit(error);
    if (code === TRY_ON_LAB_ERROR_CODES.imageInvalid) {
      return "GoogleVirtualTryOnProvider.submit -> buildGooglePredictRequestWithDiagnostics -> normalizeGoogleInputImage -> throwGoogleImageInvalid";
    }
    if (code === TRY_ON_LAB_ERROR_CODES.configurationError) {
      return "GoogleVirtualTryOnProvider.submit -> getAccessToken -> requestAccessToken -> GoogleAuth.getClient/getAccessToken -> ApiErrorException";
    }
    return "GoogleVirtualTryOnProvider.submit -> ApiErrorException";
  }

  if (error instanceof GoogleProviderHttpError) {
    return "GoogleVirtualTryOnProvider.predict -> GoogleProviderHttpError -> throwGoogleProviderError -> mapGoogleRuntimeError";
  }

  return "GoogleVirtualTryOnProvider.submit -> throwGoogleProviderError -> providerUnavailable";
}

function apiErrorCodeForAudit(error: ApiErrorException): string {
  const response = error.getResponse();
  const body = asRecord(response);
  const apiError = asRecord(body?.error);
  const code = apiError?.code;
  return typeof code === "string" ? code : TRY_ON_LAB_ERROR_CODES.failed;
}

function parseGoogleErrorBody(body: string): {
  googleErrorCode: string | undefined;
  googleErrorMessage: string | undefined;
  sanitizedBody: unknown;
} {
  if (!body) {
    return {
      googleErrorCode: undefined,
      googleErrorMessage: undefined,
      sanitizedBody: undefined,
    };
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    const record = asRecord(parsed);
    const error = asRecord(record?.error);
    const numericCode = error?.code;
    const statusCode = error?.status;
    const message = error?.message;

    return {
      googleErrorCode:
        typeof statusCode === "string"
          ? statusCode
          : typeof numericCode === "number"
            ? String(numericCode)
            : undefined,
      googleErrorMessage:
        typeof message === "string"
          ? sanitizeProviderDetail(message)
          : undefined,
      sanitizedBody: sanitizeGoogleErrorValue(parsed),
    };
  } catch {
    return {
      googleErrorCode: undefined,
      googleErrorMessage: undefined,
      sanitizedBody: sanitizeProviderDetail(redactSensitiveText(body)),
    };
  }
}

function sanitizeGoogleErrorValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeGoogleErrorValue);
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = isSensitiveDiagnosticKey(key)
        ? "[REDACTED]"
        : sanitizeGoogleErrorValue(entry);
    }
    return output;
  }

  if (typeof value === "string") {
    return sanitizeProviderDetail(redactSensitiveText(value));
  }

  return value;
}

function isSensitiveDiagnosticKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized.includes("authorization") ||
    normalized.includes("credential") ||
    normalized.includes("token") ||
    normalized.includes("private_key") ||
    normalized.includes("assertion") ||
    normalized.includes("bytesbase64encoded") ||
    normalized.includes("imagebytes")
  );
}

function redactSensitiveText(value: string): string {
  return value
    .replace(
      /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=_-]+/giu,
      "[REDACTED_IMAGE_DATA_URI]",
    )
    .replace(/\b[A-Za-z0-9+/=_-]{120,}\b/gu, "[REDACTED_LONG_VALUE]");
}

function providerErrorMessage(body: string): string {
  if (!body) {
    return "Try-On provider rejected the request.";
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    const record = asRecord(parsed);
    const error = asRecord(record?.error);
    const message = error?.message;
    return typeof message === "string" ? message : body;
  } catch {
    return body;
  }
}
