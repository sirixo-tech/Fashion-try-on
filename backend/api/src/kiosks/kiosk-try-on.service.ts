import { HttpStatus, Injectable, Optional } from "@nestjs/common";
import {
  KioskAssignmentScope,
  KioskCustomerUploadPurpose,
  TryOnAssetPurpose,
  type KioskDevice,
  type TryOnAsset,
  type TryOnLook,
  type TryOnSession,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";
import {
  TRY_ON_LAB_ERROR_CODES,
  isModelCoverageCompatibleWithGarment,
  type SelfxTryOnRunStatus,
} from "@selfx/shared";

import { ApiErrorException } from "../common/api-error.exception.js";
import { validateTechnicalImageBuffer } from "../common/image-validation.js";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { TRY_ON_RESULT_RETENTION_MS } from "../try-on/try-on.constants.js";
import { TryOnExecutionService } from "../try-on/try-on-execution.service.js";
import { TryOnSessionService } from "../try-on/try-on-session.service.js";
import type { CreateTryOnLabRunPayload } from "../try-on-lab/try-on-lab-multipart.js";
import { TRY_ON_LAB_MAX_IMAGE_BYTES } from "../try-on-lab/try-on-lab.constants.js";
import type {
  KioskTryOnAssetResponseDto,
  KioskTryOnLooksResponseDto,
  KioskTryOnRunResponseDto,
  KioskTryOnSessionResponseDto,
} from "./dto/kiosk-try-on.dto.js";
import type {
  CreateKioskTryOnRunPayload,
  KioskSessionImagePayload,
  KioskTryOnUploadedImage,
} from "./kiosk-try-on.multipart.js";
import { KioskCustomerUploadService } from "./kiosk-customer-upload.service.js";

type KioskDeviceContext = Pick<
  KioskDevice,
  "id" | "assignmentScope" | "organizationId" | "storeId"
>;

interface SessionRunAssets {
  sessionId: string;
  kioskDeviceId: string;
  personAssetId: string;
  garmentAssetId: string | null;
  executionPayload: CreateTryOnLabRunPayload;
}

@Injectable()
export class KioskTryOnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly execution: TryOnExecutionService,
    @Optional() private readonly sessions?: TryOnSessionService,
    @Optional() private readonly storage?: ObjectStorageService,
    @Optional() private readonly customerUploads?: KioskCustomerUploadService,
  ) {}

  async createSession(
    device: KioskDeviceContext,
  ): Promise<KioskTryOnSessionResponseDto> {
    const session = await this.requireSessionService().createSession({
      assignmentScope: device.assignmentScope,
      organizationId:
        device.assignmentScope === KioskAssignmentScope.PLATFORM
          ? null
          : device.organizationId,
      storeId:
        device.assignmentScope === KioskAssignmentScope.STORE
          ? device.storeId
          : null,
      kioskDeviceId: device.id,
    });
    return toSessionResponse(session);
  }

  async setCurrentPerson(
    device: KioskDeviceContext,
    sessionId: string,
    payload: KioskSessionImagePayload,
  ): Promise<KioskTryOnAssetResponseDto> {
    if (payload.customerUploadSessionId) {
      const upload = await this.requireCustomerUploads().consumeReadyUploadForAsset(
        device,
        payload.customerUploadSessionId,
        KioskCustomerUploadPurpose.MODEL,
      );
      const asset = await this.requireSessionService().attachPersonAsset({
        sessionId,
        kioskDeviceId: device.id,
        storageKey: upload.storageKey,
        contentType: upload.contentType,
        sizeBytes: upload.sizeBytes,
        width: upload.width,
        height: upload.height,
        expiresAt: upload.expiresAt,
      });
      return toAssetResponse(asset);
    }

    if (!payload.personImage) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        TRY_ON_LAB_ERROR_CODES.multipartInvalid,
        "Person image is required.",
      );
    }
    const asset = await this.storeAndAttachPersonImage(
      device,
      sessionId,
      payload.personImage,
    );
    return toAssetResponse(asset);
  }

  async getSessionLooks(
    device: KioskDeviceContext,
    sessionId: string,
  ): Promise<KioskTryOnLooksResponseDto> {
    const looks = await this.requireSessionService().getSessionLooks({
      sessionId,
      kioskDeviceId: device.id,
    });
    const storage = this.requireStorage();
    return {
      data: looks.map((look) => toLookResponse(look, storage)),
    };
  }

  async completeSession(
    device: KioskDeviceContext,
    sessionId: string,
  ): Promise<KioskTryOnSessionResponseDto> {
    const session = await this.requireSessionService().completeSession({
      sessionId,
      kioskDeviceId: device.id,
    });
    return toSessionResponse(session);
  }

  async createRun(
    device: KioskDeviceContext,
    payload: CreateKioskTryOnRunPayload,
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

    const sessionRun = payload.sessionId
      ? await this.prepareSessionRunAssets(device, payload)
      : undefined;
    const executionPayload = sessionRun?.executionPayload ?? requireLegacyPayload(payload);

    this.execution.assertConfigured();
    const providerMetadata = this.execution.metadata();
    const now = new Date();
    const created = await this.createNewRun(
      device,
      executionPayload,
      clientRequestId,
      providerMetadata,
      now,
      sessionRun,
    );

    if (created.isNew) {
      void this.processRun(created.run.id, executionPayload, sessionRun);
    }
    return toResponse(created.run);
  }

  private async createNewRun(
    device: KioskDeviceContext,
    payload: CreateTryOnLabRunPayload,
    clientRequestId: string,
    providerMetadata: ReturnType<TryOnExecutionService["metadata"]>,
    now: Date,
    sessionRun?: SessionRunAssets,
  ): Promise<{ run: Parameters<typeof toResponse>[0]; isNew: boolean }> {
    try {
      const run = await this.prisma.kioskTryOnRun.create({
        data: {
          id: createSelfxId(),
          kioskDeviceId: device.id,
          tryOnSessionId: sessionRun?.sessionId,
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
          personAssetId: sessionRun?.personAssetId,
          garmentAssetId: sessionRun?.garmentAssetId,
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
    sessionRun?: SessionRunAssets,
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
        if (
          status.status === "COMPLETED" &&
          status.resultImage &&
          sessionRun
        ) {
          await this.recordSessionLook(runId, sessionRun, status.resultImage);
        }
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

  private async prepareSessionRunAssets(
    device: KioskDeviceContext,
    payload: CreateKioskTryOnRunPayload,
  ): Promise<SessionRunAssets> {
    if (payload.garmentSource !== "DIRECT_UPLOAD") {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        TRY_ON_LAB_ERROR_CODES.resolutionMetadataInvalid,
        "Only direct captured garments are supported for session Try-On runs.",
      );
    }
    const sessionId = payload.sessionId;
    if (!sessionId) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        TRY_ON_LAB_ERROR_CODES.resolutionMetadataInvalid,
        "Session ID is required.",
      );
    }
    const sessionService = this.requireSessionService();
    let personAsset: TryOnAsset;
    if (payload.personAssetId) {
      personAsset = await sessionService.getSessionAsset({
        sessionId,
        kioskDeviceId: device.id,
        assetId: payload.personAssetId,
        purpose: TryOnAssetPurpose.PERSON,
      });
    } else if (payload.personImage) {
      personAsset = await this.storeAndAttachPersonImage(
        device,
        sessionId,
        payload.personImage,
      );
    } else {
      personAsset = await sessionService.getCurrentPersonAsset({
        sessionId,
        kioskDeviceId: device.id,
      });
    }

    const garmentAsset = await this.storeAndAttachGarmentImage(
      device,
      sessionId,
      payload.garmentImage,
    );
    const personImage = await this.readAssetAsUploadedImage(
      personAsset,
      "personImage",
    );
    const executionPayload: CreateTryOnLabRunPayload = {
      ...payload,
      personImage,
      garmentImage: payload.garmentImage,
    };

    return {
      sessionId,
      kioskDeviceId: device.id,
      personAssetId: personAsset.id,
      garmentAssetId: garmentAsset.id,
      executionPayload,
    };
  }

  private async storeAndAttachPersonImage(
    device: KioskDeviceContext,
    sessionId: string,
    image: KioskTryOnUploadedImage,
  ): Promise<TryOnAsset> {
    const key = objectKeyFor(sessionId, createSelfxId(), "person", image.mimeType);
    await this.requireStorage().putObject({
      key,
      contentType: image.mimeType,
      body: image.buffer,
    });
    return this.requireSessionService().attachPersonAsset({
      sessionId,
      kioskDeviceId: device.id,
      storageKey: key,
      contentType: image.mimeType,
      sizeBytes: image.sizeBytes,
      width: image.width,
      height: image.height,
    });
  }

  private async storeAndAttachGarmentImage(
    device: KioskDeviceContext,
    sessionId: string,
    image: KioskTryOnUploadedImage,
  ): Promise<TryOnAsset> {
    const key = objectKeyFor(sessionId, createSelfxId(), "garment", image.mimeType);
    await this.requireStorage().putObject({
      key,
      contentType: image.mimeType,
      body: image.buffer,
    });
    return this.requireSessionService().attachGarmentAsset({
      sessionId,
      kioskDeviceId: device.id,
      storageKey: key,
      contentType: image.mimeType,
      sizeBytes: image.sizeBytes,
      width: image.width,
      height: image.height,
    });
  }

  private async readAssetAsUploadedImage(
    asset: Pick<TryOnAsset, "storageKey" | "contentType">,
    fieldName: "personImage" | "garmentImage",
  ): Promise<KioskTryOnUploadedImage> {
    const buffer = await this.requireStorage().readObject(
      asset.storageKey,
      TRY_ON_LAB_MAX_IMAGE_BYTES,
    );
    const metadata = validateTechnicalImageBuffer({
      buffer,
      declaredContentType: asset.contentType,
      maxBytes: TRY_ON_LAB_MAX_IMAGE_BYTES,
    });
    return {
      fieldName,
      filename: fieldName === "personImage" ? "person-image" : "garment-image",
      mimeType: metadata.mimeType,
      sizeBytes: metadata.sizeBytes,
      buffer,
      dataUri: `data:${metadata.mimeType};base64,${buffer.toString("base64")}`,
      width: metadata.width,
      height: metadata.height,
    };
  }

  private async recordSessionLook(
    runId: string,
    sessionRun: SessionRunAssets,
    resultImage: string,
  ): Promise<void> {
    const result = await parseResultImage(resultImage);
    const metadata = validateTechnicalImageBuffer({
      buffer: result.buffer,
      declaredContentType: result.contentType,
      maxBytes: TRY_ON_LAB_MAX_IMAGE_BYTES,
    });
    const key = objectKeyFor(
      sessionRun.sessionId,
      createSelfxId(),
      "result",
      metadata.mimeType,
    );
    await this.requireStorage().putObject({
      key,
      contentType: metadata.mimeType,
      body: result.buffer,
    });
    await this.requireSessionService().recordLook({
      sessionId: sessionRun.sessionId,
      kioskDeviceId: sessionRun.kioskDeviceId,
      kioskTryOnRunId: runId,
      personAssetId: sessionRun.personAssetId,
      garmentAssetId: sessionRun.garmentAssetId,
      resultAsset: {
        storageKey: key,
        contentType: metadata.mimeType,
        sizeBytes: metadata.sizeBytes,
        width: metadata.width,
        height: metadata.height,
      },
    });
  }

  private requireSessionService(): TryOnSessionService {
    if (!this.sessions) {
      throw new ApiErrorException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "TRY_ON_SESSION_SERVICE_UNAVAILABLE",
        "Try-On session service is not available.",
      );
    }
    return this.sessions;
  }

  private requireStorage(): ObjectStorageService {
    if (!this.storage) {
      throw new ApiErrorException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "OBJECT_STORAGE_NOT_CONFIGURED",
        "Object storage is not available for Try-On sessions.",
      );
    }
    return this.storage;
  }

  private requireCustomerUploads(): KioskCustomerUploadService {
    if (!this.customerUploads) {
      throw new ApiErrorException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "KIOSK_CUSTOMER_UPLOAD_UNAVAILABLE",
        "Customer upload service is not available.",
      );
    }
    return this.customerUploads;
  }
}

function enforceModelGarmentCompatibility(
  payload: Pick<CreateKioskTryOnRunPayload, "modelCoverage" | "garmentIntent">,
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

function requireLegacyPayload(
  payload: CreateKioskTryOnRunPayload,
): CreateTryOnLabRunPayload {
  if (!payload.personImage) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      TRY_ON_LAB_ERROR_CODES.multipartInvalid,
      "Person image is required for legacy Try-On requests.",
    );
  }
  return {
    ...payload,
    personImage: payload.personImage,
    garmentImage: payload.garmentImage,
  };
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

function toSessionResponse(session: Pick<
  TryOnSession,
  "id" | "status" | "createdAt" | "updatedAt" | "expiresAt" | "currentPersonAssetId"
>): KioskTryOnSessionResponseDto {
  return {
    sessionId: session.id,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    currentPersonAssetId: session.currentPersonAssetId ?? undefined,
  };
}

function toAssetResponse(asset: Pick<
  TryOnAsset,
  | "id"
  | "purpose"
  | "contentType"
  | "sizeBytes"
  | "width"
  | "height"
  | "expiresAt"
>): KioskTryOnAssetResponseDto {
  return {
    assetId: asset.id,
    purpose: asset.purpose,
    contentType: asset.contentType ?? "application/octet-stream",
    sizeBytes: asset.sizeBytes ?? 0,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    expiresAt: asset.expiresAt.toISOString(),
  };
}

function toLookResponse(
  look: TryOnLook & {
    resultAsset: Pick<TryOnAsset, "storageKey">;
  },
  storage: ObjectStorageService,
) {
  return {
    lookId: look.id,
    runId: look.kioskTryOnRunId,
    personAssetId: look.personAssetId,
    garmentAssetId: look.garmentAssetId ?? undefined,
    resultAssetId: look.resultAssetId,
    resultReadUrl: storage.createReadUrl({
      key: look.resultAsset.storageKey,
      expiresInSeconds: 300,
    }),
    createdAt: look.createdAt.toISOString(),
    expiresAt: look.expiresAt.toISOString(),
  };
}

function objectKeyFor(
  sessionId: string,
  assetId: string,
  purpose: "person" | "garment" | "result",
  contentType: string,
): string {
  const extension =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : "jpg";
  return `try-on-sessions/${sessionId}/${purpose}/${assetId}.${extension}`;
}

async function parseResultImage(resultImage: string): Promise<{
  contentType: "image/jpeg" | "image/png" | "image/webp";
  buffer: Buffer;
}> {
  if (!resultImage.startsWith("data:")) {
    return fetchResultImage(resultImage);
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(
    resultImage,
  );
  if (!match) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      TRY_ON_LAB_ERROR_CODES.imageInvalid,
      "Try-On result image is invalid.",
    );
  }
  const contentType = match[1];
  const base64Payload = match[2];
  if (!contentType || !base64Payload) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      TRY_ON_LAB_ERROR_CODES.imageInvalid,
      "Try-On result image is invalid.",
    );
  }
  return {
    contentType: contentType.toLowerCase() as
      | "image/jpeg"
      | "image/png"
      | "image/webp",
    buffer: Buffer.from(base64Payload, "base64"),
  };
}

async function fetchResultImage(resultImage: string): Promise<{
  contentType: "image/jpeg" | "image/png" | "image/webp";
  buffer: Buffer;
}> {
  let url: URL;
  try {
    url = new URL(resultImage);
  } catch {
    throwInvalidResultImage();
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throwInvalidResultImage();
  }
  const response = await fetch(url);
  if (!response.ok) {
    throwInvalidResultImage();
  }
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  if (
    contentType !== "image/jpeg" &&
    contentType !== "image/png" &&
    contentType !== "image/webp"
  ) {
    throwInvalidResultImage();
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { contentType, buffer };
}

function throwInvalidResultImage(): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    TRY_ON_LAB_ERROR_CODES.imageInvalid,
    "Try-On result image is invalid.",
  );
}
