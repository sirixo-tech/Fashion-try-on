import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import {
  KioskAssignmentScope,
  Prisma,
  TryOnAssetPurpose,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";
import {
  TRY_ON_LAB_ERROR_CODES,
  SELFX_CATALOG_SOURCES,
  type SelfxCatalogSource,
  isModelCoverageCompatibleWithGarment,
  type SelfxGarmentCategory,
  type SelfxGarmentIntent,
  type SelfxTryOnRunStatus,
} from "@selfx/shared";

import { ApiErrorException } from "../common/api-error.exception.js";
import { validateTechnicalImageBuffer } from "../common/image-validation.js";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import {
  JEWELLERY_TYPES,
  PRODUCT_VERTICALS,
  type JewelleryType,
  type ProductVertical,
} from "../catalog/product-kind.js";
import { JewelleryTryOnExecutionService } from "../try-on/jewellery/jewellery-try-on-execution.service.js";
import type {
  JewelleryTryOnProviderMetadata,
  JewelleryTryOnProviderSubmitInput,
} from "../try-on/jewellery/jewellery-try-on.provider.js";
import { JewelleryTryOnService } from "../try-on/jewellery/jewellery-try-on.service.js";
import { TRY_ON_RESULT_RETENTION_MS } from "../try-on/try-on.constants.js";
import {
  TryOnExecutionService,
  type NormalizedTryOnProcessError,
} from "../try-on/try-on-execution.service.js";
import { TryOnSessionService } from "../try-on/try-on-session.service.js";
import { TRY_ON_LAB_MAX_IMAGE_BYTES } from "../try-on-lab/try-on-lab.constants.js";
import { type CreateTryOnLabRunPayload } from "../try-on-lab/try-on-lab-multipart.js";
import {
  PUBLIC_API_USAGE_EVENTS,
  UsageEventService,
} from "../usage/usage-event.service.js";
import {
  type CreatePublicApiTryOnDto,
  type PublicApiTryOnRunResponseDto,
} from "./dto/public-api-try-on.dto.js";
import { type PublicApiCredentialContext } from "./public-api-key-auth.service.js";
import { PUBLIC_API_UPLOAD_MAX_IMAGE_BYTES } from "./public-api-upload.multipart.js";
import { PublicApiWebhookService } from "./public-api-webhook.service.js";

interface PublicRunAssets {
  sessionId: string;
  organizationId: string;
  personAssetId: string;
  garmentAssetId: string;
  tryOnVertical: ProductVertical;
  jewelleryType: JewelleryType | null;
  providerMetadata:
    | ReturnType<TryOnExecutionService["metadata"]>
    | JewelleryTryOnProviderMetadata;
  executionPayload?: CreateTryOnLabRunPayload;
  jewelleryExecutionPayload?: JewelleryTryOnProviderSubmitInput;
}

interface TryOnProductReference {
  catalogSource: SelfxCatalogSource | null;
  externalProductId: string | null;
  externalVariantId: string | null;
  sku: string | null;
  productName: string | null;
  price: string | null;
  currency: string | null;
}

export interface PublicApiTryOnResultDownload {
  body: Buffer;
  contentType: string;
  contentDisposition: string;
  contentLength: number;
}

@Injectable()
export class PublicApiTryOnService {
  private readonly logger = new Logger(PublicApiTryOnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly execution: TryOnExecutionService,
    private readonly sessions: TryOnSessionService,
    private readonly storage: ObjectStorageService,
    private readonly webhooks: PublicApiWebhookService,
    private readonly usageEvents: UsageEventService,
    @Optional() private readonly jewelleryTryOn?: JewelleryTryOnService,
    @Optional()
    private readonly jewelleryExecution?: JewelleryTryOnExecutionService,
  ) {}

  async createRun(
    credential: PublicApiCredentialContext,
    input: CreatePublicApiTryOnDto,
  ): Promise<PublicApiTryOnRunResponseDto> {
    await this.cleanupExpiredRuns();
    const clientRequestId = normalizeClientRequestId(input.clientRequestId);
    const existing = await this.prisma.kioskTryOnRun.findUnique({
      where: {
        apiKeyId_clientRequestId: {
          apiKeyId: credential.apiKeyId,
          clientRequestId,
        },
      },
      include: runResponseInclude,
    });
    if (existing) {
      return this.toResponse(existing);
    }

    const runAssets = await this.prepareRunAssets(credential, input);
    if (runAssets.executionPayload) {
      enforceModelGarmentCompatibility(runAssets.executionPayload);
    }
    const now = new Date();
    const created = await this.createNewRun(
      credential,
      clientRequestId,
      runAssets,
      normalizeProductReference(input),
      now,
    );

    if (created.isNew) {
      if (runAssets.tryOnVertical === "JEWELLERY") {
        void this.processJewelleryRun(created.run.id, runAssets);
      } else {
        void this.processRun(created.run.id, runAssets);
      }
    }
    return this.toResponse(created.run);
  }

  async getRun(
    credential: PublicApiCredentialContext,
    runId: string,
  ): Promise<PublicApiTryOnRunResponseDto> {
    await this.cleanupExpiredRuns();
    const run = await this.prisma.kioskTryOnRun.findFirst({
      where: {
        id: runId,
        assignmentScope: KioskAssignmentScope.ORGANIZATION,
        organizationId: credential.storeId,
        apiKeyId: { not: null },
      },
      include: runResponseInclude,
    });
    if (!run) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "PUBLIC_API_TRYON_NOT_FOUND",
        "Public API Try-On run was not found.",
      );
    }
    return this.toResponse(run);
  }

  async downloadRunResult(
    credential: PublicApiCredentialContext,
    runId: string,
  ): Promise<PublicApiTryOnResultDownload> {
    await this.cleanupExpiredRuns();
    const now = new Date();
    const run = await this.prisma.kioskTryOnRun.findFirst({
      where: {
        id: runId,
        assignmentScope: KioskAssignmentScope.ORGANIZATION,
        organizationId: credential.storeId,
        apiKeyId: { not: null },
        status: "COMPLETED",
        resultAsset: {
          is: {
            deletedAt: null,
            expiresAt: { gt: now },
          },
        },
      },
      include: runDownloadInclude,
    });
    if (!run || !run.resultAsset) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "PUBLIC_API_TRYON_RESULT_NOT_FOUND",
        "Public API Try-On result was not found.",
      );
    }

    const maxBytes = Math.max(
      (run.resultAsset.sizeBytes ?? 0) + 1024 * 1024,
      TRY_ON_LAB_MAX_IMAGE_BYTES,
    );
    const body = await this.storage.readObject(
      run.resultAsset.storageKey,
      maxBytes,
    );
    await this.recordResultDownloaded(credential, run);
    const contentType =
      run.resultAsset.contentType?.trim() || "application/octet-stream";
    return {
      body,
      contentType,
      contentDisposition: attachmentDispositionForRun(run.id, contentType),
      contentLength: body.length,
    };
  }

  private async createNewRun(
    credential: PublicApiCredentialContext,
    clientRequestId: string,
    runAssets: PublicRunAssets,
    productReference: TryOnProductReference,
    now: Date,
  ): Promise<{ run: PublicRunRecord; isNew: boolean }> {
    const garmentFields = publicRunGarmentFields(runAssets);
    try {
      const run = await this.prisma.kioskTryOnRun.create({
        data: {
          id: createSelfxId(),
          kioskDeviceId: null,
          apiKeyId: credential.apiKeyId,
          tryOnSessionId: runAssets.sessionId,
          clientRequestId,
          status: "QUEUED",
          assignmentScope: KioskAssignmentScope.ORGANIZATION,
          organizationId: credential.storeId,
          storeId: null,
          personAssetId: runAssets.personAssetId,
          garmentAssetId: runAssets.garmentAssetId,
          productId: null,
          catalogSource: productReference.catalogSource,
          externalProductId: productReference.externalProductId,
          externalVariantId: productReference.externalVariantId,
          externalSku: productReference.sku,
          externalProductName: productReference.productName,
          externalProductPrice: productReference.price,
          externalCurrency: productReference.currency,
          provider: runAssets.providerMetadata.provider,
          providerDisplayName: runAssets.providerMetadata.providerDisplayName,
          providerModel: runAssets.providerMetadata.model,
          tryOnVertical: runAssets.tryOnVertical,
          jewelleryType: runAssets.jewelleryType,
          garmentSource: garmentFields.garmentSource,
          garmentIntent: garmentFields.garmentIntent,
          garmentCategory: garmentFields.garmentCategory,
          garmentPhotoType: garmentFields.garmentPhotoType,
          generationProfile: garmentFields.generationProfile,
          expiresAt: new Date(now.getTime() + TRY_ON_RESULT_RETENTION_MS),
        },
        include: runResponseInclude,
      });
      return { run, isNew: true };
    } catch (error) {
      const existing = await this.prisma.kioskTryOnRun.findUnique({
        where: {
          apiKeyId_clientRequestId: {
            apiKeyId: credential.apiKeyId,
            clientRequestId,
          },
        },
        include: runResponseInclude,
      });
      if (existing) {
        return { run: existing, isNew: false };
      }
      throw error;
    }
  }

  private async prepareRunAssets(
    credential: PublicApiCredentialContext,
    input: CreatePublicApiTryOnDto,
  ): Promise<PublicRunAssets> {
    const tryOnVertical = normalizeTryOnVertical(input.tryOnVertical);
    const scope = {
      sessionId: input.sessionId,
      organizationId: credential.storeId,
      storeId: null,
      kioskDeviceId: null,
    };
    const personAsset = input.personAssetId
      ? await this.sessions.getSessionAsset({
          ...scope,
          assetId: input.personAssetId,
          purpose: TryOnAssetPurpose.PERSON,
        })
      : await this.sessions.getCurrentPersonAsset(scope);
    const personImage = await this.readAssetAsUploadedImage(
      personAsset,
      "personImage",
    );

    if (tryOnVertical === "JEWELLERY") {
      const jewelleryAssetId = requireJewelleryAssetId(input.jewelleryAssetId);
      const jewelleryType = requireJewelleryType(input.jewelleryType);
      const jewelleryAsset = await this.sessions.getSessionAsset({
        ...scope,
        assetId: jewelleryAssetId,
        purpose: TryOnAssetPurpose.GARMENT,
      });
      const jewelleryImage = await this.readAssetAsUploadedImage(
        jewelleryAsset,
        "jewelleryImage",
      );
      const foundation = await this.requireJewelleryTryOn().prepareRunFoundation(
        {
          storeId: credential.storeId,
          personImageDataUri: personImage.dataUri,
          jewelleryImageDataUri: jewelleryImage.dataUri,
          jewelleryType,
          productReference: inputProductReference(input),
        },
      );

      return {
        sessionId: input.sessionId,
        organizationId: credential.storeId,
        personAssetId: personAsset.id,
        garmentAssetId: jewelleryAsset.id,
        tryOnVertical: "JEWELLERY",
        jewelleryType: foundation.jewelleryType,
        providerMetadata: foundation.provider,
        jewelleryExecutionPayload: {
          personImageDataUri: personImage.dataUri,
          jewelleryImageDataUri: jewelleryImage.dataUri,
          jewelleryType: foundation.jewelleryType,
          productReference: foundation.productReference,
        },
      };
    }

    const garmentAsset = await this.sessions.getSessionAsset({
      ...scope,
      assetId: requireGarmentAssetId(input.garmentAssetId),
      purpose: TryOnAssetPurpose.GARMENT,
    });
    const garmentImage = await this.readAssetAsUploadedImage(
      garmentAsset,
      "garmentImage",
    );
    const garmentIntent = input.garmentIntent ?? "AUTO";
    this.execution.assertConfigured();

    return {
      sessionId: input.sessionId,
      organizationId: credential.storeId,
      personAssetId: personAsset.id,
      garmentAssetId: garmentAsset.id,
      tryOnVertical: "GARMENT",
      jewelleryType: null,
      providerMetadata: this.execution.metadata(),
      executionPayload: {
        clientRequestId: input.clientRequestId,
        personImage,
        garmentImage,
        garmentSource: "PUBLIC_API",
        garmentIntent,
        category: input.category ?? categoryFromIntent(garmentIntent),
        garmentPhotoType: input.garmentPhotoType ?? "AUTO",
        modelCoverage: input.modelCoverage,
        generationProfile: input.generationProfile ?? "BALANCED",
        categoryResolutionSource: "AUTO_FALLBACK",
        photoTypeResolutionSource: "AUTO_FALLBACK",
        profileResolutionSource: "PLATFORM_DEFAULT",
        disambiguationRequired: false,
        disambiguationResolved: true,
        garmentAnalysisReasonCodes: [],
        qualityWarningCodes: [],
        qualityOverrideAccepted: false,
      },
    };
  }

  private async processRun(
    runId: string,
    runAssets: PublicRunAssets,
  ): Promise<void> {
    if (!runAssets.executionPayload) {
      return;
    }
    try {
      await this.execution.process(runAssets.executionPayload, {
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
              resultImage: null,
              errorCode: status.errorCode,
              errorMessage: status.errorMessage,
              completedAt: status.completedAt,
            },
          });
          if (status.status === "COMPLETED" && status.resultImage) {
            await this.recordSessionLook(runId, runAssets, status.resultImage);
            await this.deliverTerminalWebhook(runId, runAssets.organizationId);
            return;
          }
          if (status.status === "FAILED") {
            await this.deliverTerminalWebhook(runId, runAssets.organizationId);
          }
        },
        onTimedOut: async (completedAt) => {
          await this.prisma.kioskTryOnRun.update({
            where: { id: runId },
            data: {
              status: "FAILED",
              resultImage: null,
              errorCode: TRY_ON_LAB_ERROR_CODES.timedOut,
              errorMessage: "Try-On generation timed out.",
              completedAt,
            },
          });
          await this.deliverTerminalWebhook(runId, runAssets.organizationId);
        },
        onError: async (error, completedAt) => {
          await this.prisma.kioskTryOnRun.update({
            where: { id: runId },
            data: {
              status: error.status,
              resultImage: null,
              errorCode: error.errorCode,
              errorMessage: error.errorMessage,
              completedAt,
            },
          });
          await this.deliverTerminalWebhook(runId, runAssets.organizationId);
        },
      });
    } catch (error) {
      this.logger.warn({
        event: "public_api_try_on_process_failed",
        runId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async processJewelleryRun(
    runId: string,
    runAssets: PublicRunAssets,
  ): Promise<void> {
    if (!runAssets.jewelleryExecutionPayload) {
      return;
    }
    try {
      await this.requireJewelleryExecution().process(
        runAssets.jewelleryExecutionPayload,
        this.processObserver(runId, runAssets),
      );
    } catch (error) {
      this.logger.warn({
        event: "public_api_jewellery_try_on_process_failed",
        runId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private processObserver(runId: string, runAssets: PublicRunAssets) {
    return {
      onStarted: async (startedAt: Date) => {
        await this.prisma.kioskTryOnRun.update({
          where: { id: runId },
          data: { startedAt },
        });
      },
      onSubmitted: async (providerPredictionId: string) => {
        await this.prisma.kioskTryOnRun.update({
          where: { id: runId },
          data: {
            status: "PROCESSING",
            providerPredictionId,
            submittedAt: new Date(),
          },
        });
      },
      onStatus: async (status: {
        status: SelfxTryOnRunStatus;
        resultImage?: string;
        errorCode?: PublicApiTryOnRunResponseDto["errorCode"];
        errorMessage?: string;
        completedAt?: Date;
      }) => {
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
        if (status.status === "COMPLETED" && status.resultImage) {
          await this.recordSessionLook(runId, runAssets, status.resultImage);
          await this.deliverTerminalWebhook(runId, runAssets.organizationId);
          return;
        }
        if (status.status === "FAILED") {
          await this.deliverTerminalWebhook(runId, runAssets.organizationId);
        }
      },
      onTimedOut: async (completedAt: Date) => {
        await this.prisma.kioskTryOnRun.update({
          where: { id: runId },
          data: {
            status: "FAILED",
            resultImage: null,
            errorCode: TRY_ON_LAB_ERROR_CODES.timedOut,
            errorMessage: "Try-On generation timed out.",
            completedAt,
          },
        });
        await this.deliverTerminalWebhook(runId, runAssets.organizationId);
      },
      onError: async (
        error: NormalizedTryOnProcessError,
        completedAt: Date,
      ) => {
        await this.prisma.kioskTryOnRun.update({
          where: { id: runId },
          data: {
            status: error.status,
            resultImage: null,
            errorCode: error.errorCode,
            errorMessage: error.errorMessage,
            completedAt,
          },
        });
        await this.deliverTerminalWebhook(runId, runAssets.organizationId);
      },
    };
  }

  private async readAssetAsUploadedImage(
    asset: Pick<
      PublicRunAssetRecord,
      "storageKey" | "contentType" | "id" | "purpose"
    >,
    fieldName: "personImage" | "garmentImage" | "jewelleryImage",
  ) {
    const buffer = await this.storage.readObject(
      asset.storageKey,
      PUBLIC_API_UPLOAD_MAX_IMAGE_BYTES,
    );
    const metadata = validateTechnicalImageBuffer({
      buffer,
      declaredContentType: asset.contentType,
      maxBytes: PUBLIC_API_UPLOAD_MAX_IMAGE_BYTES,
    });
    return {
      fieldName,
      filename: `${fieldName}-${asset.id}`,
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
    runAssets: PublicRunAssets,
    resultImage: string,
  ): Promise<void> {
    const result = await parseResultImage(resultImage);
    const metadata = validateTechnicalImageBuffer({
      buffer: result.buffer,
      declaredContentType: result.contentType,
      maxBytes: TRY_ON_LAB_MAX_IMAGE_BYTES,
    });
    const storageKey = objectKeyFor(
      runAssets.sessionId,
      runId,
      metadata.mimeType,
    );
    await this.storage.putObject({
      key: storageKey,
      contentType: metadata.mimeType,
      body: result.buffer,
    });

    try {
      await this.sessions.recordLook({
        sessionId: runAssets.sessionId,
        organizationId: runAssets.organizationId,
        storeId: null,
        kioskDeviceId: null,
        kioskTryOnRunId: runId,
        personAssetId: runAssets.personAssetId,
        garmentAssetId: runAssets.garmentAssetId,
        productId: null,
        resultAsset: {
          storageKey,
          contentType: metadata.mimeType,
          sizeBytes: metadata.sizeBytes,
          width: metadata.width,
          height: metadata.height,
        },
      });
    } catch (error) {
      await this.deleteObjectBestEffort(storageKey);
      throw error;
    }
  }

  private async deliverTerminalWebhook(
    runId: string,
    organizationId: string,
  ): Promise<void> {
    const run = await this.prisma.kioskTryOnRun.findFirst({
      where: {
        id: runId,
        organizationId,
        apiKeyId: { not: null },
      },
      include: runResponseInclude,
    });
    if (!run) {
      return;
    }
    await this.webhooks.deliverTryOnRunTerminalEvent(
      organizationId,
      this.toResponse(run),
    );
  }

  private async recordResultDownloaded(
    credential: PublicApiCredentialContext,
    run: PublicDownloadRunRecord,
  ): Promise<void> {
    try {
      await this.usageEvents.recordPublicApiEvent({
        eventName: PUBLIC_API_USAGE_EVENTS.downloadCompleted,
        idempotencyKey: `public-api-result-downloaded:${credential.apiKeyId}:${run.id}`,
        apiKeyId: credential.apiKeyId,
        organizationId: credential.storeId,
        tryOnSessionId: run.tryOnSessionId,
        kioskTryOnRunId: run.id,
        tryOnLookId: run.look?.id ?? null,
        productId: run.productId,
        provider: run.provider,
        providerModel: run.providerModel,
        status: run.status,
        metadata: downloadUsageMetadata(run),
      });
    } catch (error) {
      this.logger.warn({
        event: "public_api_usage_event_record_failed",
        usageEventName: PUBLIC_API_USAGE_EVENTS.downloadCompleted,
        runId: run.id,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async cleanupExpiredRuns(): Promise<void> {
    await this.prisma.kioskTryOnRun.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
  }

  private requireJewelleryTryOn(): JewelleryTryOnService {
    if (!this.jewelleryTryOn) {
      throw new ApiErrorException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PUBLIC_API_JEWELLERY_TRYON_UNAVAILABLE",
        "Jewellery Try-On is not available in this deployment.",
      );
    }
    return this.jewelleryTryOn;
  }

  private requireJewelleryExecution(): JewelleryTryOnExecutionService {
    if (!this.jewelleryExecution) {
      throw new ApiErrorException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PUBLIC_API_JEWELLERY_TRYON_UNAVAILABLE",
        "Jewellery Try-On is not available in this deployment.",
      );
    }
    return this.jewelleryExecution;
  }

  private toResponse(run: PublicRunRecord): PublicApiTryOnRunResponseDto {
    return {
      id: run.id,
      status: run.status as SelfxTryOnRunStatus,
      sessionId: run.tryOnSessionId ?? "",
      tryOnVertical: run.tryOnVertical ?? "GARMENT",
      personAssetId: run.personAssetId ?? undefined,
      garmentAssetId:
        run.tryOnVertical === "JEWELLERY"
          ? undefined
          : (run.garmentAssetId ?? undefined),
      jewelleryAssetId:
        run.tryOnVertical === "JEWELLERY"
          ? (run.garmentAssetId ?? undefined)
          : undefined,
      jewelleryType: run.jewelleryType ?? undefined,
      productReference: responseProductReference(run),
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      result: run.resultAsset
        ? {
            assetId: run.resultAsset.id,
            readUrl: publicApiTryOnDownloadUrl(run.id),
            contentType: run.resultAsset.contentType ?? undefined,
            sizeBytes: run.resultAsset.sizeBytes ?? undefined,
            width: run.resultAsset.width ?? undefined,
            height: run.resultAsset.height ?? undefined,
            expiresAt: run.resultAsset.expiresAt.toISOString(),
          }
        : undefined,
      errorCode:
        run.errorCode === null
          ? undefined
          : (run.errorCode as PublicApiTryOnRunResponseDto["errorCode"]),
      errorMessage: run.errorMessage ?? undefined,
    };
  }

  private async deleteObjectBestEffort(storageKey: string): Promise<void> {
    try {
      await this.storage.deleteObject(storageKey);
    } catch {
      // Retention cleanup is the fallback if immediate cleanup fails.
    }
  }
}

const runResponseInclude = {
  resultAsset: {
    select: {
      id: true,
      storageKey: true,
      contentType: true,
      sizeBytes: true,
      width: true,
      height: true,
      expiresAt: true,
    },
  },
} satisfies Prisma.KioskTryOnRunInclude;

const runDownloadInclude = {
  resultAsset: {
    select: {
      storageKey: true,
      contentType: true,
      sizeBytes: true,
      expiresAt: true,
    },
  },
  look: {
    select: {
      id: true,
    },
  },
} satisfies Prisma.KioskTryOnRunInclude;

type PublicRunRecord = Prisma.KioskTryOnRunGetPayload<{
  include: typeof runResponseInclude;
}>;

type PublicRunAssetRecord = Awaited<
  ReturnType<TryOnSessionService["getSessionAsset"]>
>;

type PublicDownloadRunRecord = Prisma.KioskTryOnRunGetPayload<{
  include: typeof runDownloadInclude;
}>;

function normalizeClientRequestId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      "PUBLIC_API_TRYON_INVALID",
      "clientRequestId is required and must be 160 characters or fewer.",
    );
  }
  return normalized;
}

function normalizeTryOnVertical(
  value: ProductVertical | string | null | undefined,
): ProductVertical {
  const normalized = value?.trim().toUpperCase() || "GARMENT";
  if (!PRODUCT_VERTICALS.includes(normalized as ProductVertical)) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      "PUBLIC_API_TRYON_INVALID",
      "tryOnVertical must be GARMENT or JEWELLERY.",
    );
  }
  return normalized as ProductVertical;
}

function requireGarmentAssetId(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      "PUBLIC_API_TRYON_INVALID",
      "garmentAssetId is required for garment Try-On.",
    );
  }
  return normalized;
}

function requireJewelleryAssetId(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      "PUBLIC_API_TRYON_INVALID",
      "jewelleryAssetId is required for jewellery Try-On.",
    );
  }
  return normalized;
}

function requireJewelleryType(
  value: JewelleryType | string | undefined,
): JewelleryType {
  const normalized = value?.trim().toUpperCase();
  if (!normalized || !JEWELLERY_TYPES.includes(normalized as JewelleryType)) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      "PUBLIC_API_TRYON_INVALID",
      "jewelleryType must be RING, BRACELET, NECKLACE or EARRING.",
    );
  }
  return normalized as JewelleryType;
}

function inputProductReference(
  input: CreatePublicApiTryOnDto,
): JewelleryTryOnProviderSubmitInput["productReference"] {
  const reference = normalizeProductReference(input);
  if (!reference.externalProductId && !reference.productName && !reference.sku) {
    return undefined;
  }
  return {
    productId: reference.externalProductId ?? undefined,
    productName: reference.productName ?? undefined,
    sku: reference.sku ?? undefined,
  };
}

function publicRunGarmentFields(runAssets: PublicRunAssets): {
  garmentSource: string;
  garmentIntent: string;
  garmentCategory: string;
  garmentPhotoType: string;
  generationProfile: string;
} {
  if (runAssets.tryOnVertical === "JEWELLERY") {
    return {
      garmentSource: "PUBLIC_API",
      garmentIntent: "JEWELLERY",
      garmentCategory: runAssets.jewelleryType ?? "JEWELLERY",
      garmentPhotoType: "PRODUCT",
      generationProfile: "BALANCED",
    };
  }

  const payload = runAssets.executionPayload;
  if (!payload) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      "PUBLIC_API_TRYON_INVALID",
      "Garment Try-On request is missing garment execution details.",
    );
  }
  return {
    garmentSource: payload.garmentSource,
    garmentIntent: payload.garmentIntent,
    garmentCategory: payload.category,
    garmentPhotoType: payload.garmentPhotoType,
    generationProfile: payload.generationProfile,
  };
}

function normalizeProductReference(
  input: CreatePublicApiTryOnDto,
): TryOnProductReference {
  const externalProductId = optionalText(input.externalProductId);
  const externalVariantId = optionalText(input.externalVariantId);
  const sku = optionalText(input.sku);
  const productName = optionalText(input.productName);
  const price = optionalPrice(input.price);
  const currency = optionalCurrency(input.currency);
  const hasReference = Boolean(
    externalProductId ||
    externalVariantId ||
    sku ||
    productName ||
    price ||
    currency,
  );
  return {
    catalogSource: input.catalogSource ?? (hasReference ? "PUBLIC_API" : null),
    externalProductId,
    externalVariantId,
    sku,
    productName,
    price,
    currency,
  };
}

function optionalText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function optionalPrice(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(trimmed)) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      "PUBLIC_API_TRYON_INVALID_PRODUCT_REFERENCE",
      "price must be a positive decimal string with up to 2 decimal places.",
    );
  }
  return trimmed;
}

function optionalCurrency(value: string | undefined): string | null {
  const trimmed = value?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

function responseProductReference(run: {
  catalogSource?: string | null;
  externalProductId?: string | null;
  externalVariantId?: string | null;
  externalSku?: string | null;
  externalProductName?: string | null;
  externalProductPrice?: { toString(): string } | string | number | null;
  externalCurrency?: string | null;
}): PublicApiTryOnRunResponseDto["productReference"] {
  const catalogSource = validCatalogSource(run.catalogSource);
  const reference = {
    catalogSource: catalogSource ?? undefined,
    externalProductId: run.externalProductId ?? undefined,
    externalVariantId: run.externalVariantId ?? undefined,
    sku: run.externalSku ?? undefined,
    productName: run.externalProductName ?? undefined,
    price: run.externalProductPrice?.toString() ?? undefined,
    currency: run.externalCurrency ?? undefined,
  };
  return Object.values(reference).some((value) => value !== undefined)
    ? reference
    : undefined;
}

function productReferenceMetadata(run: {
  catalogSource?: string | null;
  externalProductId?: string | null;
  externalVariantId?: string | null;
  externalSku?: string | null;
  externalProductName?: string | null;
  externalProductPrice?: { toString(): string } | string | number | null;
  externalCurrency?: string | null;
}): Prisma.InputJsonObject | null {
  const reference = responseProductReference(run);
  return reference ? (reference as Prisma.InputJsonObject) : null;
}

function downloadUsageMetadata(run: {
  resultAssetId: string | null;
  tryOnVertical?: string | null;
  jewelleryType?: string | null;
  catalogSource?: string | null;
  externalProductId?: string | null;
  externalVariantId?: string | null;
  externalSku?: string | null;
  externalProductName?: string | null;
  externalProductPrice?: { toString(): string } | string | number | null;
  externalCurrency?: string | null;
}): Prisma.InputJsonObject {
  const productReference = productReferenceMetadata(run);
  return {
    ...(run.resultAssetId ? { result_asset_id: run.resultAssetId } : {}),
    ...(run.tryOnVertical ? { try_on_vertical: run.tryOnVertical } : {}),
    ...(run.jewelleryType ? { jewellery_type: run.jewelleryType } : {}),
    ...(productReference ? { product_reference: productReference } : {}),
  };
}

function validCatalogSource(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  return SELFX_CATALOG_SOURCES.includes(value as SelfxCatalogSource)
    ? (value as SelfxCatalogSource)
    : null;
}

function categoryFromIntent(intent: SelfxGarmentIntent): SelfxGarmentCategory {
  if (intent === "TOP" || intent === "BOTTOM" || intent === "ONE_PIECE") {
    return intent;
  }
  return "AUTO";
}

function enforceModelGarmentCompatibility(
  payload: Pick<CreateTryOnLabRunPayload, "modelCoverage" | "garmentIntent">,
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

function objectKeyFor(
  sessionId: string,
  runId: string,
  contentType: string,
): string {
  const extension =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : "jpg";
  return `public-api/${sessionId}/results/${runId}.${extension}`;
}

function publicApiTryOnDownloadUrl(runId: string): string {
  const path = `/api/v1/public/try-ons/${encodeURIComponent(runId)}/download`;
  const baseUrl = process.env.SELFX_API_BASE_URL?.trim().replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}${path}` : path;
}

function attachmentDispositionForRun(
  runId: string,
  contentType: string | null,
): string {
  const filename = `selfx-try-on-${runId}.${extensionForContentType(contentType)}`;
  return `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(
    filename,
  )}`;
}

function extensionForContentType(contentType: string | null): string {
  const normalized = contentType?.toLowerCase().split(";")[0]?.trim();
  if (normalized === "image/png") {
    return "png";
  }
  if (normalized === "image/webp") {
    return "webp";
  }
  return "jpg";
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
  if (!match || !match[1] || !match[2]) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      TRY_ON_LAB_ERROR_CODES.imageInvalid,
      "Try-On result image is invalid.",
    );
  }
  return {
    contentType: match[1].toLowerCase() as
      "image/jpeg" | "image/png" | "image/webp",
    buffer: Buffer.from(match[2], "base64"),
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
  return {
    contentType,
    buffer: Buffer.from(await response.arrayBuffer()),
  };
}

function throwInvalidResultImage(): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    TRY_ON_LAB_ERROR_CODES.imageInvalid,
    "Try-On result image is invalid.",
  );
}
