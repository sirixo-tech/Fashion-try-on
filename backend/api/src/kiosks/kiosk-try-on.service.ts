import { HttpStatus, Injectable } from "@nestjs/common";
import { KioskAssignmentScope, type KioskDevice } from "@prisma/client";

import { createSelfxId } from "@selfx/database";
import {
  TRY_ON_LAB_ERROR_CODES,
  isModelCoverageCompatibleWithGarment,
  type SelfxTryOnRunStatus,
} from "@selfx/shared";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { TRY_ON_RESULT_RETENTION_MS } from "../try-on/try-on.constants.js";
import { TryOnExecutionService } from "../try-on/try-on-execution.service.js";
import type { CreateTryOnLabRunPayload } from "../try-on-lab/try-on-lab-multipart.js";
import type { KioskTryOnRunResponseDto } from "./dto/kiosk-try-on.dto.js";

type KioskDeviceContext = Pick<
  KioskDevice,
  "id" | "assignmentScope" | "organizationId" | "storeId"
>;

@Injectable()
export class KioskTryOnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly execution: TryOnExecutionService,
  ) {}

  async createRun(
    device: KioskDeviceContext,
    payload: CreateTryOnLabRunPayload,
  ): Promise<KioskTryOnRunResponseDto> {
    await this.cleanupExpiredRuns();
    const clientRequestId = requireClientRequestId(payload.clientRequestId);
    const existing = await this.prisma.kioskTryOnRun.findUnique({
      where: {
        kioskDeviceId_clientRequestId: {
          kioskDeviceId: device.id,
          clientRequestId,
        },
      },
    });
    if (existing) {
      return toResponse(existing);
    }

    enforceModelGarmentCompatibility(payload);

    this.execution.assertConfigured();
    const providerMetadata = this.execution.metadata();
    const now = new Date();
    const created = await this.createNewRun(
      device,
      payload,
      clientRequestId,
      providerMetadata,
      now,
    );

    if (created.isNew) {
      void this.processRun(created.run.id, payload);
    }
    return toResponse(created.run);
  }

  private async createNewRun(
    device: KioskDeviceContext,
    payload: CreateTryOnLabRunPayload,
    clientRequestId: string,
    providerMetadata: ReturnType<TryOnExecutionService["metadata"]>,
    now: Date,
  ): Promise<{ run: Parameters<typeof toResponse>[0]; isNew: boolean }> {
    try {
      const run = await this.prisma.kioskTryOnRun.create({
        data: {
          id: createSelfxId(),
          kioskDeviceId: device.id,
          clientRequestId,
          status: "QUEUED",
          assignmentScope: device.assignmentScope,
          organizationId:
            device.assignmentScope === KioskAssignmentScope.PLATFORM
              ? null
              : device.organizationId,
          storeId:
            device.assignmentScope === KioskAssignmentScope.STORE
              ? device.storeId
              : null,
          provider: providerMetadata.provider,
          providerDisplayName: providerMetadata.providerDisplayName,
          providerModel: providerMetadata.model,
          garmentSource: payload.garmentSource,
          garmentIntent: payload.garmentIntent,
          garmentCategory: payload.category,
          garmentPhotoType: payload.garmentPhotoType,
          generationProfile: payload.generationProfile,
          expiresAt: new Date(now.getTime() + TRY_ON_RESULT_RETENTION_MS),
        },
      });
      return { run, isNew: true };
    } catch (error) {
      const existing = await this.prisma.kioskTryOnRun.findUnique({
        where: {
          kioskDeviceId_clientRequestId: {
            kioskDeviceId: device.id,
            clientRequestId,
          },
        },
      });
      if (existing) {
        return { run: existing, isNew: false };
      }
      throw error;
    }
  }

  async getRun(
    device: KioskDeviceContext,
    runId: string,
  ): Promise<KioskTryOnRunResponseDto> {
    await this.cleanupExpiredRuns();
    const run = await this.prisma.kioskTryOnRun.findFirst({
      where: { id: runId, kioskDeviceId: device.id },
    });
    if (!run) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        TRY_ON_LAB_ERROR_CODES.failed,
        "Try-On run was not found.",
      );
    }
    return toResponse(run);
  }

  private async processRun(
    runId: string,
    payload: CreateTryOnLabRunPayload,
  ): Promise<void> {
    await this.execution.process(payload, {
      onStarted: async (startedAt) => {
        await this.prisma.kioskTryOnRun.update({
          where: { id: runId },
          data: { startedAt },
        });
      },
      onSubmitted: async (providerPredictionId) => {
        await this.prisma.kioskTryOnRun.update({
          where: { id: runId },
          data: {
            status: "PROCESSING",
            providerPredictionId,
            submittedAt: new Date(),
          },
        });
      },
      onStatus: async (status) => {
        await this.prisma.kioskTryOnRun.update({
          where: { id: runId },
          data: {
            status: status.status,
            resultImage: status.resultImage,
            errorCode: status.errorCode,
            errorMessage: status.errorMessage,
            completedAt: status.completedAt,
          },
        });
      },
      onTimedOut: async (completedAt) => {
        await this.prisma.kioskTryOnRun.update({
          where: { id: runId },
          data: {
            status: "FAILED",
            errorCode: TRY_ON_LAB_ERROR_CODES.timedOut,
            errorMessage: "Try-On generation timed out.",
            completedAt,
          },
        });
      },
      onError: async (error, completedAt) => {
        await this.prisma.kioskTryOnRun.update({
          where: { id: runId },
          data: {
            status: error.status,
            errorCode: error.errorCode,
            errorMessage: error.errorMessage,
            completedAt,
          },
        });
      },
    });
  }

  private async cleanupExpiredRuns(): Promise<void> {
    await this.prisma.kioskTryOnRun.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
  }
}

function enforceModelGarmentCompatibility(
  payload: CreateTryOnLabRunPayload,
): void {
  if (!payload.modelCoverage) {
    return;
  }
  if (
    isModelCoverageCompatibleWithGarment(
      payload.modelCoverage,
      payload.garmentIntent,
    )
  ) {
    return;
  }
  throw new ApiErrorException(
    HttpStatus.CONFLICT,
    TRY_ON_LAB_ERROR_CODES.modelImageIncompatibleWithGarment,
    "Model image is not compatible with the selected garment.",
  );
}

function requireClientRequestId(value: string | undefined): string {
  if (!value) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      TRY_ON_LAB_ERROR_CODES.resolutionMetadataInvalid,
      "clientRequestId is required for kiosk Try-On runs.",
    );
  }
  return value;
}

function toResponse(run: {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  resultImage: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}): KioskTryOnRunResponseDto {
  return {
    id: run.id,
    status: run.status as SelfxTryOnRunStatus,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    resultImage: run.resultImage ?? undefined,
    errorCode:
      run.errorCode === null
        ? undefined
        : (run.errorCode as KioskTryOnRunResponseDto["errorCode"]),
    errorMessage: run.errorMessage ?? undefined,
  };
}
