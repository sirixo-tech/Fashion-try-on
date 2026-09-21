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
  type SelfxGarmentPreprocessingProviderInputImage,
  type SelfxGarmentPreprocessingStatus,
  type SelfxTryOnRunStatus,
} from "@selfx/shared";

import { CatalogService } from "../catalog/catalog.service.js";
import { normalizeSelfxGarmentCategory } from "../catalog/garment-category-normalization.js";
import type { JewelleryType } from "../catalog/product-kind.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import {
  detectImageMimeType,
  validateTechnicalImageBuffer,
} from "../common/image-validation.js";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { JewelleryTryOnExecutionService } from "../try-on/jewellery/jewellery-try-on-execution.service.js";
import { throwJewelleryTryOnNotEnabled } from "../try-on/jewellery/jewellery-try-on-execution.service.js";
import { JewelleryTryOnService } from "../try-on/jewellery/jewellery-try-on.service.js";
import {
  TRY_ON_RESULT_MAX_IMAGE_BYTES,
  TRY_ON_RESULT_RETENTION_MS,
} from "../try-on/try-on.constants.js";
import { TryOnExecutionService } from "../try-on/try-on-execution.service.js";
import { TryOnSessionService } from "../try-on/try-on-session.service.js";
import type { CreateTryOnLabRunPayload } from "../try-on-lab/try-on-lab-multipart.js";
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
  KioskTryOnJewelleryImage,
  KioskTryOnPersonImage,
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

interface JewelleryRunAssets {
  sessionId: string | null;
  kioskDeviceId: string;
  personAssetId: string | null;
  jewelleryAssetId: string | null;
  productId: string | null;
  personImage: KioskTryOnPersonImage;
  jewelleryImage: KioskTryOnJewelleryImage;
  jewelleryType: JewelleryType;
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
    @Optional() private readonly jewelleryTryOn?: JewelleryTryOnService,
    @Optional()
    private readonly jewelleryExecution?: JewelleryTryOnExecutionService,
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
    if (payload.tryOnVertical === "JEWELLERY") {
      return this.createJewelleryRun(device, payload);
    }

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
          tryOnVertical: "GARMENT",
          jewelleryType: null,
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
      onGarmentPreprocessed: async (metadata) => {
        try {
          await this.prisma.kioskTryOnRun.update({
            where: { id: runId },
            data: {
              garmentPreprocessingEnabled: metadata.enabled,
              garmentPreprocessingStatus: metadata.status,
              garmentPreprocessingProviderInputImage:
                metadata.providerInputImage,
              garmentPreprocessingMaskGenerated: metadata.maskGenerated,
              garmentPreprocessingFallbackReason: metadata.fallbackReason,
            },
          });
        } catch (error) {
          this.logger.warn(
            `Unable to persist garment preprocessing metadata for kiosk try-on run ${runId}: ${
              error instanceof Error ? error.message : "unknown error"
            }`,
          );
        }
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

  private async createJewelleryRun(
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

    const storeId = resolveJewelleryTryOnStoreId(device);
    const jewelleryRun = await this.prepareJewelleryRunAssets(device, payload);
    const foundationInput = {
      storeId,
      personImageDataUri: jewelleryRun.personImage.dataUri,
      jewelleryImageDataUri: jewelleryRun.jewelleryImage.dataUri,
      jewelleryType: jewelleryRun.jewelleryType,
    };
    const productReference = jewelleryProductReference(
      jewelleryRun.productId,
      payload,
    );
    const foundation =
      await this.requireJewelleryTryOnService().prepareRunFoundation(
        productReference
          ? { ...foundationInput, productReference }
          : foundationInput,
      );
    const now = new Date();
    const created = await this.createNewJewelleryRun(
      device,
      payload,
      jewelleryRun,
      clientRequestId,
      foundation.provider,
      now,
    );

    if (created.isNew) {
      void this.processJewelleryRun(created.run.id, jewelleryRun);
    }
    return toResponse(created.run);
  }

  private async createNewJewelleryRun(
    device: KioskDeviceContext,
    requestPayload: CreateKioskTryOnRunPayload,
    jewelleryRun: JewelleryRunAssets,
    clientRequestId: string,
    providerMetadata: ReturnType<JewelleryTryOnExecutionService["metadata"]>,
    now: Date,
  ): Promise<{ run: Parameters<typeof toResponse>[0]; isNew: boolean }> {
    try {
      const run = await this.prisma.kioskTryOnRun.create({
        data: {
          id: createSelfxId(),
          kioskDeviceId: device.id,
          tryOnSessionId: jewelleryRun.sessionId,
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
          personAssetId: jewelleryRun.personAssetId,
          garmentAssetId: jewelleryRun.jewelleryAssetId,
          productId: jewelleryRun.productId,
          ...kioskProductReferenceData(device, requestPayload, jewelleryRun),
          provider: providerMetadata.provider,
          providerDisplayName: providerMetadata.providerDisplayName,
          providerModel: providerMetadata.model,
          tryOnVertical: "JEWELLERY",
          jewelleryType: jewelleryRun.jewelleryType,
          garmentSource: requestPayload.productId
            ? "SELFX_CATALOG"
            : "DIRECT_UPLOAD",
          garmentIntent: "JEWELLERY",
          garmentCategory: jewelleryRun.jewelleryType,
          garmentPhotoType: "PRODUCT",
          generationProfile: requestPayload.generationProfile,
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

  private async cleanupExpiredRuns(): Promise<void> {
    await this.prisma.kioskTryOnRun.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
  }

  private async prepareJewelleryRunAssets(
    device: KioskDeviceContext,
    payload: CreateKioskTryOnRunPayload,
  ): Promise<JewelleryRunAssets> {
    const sessionId = payload.sessionId ?? null;
    let personAsset: TryOnAsset | null = null;
    let personImage = payload.personImage;

    if (sessionId) {
      const sessionService = this.requireSessionService();
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
      personImage = await this.readAssetAsUploadedImage(
        personAsset,
        "personImage",
      );
    }

    if (!personImage) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        TRY_ON_LAB_ERROR_CODES.multipartInvalid,
        "Person image is required for jewellery Try-On requests.",
      );
    }

    if (payload.productId) {
      const product =
        await this.requireCatalog().resolveKioskJewelleryProductForTryOn(
          device.assignmentScope === KioskAssignmentScope.PLATFORM
            ? null
            : device.organizationId,
          payload.productId,
        );
      return {
        sessionId,
        kioskDeviceId: device.id,
        personAssetId: personAsset?.id ?? null,
        jewelleryAssetId: null,
        productId: product.productId,
        personImage,
        jewelleryImage: product.jewelleryImage,
        jewelleryType: product.jewelleryType,
      };
    }

    if (!payload.jewelleryImage || !payload.jewelleryType) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        TRY_ON_LAB_ERROR_CODES.multipartInvalid,
        "Jewellery image and jewellery type are required for jewellery Try-On requests.",
      );
    }

    const jewelleryAsset = sessionId
      ? await this.storeAndAttachJewelleryImage(
          device,
          sessionId,
          payload.jewelleryImage,
        )
      : null;
    return {
      sessionId,
      kioskDeviceId: device.id,
      personAssetId: personAsset?.id ?? null,
      jewelleryAssetId: jewelleryAsset?.id ?? null,
      productId: null,
      personImage,
      jewelleryImage: payload.jewelleryImage,
      jewelleryType: payload.jewelleryType,
    };
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

  private async storeAndAttachJewelleryImage(
    device: KioskDeviceContext,
    sessionId: string,
    image: KioskTryOnUploadedImage,
  ): Promise<TryOnAsset> {
    const key = objectKeyFor(
      sessionId,
      createSelfxId(),
      "jewellery",
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

  private async readAssetAsUploadedImage<
    TFieldName extends "personImage" | "garmentImage" | "jewelleryImage",
  >(
    asset: Pick<TryOnAsset, "storageKey" | "contentType">,
    fieldName: TFieldName,
  ): Promise<KioskTryOnUploadedImage & { fieldName: TFieldName }> {
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
      filename: `${fieldName}-asset`,
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
    const result = await parseResultImage(resultImage, {
      runId,
      tryOnVertical: "GARMENT",
      logger: this.logger,
    });
    const metadata = validateTechnicalImageBuffer({
      buffer: result.buffer,
      declaredContentType: result.contentType,
      maxBytes: TRY_ON_RESULT_MAX_IMAGE_BYTES,
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

  private async recordJewellerySessionLook(
    runId: string,
    jewelleryRun: JewelleryRunAssets,
    resultImage: string,
  ): Promise<void> {
    if (!jewelleryRun.sessionId || !jewelleryRun.personAssetId) {
      return;
    }

    const result = await parseResultImage(resultImage, {
      runId,
      tryOnVertical: "JEWELLERY",
      logger: this.logger,
    });
    const metadata = validateTechnicalImageBuffer({
      buffer: result.buffer,
      declaredContentType: result.contentType,
      maxBytes: TRY_ON_RESULT_MAX_IMAGE_BYTES,
    });
    const key = objectKeyFor(
      jewelleryRun.sessionId,
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
      sessionId: jewelleryRun.sessionId,
      kioskDeviceId: jewelleryRun.kioskDeviceId,
      kioskTryOnRunId: runId,
      personAssetId: jewelleryRun.personAssetId,
      garmentAssetId: jewelleryRun.jewelleryAssetId,
      productId: jewelleryRun.productId,
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
        id: jewelleryRun.kioskDeviceId,
        assignmentScope: look.assignmentScope,
        organizationId: look.organizationId,
        storeId: look.storeId,
      },
      {
        eventName: KIOSK_USAGE_EVENTS.tryOnGenerated,
        idempotencyKey: `kiosk-jewellery-try-on-generated:${runId}`,
        tryOnSessionId: jewelleryRun.sessionId,
        kioskTryOnRunId: runId,
        tryOnLookId: look.id,
        productId: jewelleryRun.productId,
        provider: run?.provider,
        providerModel: run?.providerModel,
        status: run?.status ?? "COMPLETED",
      },
    );
  }

  private async processJewelleryRun(
    runId: string,
    jewelleryRun: JewelleryRunAssets,
  ): Promise<void> {
    let phase = "PROVIDER_EXECUTION";
    await this.requireJewelleryExecution().process(
      {
        personImageDataUri: jewelleryRun.personImage.dataUri,
        jewelleryImageDataUri: jewelleryRun.jewelleryImage.dataUri,
        jewelleryType: jewelleryRun.jewelleryType,
        ...(jewelleryRun.productId
          ? { productReference: { productId: jewelleryRun.productId } }
          : {}),
      },
      {
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
          if (status.status === "FAILED") {
            this.logger.warn({
              event: "kiosk_jewellery_run_failure",
              runId,
              jewelleryType: jewelleryRun.jewelleryType,
              phase,
              outcome: "PROVIDER_REPORTED_FAILURE",
            });
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
          if (status.status === "COMPLETED" && status.resultImage) {
            phase = "RESULT_FINALIZATION";
            await this.recordJewellerySessionLook(
              runId,
              jewelleryRun,
              status.resultImage,
            );
          }
        },
        onTimedOut: async (completedAt) => {
          this.logger.warn({
            event: "kiosk_jewellery_run_failure",
            runId,
            jewelleryType: jewelleryRun.jewelleryType,
            phase,
            outcome: "TIMEOUT",
          });
          await this.prisma.kioskTryOnRun.update({
            where: { id: runId },
            data: {
              status: "FAILED",
              errorCode: TRY_ON_LAB_ERROR_CODES.timedOut,
              errorMessage: "Jewellery Try-On generation timed out.",
              completedAt,
            },
          });
        },
        onError: async (error, completedAt) => {
          this.logger.warn({
            event: "kiosk_jewellery_run_failure",
            runId,
            jewelleryType: jewelleryRun.jewelleryType,
            phase,
            outcome: "EXECUTION_ERROR",
          });
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

  private requireJewelleryTryOnService(): JewelleryTryOnService {
    if (!this.jewelleryTryOn) {
      throw new ApiErrorException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "JEWELLERY_TRY_ON_SERVICE_UNAVAILABLE",
        "Jewellery Try-On service is not available.",
      );
    }
    return this.jewelleryTryOn;
  }

  private requireJewelleryExecution(): JewelleryTryOnExecutionService {
    if (!this.jewelleryExecution) {
      throw new ApiErrorException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "JEWELLERY_TRY_ON_SERVICE_UNAVAILABLE",
        "Jewellery Try-On service is not available.",
      );
    }
    return this.jewelleryExecution;
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

function resolveJewelleryTryOnStoreId(
  device: KioskDeviceContext,
): string | null {
  if (device.assignmentScope === KioskAssignmentScope.PLATFORM) {
    return null;
  }
  if (device.organizationId) {
    return device.organizationId;
  }
  if (
    device.assignmentScope === KioskAssignmentScope.STORE &&
    device.storeId
  ) {
    return device.storeId;
  }
  throwJewelleryTryOnNotEnabled();
}

function jewelleryProductReference(
  productId: string | null,
  payload: CreateKioskTryOnRunPayload,
): { productId?: string; productName?: string; sku?: string } | undefined {
  const reference: { productId?: string; productName?: string; sku?: string } =
    {};
  if (productId) {
    reference.productId = productId;
  }
  if (payload.productName) {
    reference.productName = payload.productName;
  }
  if (payload.sku) {
    reference.sku = payload.sku;
  }
  return Object.keys(reference).length > 0 ? reference : undefined;
}

function kioskProductReferenceData(
  device: KioskDeviceContext,
  payload: CreateKioskTryOnRunPayload,
  sessionRun:
    Pick<SessionRunAssets | JewelleryRunAssets, "productId"> | undefined,
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
  tryOnVertical?: string | null;
  jewelleryType?: string | null;
  resultImage: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  garmentPreprocessingEnabled?: boolean | null;
  garmentPreprocessingStatus?: string | null;
  garmentPreprocessingProviderInputImage?: string | null;
  garmentPreprocessingMaskGenerated?: boolean | null;
  garmentPreprocessingFallbackReason?: string | null;
}): KioskTryOnRunResponseDto {
  return {
    id: run.id,
    status: run.status as SelfxTryOnRunStatus,
    tryOnVertical: run.tryOnVertical === "JEWELLERY" ? "JEWELLERY" : "GARMENT",
    jewelleryType:
      run.tryOnVertical === "JEWELLERY"
        ? ((run.jewelleryType as JewelleryType | null | undefined) ?? undefined)
        : undefined,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    resultImage: run.resultImage ?? undefined,
    errorCode:
      run.errorCode === null
        ? undefined
        : (run.errorCode as KioskTryOnRunResponseDto["errorCode"]),
    errorMessage: run.errorMessage ?? undefined,
    garmentPreprocessingEnabled:
      run.garmentPreprocessingEnabled ?? undefined,
    garmentPreprocessingStatus:
      run.garmentPreprocessingStatus === null ||
      run.garmentPreprocessingStatus === undefined
        ? undefined
        : (run.garmentPreprocessingStatus as SelfxGarmentPreprocessingStatus),
    garmentPreprocessingProviderInputImage:
      run.garmentPreprocessingProviderInputImage === null ||
      run.garmentPreprocessingProviderInputImage === undefined
        ? undefined
        : (run.garmentPreprocessingProviderInputImage as
            SelfxGarmentPreprocessingProviderInputImage),
    garmentPreprocessingMaskGenerated:
      run.garmentPreprocessingMaskGenerated ?? undefined,
    garmentPreprocessingFallbackReason:
      run.garmentPreprocessingFallbackReason ?? undefined,
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
  purpose: "person" | "garment" | "jewellery" | "result",
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

interface ResultDownloadDiagnostics {
  runId: string;
  tryOnVertical: "GARMENT" | "JEWELLERY";
  logger: Logger;
}

async function parseResultImage(
  resultImage: string,
  diagnostics: ResultDownloadDiagnostics,
): Promise<{
  contentType: "image/jpeg" | "image/png" | "image/webp";
  buffer: Buffer;
}> {
  if (!resultImage.startsWith("data:")) {
    return fetchResultImage(resultImage, diagnostics);
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

async function fetchResultImage(
  resultImage: string,
  diagnostics: ResultDownloadDiagnostics,
): Promise<{
  contentType: "image/jpeg" | "image/png" | "image/webp";
  buffer: Buffer;
}> {
  let url: URL;
  try {
    url = new URL(resultImage);
  } catch {
    logResultDownload(diagnostics, "INVALID_URL");
    throwInvalidResultImage();
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    logResultDownload(diagnostics, "UNSUPPORTED_SCHEME");
    throwInvalidResultImage();
  }
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    logResultDownload(diagnostics, "DOWNLOAD_FAILED");
    throw error;
  }
  const contentType = response.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  // Only log a bounded MIME token, never arbitrary headers or signed URLs.
  const safeContentType =
    contentType &&
    contentType.length <= 80 &&
    /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(contentType)
      ? contentType.toLowerCase()
      : contentType == null
        ? "missing"
        : "unrecognized";
  const responseDetails = {
    httpStatus: response.status,
    contentType: safeContentType,
  };
  if (!response.ok) {
    logResultDownload(diagnostics, "HTTP_ERROR", {
      ...responseDetails,
      detectedMediaType: await inspectResultPrefix(response),
    });
    throwInvalidResultImage();
  }
  const declaredImageType =
    contentType === "image/jpeg" ||
    contentType === "image/png" ||
    contentType === "image/webp"
      ? contentType
      : null;
  const isGenericBinary =
    contentType === "application/octet-stream" ||
    contentType === "binary/octet-stream";
  if (!declaredImageType && !isGenericBinary) {
    logResultDownload(diagnostics, "UNSUPPORTED_CONTENT_TYPE", {
      ...responseDetails,
      detectedMediaType: await inspectResultPrefix(response),
    });
    throwInvalidResultImage();
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    logResultDownload(diagnostics, "BODY_READ_FAILED", responseDetails);
    throw error;
  }
  // Generic transport labels do not identify the image format; use its signature.
  const resolvedImageType = declaredImageType ?? detectImageMimeType(buffer);
  if (!resolvedImageType) {
    logResultDownload(diagnostics, "INVALID_IMAGE_SIGNATURE", {
      ...responseDetails,
      detectedMediaType: detectResultMediaType(buffer),
      sizeBytes: buffer.length,
    });
    throwInvalidResultImage();
  }
  logResultDownload(diagnostics, "DOWNLOADED", {
    ...responseDetails,
    detectedMediaType: detectResultMediaType(buffer),
    sizeBytes: buffer.length,
  });
  return { contentType: resolvedImageType, buffer };
}

function logResultDownload(
  diagnostics: ResultDownloadDiagnostics,
  outcome: string,
  details: {
    httpStatus?: number;
    contentType?: string;
    detectedMediaType?: string;
    sizeBytes?: number;
  } = {},
): void {
  const entry = {
    event: "kiosk_try_on_result_download",
    runId: diagnostics.runId,
    tryOnVertical: diagnostics.tryOnVertical,
    outcome,
    ...details,
  };
  if (outcome === "DOWNLOADED") {
    diagnostics.logger.log(entry);
  } else {
    diagnostics.logger.warn(entry);
  }
}

function detectResultMediaType(buffer: Buffer): string {
  const imageType = detectImageMimeType(buffer);
  if (imageType) {
    return imageType;
  }
  if (buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    return "application/zip";
  }
  const prefix = buffer.subarray(0, 32).toString("ascii");
  if (prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a")) {
    return "image/gif";
  }
  if (prefix.startsWith("%PDF-")) {
    return "application/pdf";
  }
  if (/^\s*(?:<!doctype html|<html)/i.test(prefix)) {
    return "text/html";
  }
  return "unknown";
}

async function inspectResultPrefix(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return "unavailable";
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const readPrefix = async (): Promise<string> => {
      const prefix = Buffer.alloc(32);
      let length = 0;
      while (length < prefix.length) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        const bytes = Buffer.from(
          chunk.value.buffer,
          chunk.value.byteOffset,
          chunk.value.byteLength,
        );
        length += bytes.copy(prefix, length, 0, prefix.length - length);
      }
      return detectResultMediaType(prefix.subarray(0, length));
    };
    return await Promise.race([
      readPrefix(),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve("unavailable"), 1_500);
      }),
    ]);
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
  }
}

function throwInvalidResultImage(): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    TRY_ON_LAB_ERROR_CODES.imageInvalid,
    "Try-On result image is invalid.",
  );
}
