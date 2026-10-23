import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import {
  TRY_ON_LAB_ERROR_CODES,
  type SelfxJewelleryCaptureRequirements,
} from "@selfx/shared";

import { ApiErrorException } from "../common/api-error.exception.js";
import { fetchPublicCatalogImage } from "./catalog-url-policy.js";
import {
  type SupportedImageMimeType,
  validateTechnicalImageBuffer,
} from "../common/image-validation.js";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { TRY_ON_LAB_MAX_IMAGE_BYTES } from "../try-on-lab/try-on-lab.constants.js";
import { JewelleryCaptureRequirementsService } from "../try-on/jewellery/jewellery-capture-requirements.service.js";
import {
  type KioskCatalogCategoryDto,
  type KioskCatalogCategoryListResponseDto,
  type KioskCatalogCategoryQueryDto,
  type KioskCatalogProductDto,
  type KioskCatalogProductListResponseDto,
  type KioskCatalogQueryDto,
  type KioskCatalogRevisionDto,
  type KioskCatalogSnapshotDto,
} from "./dto/kiosk-catalog.dto.js";
import type { JewelleryType, ProductVertical } from "./product-kind.js";

const defaultPage = 1;
const defaultPageSize = 20;
const maxPageSize = 100;
const catalogReadUrlTtlSeconds = 900;

type CatalogScope = "PLATFORM_DEFAULT" | "STORE";

type ProductRow = {
  externally_managed?: boolean;
  id: string;
  name: string;
  description: string | null;
  product_vertical: ProductVertical;
  jewellery_type: JewelleryType | null;
  audience: string;
  garment_intent: string;
  garment_category: string;
  garment_photo_type: string;
  price_amount_cents: number | null;
  minimum_price_cents?: number | null;
  maximum_price_cents?: number | null;
  price_currency: string | null;
  image_url: string | null;
  image_storage_key: string | null;
  image_content_type: string | null;
  image_width: number | null;
  image_height: number | null;
  updated_at: Date;
  category_id: string;
  category_name: string;
  category_slug: string;
  category_audience: string | null;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  audience: string | null;
  product_count: bigint | number;
};

type CatalogRevisionStatsRow = {
  product_count: bigint | number;
  category_count: bigint | number;
  updated_at: Date | null;
};

export interface KioskCatalogProductTryOnImage {
  fieldName: "garmentImage" | "jewelleryImage";
  filename: string;
  mimeType: SupportedImageMimeType;
  sizeBytes: number;
  buffer: Buffer;
  dataUri: string;
  width: number;
  height: number;
}

type KioskCatalogGarmentProductTryOnImage = KioskCatalogProductTryOnImage & {
  fieldName: "garmentImage";
};
type KioskCatalogJewelleryProductTryOnImage = KioskCatalogProductTryOnImage & {
  fieldName: "jewelleryImage";
};

export interface KioskCatalogProductForTryOn {
  productId: string;
  garmentIntent: string;
  garmentCategory: string;
  garmentPhotoType: string;
  garmentImage: KioskCatalogGarmentProductTryOnImage;
}

export interface KioskCatalogJewelleryProductForTryOn {
  productId: string;
  jewelleryType: JewelleryType;
  jewelleryImage: KioskCatalogJewelleryProductTryOnImage;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly jewelleryCaptureRequirements: JewelleryCaptureRequirementsService,
  ) {}

  async listKioskProducts(
    storeTenantId: string | null,
    query: KioskCatalogQueryDto,
  ): Promise<KioskCatalogProductListResponseDto> {
    const page = boundedPositiveInt(query.page, defaultPage);
    const pageSize = Math.min(
      boundedPositiveInt(query.pageSize, defaultPageSize),
      maxPageSize,
    );
    const offset = (page - 1) * pageSize;
    const context = this.resolveCatalogContext(storeTenantId);
    const where = productWhere(context, query);
    const [countRow, rows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(*) AS total
        FROM products p
        INNER JOIN product_categories c ON c.id = p.category_id
        WHERE ${where}
      `,
      this.prisma.$queryRaw<ProductRow[]>`
        SELECT
          EXISTS (SELECT 1 FROM external_product_mappings xm WHERE xm.product_id = p.id AND xm.organization_id = p.organization_id AND xm.external_variant_id IS NULL) AS externally_managed,
        p.id,
          p.name,
          p.description,
          p.product_vertical,
          p.jewellery_type,
          p.audience,
          p.garment_intent,
          p.garment_category,
          p.garment_photo_type,
          p.price_amount_cents,
          p.price_currency,
          (SELECT MIN(CASE WHEN ps.pricing_mode = 'VARIANT' THEN COALESCE(pv.price_override_amount_cents, p.price_amount_cents) ELSE p.price_amount_cents END) FROM product_variants pv JOIN product_stock_settings ps ON ps.product_id = pv.product_id WHERE pv.product_id = p.id AND pv.organization_id = p.organization_id AND pv.active = true) AS minimum_price_cents,
          (SELECT MAX(CASE WHEN ps.pricing_mode = 'VARIANT' THEN COALESCE(pv.price_override_amount_cents, p.price_amount_cents) ELSE p.price_amount_cents END) FROM product_variants pv JOIN product_stock_settings ps ON ps.product_id = pv.product_id WHERE pv.product_id = p.id AND pv.organization_id = p.organization_id AND pv.active = true) AS maximum_price_cents,
          p.image_url,
          p.image_storage_key,
          p.image_content_type,
          p.image_width,
          p.image_height,
          p.updated_at,
          c.id AS category_id,
          c.name AS category_name,
          c.slug AS category_slug,
          c.audience AS category_audience
        FROM products p
        INNER JOIN product_categories c ON c.id = p.category_id
        WHERE ${where}
        ORDER BY c.sort_order ASC, p.sort_order ASC, p.name ASC, p.id ASC
        LIMIT ${pageSize}
        OFFSET ${offset}
      `,
    ]);
    const total = Number(countRow[0]?.total ?? 0);
    return {
      data: rows.map((row) => this.mapProduct(row)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        hasMore: page * pageSize < total,
      },
    };
  }

  async listKioskCategories(
    storeTenantId: string | null,
    query: KioskCatalogCategoryQueryDto,
  ): Promise<KioskCatalogCategoryListResponseDto> {
    const context = this.resolveCatalogContext(storeTenantId);
    const where = categoryWhere(context, query);
    const rows = await this.prisma.$queryRaw<CategoryRow[]>`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.audience,
        COUNT(p.id) AS product_count
      FROM product_categories c
      INNER JOIN products p ON p.category_id = c.id
      WHERE ${where}
      GROUP BY c.id, c.name, c.slug, c.audience, c.sort_order
      ORDER BY c.sort_order ASC, c.name ASC, c.id ASC
    `;
    return { data: rows.map(mapCategory) };
  }

  async getKioskCatalogRevision(
    storeTenantId: string | null,
    syncVersion: number,
    productVertical: ProductVertical = "GARMENT",
  ): Promise<KioskCatalogRevisionDto> {
    const context = this.resolveCatalogContext(storeTenantId);
    const stats = await this.catalogRevisionStats(context, productVertical);
    return mapRevision(context, stats, syncVersion);
  }

  async getKioskCatalogSnapshot(
    storeTenantId: string | null,
    syncVersion: number,
    productVertical: ProductVertical = "GARMENT",
  ): Promise<KioskCatalogSnapshotDto> {
    const context = this.resolveCatalogContext(storeTenantId);
    const where = productWhere(context, { productVertical });
    const [stats, categories, products] = await Promise.all([
      this.catalogRevisionStats(context, productVertical),
      this.prisma.$queryRaw<CategoryRow[]>`
        SELECT
          c.id,
          c.name,
          c.slug,
          c.audience,
          COUNT(p.id) AS product_count
        FROM product_categories c
        INNER JOIN products p ON p.category_id = c.id
        WHERE ${where}
        GROUP BY c.id, c.name, c.slug, c.audience, c.sort_order
        ORDER BY c.sort_order ASC, c.name ASC, c.id ASC
      `,
      this.prisma.$queryRaw<ProductRow[]>`
        SELECT
          EXISTS (SELECT 1 FROM external_product_mappings xm WHERE xm.product_id = p.id AND xm.organization_id = p.organization_id AND xm.external_variant_id IS NULL) AS externally_managed,
        p.id,
          p.name,
          p.description,
          p.product_vertical,
          p.jewellery_type,
          p.audience,
          p.garment_intent,
          p.garment_category,
          p.garment_photo_type,
          p.price_amount_cents,
          p.price_currency,
          (SELECT MIN(CASE WHEN ps.pricing_mode = 'VARIANT' THEN COALESCE(pv.price_override_amount_cents, p.price_amount_cents) ELSE p.price_amount_cents END) FROM product_variants pv JOIN product_stock_settings ps ON ps.product_id = pv.product_id WHERE pv.product_id = p.id AND pv.organization_id = p.organization_id AND pv.active = true) AS minimum_price_cents,
          (SELECT MAX(CASE WHEN ps.pricing_mode = 'VARIANT' THEN COALESCE(pv.price_override_amount_cents, p.price_amount_cents) ELSE p.price_amount_cents END) FROM product_variants pv JOIN product_stock_settings ps ON ps.product_id = pv.product_id WHERE pv.product_id = p.id AND pv.organization_id = p.organization_id AND pv.active = true) AS maximum_price_cents,
          p.image_url,
          p.image_storage_key,
          p.image_content_type,
          p.image_width,
          p.image_height,
          p.updated_at,
          c.id AS category_id,
          c.name AS category_name,
          c.slug AS category_slug,
          c.audience AS category_audience
        FROM products p
        INNER JOIN product_categories c ON c.id = p.category_id
        WHERE ${where}
        ORDER BY c.sort_order ASC, p.sort_order ASC, p.name ASC, p.id ASC
      `,
    ]);
    return {
      ...mapRevision(context, stats, syncVersion),
      categories: categories.map(mapCategory),
      products: products.map((row) => this.mapProduct(row)),
    };
  }

  async resolveKioskProductForTryOn(
    storeTenantId: string | null,
    productId: string,
  ): Promise<KioskCatalogProductForTryOn> {
    const context = this.resolveCatalogContext(storeTenantId);
    const where = Prisma.join(
      [
        ...baseProductConditions(context, "GARMENT"),
        Prisma.sql`p.id = ${productId}::uuid`,
      ],
      " AND ",
    );
    const rows = await this.prisma.$queryRaw<ProductRow[]>`
      SELECT
        EXISTS (SELECT 1 FROM external_product_mappings xm WHERE xm.product_id = p.id AND xm.organization_id = p.organization_id AND xm.external_variant_id IS NULL) AS externally_managed,
        p.id,
        p.name,
        p.description,
        p.audience,
        p.garment_intent,
        p.garment_category,
        p.garment_photo_type,
        p.price_amount_cents,
        p.price_currency,
        p.image_url,
        p.image_storage_key,
        p.image_content_type,
        p.image_width,
        p.image_height,
        p.updated_at,
        c.id AS category_id,
        c.name AS category_name,
        c.slug AS category_slug,
        c.audience AS category_audience
      FROM products p
      INNER JOIN product_categories c ON c.id = p.category_id
      WHERE ${where}
      LIMIT 1
    `;
    const product = rows[0];
    if (!product) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        TRY_ON_LAB_ERROR_CODES.resolutionMetadataInvalid,
        "Catalog product is not available for this kiosk.",
      );
    }

    return {
      productId: product.id,
      garmentIntent: product.garment_intent,
      garmentCategory: product.garment_category,
      garmentPhotoType: product.garment_photo_type,
      garmentImage: await this.resolveTryOnImage(product),
    };
  }

  async resolveKioskJewelleryProductForTryOn(
    storeTenantId: string | null,
    productId: string,
  ): Promise<KioskCatalogJewelleryProductForTryOn> {
    const context = this.resolveCatalogContext(storeTenantId);
    const where = Prisma.join(
      [
        ...baseProductConditions(context, "JEWELLERY"),
        Prisma.sql`p.id = ${productId}::uuid`,
        Prisma.sql`p.jewellery_type IS NOT NULL`,
      ],
      " AND ",
    );
    const rows = await this.prisma.$queryRaw<
      Array<
        Pick<
          ProductRow,
          "id" | "image_url" | "image_storage_key" | "image_content_type"
        > & { jewellery_type: JewelleryType }
      >
    >`
      SELECT
        EXISTS (SELECT 1 FROM external_product_mappings xm WHERE xm.product_id = p.id AND xm.organization_id = p.organization_id AND xm.external_variant_id IS NULL) AS externally_managed,
        p.id,
        p.image_url,
        p.image_storage_key,
        p.image_content_type,
        p.jewellery_type
      FROM products p
      INNER JOIN product_categories c ON c.id = p.category_id
      WHERE ${where}
      LIMIT 1
    `;
    const product = rows[0];
    if (!product) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        TRY_ON_LAB_ERROR_CODES.resolutionMetadataInvalid,
        "Jewellery catalog product is not available for this kiosk.",
      );
    }

    return {
      productId: product.id,
      jewelleryType: product.jewellery_type,
      jewelleryImage: await this.resolveTryOnImage(product, "jewelleryImage"),
    };
  }

  async getKioskJewelleryCaptureRequirements(
    storeTenantId: string | null,
    productId: string,
  ): Promise<SelfxJewelleryCaptureRequirements> {
    const context = this.resolveCatalogContext(storeTenantId);
    const where = Prisma.join(
      [
        ...baseProductConditions(context, "JEWELLERY"),
        Prisma.sql`p.id = ${productId}::uuid`,
        Prisma.sql`p.jewellery_type IS NOT NULL`,
      ],
      " AND ",
    );
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; jewellery_type: JewelleryType }>
    >`
      SELECT p.id, p.jewellery_type
      FROM products p
      INNER JOIN product_categories c ON c.id = p.category_id
      WHERE ${where}
      LIMIT 1
    `;
    const product = rows[0];
    if (!product) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        TRY_ON_LAB_ERROR_CODES.resolutionMetadataInvalid,
        "Jewellery catalog product is not available for this kiosk.",
      );
    }

    return this.jewelleryCaptureRequirements.resolve(
      product.jewellery_type,
      "KIOSK",
      product.id,
    );
  }

  private resolveCatalogContext(storeTenantId: string | null): {
    scope: CatalogScope;
    storeTenantId: string | null;
  } {
    // Empty or unassigned kiosks must never discover the historic platform catalog.
    return { scope: "STORE", storeTenantId };
  }

  private mapProduct(row: ProductRow): KioskCatalogProductDto {
    return {
      nativePurchasingAllowed: !row.externally_managed,
      id: row.id,
      name: row.name,
      description: row.description,
      productVertical: row.product_vertical,
      jewelleryType: row.jewellery_type,
      audience: row.audience,
      category: {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug,
        audience: row.category_audience,
      },
      garmentIntent: row.garment_intent,
      garmentCategory: row.garment_category,
      garmentPhotoType: row.garment_photo_type,
      priceAmountCents: row.externally_managed ? null : row.price_amount_cents,
      minimumPriceAmountCents: row.externally_managed
        ? null
        : (row.minimum_price_cents ?? row.price_amount_cents),
      hasVariablePrices:
        row.minimum_price_cents != null &&
        row.maximum_price_cents != null &&
        row.minimum_price_cents !== row.maximum_price_cents,
      priceCurrency: row.price_currency,
      image: {
        url: row.image_url ?? this.catalogReadUrl(row.image_storage_key),
        contentType: row.image_content_type,
        width: row.image_width,
        height: row.image_height,
        cacheKey: productImageCacheKey(row),
      },
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private async catalogRevisionStats(
    context: {
      scope: CatalogScope;
      storeTenantId: string | null;
    },
    productVertical: ProductVertical = "GARMENT",
  ): Promise<CatalogRevisionStatsRow> {
    const where = productWhere(context, { productVertical });
    const rows = await this.prisma.$queryRaw<CatalogRevisionStatsRow[]>`
      SELECT
        COUNT(p.id) AS product_count,
        COUNT(DISTINCT c.id) AS category_count,
        MAX(GREATEST(p.updated_at, c.updated_at)) AS updated_at
      FROM products p
      INNER JOIN product_categories c ON c.id = p.category_id
      WHERE ${where}
    `;
    return rows[0] ?? { product_count: 0, category_count: 0, updated_at: null };
  }

  private catalogReadUrl(storageKey: string | null): string | null {
    if (!storageKey) {
      return null;
    }
    return this.storage.createReadUrl({
      key: storageKey,
      expiresInSeconds: catalogReadUrlTtlSeconds,
    });
  }

  private async resolveTryOnImage<
    TFieldName extends "garmentImage" | "jewelleryImage",
  >(
    product: Pick<
      ProductRow,
      "id" | "image_storage_key" | "image_url" | "image_content_type"
    >,
    fieldName: TFieldName = "garmentImage" as TFieldName,
  ): Promise<KioskCatalogProductTryOnImage & { fieldName: TFieldName }> {
    const image = product.image_storage_key
      ? await this.readStoredProductImage(product.image_storage_key)
      : await this.fetchProductImage(product.image_url);
    const metadata = validateTechnicalImageBuffer({
      buffer: image.buffer,
      declaredContentType: product.image_content_type ?? image.contentType,
      maxBytes: TRY_ON_LAB_MAX_IMAGE_BYTES,
    });
    return {
      fieldName,
      filename: `catalog-product-${product.id}`,
      mimeType: metadata.mimeType,
      sizeBytes: metadata.sizeBytes,
      buffer: image.buffer,
      dataUri: `data:${metadata.mimeType};base64,${image.buffer.toString("base64")}`,
      width: metadata.width,
      height: metadata.height,
    };
  }

  private async readStoredProductImage(
    storageKey: string,
  ): Promise<{ buffer: Buffer; contentType: string | null }> {
    return {
      buffer: await this.storage.readObject(
        storageKey,
        TRY_ON_LAB_MAX_IMAGE_BYTES,
      ),
      contentType: null,
    };
  }

  private async fetchProductImage(
    imageUrl: string | null,
  ): Promise<{ buffer: Buffer; contentType: string | null }> {
    if (!imageUrl || imageUrl.trim() === "") {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        TRY_ON_LAB_ERROR_CODES.imageInvalid,
        "Catalog product image is unavailable.",
      );
    }
    let url: URL;
    try {
      url = new URL(imageUrl);
    } catch {
      throwInvalidCatalogImage();
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throwInvalidCatalogImage();
    }
    const image = await fetchPublicCatalogImage(
      url.href,
      TRY_ON_LAB_MAX_IMAGE_BYTES,
    ).catch(() => {
      throwInvalidCatalogImage();
    });
    const buffer = image.buffer;
    if (buffer.length > TRY_ON_LAB_MAX_IMAGE_BYTES) {
      throwInvalidCatalogImage();
    }
    return {
      buffer,
      contentType: image.contentType?.split(";")[0]?.trim() ?? null,
    };
  }
}

function productWhere(
  context: { scope: CatalogScope; storeTenantId: string | null },
  query: KioskCatalogQueryDto,
): Prisma.Sql {
  const conditions = baseProductConditions(
    context,
    query.productVertical ?? "GARMENT",
  );
  if (query.audience) {
    conditions.push(Prisma.sql`p.audience = ${query.audience}`);
  }
  if (query.category) {
    conditions.push(Prisma.sql`c.slug = ${query.category}`);
  }
  return Prisma.join(conditions, " AND ");
}

function categoryWhere(
  context: { scope: CatalogScope; storeTenantId: string | null },
  query: KioskCatalogCategoryQueryDto,
): Prisma.Sql {
  const conditions = baseProductConditions(
    context,
    query.productVertical ?? "GARMENT",
  );
  if (query.audience) {
    conditions.push(Prisma.sql`p.audience = ${query.audience}`);
  }
  return Prisma.join(conditions, " AND ");
}

function baseProductConditions(
  context: {
    scope: CatalogScope;
    storeTenantId: string | null;
  },
  vertical: ProductVertical,
): Prisma.Sql[] {
  const conditions = [
    Prisma.sql`p.scope::text = ${context.scope}`,
    Prisma.sql`p.active = true`,
    Prisma.sql`p.vto_enabled = true`,
    Prisma.sql`p.product_vertical::text = ${vertical}`,
    Prisma.sql`c.active = true`,
  ];
  if (context.scope === "STORE" && context.storeTenantId) {
    conditions.push(
      Prisma.sql`p.organization_id = ${context.storeTenantId}::uuid`,
      Prisma.sql`c.scope::text = 'STORE'`,
      Prisma.sql`c.organization_id = ${context.storeTenantId}::uuid`,
    );
  } else {
    conditions.push(Prisma.sql`FALSE`);
  }
  return conditions;
}

function mapCategory(row: CategoryRow): KioskCatalogCategoryDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    audience: row.audience,
    productCount: Number(row.product_count),
  };
}

function mapRevision(
  context: { scope: CatalogScope; storeTenantId: string | null },
  stats: CatalogRevisionStatsRow,
  syncVersion: number,
): KioskCatalogRevisionDto {
  const productCount = Number(stats.product_count);
  const categoryCount = Number(stats.category_count);
  const updatedAt = stats.updated_at?.toISOString() ?? null;
  return {
    revision: [
      "commerce-tryon-2",
      context.scope,
      context.storeTenantId ?? "unassigned",
      productCount,
      categoryCount,
      updatedAt ?? "empty",
      `sync-${syncVersion}`,
    ].join(":"),
    scope: context.scope,
    storeTenantId: context.storeTenantId,
    productCount,
    categoryCount,
    updatedAt,
  };
}

function productImageCacheKey(
  row: Pick<
    ProductRow,
    "id" | "image_storage_key" | "image_url" | "updated_at"
  >,
): string {
  return [
    row.id,
    row.image_storage_key ?? row.image_url ?? "no-image",
    row.updated_at.toISOString(),
  ].join(":");
}

function boundedPositiveInt(
  value: number | undefined,
  fallback: number,
): number {
  if (!Number.isInteger(value) || value === undefined || value < 1) {
    return fallback;
  }
  return value;
}

function throwInvalidCatalogImage(): never {
  throw new ApiErrorException(
    HttpStatus.CONFLICT,
    TRY_ON_LAB_ERROR_CODES.imageInvalid,
    "Catalog product image is unavailable.",
  );
}
