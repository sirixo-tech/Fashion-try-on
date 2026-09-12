import { HttpStatus, Injectable } from "@nestjs/common";
import {
  CatalogProductScope,
  ExternalProductMappingStatus,
  Prisma,
  type IntegrationType,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  type IntegrationCatalogProductInputDto,
  type IntegrationCatalogSyncInputDto,
  type IntegrationCatalogSyncResponseDto,
  type IntegrationCatalogVariantInputDto,
} from "./dto/integration-catalog-sync.dto.js";
import {
  type IntegrationProductControlsDto,
  type IntegrationProductControlsQueryDto,
  type IntegrationProductControlsResponseDto,
  type IntegrationProductTryOnStatus,
  type UpdateIntegrationProductVtoDto,
} from "./dto/integration-product-controls.dto.js";
import { type IntegrationCredentialContext } from "./integration-token-auth.service.js";

export const INTEGRATION_CATALOG_SYNC_ERROR_CODES = {
  duplicateProduct: "INTEGRATION_CATALOG_DUPLICATE_PRODUCT",
  duplicateVariant: "INTEGRATION_CATALOG_DUPLICATE_VARIANT",
  productNotFound: "INTEGRATION_PRODUCT_NOT_FOUND",
  productNotEligible: "INTEGRATION_PRODUCT_NOT_ELIGIBLE",
} as const;

type SyncCounts = Pick<
  IntegrationCatalogSyncResponseDto,
  "created" | "updated" | "archived" | "ignoredAsStale" | "skippedWithoutImage"
>;

type RootMapping = {
  id: string;
  productId: string;
  externalProductId: string;
  externalUpdatedAt: Date | null;
  lastSeenAt: Date;
};

type ProductControlMapping = Prisma.ExternalProductMappingGetPayload<{
  include: {
    product: {
      select: {
        id: true;
        name: true;
        active: true;
        vtoEnabled: true;
        productVertical: true;
        imageUrl: true;
        imageStorageKey: true;
        updatedAt: true;
      };
    };
  };
}>;

@Injectable()
export class IntegrationCatalogSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async listProductControls(
    credential: IntegrationCredentialContext,
    query: IntegrationProductControlsQueryDto,
  ): Promise<IntegrationProductControlsResponseDto> {
    const mappings = await this.prisma.externalProductMapping.findMany({
      where: {
        integrationId: credential.integrationId,
        organizationId: credential.storeId,
        externalVariantId: null,
        status: ExternalProductMappingStatus.ACTIVE,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            active: true,
            vtoEnabled: true,
            productVertical: true,
            imageUrl: true,
            imageStorageKey: true,
            updatedAt: true,
          },
        },
      },
      orderBy: [{ lastSeenAt: "desc" }, { externalProductId: "asc" }],
      take: boundedProductControlsLimit(query.limit),
    });
    const data = mappings.map(mapProductControl);
    return {
      data,
      summary: {
        total: data.length,
        ready: data.filter((product) => product.tryOnStatus === "READY")
          .length,
        disabled: data.filter((product) => product.tryOnStatus === "DISABLED")
          .length,
        needsAttention: data.filter(
          (product) =>
            product.tryOnStatus !== "READY" &&
            product.tryOnStatus !== "DISABLED",
        ).length,
      },
    };
  }

  async updateProductVto(
    credential: IntegrationCredentialContext,
    input: UpdateIntegrationProductVtoDto,
  ): Promise<IntegrationProductControlsDto> {
    const externalProductId = nullableTrim(input.externalProductId);
    if (!externalProductId) {
      throwProductNotFound();
    }
    const mapping = await this.prisma.externalProductMapping.findFirst({
      where: {
        integrationId: credential.integrationId,
        organizationId: credential.storeId,
        externalProductId,
        externalVariantId: null,
        status: ExternalProductMappingStatus.ACTIVE,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            active: true,
            vtoEnabled: true,
            productVertical: true,
            imageUrl: true,
            imageStorageKey: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!mapping) {
      throwProductNotFound();
    }
    if (input.enabled && !isProductEligibleForTryOn(mapping.product)) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        INTEGRATION_CATALOG_SYNC_ERROR_CODES.productNotEligible,
        "This synced product is not eligible for SelfX Try-On.",
      );
    }
    const product = await this.prisma.product.update({
      where: { id: mapping.productId },
      data: { vtoEnabled: input.enabled },
      select: {
        id: true,
        name: true,
        active: true,
        vtoEnabled: true,
        productVertical: true,
        imageUrl: true,
        imageStorageKey: true,
        updatedAt: true,
      },
    });
    return mapProductControl({ ...mapping, product });
  }

  async sync(
    credential: IntegrationCredentialContext,
    input: IntegrationCatalogSyncInputDto,
  ): Promise<IntegrationCatalogSyncResponseDto> {
    assertUniqueExternalIdentities(input.products);
    const observedAt =
      input.mode === "FULL" ? new Date(input.sourceSnapshotAt!) : new Date();
    const counts = await this.prisma.$transaction(async (tx) => {
      const categoryId = await ensureImportedCategory(tx, credential);
      const result: SyncCounts = {
        created: 0,
        updated: 0,
        archived: 0,
        ignoredAsStale: 0,
        skippedWithoutImage: 0,
      };
      for (const product of input.products) {
        await syncProduct(
          tx,
          credential,
          categoryId,
          product,
          observedAt,
          result,
        );
      }

      if (input.mode === "FULL" && input.finalize) {
        await archiveMissingProducts(
          tx,
          credential.integrationId,
          observedAt,
          result,
        );
      }
      return result;
    });

    return {
      direction: "COMMERCE_TO_SELFX",
      sourceOfTruth: "COMMERCE_PLATFORM",
      finalized: input.mode === "FULL" && input.finalize === true,
      ...counts,
      processedAt: new Date().toISOString(),
    };
  }

  async archiveIntegrationCatalog(
    integrationId: string,
    archivedAt: Date,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const roots = await tx.externalProductMapping.findMany({
        where: { integrationId, externalVariantId: null },
        select: { productId: true },
      });
      const productIds = [...new Set(roots.map((root) => root.productId))];
      if (productIds.length > 0) {
        await tx.product.updateMany({
          where: { id: { in: productIds } },
          data: { active: false },
        });
        await tx.externalProductMapping.updateMany({
          where: { integrationId },
          data: {
            status: ExternalProductMappingStatus.ARCHIVED,
            externalUpdatedAt: archivedAt,
            lastSeenAt: archivedAt,
          },
        });
      }
      return productIds.length;
    });
  }
}

async function syncProduct(
  tx: Prisma.TransactionClient,
  credential: IntegrationCredentialContext,
  categoryId: string,
  input: IntegrationCatalogProductInputDto,
  observedAt: Date,
  counts: SyncCounts,
): Promise<void> {
  const sourceUpdatedAt = new Date(input.sourceUpdatedAt);
  const mapping = await tx.externalProductMapping.findFirst({
    where: {
      integrationId: credential.integrationId,
      externalProductId: input.externalProductId,
      externalVariantId: null,
    },
    select: {
      id: true,
      productId: true,
      externalProductId: true,
      externalUpdatedAt: true,
      lastSeenAt: true,
    },
  });

  if (
    mapping?.externalUpdatedAt &&
    sourceUpdatedAt <= mapping.externalUpdatedAt
  ) {
    const sourceEligibilityFields = sourceOwnedEligibilityFields(input);
    if (Object.keys(sourceEligibilityFields).length > 0) {
      await tx.product.update({
        where: { id: mapping.productId },
        data: sourceEligibilityFields,
      });
    }
    await tx.externalProductMapping.update({
      where: { id: mapping.id },
      data: { lastSeenAt: observedAt },
    });
    counts.ignoredAsStale += 1;
    return;
  }

  if (input.status === "ARCHIVED") {
    if (mapping) {
      await archiveMappedProduct(
        tx,
        credential.integrationId,
        mapping,
        sourceUpdatedAt,
        observedAt,
      );
      counts.archived += 1;
    }
    return;
  }

  if (!nullableTrim(input.featuredImageUrl)) {
    if (mapping) {
      await archiveMappedProduct(
        tx,
        credential.integrationId,
        mapping,
        sourceUpdatedAt,
        observedAt,
      );
      counts.archived += 1;
    }
    counts.skippedWithoutImage += 1;
    return;
  }

  const sourceFields = sourceOwnedProductFields(input);
  const sourceEligibilityFields = sourceOwnedEligibilityFields(input);
  let productId: string;
  if (mapping) {
    productId = mapping.productId;
    await tx.product.update({
      where: { id: productId },
      data: {
        ...sourceFields,
        ...sourceEligibilityFields,
      },
    });
    await tx.externalProductMapping.update({
      where: { id: mapping.id },
      data: rootMappingFields(credential, input, sourceUpdatedAt, observedAt),
    });
    counts.updated += 1;
  } else {
    productId = createSelfxId();
    await tx.product.create({
      data: {
        id: productId,
        catalogKey: integrationProductCatalogKey(
          credential.integrationId,
          input.externalProductId,
        ),
        scope: CatalogProductScope.STORE,
        organizationId: credential.storeId,
        categoryId,
        ...sourceFields,
        audience: "UNISEX",
        vtoEnabled: input.vtoEnabled ?? false,
        sortOrder: 0,
        garmentIntent: "AUTO",
        garmentCategory: "AUTO",
        garmentPhotoType: "AUTO",
        productVertical: "GARMENT",
        jewelleryType: null,
        imageStorageKey: null,
        imageContentType: null,
        imageWidth: null,
        imageHeight: null,
      },
    });
    await tx.externalProductMapping.create({
      data: {
        id: createSelfxId(),
        integrationId: credential.integrationId,
        organizationId: credential.storeId,
        productId,
        externalProductId: input.externalProductId,
        externalVariantId: null,
        ...rootMappingFields(credential, input, sourceUpdatedAt, observedAt),
      },
    });
    counts.created += 1;
  }

  await syncVariants(
    tx,
    credential,
    productId,
    input,
    sourceUpdatedAt,
    observedAt,
  );
}

async function syncVariants(
  tx: Prisma.TransactionClient,
  credential: IntegrationCredentialContext,
  productId: string,
  product: IntegrationCatalogProductInputDto,
  sourceUpdatedAt: Date,
  observedAt: Date,
): Promise<void> {
  if (product.variants === undefined) {
    return;
  }
  const existing = await tx.externalProductMapping.findMany({
    where: {
      integrationId: credential.integrationId,
      externalProductId: product.externalProductId,
      externalVariantId: { not: null },
    },
    select: { id: true, externalVariantId: true },
  });
  const existingById = new Map(
    existing.flatMap((mapping) =>
      mapping.externalVariantId
        ? ([[mapping.externalVariantId, mapping]] as const)
        : [],
    ),
  );
  const incomingIds = new Set<string>();

  for (const variant of product.variants ?? []) {
    incomingIds.add(variant.externalVariantId);
    const current = existingById.get(variant.externalVariantId);
    const data = variantMappingFields(
      credential,
      product,
      variant,
      sourceUpdatedAt,
      observedAt,
    );
    if (current) {
      await tx.externalProductMapping.update({
        where: { id: current.id },
        data,
      });
    } else {
      await tx.externalProductMapping.create({
        data: {
          id: createSelfxId(),
          integrationId: credential.integrationId,
          organizationId: credential.storeId,
          productId,
          externalProductId: product.externalProductId,
          externalVariantId: variant.externalVariantId,
          ...data,
        },
      });
    }
  }

  const removedVariantIds = existing
    .filter(
      (mapping) =>
        mapping.externalVariantId &&
        !incomingIds.has(mapping.externalVariantId),
    )
    .map((mapping) => mapping.id);
  if (removedVariantIds.length > 0) {
    await tx.externalProductMapping.updateMany({
      where: { id: { in: removedVariantIds } },
      data: {
        status: ExternalProductMappingStatus.ARCHIVED,
        externalUpdatedAt: sourceUpdatedAt,
        lastSeenAt: observedAt,
      },
    });
  }
}

async function archiveMissingProducts(
  tx: Prisma.TransactionClient,
  integrationId: string,
  sourceSnapshotAt: Date,
  counts: SyncCounts,
): Promise<void> {
  const existing = await tx.externalProductMapping.findMany({
    where: {
      integrationId,
      externalVariantId: null,
      status: ExternalProductMappingStatus.ACTIVE,
    },
    select: {
      id: true,
      productId: true,
      externalProductId: true,
      externalUpdatedAt: true,
      lastSeenAt: true,
    },
  });
  for (const mapping of existing) {
    if (mapping.lastSeenAt < sourceSnapshotAt) {
      await archiveMappedProduct(
        tx,
        integrationId,
        mapping,
        sourceSnapshotAt,
        sourceSnapshotAt,
      );
      counts.archived += 1;
    }
  }
}

async function archiveMappedProduct(
  tx: Prisma.TransactionClient,
  integrationId: string,
  mapping: RootMapping,
  sourceUpdatedAt: Date,
  observedAt: Date,
): Promise<void> {
  await tx.product.update({
    where: { id: mapping.productId },
    data: { active: false },
  });
  await tx.externalProductMapping.updateMany({
    where: {
      integrationId,
      externalProductId: mapping.externalProductId,
    },
    data: {
      status: ExternalProductMappingStatus.ARCHIVED,
      externalUpdatedAt: sourceUpdatedAt,
      lastSeenAt: observedAt,
    },
  });
}

async function ensureImportedCategory(
  tx: Prisma.TransactionClient,
  credential: IntegrationCredentialContext,
): Promise<string> {
  const sourceName = integrationSourceName(credential.integrationType);
  const category = await tx.productCategory.upsert({
    where: {
      catalogKey: integrationCategoryCatalogKey(credential.integrationId),
    },
    create: {
      id: createSelfxId(),
      catalogKey: integrationCategoryCatalogKey(credential.integrationId),
      scope: CatalogProductScope.STORE,
      organizationId: credential.storeId,
      name: `${sourceName} products`,
      slug: `${sourceName.toLowerCase()}-products`,
      audience: "UNISEX",
      active: true,
    },
    update: { active: true },
    select: { id: true },
  });
  return category.id;
}

function sourceOwnedProductFields(input: IntegrationCatalogProductInputDto) {
  return {
    name: input.title!.trim(),
    slug: productSlug(input),
    description: nullableTrim(input.description),
    active: input.status === "ACTIVE",
    priceAmountCents: input.priceAmountCents ?? null,
    priceCurrency: nullableTrim(input.priceCurrency),
    productUrl: nullableTrim(input.productUrl),
    imageUrl: nullableTrim(input.featuredImageUrl),
  } satisfies Prisma.ProductUncheckedUpdateInput;
}

function sourceOwnedEligibilityFields(
  input: IntegrationCatalogProductInputDto,
) {
  return input.vtoEnabled === undefined
    ? {}
    : ({
        vtoEnabled: input.vtoEnabled,
      } satisfies Prisma.ProductUncheckedUpdateInput);
}

function rootMappingFields(
  credential: IntegrationCredentialContext,
  input: IntegrationCatalogProductInputDto,
  sourceUpdatedAt: Date,
  observedAt: Date,
) {
  return {
    externalSku: null,
    externalHandle: nullableTrim(input.handle),
    status: ExternalProductMappingStatus.ACTIVE,
    metadata: {
      authoritativeSource: integrationSourceName(credential.integrationType),
      syncDirection: "COMMERCE_TO_SELFX",
      sourceStatus: input.status,
      variantCount: input.variants?.length ?? null,
    } satisfies Prisma.InputJsonObject,
    externalUpdatedAt: sourceUpdatedAt,
    lastSeenAt: observedAt,
  };
}

function variantMappingFields(
  credential: IntegrationCredentialContext,
  product: IntegrationCatalogProductInputDto,
  variant: IntegrationCatalogVariantInputDto,
  sourceUpdatedAt: Date,
  observedAt: Date,
) {
  return {
    externalSku: nullableTrim(variant.sku),
    externalHandle: nullableTrim(product.handle),
    status: ExternalProductMappingStatus.ACTIVE,
    metadata: {
      authoritativeSource: integrationSourceName(credential.integrationType),
      syncDirection: "COMMERCE_TO_SELFX",
      title: nullableTrim(variant.title),
      available: variant.available ?? null,
      priceAmountCents: variant.priceAmountCents ?? null,
      priceCurrency: nullableTrim(variant.priceCurrency),
      imageUrl: nullableTrim(variant.imageUrl),
    } satisfies Prisma.InputJsonObject,
    externalUpdatedAt: sourceUpdatedAt,
    lastSeenAt: observedAt,
  };
}

function assertUniqueExternalIdentities(
  products: readonly IntegrationCatalogProductInputDto[],
): void {
  const productIds = new Set<string>();
  for (const product of products) {
    if (productIds.has(product.externalProductId)) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        INTEGRATION_CATALOG_SYNC_ERROR_CODES.duplicateProduct,
        "A catalog sync request cannot contain the same external product twice.",
      );
    }
    productIds.add(product.externalProductId);

    const variantIds = new Set<string>();
    for (const variant of product.variants ?? []) {
      if (variantIds.has(variant.externalVariantId)) {
        throw new ApiErrorException(
          HttpStatus.BAD_REQUEST,
          INTEGRATION_CATALOG_SYNC_ERROR_CODES.duplicateVariant,
          "A product cannot contain the same external variant twice.",
        );
      }
      variantIds.add(variant.externalVariantId);
    }
  }
}

function integrationCategoryCatalogKey(integrationId: string): string {
  return `integration:${integrationId}:category:imports`;
}

function integrationProductCatalogKey(
  integrationId: string,
  externalProductId: string,
): string {
  return `integration:${integrationId}:product:${externalProductId}`;
}

function integrationSourceName(
  type: IntegrationType,
): "Shopify" | "WooCommerce" {
  return type === "SHOPIFY" ? "Shopify" : "WooCommerce";
}

function productSlug(input: IntegrationCatalogProductInputDto): string {
  const source =
    nullableTrim(input.handle) ?? input.title ?? input.externalProductId;
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
  return slug || `external-${input.externalProductId.slice(0, 140)}`;
}

function nullableTrim(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function boundedProductControlsLimit(value: number | undefined): number {
  if (!value || !Number.isInteger(value)) {
    return 25;
  }
  return Math.min(Math.max(value, 1), 50);
}

function mapProductControl(
  mapping: ProductControlMapping,
): IntegrationProductControlsDto {
  return {
    id: mapping.product.id,
    externalProductId: mapping.externalProductId,
    handle: mapping.externalHandle,
    name: mapping.product.name,
    active: mapping.product.active,
    vtoEnabled: mapping.product.vtoEnabled,
    productVertical: mapping.product.productVertical,
    imageUrl: mapping.product.imageUrl,
    tryOnStatus: productTryOnStatus(mapping.product),
    updatedAt: mapping.product.updatedAt.toISOString(),
  };
}

function productTryOnStatus(
  product: Pick<
    ProductControlMapping["product"],
    "active" | "vtoEnabled" | "productVertical" | "imageUrl" | "imageStorageKey"
  >,
): IntegrationProductTryOnStatus {
  if (!product.active) {
    return "INACTIVE";
  }
  if (product.productVertical !== "GARMENT") {
    return "NOT_GARMENT";
  }
  if (!hasProductImage(product)) {
    return "MISSING_IMAGE";
  }
  return product.vtoEnabled ? "READY" : "DISABLED";
}

function isProductEligibleForTryOn(
  product: Pick<
    ProductControlMapping["product"],
    "active" | "productVertical" | "imageUrl" | "imageStorageKey"
  >,
): boolean {
  return (
    product.active &&
    product.productVertical === "GARMENT" &&
    hasProductImage(product)
  );
}

function hasProductImage(
  product: Pick<ProductControlMapping["product"], "imageUrl" | "imageStorageKey">,
): boolean {
  return Boolean(nullableTrim(product.imageUrl) || product.imageStorageKey);
}

function throwProductNotFound(): never {
  throw new ApiErrorException(
    HttpStatus.NOT_FOUND,
    INTEGRATION_CATALOG_SYNC_ERROR_CODES.productNotFound,
    "Synced integration product was not found.",
  );
}
