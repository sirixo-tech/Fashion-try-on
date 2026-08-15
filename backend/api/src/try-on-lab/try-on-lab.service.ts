import { HttpStatus, Injectable } from "@nestjs/common";

import { createSelfxId } from "@selfx/database";
import {
  TRY_ON_LAB_ERROR_CODES,
  type TryOnLabRunResponse,
} from "@selfx/shared";

import { ApiErrorException } from "../common/api-error.exception.js";
import { TryOnExecutionService } from "../try-on/try-on-execution.service.js";
import type { CreateTryOnLabRunPayload } from "./try-on-lab-multipart.js";
import { TryOnLabRunRegistryService } from "./try-on-lab-run-registry.service.js";

@Injectable()
export class TryOnLabService {
  constructor(
    private readonly registry: TryOnLabRunRegistryService,
    private readonly execution: TryOnExecutionService,
  ) {}

  createRun(
    actorUserId: string,
    payload: CreateTryOnLabRunPayload,
  ): TryOnLabRunResponse {
    this.assertLabEnabled();
    this.execution.assertConfigured();

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
      providerMetadata: this.execution.metadata(),
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
    await this.execution.process(payload, {
      onStarted: (startedAt) => {
        this.registry.update(runId, { startedAt });
      },
      onSubmitted: (providerPredictionId) => {
        this.registry.update(runId, {
          status: "PROCESSING",
          providerPredictionId,
        });
      },
      onStatus: (status) => {
        this.registry.update(runId, status);
      },
      onTimedOut: (completedAt) => {
        this.registry.update(runId, {
          status: "FAILED",
          errorCode: TRY_ON_LAB_ERROR_CODES.timedOut,
          errorMessage: "Try-On generation timed out.",
          completedAt,
        });
      },
      onError: (error, completedAt) => {
        this.registry.update(runId, {
          ...error,
          completedAt,
        });
      },
    });
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
