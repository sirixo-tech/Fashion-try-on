import { createHash, randomBytes, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import {
  ExternalProductMappingStatus,
  IntegrationStatus,
  KioskAssignmentScope,
  type Prisma,
  type Product,
  TryOnAssetPurpose,
  TryOnSessionStatus,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";
import {
  DEFAULT_TRY_ON_GENERATION_PROFILE,
  SELFX_GARMENT_CATEGORIES,
  SELFX_GARMENT_INTENTS,
  SELFX_GARMENT_PHOTO_TYPES,
  TRY_ON_LAB_ERROR_CODES,
  type SelfxGarmentCategory,
  type SelfxGarmentIntent,
  type SelfxGarmentPhotoType,
  type SelfxTryOnRunStatus,
} from "@selfx/shared";

import { ApiErrorException } from "../common/api-error.exception.js";
import {
  TechnicalImageValidationError,
  validateTechnicalImageBuffer,
} from "../common/image-validation.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  PUBLIC_API_UPLOAD_MAX_IMAGE_BYTES,
  type PublicApiUploadPayload,
} from "../developer-api/public-api-upload.multipart.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import {
  TryOnExecutionService,
  type NormalizedTryOnProcessError,
} from "../try-on/try-on-execution.service.js";
import { TryOnSessionService } from "../try-on/try-on-session.service.js";
import { TRY_ON_RESULT_RETENTION_MS } from "../try-on/try-on.constants.js";
import {
  type CreateTryOnLabRunPayload,
  type TryOnLabUploadedImage,
} from "../try-on-lab/try-on-lab-multipart.js";
import {
  type CreateShopifyStorefrontTryOnRunDto,
  type CreateShopifyStorefrontTryOnSessionDto,
  type ShopifyStorefrontTryOnPersonUploadDto,
  type ShopifyStorefrontTryOnProductDto,
  type ShopifyStorefrontTryOnRunDto,
  type ShopifyStorefrontTryOnSessionDto,
} from "./dto/shopify-storefront-try-on.dto.js";

const storefrontProductImageMaxBytes = PUBLIC_API_UPLOAD_MAX_IMAGE_BYTES;
export const SHOPIFY_STOREFRONT_TRY_ON_SESSION_LIFETIME_MS = 15 * 60 * 1000;

export const SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES = {
  productContextMissing: "SHOPIFY_STOREFRONT_TRYON_PRODUCT_CONTEXT_MISSING",
  productUnavailable: "SHOPIFY_STOREFRONT_TRYON_PRODUCT_UNAVAILABLE",
  productNotEnabled: "SHOPIFY_STOREFRONT_TRYON_PRODUCT_NOT_ENABLED",
  productImageUnavailable: "SHOPIFY_STOREFRONT_TRYON_PRODUCT_IMAGE_UNAVAILABLE",
  sessionNotFound: "SHOPIFY_STOREFRONT_TRYON_SESSION_NOT_FOUND",
  imageInvalid: "SHOPIFY_STOREFRONT_TRYON_IMAGE_INVALID",
  personRequired: "SHOPIFY_STOREFRONT_TRYON_PERSON_REQUIRED",
  runNotFound: "SHOPIFY_STOREFRONT_TRYON_RUN_NOT_FOUND",
} as const;

type ShopifyProductContext = {
  integrationId: string;
  storeId: string;
  mapping: {
    externalProductId: string;
    externalHandle: string | null;
    externalSku: string | null;
  };
  product: ShopifyProductRecord;
};

type ShopifyProductRecord = Pick<
  Product,
  | "id"
  | "name"
  | "active"
  | "vtoEnabled"
  | "imageUrl"
  | "imageStorageKey"
  | "imageContentType"
  | "priceAmountCents"
  | "priceCurrency"
  | "productVertical"
  | "garmentIntent"
  | "garmentCategory"
  | "garmentPhotoType"
>;

type ActiveMapping = {
  externalProductId: string;
  externalHandle: string | null;
  externalSku: string | null;
};

type RunWithResult = Prisma.KioskTryOnRunGetPayload<{
  include: typeof runInclude;
}>;

type StorefrontCapability = Prisma.ShopifyStorefrontTryOnSessionGetPayload<{
  include: typeof storefrontCapabilityInclude;
}>;

@Injectable()
export class ShopifyStorefrontTryOnService {
  private readonly logger = new Logger(ShopifyStorefrontTryOnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: TryOnSessionService,
    private readonly storage: ObjectStorageService,
    private readonly execution: TryOnExecutionService,
  ) {}

  async createSession(
    input: CreateShopifyStorefrontTryOnSessionDto,
  ): Promise<ShopifyStorefrontTryOnSessionDto> {
    const context = await this.requireEligibleProduct(input);
    const expiresAt = new Date(
      Date.now() + SHOPIFY_STOREFRONT_TRY_ON_SESSION_LIFETIME_MS,
    );
    const sessionToken = createSessionToken();
    const session = await this.sessions.createSession({
      assignmentScope: KioskAssignmentScope.ORGANIZATION,
      organizationId: context.storeId,
      storeId: null,
      kioskDeviceId: null,
      expiresAt,
    });

    let storageKey: string | undefined;
    try {
      const productImage = await this.readProductImage(context.product);
      storageKey = objectKeyFor({
        storeId: context.storeId,
        sessionId: session.id,
        purpose: "garment",
        contentType: productImage.mimeType,
      });
      await this.storage.putObject({
        key: storageKey,
        contentType: productImage.mimeType,
        body: productImage.buffer,
      });
      const asset = await this.sessions.attachGarmentAsset({
        sessionId: session.id,
        organizationId: context.storeId,
        storeId: null,
        kioskDeviceId: null,
        storageKey,
        contentType: productImage.mimeType,
        sizeBytes: productImage.sizeBytes,
        width: productImage.width,
        height: productImage.height,
        expiresAt,
      });
      await this.prisma.shopifyStorefrontTryOnSession.create({
        data: {
          id: createSelfxId(),
          tokenHash: hashSessionToken(sessionToken),
          tryOnSessionId: session.id,
          integrationId: context.integrationId,
          organizationId: context.storeId,
          productId: context.product.id,
          garmentAssetId: asset.id,
          shopDomain: normalizeShopDomain(input.shop),
          externalProductId: context.mapping.externalProductId,
          productHandle: context.mapping.externalHandle,
          expiresAt,
        },
      });
      return {
        session: sessionToken,
        garmentAssetId: asset.id,
        expiresAt: expiresAt.toISOString(),
        product: toProductDto(context),
      };
    } catch (error) {
      if (storageKey) {
        await this.deleteObjectBestEffort(storageKey);
      }
      await this.completeSessionBestEffort(session.id, context.storeId);
      throw error;
    }
  }

  async getSession(
    sessionToken: string,
  ): Promise<ShopifyStorefrontTryOnSessionDto> {
    const capability = await this.requireActiveCapability(sessionToken);
    return {
      session: sessionToken,
      garmentAssetId: capability.garmentAssetId,
      expiresAt: capability.expiresAt.toISOString(),
      product: toCapabilityProductDto(capability),
    };
  }

  async uploadPersonImage(
    sessionToken: string,
    payload: PublicApiUploadPayload,
  ): Promise<ShopifyStorefrontTryOnPersonUploadDto> {
    if (payload.purpose !== TryOnAssetPurpose.PERSON) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.imageInvalid,
        "Upload purpose must be PERSON.",
      );
    }
    const capability = await this.requireActiveCapability(sessionToken);
    const storageKey = objectKeyFor({
      storeId: capability.organizationId,
      sessionId: capability.tryOnSessionId,
      purpose: "person",
      contentType: payload.image.mimeType,
    });
    try {
      await this.storage.putObject({
        key: storageKey,
        contentType: payload.image.mimeType,
        body: payload.image.buffer,
      });
      const asset = await this.sessions.attachPersonAsset({
        sessionId: capability.tryOnSessionId,
        organizationId: capability.organizationId,
        storeId: null,
        kioskDeviceId: null,
        storageKey,
        contentType: payload.image.mimeType,
        sizeBytes: payload.image.sizeBytes,
        width: payload.image.width,
        height: payload.image.height,
        expiresAt: capability.expiresAt,
      });
      return {
        session: sessionToken,
        personAssetId: asset.id,
        expiresAt: asset.expiresAt.toISOString(),
      };
    } catch (error) {
      await this.deleteObjectBestEffort(storageKey);
      throw error;
    }
  }

  async createRun(
    sessionToken: string,
    input: CreateShopifyStorefrontTryOnRunDto,
  ): Promise<ShopifyStorefrontTryOnRunDto> {
    const capability = await this.requireActiveCapability(sessionToken);
    const mapping = await this.requireActiveMapping(capability);
    const personAsset = await this.sessions
      .getCurrentPersonAsset({
        sessionId: capability.tryOnSessionId,
        organizationId: capability.organizationId,
        storeId: null,
        kioskDeviceId: null,
      })
      .catch(() => {
        throw new ApiErrorException(
          HttpStatus.CONFLICT,
          SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.personRequired,
          "Add your photo before starting Try-On.",
        );
      });
    const garmentAsset = await this.sessions
      .getSessionAsset({
        sessionId: capability.tryOnSessionId,
        organizationId: capability.organizationId,
        storeId: null,
        kioskDeviceId: null,
        assetId: capability.garmentAssetId,
        purpose: TryOnAssetPurpose.GARMENT,
      })
      .catch(() => {
        throw productImageUnavailable();
      });
    const [personImage, garmentImage] = await Promise.all([
      this.readAssetAsUploadedImage(personAsset, "personImage"),
      this.readAssetAsUploadedImage(garmentAsset, "garmentImage"),
    ]);
    const provider = this.execution.metadata();
    this.execution.assertConfigured();
    const now = new Date();
    const run = await this.prisma.kioskTryOnRun.create({
      data: {
        id: createSelfxId(),
        kioskDeviceId: null,
        apiKeyId: null,
        tryOnSessionId: capability.tryOnSessionId,
        clientRequestId: input.clientRequestId?.trim() || randomUUID(),
        status: "QUEUED",
        assignmentScope: KioskAssignmentScope.ORGANIZATION,
        organizationId: capability.organizationId,
        storeId: null,
        personAssetId: personAsset.id,
        garmentAssetId: garmentAsset.id,
        productId: capability.product.id,
        catalogSource: "SHOPIFY",
        externalProductId: capability.externalProductId,
        externalVariantId: null,
        externalSku: mapping.externalSku,
        externalProductName: capability.product.name,
        externalProductPrice: priceDecimal(capability.product.priceAmountCents),
        externalCurrency: capability.product.priceCurrency,
        provider: provider.provider,
        providerDisplayName: provider.providerDisplayName,
        providerModel: provider.model,
        tryOnVertical: "GARMENT",
        jewelleryType: null,
        garmentSource: "SHOPIFY",
        garmentIntent: normalizeGarmentIntent(capability.product.garmentIntent),
        garmentCategory: normalizeGarmentCategory(
          capability.product.garmentCategory,
        ),
        garmentPhotoType: normalizeGarmentPhotoType(
          capability.product.garmentPhotoType,
        ),
        generationProfile: DEFAULT_TRY_ON_GENERATION_PROFILE,
        expiresAt: new Date(now.getTime() + TRY_ON_RESULT_RETENTION_MS),
      },
      include: runInclude,
    });

    void this.processRun(run.id, {
      sessionId: capability.tryOnSessionId,
      storeId: capability.organizationId,
      productId: capability.product.id,
      personAssetId: personAsset.id,
      garmentAssetId: garmentAsset.id,
      payload: {
        clientRequestId: run.clientRequestId,
        personImage,
        garmentImage,
        garmentSource: "SHOPIFY",
        garmentIntent: normalizeGarmentIntent(capability.product.garmentIntent),
        category: normalizeGarmentCategory(capability.product.garmentCategory),
        garmentPhotoType: normalizeGarmentPhotoType(
          capability.product.garmentPhotoType,
        ),
        generationProfile: DEFAULT_TRY_ON_GENERATION_PROFILE,
        categoryResolutionSource: "SHOPIFY_CATALOG_METADATA",
        photoTypeResolutionSource: "SHOPIFY_CATALOG_METADATA",
        profileResolutionSource: "PLATFORM_DEFAULT",
        disambiguationRequired: false,
        disambiguationResolved: true,
        garmentAnalysisReasonCodes: [],
        qualityWarningCodes: [],
        qualityOverrideAccepted: false,
      },
    });

    return this.toRunDto(run, sessionToken, toCapabilityProductDto(capability));
  }

  async getRun(
    sessionToken: string,
    runId: string,
  ): Promise<ShopifyStorefrontTryOnRunDto> {
    const capability = await this.requireActiveCapability(sessionToken);
    const run = await this.findRun(capability.tryOnSessionId, runId);
    if (!run || run.organizationId !== capability.organizationId) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.runNotFound,
        "Try-On run was not found.",
      );
    }
    return this.toRunDto(run, sessionToken, toCapabilityProductDto(capability));
  }

  private async requireEligibleProduct(
    input: CreateShopifyStorefrontTryOnSessionDto,
  ): Promise<ShopifyProductContext> {
    const shop = normalizeShopDomain(input.shop);
    const externalProductId = nullableTrim(input.externalProductId);
    const productHandle = nullableTrim(input.productHandle);
    if (!externalProductId && !productHandle) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.productContextMissing,
        "Shopify product context is required.",
      );
    }

    const integration = await this.prisma.integration.findFirst({
      where: {
        type: "SHOPIFY",
        status: IntegrationStatus.ACTIVE,
        metadata: { path: ["shopDomain"], equals: shop },
        organization: { status: "ACTIVE" },
      },
      select: { id: true, organizationId: true },
    });
    if (!integration) {
      throw productUnavailable();
    }

    const mapping = await this.prisma.externalProductMapping.findFirst({
      where: {
        integrationId: integration.id,
        status: ExternalProductMappingStatus.ACTIVE,
        externalVariantId: null,
        OR: [
          ...(externalProductId ? [{ externalProductId }] : []),
          ...(productHandle ? [{ externalHandle: productHandle }] : []),
        ],
      },
      select: {
        externalProductId: true,
        externalHandle: true,
        externalSku: true,
        product: { select: productSelect },
      },
    });
    if (!mapping) {
      throw productUnavailable();
    }
    assertProductEligible(mapping.product);
    return {
      integrationId: integration.id,
      storeId: integration.organizationId,
      mapping,
      product: mapping.product,
    };
  }

  private async requireCapability(
    sessionToken: string,
  ): Promise<StorefrontCapability> {
    if (!validSessionToken(sessionToken)) {
      throw sessionNotFound();
    }
    const capability = await this.prisma.shopifyStorefrontTryOnSession.findUnique(
      {
        where: { tokenHash: hashSessionToken(sessionToken) },
        include: storefrontCapabilityInclude,
      },
    );
    if (!capability) {
      throw sessionNotFound();
    }
    return capability;
  }

  private async requireActiveCapability(
    sessionToken: string,
  ): Promise<StorefrontCapability> {
    const capability = await this.requireCapability(sessionToken);
    if (
      capability.expiresAt <= new Date() ||
      capability.tryOnSession.expiresAt <= new Date() ||
      capability.tryOnSession.status !== TryOnSessionStatus.ACTIVE
    ) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.sessionNotFound,
        "Try-On session is no longer active.",
      );
    }
    this.assertCapabilityEligible(capability);
    await this.requireActiveMapping(capability);
    return capability;
  }

  private assertCapabilityEligible(capability: StorefrontCapability): void {
    if (
      capability.integration.type !== "SHOPIFY" ||
      capability.integration.status !== IntegrationStatus.ACTIVE ||
      capability.integration.organization.status !== "ACTIVE"
    ) {
      throw productUnavailable();
    }
    assertProductEligible(capability.product);
  }

  private async requireActiveMapping(
    capability: StorefrontCapability,
  ): Promise<ActiveMapping> {
    const mapping = await this.prisma.externalProductMapping.findFirst({
      where: {
        integrationId: capability.integrationId,
        productId: capability.productId,
        externalProductId: capability.externalProductId,
        externalVariantId: null,
        status: ExternalProductMappingStatus.ACTIVE,
      },
      select: {
        externalProductId: true,
        externalHandle: true,
        externalSku: true,
      },
    });
    if (!mapping) {
      throw productUnavailable();
    }
    return mapping;
  }

  private async readProductImage(product: ShopifyProductRecord) {
    if (product.imageStorageKey) {
      const buffer = await this.storage.readObject(
        product.imageStorageKey,
        storefrontProductImageMaxBytes,
      );
      return validateProductImage(buffer, product.imageContentType);
    }
    if (!product.imageUrl) {
      throw productImageUnavailable();
    }
    const response = await fetch(product.imageUrl);
    if (!response.ok) {
      throw productImageUnavailable();
    }
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > storefrontProductImageMaxBytes) {
      throw productImageUnavailable();
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return validateProductImage(buffer, response.headers.get("content-type"));
  }

  private async readAssetAsUploadedImage(
    asset: {
      id: string;
      storageKey: string;
      contentType: string | null;
    },
    fieldName: "personImage" | "garmentImage",
  ): Promise<TryOnLabUploadedImage> {
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
    };
  }

  private async processRun(
    runId: string,
    input: {
      sessionId: string;
      storeId: string;
      productId: string;
      personAssetId: string;
      garmentAssetId: string;
      payload: CreateTryOnLabRunPayload;
    },
  ): Promise<void> {
    try {
      await this.execution.process(input.payload, {
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
            await this.recordSessionLook(runId, input, status.resultImage);
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
        },
      });
    } catch (error) {
      this.logger.warn({
        event: "shopify_storefront_try_on_process_failed",
        runId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async recordSessionLook(
    runId: string,
    input: {
      sessionId: string;
      storeId: string;
      productId: string;
      personAssetId: string;
      garmentAssetId: string;
    },
    resultImage: string,
  ): Promise<void> {
    const result = await parseResultImage(resultImage);
    const metadata = validateTechnicalImageBuffer({
      buffer: result.buffer,
      declaredContentType: result.contentType,
      maxBytes: PUBLIC_API_UPLOAD_MAX_IMAGE_BYTES,
    });
    const storageKey = objectKeyFor({
      storeId: input.storeId,
      sessionId: input.sessionId,
      purpose: "result",
      contentType: metadata.mimeType,
      runId,
    });
    await this.storage.putObject({
      key: storageKey,
      contentType: metadata.mimeType,
      body: result.buffer,
    });
    try {
      await this.sessions.recordLook({
        sessionId: input.sessionId,
        organizationId: input.storeId,
        storeId: null,
        kioskDeviceId: null,
        kioskTryOnRunId: runId,
        personAssetId: input.personAssetId,
        garmentAssetId: input.garmentAssetId,
        productId: input.productId,
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

  private async findRun(sessionId: string, runId: string) {
    return this.prisma.kioskTryOnRun.findFirst({
      where: {
        id: runId,
        tryOnSessionId: sessionId,
        assignmentScope: KioskAssignmentScope.ORGANIZATION,
        kioskDeviceId: null,
        apiKeyId: null,
      },
      include: runInclude,
    });
  }

  private toRunDto(
    run: RunWithResult,
    sessionToken: string,
    product: ShopifyStorefrontTryOnProductDto,
  ): ShopifyStorefrontTryOnRunDto {
    return {
      id: run.id,
      status: run.status as SelfxTryOnRunStatus,
      session: sessionToken,
      product,
      result: run.resultAsset
        ? {
            assetId: run.resultAsset.id,
            readUrl: this.storage.createReadUrl({
              key: run.resultAsset.storageKey,
              expiresInSeconds: 900,
            }),
            contentType: run.resultAsset.contentType ?? undefined,
            expiresAt: run.resultAsset.expiresAt.toISOString(),
          }
        : undefined,
      errorCode: run.errorCode ?? undefined,
      errorMessage: run.errorMessage ?? undefined,
    };
  }

  private async deleteObjectBestEffort(storageKey: string): Promise<void> {
    try {
      await this.storage.deleteObject(storageKey);
    } catch {
      // Durable retention cleanup is the fallback if immediate cleanup fails.
    }
  }

  private async completeSessionBestEffort(
    sessionId: string,
    storeId: string,
  ): Promise<void> {
    try {
      await this.sessions.completeSession({
        sessionId,
        organizationId: storeId,
        storeId: null,
        kioskDeviceId: null,
      });
    } catch {
      // Keep the original failure visible to the caller.
    }
  }
}

const productSelect = {
  id: true,
  name: true,
  active: true,
  vtoEnabled: true,
  imageUrl: true,
  imageStorageKey: true,
  imageContentType: true,
  priceAmountCents: true,
  priceCurrency: true,
  productVertical: true,
  garmentIntent: true,
  garmentCategory: true,
  garmentPhotoType: true,
} satisfies Prisma.ProductSelect;

const storefrontCapabilityInclude = {
  integration: {
    select: {
      id: true,
      type: true,
      status: true,
      organization: { select: { id: true, status: true } },
    },
  },
  product: { select: productSelect },
  tryOnSession: {
    select: {
      id: true,
      status: true,
      organizationId: true,
      expiresAt: true,
    },
  },
} satisfies Prisma.ShopifyStorefrontTryOnSessionInclude;

const runInclude = {
  resultAsset: {
    select: {
      id: true,
      storageKey: true,
      contentType: true,
      expiresAt: true,
    },
  },
} satisfies Prisma.KioskTryOnRunInclude;

function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(sessionToken: string): string {
  return createHash("sha256").update(sessionToken).digest("hex");
}

function validSessionToken(sessionToken: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(sessionToken);
}

function validateProductImage(buffer: Buffer, contentType: string | null) {
  try {
    const metadata = validateTechnicalImageBuffer({
      buffer,
      declaredContentType: contentType?.split(";")[0]?.trim() || null,
      maxBytes: storefrontProductImageMaxBytes,
    });
    return { ...metadata, buffer };
  } catch (error) {
    if (error instanceof TechnicalImageValidationError) {
      throw productImageUnavailable();
    }
    throw error;
  }
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
  if (!match?.[1] || !match[2]) {
    throwInvalidResultImage();
  }
  return {
    contentType: match[1].toLowerCase() as
      | "image/jpeg"
      | "image/png"
      | "image/webp",
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

function toProductDto(
  context: Pick<ShopifyProductContext, "mapping" | "product">,
): ShopifyStorefrontTryOnProductDto {
  return {
    id: context.product.id,
    name: context.product.name,
    handle: context.mapping.externalHandle ?? undefined,
    externalProductId: context.mapping.externalProductId,
    imageUrl: context.product.imageUrl ?? undefined,
  };
}

function toCapabilityProductDto(
  capability: StorefrontCapability,
): ShopifyStorefrontTryOnProductDto {
  return {
    id: capability.product.id,
    name: capability.product.name,
    handle: capability.productHandle ?? undefined,
    externalProductId: capability.externalProductId,
    imageUrl: capability.product.imageUrl ?? undefined,
  };
}

function objectKeyFor(input: {
  storeId: string;
  sessionId: string;
  purpose: "person" | "garment" | "result";
  contentType: string;
  runId?: string;
}): string {
  const extension =
    input.contentType === "image/png"
      ? "png"
      : input.contentType === "image/webp"
        ? "webp"
        : "jpg";
  const filename =
    input.purpose === "result" && input.runId
      ? `${input.runId}.${extension}`
      : `${input.purpose}-${randomUUID()}.${extension}`;
  return [
    "shopify-storefront",
    input.storeId,
    input.sessionId,
    input.purpose,
    filename,
  ].join("/");
}

function normalizeShopDomain(value: string): string {
  const clean = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(clean)) {
    throw productUnavailable();
  }
  return clean;
}

function assertProductEligible(product: ShopifyProductRecord): void {
  if (
    !product.active ||
    !product.vtoEnabled ||
    product.productVertical !== "GARMENT"
  ) {
    throw new ApiErrorException(
      HttpStatus.CONFLICT,
      SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.productNotEnabled,
      "This product is not enabled for SelfX Try-On yet.",
    );
  }
  if (!product.imageUrl && !product.imageStorageKey) {
    throw productImageUnavailable();
  }
}

function normalizeGarmentIntent(value: string): SelfxGarmentIntent {
  return SELFX_GARMENT_INTENTS.includes(value as SelfxGarmentIntent)
    ? (value as SelfxGarmentIntent)
    : "AUTO";
}

function normalizeGarmentCategory(value: string): SelfxGarmentCategory {
  return SELFX_GARMENT_CATEGORIES.includes(value as SelfxGarmentCategory)
    ? (value as SelfxGarmentCategory)
    : "AUTO";
}

function normalizeGarmentPhotoType(value: string): SelfxGarmentPhotoType {
  return SELFX_GARMENT_PHOTO_TYPES.includes(value as SelfxGarmentPhotoType)
    ? (value as SelfxGarmentPhotoType)
    : "AUTO";
}

function priceDecimal(amountCents: number | null): string | null {
  return amountCents === null ? null : (amountCents / 100).toFixed(2);
}

function nullableTrim(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean ? clean : null;
}

function productUnavailable(): ApiErrorException {
  return new ApiErrorException(
    HttpStatus.NOT_FOUND,
    SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.productUnavailable,
    "This Shopify product is not available for SelfX Try-On.",
  );
}

function productImageUnavailable(): ApiErrorException {
  return new ApiErrorException(
    HttpStatus.CONFLICT,
    SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.productImageUnavailable,
    "This product image is not available for SelfX Try-On.",
  );
}

function sessionNotFound(): ApiErrorException {
  return new ApiErrorException(
    HttpStatus.NOT_FOUND,
    SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.sessionNotFound,
    "Try-On session was not found.",
  );
}

function throwInvalidResultImage(): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    TRY_ON_LAB_ERROR_CODES.imageInvalid,
    "Try-On result image is invalid.",
  );
}
