import { HttpStatus, Injectable } from "@nestjs/common";
import Fashn from "fashn";

import {
  SELFX_AI_PROVIDER_ERROR_CODES,
  SelfxAiProviderError,
} from "../../provider-errors.js";
import {
  GarmentPreviewProvider,
  type GarmentPreviewInput,
  type GarmentPreviewProviderMetadata,
  type GarmentPreviewResult,
} from "../garment-preview.provider.js";
import { promptFor } from "./openai-garment-preview.provider.js";

const FASHN_GARMENT_PREVIEW_MODEL = "edit";

type FashnPreviewClient = Pick<Fashn, "predictions">;

@Injectable()
export class FashnGarmentPreviewProvider extends GarmentPreviewProvider {
  private client?: FashnPreviewClient;

  override metadata(): GarmentPreviewProviderMetadata {
    return {
      provider: "fashn",
      providerDisplayName: "FASHN",
      model: FASHN_GARMENT_PREVIEW_MODEL,
    };
  }

  override assertConfigured(): void {
    if (!readFashnApiKey()) {
      throw new SelfxAiProviderError(
        SELFX_AI_PROVIDER_ERROR_CODES.configurationError,
        "Garment extraction is not configured.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  override async generatePreview(
    input: GarmentPreviewInput,
  ): Promise<GarmentPreviewResult> {
    const client = this.getClient();

    try {
      const response = await client.predictions.subscribe({
        model_name: FASHN_GARMENT_PREVIEW_MODEL,
        inputs: {
          image: toDataUri(input),
          prompt: promptFor(input.garmentIntent),
          aspect_ratio: "2:3",
          generation_mode: "balanced",
          num_images: 1,
          output_format: "png",
          resolution: "1k",
          return_base64: true,
        },
        timeout: 120_000,
        pollInterval: 2_000,
      } satisfies Fashn.PredictionSubscribeParams);

      if (response.status !== "completed") {
        throw mapFashnRuntimeError(response.status, response.error?.name);
      }

      const imageDataUri = imageDataUriFromOutput(response.output);
      if (!imageDataUri) {
        throw new SelfxAiProviderError(
          SELFX_AI_PROVIDER_ERROR_CODES.generationFailed,
          "Garment extraction did not return an image.",
          HttpStatus.BAD_GATEWAY,
        );
      }

      return {
        imageDataUri,
        mimeType: "image/png",
      };
    } catch (error) {
      if (error instanceof SelfxAiProviderError) {
        throw error;
      }
      throwFashnApiError(error);
    }
  }

  private getClient(): FashnPreviewClient {
    const apiKey = readFashnApiKey();
    if (!apiKey) {
      this.assertConfigured();
      throw new Error("FASHN_API_KEY missing after configuration check.");
    }

    this.client ??= this.createClient(apiKey);
    return this.client;
  }

  protected createClient(apiKey: string): FashnPreviewClient {
    return new Fashn({ apiKey });
  }
}

export function imageDataUriFromOutput(output: unknown): string | null {
  if (!Array.isArray(output)) {
    return null;
  }

  const first = output[0];
  if (typeof first === "string" && first.startsWith("data:image/png;base64,")) {
    return first;
  }

  return null;
}

export function mapFashnRuntimeError(
  providerStatus: string,
  providerErrorName?: string,
): SelfxAiProviderError {
  if (providerStatus === "time_out") {
    return new SelfxAiProviderError(
      SELFX_AI_PROVIDER_ERROR_CODES.generationTimeout,
      "Garment extraction timed out.",
      HttpStatus.GATEWAY_TIMEOUT,
    );
  }

  const name = (providerErrorName ?? "").toLowerCase();
  if (name.includes("image") || name.includes("load")) {
    return new SelfxAiProviderError(
      SELFX_AI_PROVIDER_ERROR_CODES.invalidImage,
      "SelfX could not use this garment image.",
      HttpStatus.BAD_REQUEST,
    );
  }

  if (name.includes("moderation") || name.includes("content")) {
    return new SelfxAiProviderError(
      SELFX_AI_PROVIDER_ERROR_CODES.unsupportedInput,
      "SelfX could not use this garment image.",
      HttpStatus.BAD_REQUEST,
    );
  }

  return new SelfxAiProviderError(
    SELFX_AI_PROVIDER_ERROR_CODES.generationFailed,
    "SelfX could not prepare the garment image.",
    HttpStatus.BAD_GATEWAY,
  );
}

function throwFashnApiError(error: unknown): never {
  if (error instanceof Fashn.APIError) {
    if (error.status === 401 || error.status === 403) {
      throw new SelfxAiProviderError(
        SELFX_AI_PROVIDER_ERROR_CODES.providerAuthFailed,
        "Garment extraction provider authentication failed.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (error.status === 429) {
      throw new SelfxAiProviderError(
        SELFX_AI_PROVIDER_ERROR_CODES.rateLimited,
        "Garment extraction provider rate limit reached.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (error.status >= 500) {
      throw new SelfxAiProviderError(
        SELFX_AI_PROVIDER_ERROR_CODES.providerUnavailable,
        "Garment extraction provider is temporarily unavailable.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    throw new SelfxAiProviderError(
      SELFX_AI_PROVIDER_ERROR_CODES.generationFailed,
      "Garment extraction provider rejected the request.",
      HttpStatus.BAD_GATEWAY,
    );
  }

  throw new SelfxAiProviderError(
    SELFX_AI_PROVIDER_ERROR_CODES.providerUnavailable,
    "Garment extraction provider could not be reached.",
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

function toDataUri(input: GarmentPreviewInput): string {
  return `data:${input.image.mimeType};base64,${input.image.buffer.toString(
    "base64",
  )}`;
}

function readFashnApiKey(): string | undefined {
  const value = process.env.FASHN_API_KEY?.trim();
  return value ? value : undefined;
}
