import { createHash, randomBytes, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import {
  CreditLedgerEntryType,
  CreditLedgerChannel,
  ExternalProductMappingStatus,
  IntegrationCredentialStatus,
  IntegrationStatus,
  Prisma as PrismaRuntime,
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
import { publicTryOnErrorMessage } from "../common/public-try-on-errors.js";
import type { StorefrontLimitsDto } from "./dto/commerce-storefront.dto.js";
import {
  TechnicalImageValidationError,
  validateTechnicalImageBuffer,
} from "../common/image-validation.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  PUBLIC_API_UPLOAD_MAX_IMAGE_BYTES,
  type PublicApiUploadPayload,
} from "../developer-api/public-api-upload.multipart.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { PricingControlService } from "../entitlements/pricing-control.service.js";
import { type PricingPlanResponseDto } from "../entitlements/dto/pricing-plan.dto.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import {
  TryOnExecutionService,
  type NormalizedTryOnProcessError,
  type TryOnExecutionObserver,
} from "../try-on/try-on-execution.service.js";
import { TryOnSessionService } from "../try-on/try-on-session.service.js";
import { JewelleryTryOnExecutionService } from "../try-on/jewellery/jewellery-try-on-execution.service.js";
import { JewelleryTryOnService } from "../try-on/jewellery/jewellery-try-on.service.js";
import type { JewelleryTryOnProviderSubmitInput } from "../try-on/jewellery/jewellery-try-on.provider.js";
import { TRY_ON_RESULT_RETENTION_MS } from "../try-on/try-on.constants.js";
import {
  type CreateTryOnLabRunPayload,
  type TryOnLabUploadedImage,
} from "../try-on-lab/try-on-lab-multipart.js";
import {
  type CreateShopifyStorefrontTryOnRunDto,
  type CreateShopifyStorefrontTryOnSessionDto,
  type ShopifyStorefrontCreditSummaryDto,
  type ShopifyStorefrontPricingPlanDto,
  type ShopifyStorefrontPricingPlansDto,
  type ShopifyStorefrontConnectionHealthDto,
  type ShopifyStorefrontUsageSummaryDto,
  type ShopifyStorefrontTryOnPersonUploadDto,
  type ShopifyStorefrontTryOnProductDto,
  type ShopifyStorefrontTryOnRunDto,
  type ShopifyStorefrontTryOnSessionDto,
} from "./dto/shopify-storefront-try-on.dto.js";
import {
  needsShopifyJewelleryClassification,
  shopifyTryOnModeAllowsProduct,
} from "./shopify-product-category.js";
import type { IntegrationCredentialContext } from "./integration-token-auth.service.js";
import {
  fetchPublicCatalogImage,
  publicCommerceUrl,
} from "../catalog/catalog-url-policy.js";
export const STOREFRONT_CONSENT_VERSION = "selfx-photo-2026-10-23";
export const STOREFRONT_CONSENT_TEXT =
  "I consent to SelfX processing my photo to generate this virtual try-on.";

const storefrontProductImageMaxBytes = PUBLIC_API_UPLOAD_MAX_IMAGE_BYTES;
function wooLimits(metadata: Prisma.JsonValue | null): StorefrontLimitsDto {
  const root =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : {};
  const raw = root.storefrontLimits;
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const number = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1_000_000
      ? v
      : fallback;
  return {
    visitorTryOnLimit: number(value.visitorTryOnLimit, 5),
    visitorTryOnLimitPeriod:
      value.visitorTryOnLimitPeriod === "WEEK" ||
      value.visitorTryOnLimitPeriod === "MONTH"
        ? value.visitorTryOnLimitPeriod
        : "DAY",
    monthlyStoreTryOnLimit: number(value.monthlyStoreTryOnLimit, 0),
  };
}
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
  visitorLimitReached: "SHOPIFY_STOREFRONT_TRYON_VISITOR_LIMIT_REACHED",
  monthlyLimitReached: "SHOPIFY_STOREFRONT_TRYON_MONTHLY_LIMIT_REACHED",
  visitorRequired: "STOREFRONT_VISITOR_REQUIRED",
  visitorMismatch: "STOREFRONT_VISITOR_MISMATCH",
} as const;

function visitorError(kind: "visitorRequired" | "visitorMismatch") {
  return new ApiErrorException(
    HttpStatus.CONFLICT,
    SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES[kind],
    "Return to the product page and start Try-On again in this browser.",
  );
}

type ShopifyProductContext = {
  source?: "SHOPIFY" | "WOOCOMMERCE";
  shopIdentity?: string;
  integrationId: string;
  storeId: string;
  mapping: {
    externalProductId: string;
    externalHandle: string | null;
    externalSku: string | null;
  };
  product: ShopifyProductRecord;
};

type StorefrontPolicyInput = Omit<
  CreateShopifyStorefrontTryOnSessionDto,
  "source" | "shop"
> & { shop?: string };
type ShopifyProductRecord = Pick<
  Product,
  | "id"
  | "name"
  | "active"
  | "vtoEnabled"
  | "imageUrl"
  | "imageStorageKey"
  | "imageContentType"
  | "productUrl"
  | "priceAmountCents"
  | "priceCurrency"
  | "productVertical"
  | "jewelleryType"
  | "garmentIntent"
  | "garmentCategory"
  | "garmentPhotoType"
>;

type ActiveMapping = {
  externalProductId: string;
  externalHandle: string | null;
  externalSku: string | null;
};

type StorefrontLimitPeriod = "DAY" | "WEEK" | "MONTH";

type StorefrontLimits = {
  visitorTokenHash: string | null;
  visitorTryOnLimit: number;
  visitorLimitPeriod: StorefrontLimitPeriod;
  monthlyStoreTryOnLimit: number;
};

type RunWithResult = Prisma.KioskTryOnRunGetPayload<{
  include: typeof runInclude;
}>;

type StorefrontCapability = Prisma.ShopifyStorefrontTryOnSessionGetPayload<{
  include: typeof storefrontCapabilityInclude;
}>;

@Injectable()
export class CommerceStorefrontTryOnService {
  private readonly logger = new Logger(CommerceStorefrontTryOnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: TryOnSessionService,
    private readonly storage: ObjectStorageService,
    private readonly execution: TryOnExecutionService,
    private readonly entitlements: EntitlementsService,
    private readonly pricing: PricingControlService,
    private readonly jewelleryTryOn: JewelleryTryOnService,
    private readonly jewelleryExecution: JewelleryTryOnExecutionService,
  ) {}

  private async wooContext(
    credential: IntegrationCredentialContext,
    externalProductId: string,
  ): Promise<ShopifyProductContext> {
    if (credential.integrationType !== "WOOCOMMERCE")
      throw productUnavailable();
    const integration = await this.prisma.integration.findFirst({
      where: {
        id: credential.integrationId,
        organizationId: credential.storeId,
        type: "WOOCOMMERCE",
        status: "ACTIVE",
        organization: { status: "ACTIVE" },
      },
      select: { id: true, organizationId: true, externalAccountId: true },
    });
    if (!integration?.externalAccountId) throw productUnavailable();
    const website = publicCommerceUrl(integration.externalAccountId);
    const mapping = await this.prisma.externalProductMapping.findFirst({
      where: {
        integrationId: integration.id,
        organizationId: credential.storeId,
        externalProductId,
        externalVariantId: null,
        status: "ACTIVE",
        product: { organizationId: credential.storeId, scope: "STORE" },
      },
      select: {
        externalProductId: true,
        externalHandle: true,
        externalSku: true,
        product: { select: productSelect },
      },
    });
    if (!mapping) throw productUnavailable();
    assertProductEligible(mapping.product);
    if (
      !storefrontReturnUrl(
        "WOOCOMMERCE",
        website.href,
        mapping.product.productUrl,
        null,
      )
    )
      throw productUnavailable();
    await this.entitlements.assertStoreHasFeature(
      credential.storeId,
      "WOOCOMMERCE_INTEGRATION",
    );
    return {
      source: "WOOCOMMERCE",
      shopIdentity: website.href,
      integrationId: integration.id,
      storeId: credential.storeId,
      mapping,
      product: mapping.product,
    };
  }

  async wooAvailability(
    credential: IntegrationCredentialContext,
    externalProductId: string,
  ) {
    try {
      await this.wooContext(credential, externalProductId);
      return { available: true };
    } catch (error) {
      if (error instanceof ApiErrorException) return { available: false };
      throw error;
    }
  }

  async wooSettings(credential: IntegrationCredentialContext) {
    if (credential.integrationType !== "WOOCOMMERCE")
      throw productUnavailable();
    const integration = await this.prisma.integration.findFirst({
      where: {
        id: credential.integrationId,
        organizationId: credential.storeId,
        type: "WOOCOMMERCE",
        status: "ACTIVE",
        organization: { status: "ACTIVE" },
      },
      select: { metadata: true },
    });
    if (!integration) throw productUnavailable();
    return wooLimits(integration.metadata);
  }

  async saveWooSettings(
    credential: IntegrationCredentialContext,
    input: StorefrontLimitsDto,
  ) {
    await this.wooSettings(credential);
    await this.entitlements.assertStoreHasFeature(
      credential.storeId,
      "CUSTOM_LIMITS",
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM integrations WHERE id = ${credential.integrationId}::uuid FOR UPDATE`;
      const current = await tx.integration.findFirstOrThrow({
        where: {
          id: credential.integrationId,
          organizationId: credential.storeId,
          status: "ACTIVE",
          organization: { status: "ACTIVE" },
        },
      });
      const metadata =
        current.metadata &&
        typeof current.metadata === "object" &&
        !Array.isArray(current.metadata)
          ? current.metadata
          : {};
      await tx.integration.update({
        where: { id: current.id },
        data: { metadata: { ...metadata, storefrontLimits: { ...input } } },
      });
    });
    return input;
  }

  async createWooCommerceSession(
    credential: IntegrationCredentialContext,
    input: { externalProductId: string; visitorToken: string; locale?: string },
  ) {
    const context = await this.wooContext(credential, input.externalProductId);
    const limits = await this.wooSettings(credential);
    const count = await this.prisma.shopifyStorefrontTryOnSession.count({
      where: {
        integrationId: credential.integrationId,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    if (count >= 20)
      throw new ApiErrorException(
        HttpStatus.TOO_MANY_REQUESTS,
        "STOREFRONT_RATE_LIMITED",
        "Try-On is busy. Please try again shortly.",
      );
    return this.createContextSession(
      {
        externalProductId: input.externalProductId,
        visitorToken: input.visitorToken,
        locale: input.locale,
        ...limits,
      },
      context,
    );
  }

  async acceptPhotoConsent(sessionToken: string) {
    const capability = await this.requireActiveCapability(sessionToken);
    this.assertVisitorBound(capability);
    await this.prisma.auditLog.create({
      data: {
        id: createSelfxId(),
        organizationId: capability.organizationId,
        action: "try_on.photo_consent_accepted",
        resourceType: "try_on_session",
        resourceId: capability.tryOnSessionId,
        actorSnapshot: { type: "ANONYMOUS_CUSTOMER" },
        metadata: {
          policyVersion: STOREFRONT_CONSENT_VERSION,
          policyText: STOREFRONT_CONSENT_TEXT,
          integrationId: capability.integrationId,
          source: capability.integration.type,
        },
      },
    });
    return { accepted: true, policyVersion: STOREFRONT_CONSENT_VERSION };
  }

  async requirePhotoConsent(sessionToken: string) {
    const capability = await this.requireActiveCapability(sessionToken);
    this.assertVisitorBound(capability);
    const consent = await this.prisma.auditLog.findFirst({
      where: {
        organizationId: capability.organizationId,
        resourceType: "try_on_session",
        resourceId: capability.tryOnSessionId,
        action: "try_on.photo_consent_accepted",
        metadata: {
          path: ["policyVersion"],
          equals: STOREFRONT_CONSENT_VERSION,
        },
      },
      select: { id: true },
    });
    if (!consent)
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        "STOREFRONT_CONSENT_REQUIRED",
        "Accept photo processing consent before adding a photo.",
      );
    return capability;
  }

  async createSession(
    input: CreateShopifyStorefrontTryOnSessionDto,
  ): Promise<ShopifyStorefrontTryOnSessionDto> {
    return this.createContextSession(
      // Shopify's proxy cannot carry browser cookies. Bind only on SelfX.
      { ...input, visitorToken: undefined },
      await this.requireEligibleProduct(input),
    );
  }
  async shopifyAvailability(input: CreateShopifyStorefrontTryOnSessionDto) {
    try {
      const context = await this.requireEligibleProduct(input);
      await this.entitlements.assertStoreHasFeature(
        context.storeId,
        "SHOPIFY_INTEGRATION",
      );
      const summary = await this.entitlements.getStoreCreditSummary(
        context.storeId,
      );
      return {
        available:
          ["ACTIVE", "TRIALING"].includes(summary.subscription?.status ?? "") &&
          (summary.subscription?.pricingPlan?.billingMode === "POSTPAID_PAYG" ||
            summary.availableCredits > 0),
      };
    } catch (error) {
      if (error instanceof ApiErrorException) return { available: false };
      throw error;
    }
  }

  private async createContextSession(
    input: StorefrontPolicyInput,
    context: ShopifyProductContext,
  ): Promise<ShopifyStorefrontTryOnSessionDto> {
    if (context.product.productVertical === "JEWELLERY") {
      await this.jewelleryTryOn.assertStoreCanRunJewelleryTryOn(
        context.storeId,
      );
      this.jewelleryExecution.assertConfigured();
    }
    await this.entitlements.assertStoreHasFeature(
      context.storeId,
      context.source === "WOOCOMMERCE"
        ? "WOOCOMMERCE_INTEGRATION"
        : "SHOPIFY_INTEGRATION",
    );
    const shopDomain =
      context.shopIdentity ?? normalizeShopDomain(input.shop ?? "");
    const limits = storefrontLimitsFromInput(input);
    await this.assertStorefrontLimits({
      organizationId: context.storeId,
      shopDomain,
      source: context.source,
      ...limits,
      visitorTryOnLimit:
        context.source === "WOOCOMMERCE" ? limits.visitorTryOnLimit : 0,
    });
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
      const storefrontLocale = normalizeStorefrontLocale(input.locale);
      await this.prisma.shopifyStorefrontTryOnSession.create({
        data: {
          id: createSelfxId(),
          tokenHash: hashSessionToken(sessionToken),
          tryOnSessionId: session.id,
          integrationId: context.integrationId,
          organizationId: context.storeId,
          productId: context.product.id,
          garmentAssetId: asset.id,
          shopDomain,
          externalProductId: context.mapping.externalProductId,
          productHandle: context.mapping.externalHandle,
          storefrontLocale,
          visitorTokenHash: limits.visitorTokenHash,
          visitorTryOnLimit: limits.visitorTryOnLimit,
          visitorLimitPeriod: limits.visitorLimitPeriod,
          monthlyStoreTryOnLimit: limits.monthlyStoreTryOnLimit,
          expiresAt,
        },
      });
      return {
        session: sessionToken,
        garmentAssetId: asset.id,
        expiresAt: expiresAt.toISOString(),
        locale: storefrontLocale,
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
      locale: capability.storefrontLocale,
      product: toCapabilityProductDto(capability),
    };
  }

  async bindFirstPartyVisitor(sessionToken: string, visitorToken: string) {
    const capability = await this.requireActiveCapability(sessionToken);
    // WooCommerce retains its existing WordPress-side visitor binding.
    if (capability.integration.type !== "SHOPIFY")
      return { bound: true, cookieRequired: false };
    if (!validSessionToken(visitorToken)) throw visitorError("visitorRequired");
    const visitorTokenHash = createHash("sha256")
      .update(`selfx-web-visitor:${capability.organizationId}:${visitorToken}`)
      .digest("hex");
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`storefront:${capability.organizationId}`}, 0))`;
      const current = await tx.shopifyStorefrontTryOnSession.findUniqueOrThrow({
        where: { id: capability.id },
      });
      if (current.visitorBoundAt) {
        if (current.visitorTokenHash !== visitorTokenHash)
          throw visitorError("visitorMismatch");
        return;
      }
      // Never rewrite usage attribution on a pre-upgrade session with runs.
      if (
        await tx.kioskTryOnRun.count({
          where: { tryOnSessionId: capability.tryOnSessionId },
        })
      ) {
        throw visitorError("visitorRequired");
      }
      await tx.shopifyStorefrontTryOnSession.update({
        where: { id: capability.id },
        data: { visitorTokenHash, visitorBoundAt: new Date() },
      });
    });
    return { bound: true, cookieRequired: true };
  }

  private assertVisitorBound(capability: StorefrontCapability): void {
    if (
      capability.integration.type === "SHOPIFY" &&
      (!capability.visitorBoundAt || !capability.visitorTokenHash)
    ) {
      throw visitorError("visitorRequired");
    }
  }

  async getCreditSummaryForShop(
    shop: string | undefined,
  ): Promise<ShopifyStorefrontCreditSummaryDto> {
    const integration = await this.requireActiveIntegrationForShop(shop);
    return this.entitlements.getStoreCreditSummary(integration.organizationId);
  }

  async getUsageSummaryForShop(
    shop: string | undefined,
  ): Promise<ShopifyStorefrontUsageSummaryDto> {
    const integration = await this.requireActiveIntegrationForShop(shop);
    const now = new Date();
    const monthStart = currentUtcMonthStart(now);
    const shopifyRunWhere = {
      organizationId: integration.organizationId,
      catalogSource: "SHOPIFY",
    } satisfies Prisma.KioskTryOnRunWhereInput;
    const thisMonthRunWhere = {
      ...shopifyRunWhere,
      createdAt: { gte: monthStart, lte: now },
    } satisfies Prisma.KioskTryOnRunWhereInput;

    const [
      totalTryOns,
      thisMonthTryOns,
      completedTryOns,
      failedTryOns,
      generatedImages,
      creditConsumption,
      topProductRows,
    ] = await Promise.all([
      this.prisma.kioskTryOnRun.count({ where: shopifyRunWhere }),
      this.prisma.kioskTryOnRun.count({ where: thisMonthRunWhere }),
      this.prisma.kioskTryOnRun.count({
        where: { ...thisMonthRunWhere, status: "COMPLETED" },
      }),
      this.prisma.kioskTryOnRun.count({
        where: { ...thisMonthRunWhere, status: "FAILED" },
      }),
      this.prisma.kioskTryOnRun.count({
        where: { ...thisMonthRunWhere, resultAssetId: { not: null } },
      }),
      this.prisma.creditLedgerEntry.aggregate({
        where: {
          organizationId: integration.organizationId,
          channel: CreditLedgerChannel.SHOPIFY,
          entryType: CreditLedgerEntryType.CREDIT_CONSUMED,
          occurredAt: { gte: monthStart, lte: now },
        },
        _sum: { quantity: true },
      }),
      this.prisma.kioskTryOnRun.groupBy({
        by: ["productId"],
        where: { ...thisMonthRunWhere, productId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const productIds = topProductRows
      .map((row) => row.productId)
      .filter((productId): productId is string => Boolean(productId));
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, slug: true, imageUrl: true },
        })
      : [];
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );

    return {
      totalTryOns,
      thisMonth: {
        start: monthStart.toISOString(),
        end: now.toISOString(),
        tryOns: thisMonthTryOns,
        completedTryOns,
        failedTryOns,
        generatedImages,
        creditsConsumed: Math.abs(creditConsumption._sum.quantity ?? 0),
      },
      topProducts: topProductRows
        .filter((row) => row.productId)
        .map((row) => {
          const product = productsById.get(row.productId!);
          return {
            productId: row.productId!,
            productName: product?.name ?? "Unknown product",
            productSlug: product?.slug,
            imageUrl: product?.imageUrl ?? undefined,
            tryOns: row._count._all,
          };
        })
        .sort((a, b) => b.tryOns - a.tryOns)
        .slice(0, 5),
    };
  }

  async getAvailablePlansForShop(
    shop: string | undefined,
  ): Promise<ShopifyStorefrontPricingPlansDto> {
    await this.requireActiveIntegrationForShop(shop);
    const plans = await this.pricing.listAvailablePlans();
    return {
      data: plans.filter(supportsShopifyChannel).map(toPricingPlanDto),
    };
  }

  async getConnectionHealthForShop(
    shop: string | undefined,
  ): Promise<ShopifyStorefrontConnectionHealthDto> {
    const shopDomain = normalizeShopDomainForHealth(shop);
    if (!shopDomain) {
      return {
        state: "ERROR",
        shopDomain: nullableTrim(shop) ?? "",
        storeName: null,
        integrationId: null,
        storeId: null,
        reasons: ["SHOP_DOMAIN_INVALID"],
        message: "Shopify shop domain is missing or invalid.",
      };
    }

    const integration = await this.prisma.integration.findFirst({
      where: {
        type: "SHOPIFY",
        metadata: { path: ["shopDomain"], equals: shopDomain },
      },
      select: {
        id: true,
        organizationId: true,
        status: true,
        externalAccountId: true,
        externalAccountName: true,
        metadata: true,
        organization: { select: { name: true, status: true } },
        credentials: {
          where: {
            status: IntegrationCredentialStatus.ACTIVE,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!integration) {
      return {
        state: "NOT_CONNECTED",
        shopDomain,
        storeName: null,
        integrationId: null,
        storeId: null,
        reasons: ["CENTRAL_INTEGRATION_NOT_FOUND"],
        message: "This Shopify shop is not connected to a SelfX Store.",
      };
    }

    const reasons: string[] = [];
    if (integration.status === IntegrationStatus.ACTIVE) {
      reasons.push("CENTRAL_INTEGRATION_ACTIVE");
    } else {
      reasons.push(`CENTRAL_INTEGRATION_${integration.status}`);
    }
    if (integration.organization.status === "ACTIVE") {
      reasons.push("SELFX_STORE_ACTIVE");
    } else {
      reasons.push(`SELFX_STORE_${integration.organization.status}`);
    }
    if (integration.credentials.length > 0) {
      reasons.push("INTEGRATION_CREDENTIAL_ACTIVE");
    } else {
      reasons.push("INTEGRATION_CREDENTIAL_MISSING");
    }

    const connected =
      integration.status === IntegrationStatus.ACTIVE &&
      integration.organization.status === "ACTIVE" &&
      integration.credentials.length > 0;

    return {
      state: connected ? "CONNECTED" : "NEEDS_RECONNECT",
      reconciliationOwner:
        integration.metadata &&
        typeof integration.metadata === "object" &&
        !Array.isArray(integration.metadata) &&
        integration.metadata.connectionMode === "SHOPIFY_APP"
          ? "SHOPIFY_APP"
          : "SELFX_API",
      shopDomain,
      storeName: integration.organization.name,
      integrationId: integration.id,
      storeId: integration.organizationId,
      reasons,
      message: connected
        ? "This Shopify shop is connected to SelfX."
        : "This Shopify shop connection needs to be reconnected.",
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
    const capability = await this.requirePhotoConsent(sessionToken);
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
    const capability = await this.requirePhotoConsent(sessionToken);
    const requestId = input.clientRequestId?.trim() || randomUUID();
    const query = {
      where: {
        tryOnSessionId: capability.tryOnSessionId,
        organizationId: capability.organizationId,
        clientRequestId: requestId,
      },
      include: runInclude,
    };
    const existing = await this.prisma.kioskTryOnRun.findFirst(query);
    if (existing)
      return this.toRunDto(
        existing,
        sessionToken,
        toCapabilityProductDto(capability),
      );
    try {
      return await this.createRunOnce(sessionToken, {
        ...input,
        clientRequestId: requestId,
      });
    } catch (error) {
      if (
        error instanceof PrismaRuntime.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const winner = await this.prisma.kioskTryOnRun.findFirst(query);
        if (winner)
          return this.toRunDto(
            winner,
            sessionToken,
            toCapabilityProductDto(capability),
          );
      }
      throw error;
    }
  }

  private async createRunOnce(
    sessionToken: string,
    input: CreateShopifyStorefrontTryOnRunDto,
  ): Promise<ShopifyStorefrontTryOnRunDto> {
    const capability = await this.requirePhotoConsent(sessionToken);
    const source =
      capability.integration.type === "WOOCOMMERCE" ? "WOOCOMMERCE" : "SHOPIFY";
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
    const isJewellery = capability.product.productVertical === "JEWELLERY";
    const jewelleryFoundation = isJewellery
      ? await this.jewelleryTryOn.prepareRunFoundation({
          storeId: capability.organizationId,
          personImageDataUri: personImage.dataUri,
          jewelleryImageDataUri: garmentImage.dataUri,
          jewelleryType: capability.product.jewelleryType!,
          productReference: {
            productId: capability.product.id,
            productName: capability.product.name,
            sku: mapping.externalSku ?? undefined,
          },
        })
      : null;
    if (!isJewellery) this.execution.assertConfigured();
    const provider = jewelleryFoundation?.provider ?? this.execution.metadata();
    const clientRequestId = input.clientRequestId?.trim() || randomUUID();
    const { run, created } = await this.prisma.$transaction(
      async (tx) => {
        // Serialize quota admission across products, sessions and API instances.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`storefront:${capability.organizationId}`}, 0))`;
        const existing = await tx.kioskTryOnRun.findFirst({
          where: {
            tryOnSessionId: capability.tryOnSessionId,
            organizationId: capability.organizationId,
            clientRequestId,
          },
          include: runInclude,
        });
        if (existing) return { run: existing, created: false };
        await this.assertStorefrontLimits(
          {
            source,
            organizationId: capability.organizationId,
            shopDomain: capability.shopDomain,
            visitorTokenHash: capability.visitorTokenHash,
            visitorTryOnLimit: capability.visitorTryOnLimit,
            visitorLimitPeriod: normalizeLimitPeriod(
              capability.visitorLimitPeriod,
            ),
            monthlyStoreTryOnLimit: capability.monthlyStoreTryOnLimit,
            ...(source === "WOOCOMMERCE"
              ? (() => {
                  const limits = wooLimits(capability.integration.metadata);
                  return {
                    visitorTryOnLimit: limits.visitorTryOnLimit,
                    visitorLimitPeriod: limits.visitorTryOnLimitPeriod,
                    monthlyStoreTryOnLimit: limits.monthlyStoreTryOnLimit,
                  };
                })()
              : {}),
          },
          tx,
        );
        const admission = await this.entitlements.consumeTryOnCredit(
          {
            organizationId: capability.organizationId,
            channel: CreditLedgerChannel[source],
            idempotencyKey: [
              "tryon",
              source.toLowerCase(),
              capability.tryOnSessionId,
              clientRequestId,
            ].join(":"),
            reason: `${source} storefront Try-On generation`,
            tryOnSessionId: capability.tryOnSessionId,
            productId: capability.product.id,
            integrationId: capability.integrationId,
            metadata: {
              externalProductId: capability.externalProductId,
              productHandle: capability.productHandle,
            },
          },
          tx,
        );
        const now = new Date();
        const run = await tx.kioskTryOnRun.create({
          data: {
            id: createSelfxId(),
            billingChannel: CreditLedgerChannel[source],
            storefrontRequestKey: createHash("sha256")
              .update(`${capability.tryOnSessionId}:${clientRequestId}`)
              .digest("hex"),
            billingCycleId: admission?.billingCycleId,
            shopifyReservationId: admission?.shopifyReservationId,
            kioskDeviceId: null,
            apiKeyId: null,
            tryOnSessionId: capability.tryOnSessionId,
            clientRequestId,
            status: "QUEUED",
            assignmentScope: KioskAssignmentScope.ORGANIZATION,
            organizationId: capability.organizationId,
            storeId: null,
            personAssetId: personAsset.id,
            garmentAssetId: garmentAsset.id,
            productId: capability.product.id,
            catalogSource: source,
            externalProductId: capability.externalProductId,
            externalVariantId: null,
            externalSku: mapping.externalSku,
            externalProductName: capability.product.name,
            externalProductPrice: null,
            externalCurrency: null,
            provider: provider.provider,
            providerDisplayName: provider.providerDisplayName,
            providerModel: provider.model,
            tryOnVertical: isJewellery ? "JEWELLERY" : "GARMENT",
            jewelleryType: jewelleryFoundation?.jewelleryType ?? null,
            garmentSource: source,
            garmentIntent: normalizeGarmentIntent(
              capability.product.garmentIntent,
            ),
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
        return { run, created: true };
      },
      { timeout: 15_000 },
    );
    if (!created)
      return this.toRunDto(
        run,
        sessionToken,
        toCapabilityProductDto(capability),
      );

    void this.processRun(run.id, {
      sessionId: capability.tryOnSessionId,
      storeId: capability.organizationId,
      productId: capability.product.id,
      personAssetId: personAsset.id,
      garmentAssetId: garmentAsset.id,
      jewelleryPayload: jewelleryFoundation
        ? {
            personImageDataUri: personImage.dataUri,
            jewelleryImageDataUri: garmentImage.dataUri,
            jewelleryType: jewelleryFoundation.jewelleryType,
            productReference: jewelleryFoundation.productReference,
          }
        : undefined,
      payload: isJewellery
        ? undefined
        : {
            clientRequestId: run.clientRequestId,
            personImage,
            garmentImage,
            garmentSource: source,
            garmentIntent: normalizeGarmentIntent(
              capability.product.garmentIntent,
            ),
            category: normalizeGarmentCategory(
              capability.product.garmentCategory,
            ),
            garmentPhotoType: normalizeGarmentPhotoType(
              capability.product.garmentPhotoType,
            ),
            generationProfile: DEFAULT_TRY_ON_GENERATION_PROFILE,
            categoryResolutionSource:
              source === "WOOCOMMERCE"
                ? "WOOCOMMERCE_CATALOG_METADATA"
                : "SHOPIFY_CATALOG_METADATA",
            photoTypeResolutionSource:
              source === "WOOCOMMERCE"
                ? "WOOCOMMERCE_CATALOG_METADATA"
                : "SHOPIFY_CATALOG_METADATA",
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

  private async requireActiveIntegrationForShop(shop: string | undefined) {
    if (!shop) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.productContextMissing,
        "Shopify shop is required.",
      );
    }
    const shopDomain = normalizeShopDomain(shop);
    const integration = await this.prisma.integration.findFirst({
      where: {
        type: "SHOPIFY",
        status: IntegrationStatus.ACTIVE,
        metadata: { path: ["shopDomain"], equals: shopDomain },
        organization: { status: "ACTIVE" },
      },
      select: { id: true, organizationId: true, metadata: true },
    });
    if (!integration) {
      throw productUnavailable();
    }
    return integration;
  }

  private async requireEligibleProduct(
    input: CreateShopifyStorefrontTryOnSessionDto,
  ): Promise<ShopifyProductContext> {
    const rawExternalProductId = nullableTrim(input.externalProductId);
    const externalProductIds = shopifyProductIdCandidates(rawExternalProductId);
    const productHandle = normalizeShopifyHandle(input.productHandle);
    let shop: string;
    try {
      shop = normalizeShopDomain(input.shop);
    } catch (error) {
      this.logProductUnavailable({
        reason: "invalid_shop_domain",
        shop: nullableTrim(input.shop),
        externalProductId: externalProductIds[0] ?? rawExternalProductId,
        productHandle,
      });
      throw error;
    }
    if (!rawExternalProductId && !productHandle) {
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
      select: { id: true, organizationId: true, metadata: true },
    });
    if (!integration) {
      this.logProductUnavailable({
        reason: "active_integration_not_found",
        shop,
        externalProductId: externalProductIds[0] ?? rawExternalProductId,
        productHandle,
      });
      throw productUnavailable();
    }

    const mapping = await this.prisma.externalProductMapping.findFirst({
      where: {
        integrationId: integration.id,
        status: ExternalProductMappingStatus.ACTIVE,
        externalVariantId: null,
        OR: [
          ...externalProductIds.map((externalProductId) => ({
            externalProductId,
          })),
          ...(productHandle ? [{ externalHandle: productHandle }] : []),
        ],
      },
      select: {
        externalProductId: true,
        externalHandle: true,
        externalSku: true,
        metadata: true,
        product: { select: productSelect },
      },
    });
    if (!mapping) {
      this.logProductUnavailable({
        reason: "active_product_mapping_not_found",
        shop,
        externalProductId: externalProductIds[0] ?? rawExternalProductId,
        productHandle,
        integrationId: integration.id,
      });
      throw productUnavailable();
    }
    assertProductEligible(mapping.product);
    if (
      !shopifyTryOnModeAllowsProduct(
        integration.metadata,
        mapping.product.productVertical,
      )
    ) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.productNotEnabled,
        "This product type is not enabled for this Shopify store.",
      );
    }
    if (
      needsShopifyJewelleryClassification(
        mapping.metadata,
        mapping.product.productVertical,
      )
    ) {
      this.logProductUnavailable({
        reason: "jewellery_classification_required",
        shop,
        externalProductId: mapping.externalProductId,
        productHandle: mapping.externalHandle,
        integrationId: integration.id,
      });
      throw productUnavailable();
    }
    return {
      source: "SHOPIFY",
      shopIdentity: shop,
      integrationId: integration.id,
      storeId: integration.organizationId,
      mapping,
      product: mapping.product,
    };
  }

  private logProductUnavailable(input: {
    reason: string;
    shop: string | null;
    externalProductId: string | null;
    productHandle: string | null;
    integrationId?: string;
  }): void {
    this.logger.warn({
      event: "shopify_storefront_try_on_product_unavailable",
      reason: input.reason,
      shop: input.shop,
      externalProductId: input.externalProductId,
      productHandle: input.productHandle,
      integrationId: input.integrationId,
    });
  }

  private async requireCapability(
    sessionToken: string,
  ): Promise<StorefrontCapability> {
    if (!validSessionToken(sessionToken)) {
      throw sessionNotFound();
    }
    const capability =
      await this.prisma.shopifyStorefrontTryOnSession.findUnique({
        where: { tokenHash: hashSessionToken(sessionToken) },
        include: storefrontCapabilityInclude,
      });
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
    await this.entitlements.assertStoreHasFeature(
      capability.organizationId,
      capability.integration.type === "WOOCOMMERCE"
        ? "WOOCOMMERCE_INTEGRATION"
        : "SHOPIFY_INTEGRATION",
    );
    await this.requireActiveMapping(capability);
    return capability;
  }

  private assertCapabilityEligible(capability: StorefrontCapability): void {
    if (
      !["SHOPIFY", "WOOCOMMERCE"].includes(capability.integration.type) ||
      capability.integration.status !== IntegrationStatus.ACTIVE ||
      capability.integration.organization.status !== "ACTIVE"
    ) {
      throw productUnavailable();
    }
    assertProductEligible(capability.product);
    if (
      !shopifyTryOnModeAllowsProduct(
        capability.integration.metadata,
        capability.product.productVertical,
      )
    ) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.productNotEnabled,
        "This product type is not enabled for this Shopify store.",
      );
    }
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
        metadata: true,
      },
    });
    if (!mapping) {
      throw productUnavailable();
    }
    if (
      needsShopifyJewelleryClassification(
        mapping.metadata,
        capability.product.productVertical,
      )
    ) {
      throw productUnavailable();
    }
    return mapping;
  }

  private async assertStorefrontLimits(
    input: {
      organizationId: string;
      shopDomain: string;
      source?: "SHOPIFY" | "WOOCOMMERCE";
    } & StorefrontLimits,
    client: Pick<Prisma.TransactionClient, "kioskTryOnRun"> = this.prisma,
  ): Promise<void> {
    const now = new Date();
    if (input.monthlyStoreTryOnLimit > 0) {
      const monthlyRuns = await client.kioskTryOnRun.count({
        where: {
          organizationId: input.organizationId,
          catalogSource: input.source ?? "SHOPIFY",
          createdAt: { gte: currentUtcMonthStart(now), lte: now },
          tryOnSession: {
            shopifyStorefrontTryOnSession: {
              shopDomain: input.shopDomain,
            },
          },
        },
      });
      if (monthlyRuns >= input.monthlyStoreTryOnLimit) {
        throw new ApiErrorException(
          HttpStatus.TOO_MANY_REQUESTS,
          SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.monthlyLimitReached,
          "This store has reached its monthly Try-On limit.",
        );
      }
    }

    if (input.visitorTryOnLimit > 0) {
      if (!input.visitorTokenHash) {
        throw new ApiErrorException(
          HttpStatus.BAD_REQUEST,
          SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.visitorLimitReached,
          "This Try-On visitor session could not be verified.",
        );
      }
      const visitorRuns = await client.kioskTryOnRun.count({
        where: {
          organizationId: input.organizationId,
          catalogSource: input.source ?? "SHOPIFY",
          createdAt: {
            gte: periodStart(now, input.visitorLimitPeriod),
            lte: now,
          },
          tryOnSession: {
            shopifyStorefrontTryOnSession: {
              shopDomain: input.shopDomain,
              visitorTokenHash: input.visitorTokenHash,
            },
          },
        },
      });
      if (visitorRuns >= input.visitorTryOnLimit) {
        throw new ApiErrorException(
          HttpStatus.TOO_MANY_REQUESTS,
          SHOPIFY_STOREFRONT_TRY_ON_ERROR_CODES.visitorLimitReached,
          "You have reached this store's Try-On limit for now.",
        );
      }
    }
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
    const image = await fetchPublicCatalogImage(
      product.imageUrl,
      storefrontProductImageMaxBytes,
    ).catch(() => {
      throw productImageUnavailable();
    });
    return validateProductImage(image.buffer, image.contentType);
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
      payload?: CreateTryOnLabRunPayload;
      jewelleryPayload?: JewelleryTryOnProviderSubmitInput;
    },
  ): Promise<void> {
    try {
      const observer: TryOnExecutionObserver = {
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
      };
      if (input.jewelleryPayload) {
        await this.jewelleryExecution.process(input.jewelleryPayload, observer);
      } else if (input.payload) {
        await this.execution.process(input.payload, observer);
      }
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
            downloadUrl: this.storage.createReadUrl({
              key: run.resultAsset.storageKey,
              expiresInSeconds: 900,
              responseContentDisposition: `attachment; filename="${resultDownloadFilename(
                run.id,
                run.resultAsset.contentType,
              )}"`,
              responseContentType: run.resultAsset.contentType ?? undefined,
            }),
            contentType: run.resultAsset.contentType ?? undefined,
            expiresAt: run.resultAsset.expiresAt.toISOString(),
          }
        : undefined,
      errorCode: run.errorCode ?? undefined,
      errorMessage: publicTryOnErrorMessage(run.errorCode, run.errorMessage),
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
  productUrl: true,
  priceAmountCents: true,
  priceCurrency: true,
  productVertical: true,
  jewelleryType: true,
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
      metadata: true,
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

function hashVisitorToken(visitorToken: string | undefined): string | null {
  const clean = visitorToken?.trim();
  if (!clean || !/^[A-Za-z0-9_-]{32,128}$/.test(clean)) return null;
  return createHash("sha256").update(clean).digest("hex");
}

function validSessionToken(sessionToken: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(sessionToken);
}

const supportedStorefrontLocales = new Set([
  "en",
  "es",
  "ar",
  "hi",
  "fr",
  "de",
  "pt",
  "it",
]);

function normalizeStorefrontLocale(value: string | undefined): string {
  const clean = value?.trim().toLowerCase().split("-")[0];
  return clean && supportedStorefrontLocales.has(clean) ? clean : "en";
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

function storefrontReturnUrl(
  source: string,
  identity: string | undefined | null,
  productUrl: string | undefined | null,
  handle: string | null,
): string | undefined {
  try {
    if (!identity) return undefined;
    if (source === "SHOPIFY")
      return handle
        ? `https://${normalizeShopDomain(identity)}/products/${encodeURIComponent(handle)}`
        : undefined;
    const website = publicCommerceUrl(identity),
      product = publicCommerceUrl(productUrl ?? "");
    if (product.origin !== website.origin) return undefined;
    product.hash = "";
    return product.href;
  } catch {
    return undefined;
  }
}

function toProductDto(
  context: Pick<
    ShopifyProductContext,
    "mapping" | "product" | "source" | "shopIdentity"
  >,
): ShopifyStorefrontTryOnProductDto {
  return {
    id: context.product.id,
    name: context.product.name,
    returnUrl: storefrontReturnUrl(
      context.source ?? "SHOPIFY",
      context.shopIdentity,
      context.product.productUrl,
      context.mapping.externalHandle,
    ),
    tryOnVertical: context.product.productVertical,
    jewelleryType: context.product.jewelleryType,
    handle: context.mapping.externalHandle ?? undefined,
    externalProductId: context.mapping.externalProductId,
    imageUrl: context.product.imageUrl ?? undefined,
    priceAmountCents: null,
    priceCurrency: null,
  };
}

function toCapabilityProductDto(
  capability: StorefrontCapability,
): ShopifyStorefrontTryOnProductDto {
  return {
    id: capability.product.id,
    name: capability.product.name,
    returnUrl: storefrontReturnUrl(
      capability.integration.type,
      capability.shopDomain,
      capability.product.productUrl,
      capability.productHandle,
    ),
    tryOnVertical: capability.product.productVertical,
    jewelleryType: capability.product.jewelleryType,
    handle: capability.productHandle ?? undefined,
    externalProductId: capability.externalProductId,
    imageUrl: capability.product.imageUrl ?? undefined,
    priceAmountCents: null,
    priceCurrency: null,
  };
}

function toPricingPlanDto(
  plan: PricingPlanResponseDto,
): ShopifyStorefrontPricingPlanDto {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    channels: plan.channels,
    currency: plan.currency,
    billingMode: plan.billingMode,
    creditUnitPriceCents: plan.creditUnitPriceCents,
    monthlyPriceCents: plan.monthlyPriceCents,
    includedCredits: plan.includedCredits,
    trialCredits: plan.trialCredits,
    storeLocationLimit: plan.storeLocationLimit,
    extraCreditPriceCents: plan.extraCreditPriceCents,
    kioskMonthlyRentCents: plan.kioskMonthlyRentCents,
    kioskDeviceLimit: plan.kioskDeviceLimit,
    featureKeys: plan.featureKeys,
  };
}

function supportsShopifyChannel(plan: { channels: string[] }): boolean {
  return plan.channels.includes("SHOPIFY");
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

function normalizeShopDomainForHealth(
  value: string | undefined,
): string | null {
  const clean = nullableTrim(value)?.toLowerCase();
  return clean && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(clean)
    ? clean
    : null;
}

function currentUtcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function storefrontLimitsFromInput(
  input: StorefrontPolicyInput,
): StorefrontLimits {
  return {
    visitorTokenHash: hashVisitorToken(input.visitorToken),
    visitorTryOnLimit: normalizeLimit(input.visitorTryOnLimit),
    visitorLimitPeriod: normalizeLimitPeriod(input.visitorTryOnLimitPeriod),
    monthlyStoreTryOnLimit: normalizeLimit(input.monthlyStoreTryOnLimit),
  };
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value <= 0) return 0;
  return Math.min(Math.floor(value), 1_000_000);
}

function normalizeLimitPeriod(
  value: string | undefined,
): StorefrontLimitPeriod {
  return value === "WEEK" || value === "MONTH" ? value : "DAY";
}

function periodStart(now: Date, period: StorefrontLimitPeriod): Date {
  if (period === "MONTH") return currentUtcMonthStart(now);
  if (period === "WEEK") {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const daysSinceMonday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - daysSinceMonday);
    return start;
  }
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function assertProductEligible(product: ShopifyProductRecord): void {
  if (
    !product.active ||
    !product.vtoEnabled ||
    (product.productVertical !== "GARMENT" &&
      (product.productVertical !== "JEWELLERY" || !product.jewelleryType))
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

function nullableTrim(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean ? clean : null;
}

function normalizeShopifyHandle(
  value: string | null | undefined,
): string | null {
  const clean = value?.trim().toLowerCase();
  return clean || null;
}

function shopifyProductIdCandidates(
  value: string | null | undefined,
): string[] {
  const clean = nullableTrim(value);
  if (!clean) return [];

  const candidates = new Set<string>();
  const gidMatch = /^gid:\/\/shopify\/Product\/(\d+)$/i.exec(clean);
  const numericId = gidMatch?.[1] ?? (/^\d+$/.test(clean) ? clean : null);

  if (numericId) {
    candidates.add(`gid://shopify/Product/${numericId}`);
    candidates.add(numericId);
    return [...candidates];
  }

  candidates.add(clean);
  return [...candidates];
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

function resultDownloadFilename(
  runId: string,
  contentType: string | null | undefined,
): string {
  const extension =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : "jpg";
  return `selfx-try-on-${runId}.${extension}`;
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
