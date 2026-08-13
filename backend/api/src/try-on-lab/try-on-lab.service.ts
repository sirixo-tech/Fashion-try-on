import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { createSelfxId } from "@selfx/database";
import {
  TRY_ON_LAB_ERROR_CODES,
  type TryOnLabRunResponse,
} from "@selfx/shared";

import { ApiErrorException } from "../common/api-error.exception.js";
import {
  TRY_ON_LAB_POLL_INTERVAL_MS,
  TRY_ON_LAB_PROVIDER,
  TRY_ON_LAB_PROVIDER_TIMEOUT_MS,
} from "./try-on-lab.constants.js";
import type { CreateTryOnLabRunPayload } from "./try-on-lab-multipart.js";
import { TryOnLabRunRegistryService } from "./try-on-lab-run-registry.service.js";
import type { TryOnProvider } from "./providers/try-on-provider.js";

@Injectable()
export class TryOnLabService {
  constructor(
    private readonly registry: TryOnLabRunRegistryService,
    @Inject(TRY_ON_LAB_PROVIDER) private readonly provider: TryOnProvider,
  ) {}

  createRun(
    actorUserId: string,
    payload: CreateTryOnLabRunPayload,
  ): TryOnLabRunResponse {
    this.assertLabEnabled();
    this.provider.assertConfigured();

    const run = this.registry.create({
      id: createSelfxId(),
      actorUserId,
      garmentSource: payload.garmentSource,
      garmentIntent: payload.garmentIntent,
      category: payload.category,
      garmentPhotoType: payload.garmentPhotoType,
      generationProfile: payload.generationProfile,
      categoryResolutionSource: payload.categoryResolutionSource,
      photoTypeResolutionSource: payload.photoTypeResolutionSource,
      profileResolutionSource: payload.profileResolutionSource,
      analysisConfidence: payload.analysisConfidence,
      disambiguationRequired: payload.disambiguationRequired,
      disambiguationResolved: payload.disambiguationResolved,
      garmentAnalysisBodyCoverage: payload.garmentAnalysisBodyCoverage,
      garmentAnalysisReasonCodes: payload.garmentAnalysisReasonCodes,
      providerMetadata: this.provider.metadata(),
      qualityWarningCodes: payload.qualityWarningCodes,
      qualityOverrideAccepted: payload.qualityOverrideAccepted,
    });

    void this.processRun(run.id, payload);
    return this.registry.toResponse(run);
  }

  getRun(actorUserId: string, runId: string): TryOnLabRunResponse {
    this.assertLabEnabled();
    const run = this.registry.getForActor(runId, actorUserId);
    if (!run) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        TRY_ON_LAB_ERROR_CODES.failed,
        "Try-On Lab run was not found.",
      );
    }

    return this.registry.toResponse(run);
  }

  private async processRun(
    runId: string,
    payload: CreateTryOnLabRunPayload,
  ): Promise<void> {
    const startedAt = new Date();
    this.registry.update(runId, { startedAt });

    try {
      const submitted = await this.provider.submit({
        personImageDataUri: payload.personImage.dataUri,
        garmentImageDataUri: payload.garmentImage.dataUri,
        category: payload.category,
        garmentPhotoType: payload.garmentPhotoType,
        generationProfile: payload.generationProfile,
      });
      this.registry.update(runId, {
        status: "PROCESSING",
        providerPredictionId: submitted.providerPredictionId,
      });

      while (
        Date.now() - startedAt.getTime() <
        TRY_ON_LAB_PROVIDER_TIMEOUT_MS
      ) {
        const status = await this.provider.poll(submitted.providerPredictionId);
        this.registry.update(runId, terminalPatch(status));

        if (status.status === "COMPLETED" || status.status === "FAILED") {
          return;
        }

        await wait(TRY_ON_LAB_POLL_INTERVAL_MS);
      }

      this.registry.update(runId, {
        status: "FAILED",
        errorCode: TRY_ON_LAB_ERROR_CODES.timedOut,
        errorMessage: "Try-On generation timed out.",
        completedAt: new Date(),
      });
    } catch (error) {
      this.registry.update(runId, {
        ...normalizeProcessError(error),
        completedAt: new Date(),
      });
    }
  }

  private assertLabEnabled(): void {
    if (process.env.TRYON_LAB_ENABLED !== "true") {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        TRY_ON_LAB_ERROR_CODES.configurationError,
        "Try-On Lab is disabled for this environment.",
      );
    }
  }
}

function terminalPatch(
  status: Awaited<ReturnType<TryOnProvider["poll"]>>,
): Awaited<ReturnType<TryOnProvider["poll"]>> & { completedAt?: Date } {
  if (status.status === "COMPLETED" || status.status === "FAILED") {
    return { ...status, completedAt: new Date() };
  }

  return status;
}

function normalizeProcessError(error: unknown): {
  status: "FAILED";
  errorCode: (typeof TRY_ON_LAB_ERROR_CODES)[keyof typeof TRY_ON_LAB_ERROR_CODES];
  errorMessage: string;
} {
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

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
