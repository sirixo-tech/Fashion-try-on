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
import { type IntegrationCredentialContext } from "./integration-token-auth.service.js";

export const INTEGRATION_CATALOG_SYNC_ERROR_CODES = {
  duplicateProduct: "INTEGRATION_CATALOG_DUPLICATE_PRODUCT",
  duplicateVariant: "INTEGRATION_CATALOG_DUPLICATE_VARIANT",
} as const;

type SyncCounts = Pick<
  IntegrationCatalogSyncResponseDto,
  "created" | "updated" | "archived" | "ignoredAsStale"
>;

type RootMapping = {
  id: string;
  productId: string;
  externalProductId: string;
  externalUpdatedAt: Date | null;
  lastSeenAt: Date;
};

@Injectable()
export class IntegrationCatalogSyncService {
  constructor(private readonly prisma: PrismaService) {}

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

  const sourceFields = sourceOwnedProductFields(input);
  let productId: string;
  if (mapping) {
    productId = mapping.productId;
    await tx.product.update({
      where: { id: productId },
      data: sourceFields,
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
        vtoEnabled: false,
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
