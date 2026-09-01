import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import {
  KioskAssignmentScope,
  KioskCustomerUploadPurpose,
  TryOnAssetPurpose,
  TryOnSessionStatus,
  type KioskDevice,
  type TryOnAsset,
  type TryOnLook,
  type TryOnSession,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";
import {
  SELFX_GARMENT_CATEGORIES,
  SELFX_GARMENT_INTENTS,
  SELFX_GARMENT_PHOTO_TYPES,
  TRY_ON_LAB_ERROR_CODES,
  isModelCoverageCompatibleWithGarment,
  type SelfxCatalogSource,
  type SelfxTryOnRunStatus,
} from "@selfx/shared";

import { CatalogService } from "../catalog/catalog.service.js";
import { normalizeSelfxGarmentCategory } from "../catalog/garment-category-normalization.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { validateTechnicalImageBuffer } from "../common/image-validation.js";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { TRY_ON_RESULT_RETENTION_MS } from "../try-on/try-on.constants.js";
import { TryOnExecutionService } from "../try-on/try-on-execution.service.js";
import { TryOnSessionService } from "../try-on/try-on-session.service.js";
import type { CreateTryOnLabRunPayload } from "../try-on-lab/try-on-lab-multipart.js";
import { TRY_ON_LAB_MAX_IMAGE_BYTES } from "../try-on-lab/try-on-lab.constants.js";
import {
  KIOSK_USAGE_EVENTS,
  UsageEventService,
  type RecordKioskUsageEventInput,
} from "../usage/usage-event.service.js";
import { MediaUploadSettingsService } from "../platform/media-upload-settings.service.js";
import { KIOSK_CAPTURE_DEFAULT_MAX_IMAGE_BYTES } from "./kiosk.constants.js";
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

export type KioskTryOnSessionCompletionReason = "FINISHED" | "IDLE_TIMEOUT";

interface SessionRunAssets {
  sessionId: string;
  kioskDeviceId: string;
  personAssetId: string;
  garmentAssetId: string | null;
  productId: string | null;
  executionPayload: CreateTryOnLabRunPayload;
}

interface KioskTryOnProductReference {
  catalogSource: SelfxCatalogSource | null;
  externalProductId: string | null;
  externalVariantId: string | null;
  externalSku: string | null;
  externalProductName: string | null;
  externalProductPrice: string | null;
  externalCurrency: string | null;
}

@Injectable()
export class KioskTryOnService {
  private readonly logger = new Logger(KioskTryOnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly execution: TryOnExecutionService,
    @Optional() private readonly sessions?: TryOnSessionService,
    @Optional() private readonly storage?: ObjectStorageService,
    @Optional() private readonly customerUploads?: KioskCustomerUploadService,
    @Optional() private readonly catalog?: CatalogService,
    @Optional()
    private readonly mediaUploadSettings?: MediaUploadSettingsService,
    @Optional() private readonly usageEvents?: UsageEventService,
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
    await this.recordUsage(device, {
      eventName: KIOSK_USAGE_EVENTS.sessionStarted,
      idempotencyKey: `kiosk-session-started:${session.id}`,
      tryOnSessionId: session.id,
      status: session.status,
      occurredAt: session.createdAt,
    });
    return toSessionResponse(session);
  }

  async setCurrentPerson(
    device: KioskDeviceContext,
    sessionId: string,
    payload: KioskSessionImagePayload,
  ): Promise<KioskTryOnAssetResponseDto> {
    if (payload.customerUploadSessionId) {
      const upload =
        await this.requireCustomerUploads().consumeReadyUploadForAsset(
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
    reason: KioskTryOnSessionCompletionReason = "FINISHED",
  ): Promise<KioskTryOnSessionResponseDto> {
    const session = await this.requireSessionService().completeSession({
      sessionId,
      kioskDeviceId: device.id,
    });
    await this.recordUsage(device, {
      eventName: KIOSK_USAGE_EVENTS.sessionCompleted,
      idempotencyKey: `kiosk-session-completed:${session.id}`,
      tryOnSessionId: session.id,
      status: session.status,
      occurredAt: session.completedAt ?? session.updatedAt,
      metadata: { reason },
    });
    if (reason === "IDLE_TIMEOUT") {
      await this.recordUsage(device, {
        eventName: KIOSK_USAGE_EVENTS.sessionIdleExpired,
        idempotencyKey: `kiosk-session-idle-expired:${session.id}`,
        tryOnSessionId: session.id,
        status: session.status,
        occurredAt: session.completedAt ?? session.updatedAt,
      });
    }
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

    const sessionRun = payload.sessionId
      ? await this.prepareSessionRunAssets(device, payload)
      : undefined;
    const executionPayload =
      sessionRun?.executionPayload ?? requireLegacyPayload(payload);
    enforceModelGarmentCompatibility(executionPayload);

    this.execution.assertConfigured();
    const providerMetadata = this.execution.metadata();
    const now = new Date();
    const created = await this.createNewRun(
      device,
      payload,
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
    requestPayload: CreateKioskTryOnRunPayload,
    executionPayload: CreateTryOnLabRunPayload,
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
          productId: sessionRun?.productId ?? requestPayload.productId ?? null,
          ...kioskProductReferenceData(device, requestPayload, sessionRun),
          provider: providerMetadata.provider,
          providerDisplayName: providerMetadata.providerDisplayName,
          providerModel: providerMetadata.model,
          garmentSource: executionPayload.garmentSource,
          garmentIntent: executionPayload.garmentIntent,
          garmentCategory: executionPayload.category,
          garmentPhotoType: executionPayload.garmentPhotoType,
          generationProfile: executionPayload.generationProfile,
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
        if (status.status === "COMPLETED" && status.resultImage && sessionRun) {
          const sessionIsStillActive = await this.prisma.tryOnSession.findFirst(
            {
              where: {
                id: sessionRun.sessionId,
                kioskDeviceId: sessionRun.kioskDeviceId,
                status: TryOnSessionStatus.ACTIVE,
                expiresAt: { gt: new Date() },
              },
              select: { id: true },
            },
          );
          if (!sessionIsStillActive) {
            await this.prisma.kioskTryOnRun.update({
              where: { id: runId },
              data: {
                status: status.status,
                resultImage: null,
                errorCode: status.errorCode,
                errorMessage: status.errorMessage,
                completedAt: status.completedAt,
              },
            });
            return;
          }
        }
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
        if (status.status === "COMPLETED" && status.resultImage && sessionRun) {
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
    if (
      payload.garmentSource !== "DIRECT_UPLOAD" &&
      payload.garmentSource !== "SELFX_CATALOG"
    ) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        TRY_ON_LAB_ERROR_CODES.resolutionMetadataInvalid,
        "Only direct captured garments and SelfX catalog products are supported for session Try-On runs.",
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

    const personImage = await this.readAssetAsUploadedImage(
      personAsset,
      "personImage",
    );
    if (payload.productId) {
      const product = await this.requireCatalog().resolveKioskProductForTryOn(
        device.assignmentScope === KioskAssignmentScope.PLATFORM
          ? null
          : device.organizationId,
        payload.productId,
      );
      const garmentCategory =
        normalizeSelfxGarmentCategory(product.garmentCategory) ??
        product.garmentCategory;
      const executionPayload: CreateTryOnLabRunPayload = {
        ...payload,
        personImage,
        garmentImage: product.garmentImage,
        garmentSource: "SELFX_CATALOG",
        garmentIntent: requireCatalogEnum(
          product.garmentIntent,
          SELFX_GARMENT_INTENTS,
          "Invalid catalog garment intent.",
        ),
        category: requireCatalogEnum(
          garmentCategory,
          SELFX_GARMENT_CATEGORIES,
          "Invalid catalog garment category.",
        ),
        garmentPhotoType: requireCatalogEnum(
          product.garmentPhotoType,
          SELFX_GARMENT_PHOTO_TYPES,
          "Invalid catalog garment photo type.",
        ),
        categoryResolutionSource: "SELFX_CATALOG_METADATA",
        photoTypeResolutionSource: "SELFX_CATALOG_METADATA",
        disambiguationRequired: false,
        disambiguationResolved: true,
        garmentAnalysisReasonCodes: [],
      };

      return {
        sessionId,
        kioskDeviceId: device.id,
        personAssetId: personAsset.id,
        garmentAssetId: null,
        productId: product.productId,
        executionPayload,
      };
    }

    if (!payload.garmentImage) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        TRY_ON_LAB_ERROR_CODES.multipartInvalid,
        "Garment image is required for captured garment Try-On runs.",
      );
    }
    const garmentAsset = await this.storeAndAttachGarmentImage(
      device,
      sessionId,
      payload.garmentImage,
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
      productId: null,
      executionPayload,
    };
  }

  private async storeAndAttachPersonImage(
    device: KioskDeviceContext,
    sessionId: string,
    image: KioskTryOnUploadedImage,
  ): Promise<TryOnAsset> {
    const key = objectKeyFor(
      sessionId,
      createSelfxId(),
      "person",
      image.mimeType,
    );
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
    const key = objectKeyFor(
      sessionId,
      createSelfxId(),
      "garment",
      image.mimeType,
    );
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
    const maxImageBytes =
      (await this.mediaUploadSettings?.resolveCaptureImageMaxBytes()) ??
      KIOSK_CAPTURE_DEFAULT_MAX_IMAGE_BYTES;
    const buffer = await this.requireStorage().readObject(
      asset.storageKey,
      maxImageBytes,
    );
    const metadata = validateTechnicalImageBuffer({
      buffer,
      declaredContentType: asset.contentType,
      maxBytes: maxImageBytes,
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
    const look = await this.requireSessionService().recordLook({
      sessionId: sessionRun.sessionId,
      kioskDeviceId: sessionRun.kioskDeviceId,
      kioskTryOnRunId: runId,
      personAssetId: sessionRun.personAssetId,
      garmentAssetId: sessionRun.garmentAssetId,
      productId: sessionRun.productId,
      resultAsset: {
        storageKey: key,
        contentType: metadata.mimeType,
        sizeBytes: metadata.sizeBytes,
        width: metadata.width,
        height: metadata.height,
      },
    });
    const run = await this.prisma.kioskTryOnRun.findUnique({
      where: { id: runId },
      select: {
        provider: true,
        providerModel: true,
        status: true,
      },
    });
    await this.recordUsage(
      {
        id: sessionRun.kioskDeviceId,
        assignmentScope: look.assignmentScope,
        organizationId: look.organizationId,
        storeId: look.storeId,
      },
      {
        eventName: KIOSK_USAGE_EVENTS.tryOnGenerated,
        idempotencyKey: `kiosk-try-on-generated:${runId}`,
        tryOnSessionId: sessionRun.sessionId,
        kioskTryOnRunId: runId,
        tryOnLookId: look.id,
        productId: sessionRun.productId,
        provider: run?.provider,
        providerModel: run?.providerModel,
        status: run?.status ?? "COMPLETED",
      },
    );
  }

  private async recordUsage(
    device: KioskDeviceContext,
    input: Omit<RecordKioskUsageEventInput, "device">,
  ): Promise<void> {
    try {
      await this.usageEvents?.recordKioskEvent({ ...input, device });
    } catch (error) {
      this.logger.warn({
        event: "kiosk_usage_event_record_failed",
        usageEventName: input.eventName,
        kioskDeviceId: device.id,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
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

  private requireCatalog(): CatalogService {
    if (!this.catalog) {
      throw new ApiErrorException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "KIOSK_CATALOG_UNAVAILABLE",
        "Catalog service is not available.",
      );
    }
    return this.catalog;
  }
}

function enforceModelGarmentCompatibility(
  payload: Pick<CreateKioskTryOnRunPayload, "modelCoverage" | "garmentIntent">,
): void {
  if (!payload.modelCoverage) {
    return;
  }
  if (payload.modelCoverage === "UNKNOWN") {
    throw new ApiErrorException(
      HttpStatus.CONFLICT,
      TRY_ON_LAB_ERROR_CODES.modelImageIncompatibleWithGarment,
      "Model image is not compatible with the selected garment.",
    );
  }
  if (payload.garmentIntent === "AUTO") {
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
  if (!payload.garmentImage) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      TRY_ON_LAB_ERROR_CODES.multipartInvalid,
      "Garment image is required for legacy Try-On requests.",
    );
  }
  return {
    ...payload,
    personImage: payload.personImage,
    garmentImage: payload.garmentImage,
  };
}

function requireCatalogEnum<const TValue extends readonly string[]>(
  value: string,
  allowed: TValue,
  message: string,
): TValue[number] {
  if ((allowed as readonly string[]).includes(value)) {
    return value as TValue[number];
  }
  throw new ApiErrorException(
    HttpStatus.CONFLICT,
    TRY_ON_LAB_ERROR_CODES.resolutionMetadataInvalid,
    message,
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

function kioskProductReferenceData(
  device: KioskDeviceContext,
  payload: CreateKioskTryOnRunPayload,
  sessionRun: SessionRunAssets | undefined,
): KioskTryOnProductReference {
  const catalogSource =
    payload.catalogSource ??
    (sessionRun?.productId
      ? device.assignmentScope === KioskAssignmentScope.PLATFORM
        ? "SELFX_CATALOG"
        : "STORE_CATALOG"
      : null);
  return {
    catalogSource,
    externalProductId: payload.externalProductId ?? null,
    externalVariantId: payload.externalVariantId ?? null,
    externalSku: payload.sku ?? null,
    externalProductName: payload.productName ?? null,
    externalProductPrice: payload.price ?? null,
    externalCurrency: payload.currency?.trim().toUpperCase() ?? null,
  };
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

function toSessionResponse(
  session: Pick<
    TryOnSession,
    | "id"
    | "status"
    | "createdAt"
    | "updatedAt"
    | "expiresAt"
    | "currentPersonAssetId"
  >,
): KioskTryOnSessionResponseDto {
  return {
    sessionId: session.id,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    currentPersonAssetId: session.currentPersonAssetId ?? undefined,
  };
}

function toAssetResponse(
  asset: Pick<
    TryOnAsset,
    | "id"
    | "purpose"
    | "contentType"
    | "sizeBytes"
    | "width"
    | "height"
    | "expiresAt"
  >,
): KioskTryOnAssetResponseDto {
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
    productId: look.productId ?? undefined,
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
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(
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
      "image/jpeg" | "image/png" | "image/webp",
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
  const contentType = response.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim();
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
