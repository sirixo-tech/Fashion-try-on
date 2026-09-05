import { HttpStatus, Injectable } from "@nestjs/common";

import { createSelfxId } from "@selfx/database";
import {
  TRY_ON_LAB_ERROR_CODES,
  type JewelleryTryOnLabRunResponse,
} from "@selfx/shared";

import { ApiErrorException } from "../common/api-error.exception.js";
import { JewelleryTryOnExecutionService } from "../try-on/jewellery/jewellery-try-on-execution.service.js";
import { JewelleryPersonImageValidatorService } from "../try-on/jewellery/jewellery-person-image-validator.service.js";
import type { CreateJewelleryTryOnLabRunPayload } from "./jewellery-try-on-lab-multipart.js";
import { JewelleryTryOnLabRunRegistryService } from "./jewellery-try-on-lab-run-registry.service.js";

@Injectable()
export class JewelleryTryOnLabService {
  constructor(
    private readonly registry: JewelleryTryOnLabRunRegistryService,
    private readonly execution: JewelleryTryOnExecutionService,
    private readonly personImageValidator: JewelleryPersonImageValidatorService,
  ) {}

  async createRun(
    actorUserId: string,
    payload: CreateJewelleryTryOnLabRunPayload,
  ): Promise<JewelleryTryOnLabRunResponse> {
    this.assertLabEnabled();
    const preflight = await this.personImageValidator.validate({
      buffer: payload.personImage.buffer,
      declaredContentType: payload.personImage.mimeType,
      jewelleryType: payload.jewelleryType,
      channel: "TRY_ON_LAB",
      semanticEvidence: payload.personSemanticEvidence,
    });
    if (!preflight.canProceed) {
      throw new ApiErrorException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        preflight.reasonCode ?? "JEWELLERY_PERSON_IMAGE_INVALID",
        preflight.message ?? "Retake or upload another person photo.",
      );
    }
    this.execution.assertConfigured();

    const run = this.registry.create({
      id: createSelfxId(),
      actorUserId,
      jewelleryType: payload.jewelleryType,
      productReference: payload.productReference,
      providerMetadata: this.execution.metadata(),
    });

    void this.processRun(run.id, payload);
    return this.registry.toResponse(run);
  }

  getRun(actorUserId: string, runId: string): JewelleryTryOnLabRunResponse {
    this.assertLabEnabled();
    const run = this.registry.getForActor(runId, actorUserId);
    if (!run) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        TRY_ON_LAB_ERROR_CODES.failed,
        "Jewellery Lab run was not found.",
      );
    }

    return this.registry.toResponse(run);
  }

  private async processRun(
    runId: string,
    payload: CreateJewelleryTryOnLabRunPayload,
  ): Promise<void> {
    await this.execution.process(
      {
        personImageDataUri: payload.personImage.dataUri,
        jewelleryImageDataUri: payload.jewelleryImage.dataUri,
        jewelleryType: payload.jewelleryType,
        productReference: payload.productReference,
      },
      {
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
            errorMessage: "Jewellery Try-On generation timed out.",
            completedAt,
          });
        },
        onError: (error, completedAt) => {
          this.registry.update(runId, {
            ...error,
            completedAt,
          });
        },
      },
    );
  }

  assertLabEnabled(): void {
    if (process.env.TRYON_LAB_ENABLED !== "true") {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        TRY_ON_LAB_ERROR_CODES.configurationError,
        "Try-On Lab is disabled for this environment.",
      );
    }
  }
}
