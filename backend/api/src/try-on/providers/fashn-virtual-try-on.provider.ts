import { HttpStatus, Injectable } from "@nestjs/common";
import Fashn from "fashn";

import {
  TRY_ON_LAB_ERROR_CODES,
  type SelfxGarmentCategory,
  type SelfxGarmentPhotoType,
  type SelfxGenerationProfile,
  type SelfxTryOnRunStatus,
  type TryOnLabErrorCode,
} from "@selfx/shared";

import { ApiErrorException } from "../../common/api-error.exception.js";
import {
  type VirtualTryOnProvider,
  type VirtualTryOnProviderMetadata,
  type VirtualTryOnProviderStatusResult,
  type VirtualTryOnProviderSubmitInput,
  type VirtualTryOnProviderSubmitResult,
} from "./virtual-try-on.provider.js";

type FashnCategory = "auto" | "tops" | "bottoms" | "one-pieces";
type FashnGarmentPhotoType = "auto" | "flat-lay" | "model";
type FashnMode = "performance" | "balanced" | "quality";
type FashnStatus =
  | "starting"
  | "in_queue"
  | "processing"
  | "completed"
  | "failed"
  | "canceled"
  | "time_out";

const FASHN_TRYON_V1_6_MODEL = "tryon-v1.6";

@Injectable()
export class FashnVirtualTryOnProvider implements VirtualTryOnProvider {
  private client?: Fashn;

  metadata(): VirtualTryOnProviderMetadata {
    return {
      provider: "fashn",
      providerDisplayName: "FASHN",
      model: FASHN_TRYON_V1_6_MODEL,
    };
  }

  assertConfigured(): void {
    if (!readFashnApiKey()) {
      throw new ApiErrorException(
        HttpStatus.SERVICE_UNAVAILABLE,
        TRY_ON_LAB_ERROR_CODES.configurationError,
        "Try-On provider is not configured for this environment.",
      );
    }
  }

  async submit(
    input: VirtualTryOnProviderSubmitInput,
  ): Promise<VirtualTryOnProviderSubmitResult> {
    const client = this.getClient();

    try {
      const response = await client.predictions.run({
        model_name: FASHN_TRYON_V1_6_MODEL,
        inputs: {
          model_image: input.personImageDataUri,
          garment_image: input.garmentImageDataUri,
          category: mapGarmentCategory(input.category),
          garment_photo_type: mapGarmentPhotoType(input.garmentPhotoType),
          mode: mapGenerationProfile(input.generationProfile),
          num_samples: 1,
          output_format: "jpeg",
          segmentation_free: true,
          moderation_level: "permissive",
          return_base64: true,
        },
      } satisfies Fashn.PredictionRunParams);

      return { providerPredictionId: response.id };
    } catch (error) {
      throwProviderApiError(error);
    }
  }

  async poll(
    providerPredictionId: string,
  ): Promise<VirtualTryOnProviderStatusResult> {
    const client = this.getClient();

    try {
      const response = await client.predictions.status(providerPredictionId);
      const status = mapProviderStatus(String(response.status) as FashnStatus);

      if (status === "COMPLETED") {
        return {
          status,
          resultImage: Array.isArray(response.output)
            ? response.output[0]
            : undefined,
        };
      }

      if (status === "FAILED") {
        return {
          status,
          ...mapProviderRuntimeError(
            String(response.status),
            response.error?.name,
          ),
        };
      }

      return { status };
    } catch (error) {
      throwProviderApiError(error);
    }
  }

  private getClient(): Fashn {
    const apiKey = readFashnApiKey();
    if (!apiKey) {
      this.assertConfigured();
      throw new Error("FASHN_API_KEY missing after configuration check.");
    }

    this.client ??= this.createClient(apiKey);
    return this.client;
  }

  protected createClient(apiKey: string): Fashn {
    return new Fashn({ apiKey });
  }
}

export function mapGarmentCategory(
  category: SelfxGarmentCategory,
): FashnCategory {
  switch (category) {
    case "AUTO":
      return "auto";
    case "TOP":
      return "tops";
    case "BOTTOM":
      return "bottoms";
    case "ONE_PIECE":
      return "one-pieces";
    default:
      return assertNever(category);
  }
}

export function mapGarmentPhotoType(
  photoType: SelfxGarmentPhotoType,
): FashnGarmentPhotoType {
  switch (photoType) {
    case "AUTO":
      return "auto";
    case "FLAT_LAY":
      return "flat-lay";
    case "ON_MODEL":
      return "model";
    default:
      return assertNever(photoType);
  }
}

export function mapGenerationProfile(
  profile: SelfxGenerationProfile,
): FashnMode {
  switch (profile) {
    case "PERFORMANCE":
      return "performance";
    case "BALANCED":
      return "balanced";
    case "QUALITY":
      return "quality";
    default:
      return assertNever(profile);
  }
}

export function mapProviderStatus(status: FashnStatus): SelfxTryOnRunStatus {
  switch (status) {
    case "starting":
    case "in_queue":
      return "QUEUED";
    case "processing":
      return "PROCESSING";
    case "completed":
      return "COMPLETED";
    case "failed":
    case "canceled":
    case "time_out":
      return "FAILED";
    default:
      return assertNever(status);
  }
}

export function mapProviderRuntimeError(
  providerStatus: string,
  providerErrorName?: string,
): { errorCode: TryOnLabErrorCode; errorMessage: string } {
  if (providerStatus === "time_out") {
    return {
      errorCode: TRY_ON_LAB_ERROR_CODES.timedOut,
      errorMessage: "Try-On generation timed out.",
    };
  }

  const name = (providerErrorName ?? "").toLowerCase();
  if (name.includes("pose")) {
    return {
      errorCode: TRY_ON_LAB_ERROR_CODES.poseNotDetected,
      errorMessage: "The provider could not detect a usable body pose.",
    };
  }
  if (name.includes("moderation") || name.includes("content")) {
    return {
      errorCode: TRY_ON_LAB_ERROR_CODES.moderationRejected,
      errorMessage: "The provider rejected the image content.",
    };
  }
  if (name.includes("image") || name.includes("load")) {
    return {
      errorCode: TRY_ON_LAB_ERROR_CODES.imageInvalid,
      errorMessage: "The provider could not use one of the uploaded images.",
    };
  }

  return {
    errorCode: TRY_ON_LAB_ERROR_CODES.failed,
    errorMessage: "Try-On generation failed.",
  };
}

function throwProviderApiError(error: unknown): never {
  if (error instanceof Fashn.APIError) {
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

    throw new ApiErrorException(
      HttpStatus.BAD_GATEWAY,
      TRY_ON_LAB_ERROR_CODES.failed,
      "Try-On provider rejected the request.",
    );
  }

  throw new ApiErrorException(
    HttpStatus.SERVICE_UNAVAILABLE,
    TRY_ON_LAB_ERROR_CODES.providerUnavailable,
    "Try-On provider could not be reached.",
  );
}

function readFashnApiKey(): string | undefined {
  const value = process.env.FASHN_API_KEY?.trim();
  return value ? value : undefined;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported FASHN mapping value: ${String(value)}`);
}
