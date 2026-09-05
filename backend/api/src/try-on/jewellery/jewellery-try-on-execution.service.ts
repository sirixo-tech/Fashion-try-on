import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { TRY_ON_LAB_ERROR_CODES } from "@selfx/shared";

import { ApiErrorException } from "../../common/api-error.exception.js";
import type { NormalizedTryOnProcessError } from "../try-on-execution.service.js";
import {
  normalizeProcessError,
  terminalPatch,
} from "../try-on-execution.service.js";
import {
  JEWELLERY_TRY_ON_PROVIDER,
  TRY_ON_PROVIDER_POLL_INTERVAL_MS,
  TRY_ON_PROVIDER_TIMEOUT_MS,
} from "../try-on.constants.js";
import type {
  JewelleryTryOnProvider,
  JewelleryTryOnProviderMetadata,
  JewelleryTryOnProviderStatusResult,
  JewelleryTryOnProviderSubmitInput,
} from "./jewellery-try-on.provider.js";

type MaybePromise<T> = T | Promise<T>;

export interface JewelleryTryOnExecutionObserver {
  onStarted(startedAt: Date): MaybePromise<void>;
  onSubmitted(providerPredictionId: string): MaybePromise<void>;
  onStatus(
    status: JewelleryTryOnProviderStatusResult & { completedAt?: Date },
  ): MaybePromise<void>;
  onTimedOut(completedAt: Date): MaybePromise<void>;
  onError(
    error: NormalizedTryOnProcessError,
    completedAt: Date,
  ): MaybePromise<void>;
}

@Injectable()
export class JewelleryTryOnExecutionService {
  constructor(
    @Inject(JEWELLERY_TRY_ON_PROVIDER)
    private readonly provider: JewelleryTryOnProvider,
  ) {}

  assertConfigured(): void {
    this.provider.assertConfigured();
  }

  metadata(): JewelleryTryOnProviderMetadata {
    return this.provider.metadata();
  }

  async process(
    payload: JewelleryTryOnProviderSubmitInput,
    observer: JewelleryTryOnExecutionObserver,
  ): Promise<void> {
    const startedAt = new Date();
    await observer.onStarted(startedAt);

    try {
      const submitted = await this.provider.submit(payload);
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

export function throwJewelleryTryOnNotEnabled(): never {
  throw new ApiErrorException(
    HttpStatus.FORBIDDEN,
    TRY_ON_LAB_ERROR_CODES.configurationError,
    "Jewellery Try-On is not enabled for this Store.",
  );
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
