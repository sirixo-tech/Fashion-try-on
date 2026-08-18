import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { TRY_ON_LAB_ERROR_CODES } from "@selfx/shared";

import { ApiErrorException } from "../common/api-error.exception.js";
import type { CreateTryOnLabRunPayload } from "../try-on-lab/try-on-lab-multipart.js";
import type {
  VirtualTryOnProvider,
  VirtualTryOnProviderMetadata,
  VirtualTryOnProviderStatusResult,
} from "./providers/virtual-try-on.provider.js";
import {
  TRY_ON_PROVIDER,
  TRY_ON_PROVIDER_POLL_INTERVAL_MS,
  TRY_ON_PROVIDER_TIMEOUT_MS,
} from "./try-on.constants.js";

type MaybePromise<T> = T | Promise<T>;

export interface TryOnExecutionObserver {
  onStarted(startedAt: Date): MaybePromise<void>;
  onSubmitted(providerPredictionId: string): MaybePromise<void>;
  onStatus(
    status: VirtualTryOnProviderStatusResult & { completedAt?: Date },
  ): MaybePromise<void>;
  onTimedOut(completedAt: Date): MaybePromise<void>;
  onError(
    error: NormalizedTryOnProcessError,
    completedAt: Date,
  ): MaybePromise<void>;
}

export interface NormalizedTryOnProcessError {
  status: "FAILED";
  errorCode: (typeof TRY_ON_LAB_ERROR_CODES)[keyof typeof TRY_ON_LAB_ERROR_CODES];
  errorMessage: string;
}

@Injectable()
export class TryOnExecutionService {
  constructor(
    @Inject(TRY_ON_PROVIDER) private readonly provider: VirtualTryOnProvider,
  ) {}

  assertConfigured(): void {
    this.provider.assertConfigured();
  }

  metadata(): VirtualTryOnProviderMetadata {
    return this.provider.metadata();
  }

  async process(
    payload: CreateTryOnLabRunPayload,
    observer: TryOnExecutionObserver,
  ): Promise<void> {
    const startedAt = new Date();
    await observer.onStarted(startedAt);

    try {
      const submitted = await this.provider.submit({
        personImageDataUri: payload.personImage.dataUri,
        garmentImageDataUri: payload.garmentImage.dataUri,
        category: payload.category,
        garmentPhotoType: payload.garmentPhotoType,
        generationProfile: payload.generationProfile,
      });
      await observer.onSubmitted(submitted.providerPredictionId);

      while (Date.now() - startedAt.getTime() < TRY_ON_PROVIDER_TIMEOUT_MS) {
        const status = await this.provider.poll(submitted.providerPredictionId);
        await observer.onStatus(terminalPatch(status));

        if (status.status === "COMPLETED" || status.status === "FAILED") {
          return;
        }

        await wait(TRY_ON_PROVIDER_POLL_INTERVAL_MS);
      }

      await observer.onTimedOut(new Date());
    } catch (error) {
      await observer.onError(normalizeProcessError(error), new Date());
    }
  }
}

export function terminalPatch(
  status: VirtualTryOnProviderStatusResult,
): VirtualTryOnProviderStatusResult & { completedAt?: Date } {
  if (status.status === "COMPLETED" || status.status === "FAILED") {
    return { ...status, completedAt: new Date() };
  }

  return status;
}

export function normalizeProcessError(
  error: unknown,
): NormalizedTryOnProcessError {
  if (error instanceof ApiErrorException) {
    const response = error.getResponse();
    if (
      response &&
      typeof response === "object" &&
      "error" in response &&
      response.error &&
      typeof response.error === "object" &&
      "code" in response.error
    ) {
      return {
        status: "FAILED",
        errorCode: String(
          response.error.code,
        ) as (typeof TRY_ON_LAB_ERROR_CODES)[keyof typeof TRY_ON_LAB_ERROR_CODES],
        errorMessage:
          "message" in response.error &&
          typeof response.error.message === "string"
            ? response.error.message
            : "Try-On generation failed.",
      };
    }
  }

  return {
    status: "FAILED",
    errorCode: TRY_ON_LAB_ERROR_CODES.failed,
    errorMessage: "Try-On generation failed.",
  };
}

export function throwTryOnRunNotFound(): never {
  throw new ApiErrorException(
    HttpStatus.NOT_FOUND,
    TRY_ON_LAB_ERROR_CODES.failed,
    "Try-On run was not found.",
  );
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
