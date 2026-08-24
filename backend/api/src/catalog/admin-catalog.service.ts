import { HttpStatus, Injectable } from "@nestjs/common";
import { CatalogProductScope, Prisma } from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { GarmentPreviewSettingsService } from "../try-on/garment-preview-settings.service.js";
import {
  type CreatePlatformProductDto,
  type CreatePlatformProductImageUploadDto,
  type PlatformProductDto,
  type PlatformProductImageUploadIntentDto,
  type PlatformProductListQueryDto,
  type PlatformProductListResponseDto,
  type UpdatePlatformProductDto,
} from "./dto/admin-catalog.dto.js";

export const ADMIN_CATALOG_ERROR_CODES = {
  productNotFound: "PLATFORM_PRODUCT_NOT_FOUND",
  productInvalid: "PLATFORM_PRODUCT_INVALID",
  productSlugConflict: "PLATFORM_PRODUCT_SLUG_CONFLICT",
} as const;

type PlatformProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  audience: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  active: boolean;
  vto_enabled: boolean;
  price_amount_cents: number | null;
  price_currency: string | null;
  product_url: string | null;
  garment_intent: string;
  garment_category: string;
  garment_photo_type: string;
  image_url: string | null;
  image_storage_key: string | null;
  image_content_type: string | null;
  image_width: number | null;
  image_height: number | null;
  created_at: Date;
  updated_at: Date;
};

const defaultPage = 1;
const defaultPageSize = 25;
const maxPageSize = 100;
const productUploadContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
const productUploadContentTypeSet = new Set<string>(productUploadContentTypes);
const maxProductImageBytes = 12 * 1024 * 1024;
const productUploadIntentTtlSeconds = 300;
const catalogReadUrlTtlSeconds = 900;

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly platformSettings: GarmentPreviewSettingsService,
  ) {}

  async listPlatformProducts(
    query: PlatformProductListQueryDto,
  ): Promise<PlatformProductListResponseDto> {
    const page = boundedPositiveInt(query.page, defaultPage);
    const pageSize = Math.min(
      boundedPositiveInt(query.pageSize, defaultPageSize),
      maxPageSize,
    );
    const where = platformProductWhere(query);
    const [countRows, rows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(*) AS total
        FROM products p
        INNER JOIN product_categories c ON c.id = p.category_id
        WHERE ${where}
      `,
      this.prisma.$queryRaw<PlatformProductRow[]>`
        ${platformProductSelect()}
        WHERE ${where}
        ORDER BY c.sort_order ASC, p.sort_order ASC, p.name ASC, p.id ASC
        LIMIT ${pageSize}
        OFFSET ${(page - 1) * pageSize}
      `,
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    return {
      data: rows.map((row) => this.mapPlatformProduct(row)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        hasMore: page * pageSize < total,
      },
    };
  }

  async createPlatformProduct(
    input: CreatePlatformProductDto,
  ): Promise<PlatformProductDto> {
    const audience = input.audience?.trim().toUpperCase() || "UNISEX";
    const category = await this.ensurePlatformProductCategory(
      input.categoryName,
      audience,
    );
    const productId = createSelfxId();
    const slug = normalizeProductSlug(input.slug ?? slugFromName(input.name));
    const image = normalizeProductImage(input.image);
    const price = normalizePrice(
      input.priceAmountCents,
      input.priceCurrency,
      await this.platformSettings.platformDefaultCurrency(),
    );
    try {
      await this.prisma.$executeRaw`
        INSERT INTO products (
          id,
          catalog_key,
          scope,
          organization_id,
          category_id,
          name,
          slug,
          description,
          audience,
          active,
          vto_enabled,
          price_amount_cents,
          price_currency,
          product_url,
          garment_intent,
          garment_category,
          garment_photo_type,
          image_url,
          image_storage_key,
          image_content_type,
          image_width,
          image_height
        )
        VALUES (
          ${productId}::uuid,
          ${platformProductCatalogKey(audience, slug)},
          ${CatalogProductScope.PLATFORM_DEFAULT}::"CatalogProductScope",
          NULL,
          ${category.id}::uuid,
          ${input.name.trim()},
          ${slug},
          ${nullableTrim(input.description ?? undefined)},
          ${audience},
          ${input.active ?? true},
          ${input.vtoEnabled ?? true},
          ${price.amountCents},
          ${price.currency},
          ${nullableTrim(input.productUrl ?? undefined)},
          ${input.garmentIntent?.trim() || "TOP"},
          ${input.garmentCategory?.trim() || "TOP"},
          ${input.garmentPhotoType?.trim() || "AUTO"},
          ${image.url},
          ${image.storageKey},
          ${image.contentType},
          ${image.width},
          ${image.height}
        )
      `;
      return this.getPlatformProduct(productId);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throwProductSlugConflict();
      }
      throw error;
    }
  }

  async updatePlatformProduct(
    productId: string,
    input: UpdatePlatformProductDto,
  ): Promise<PlatformProductDto> {
    const existing = await this.requirePlatformProduct(productId);
    const audience = input.audience?.trim().toUpperCase() || existing.audience;
    const assignments: Prisma.Sql[] = [];
    if (input.name !== undefined) {
      assignments.push(Prisma.sql`name = ${input.name.trim()}`);
    }
    if (input.slug !== undefined || input.audience !== undefined) {
      const slug = normalizeProductSlug(input.slug ?? existing.slug);
      assignments.push(Prisma.sql`slug = ${slug}`);
      assignments.push(Prisma.sql`audience = ${audience}`);
      assignments.push(
        Prisma.sql`catalog_key = ${platformProductCatalogKey(audience, slug)}`,
      );
    }
    if (input.categoryName !== undefined || input.audience !== undefined) {
      const category = await this.ensurePlatformProductCategory(
        input.categoryName ?? existing.category_name,
        audience,
      );
      assignments.push(Prisma.sql`category_id = ${category.id}::uuid`);
    }
    if (input.description !== undefined) {
      assignments.push(
        Prisma.sql`description = ${nullableTrim(input.description ?? undefined)}`,
      );
    }
    if (input.priceAmountCents !== undefined || input.priceCurrency !== undefined) {
      const price = normalizePrice(
        input.priceAmountCents,
        input.priceCurrency,
        await this.platformSettings.platformDefaultCurrency(),
      );
      if (input.priceAmountCents !== undefined) {
        assignments.push(Prisma.sql`price_amount_cents = ${price.amountCents}`);
      }
      assignments.push(Prisma.sql`price_currency = ${price.currency}`);
    }
    if (input.productUrl !== undefined) {
      assignments.push(
        Prisma.sql`product_url = ${nullableTrim(input.productUrl ?? undefined)}`,
      );
    }
    if (input.garmentIntent !== undefined) {
      assignments.push(
        Prisma.sql`garment_intent = ${input.garmentIntent.trim() || "TOP"}`,
      );
    }
    if (input.garmentCategory !== undefined) {
      assignments.push(
        Prisma.sql`garment_category = ${input.garmentCategory.trim() || "TOP"}`,
      );
    }
    if (input.garmentPhotoType !== undefined) {
      assignments.push(
        Prisma.sql`garment_photo_type = ${input.garmentPhotoType.trim() || "AUTO"}`,
      );
    }
    if (input.active !== undefined) {
      assignments.push(Prisma.sql`active = ${input.active}`);
    }
    if (input.vtoEnabled !== undefined) {
      assignments.push(Prisma.sql`vto_enabled = ${input.vtoEnabled}`);
    }
    if (input.image !== undefined) {
      const image = normalizeProductImage(input.image);
      assignments.push(Prisma.sql`image_url = ${image.url}`);
      assignments.push(Prisma.sql`image_storage_key = ${image.storageKey}`);
      assignments.push(Prisma.sql`image_content_type = ${image.contentType}`);
      assignments.push(Prisma.sql`image_width = ${image.width}`);
      assignments.push(Prisma.sql`image_height = ${image.height}`);
    }
    if (assignments.length === 0) {
      return this.mapPlatformProduct(existing);
    }
    assignments.push(Prisma.sql`updated_at = CURRENT_TIMESTAMP`);
    try {
      await this.prisma.$executeRaw`
        UPDATE products
        SET ${Prisma.join(assignments, ", ")}
        WHERE id = ${productId}::uuid
          AND scope::text = 'PLATFORM_DEFAULT'
          AND organization_id IS NULL
      `;
      return this.getPlatformProduct(productId);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throwProductSlugConflict();
      }
      throw error;
    }
  }

  async createPlatformProductImageUploadIntent(
    input: CreatePlatformProductImageUploadDto,
  ): Promise<PlatformProductImageUploadIntentDto> {
    const contentType = normalizeUploadedImageContentType(input.contentType);
    if (!contentType || input.sizeBytes > maxProductImageBytes) {
      throwProductInvalid("Product image upload is invalid.");
    }
    const storageKey = platformProductImageObjectKeyFor(contentType);
    const now = new Date();
    return {
      storageKey,
      uploadUrl: this.storage.createUploadUrl({
        key: storageKey,
        contentType,
        expiresInSeconds: productUploadIntentTtlSeconds,
      }),
      method: "PUT",
      expiresAt: new Date(
        now.getTime() + productUploadIntentTtlSeconds * 1000,
      ).toISOString(),
      headers: { "Content-Type": contentType },
      maxImageBytes: maxProductImageBytes,
      supportedContentTypes: [...productUploadContentTypes],
    };
  }

  private async getPlatformProduct(
    productId: string,
  ): Promise<PlatformProductDto> {
    return this.mapPlatformProduct(await this.requirePlatformProduct(productId));
  }

  private async requirePlatformProduct(
    productId: string,
  ): Promise<PlatformProductRow> {
    const rows = await this.prisma.$queryRaw<PlatformProductRow[]>`
      ${platformProductSelect()}
      WHERE p.id = ${productId}::uuid
        AND p.scope::text = 'PLATFORM_DEFAULT'
        AND p.organization_id IS NULL
      LIMIT 1
    `;
    if (!rows[0]) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        ADMIN_CATALOG_ERROR_CODES.productNotFound,
        "Platform product was not found.",
      );
    }
    return rows[0];
  }

  private async ensurePlatformProductCategory(
    name: string,
    audience: string,
  ): Promise<{ id: string; name: string; slug: string }> {
    const categoryName = name.trim();
    if (!categoryName) {
      throwProductInvalid("Product category is required.");
    }
    const slug = slugFromName(categoryName);
    const catalogKey = `platform:category:${audience.toLowerCase()}:${slug}`;
    const existing = await this.prisma.productCategory.findUnique({
      where: { catalogKey },
      select: { id: true, name: true, slug: true },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.productCategory.create({
      data: {
        id: createSelfxId(),
        catalogKey,
        scope: CatalogProductScope.PLATFORM_DEFAULT,
        organizationId: null,
        name: categoryName,
        slug,
        audience,
        active: true,
      },
      select: { id: true, name: true, slug: true },
    });
  }

  private mapPlatformProduct(row: PlatformProductRow): PlatformProductDto {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      audience: row.audience,
      categoryId: row.category_id,
      categoryName: row.category_name,
      categorySlug: row.category_slug,
      active: row.active,
      vtoEnabled: row.vto_enabled,
      priceAmountCents: row.price_amount_cents,
      priceCurrency: row.price_currency,
      productUrl: row.product_url,
      garmentIntent: row.garment_intent,
      garmentCategory: row.garment_category,
      garmentPhotoType: row.garment_photo_type,
      image: {
        url: row.image_url ?? this.productReadUrl(row.image_storage_key),
        storageKey: row.image_storage_key,
        contentType: row.image_content_type,
        width: row.image_width,
        height: row.image_height,
      },
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private productReadUrl(storageKey: string | null): string | null {
    if (!storageKey) {
      return null;
    }
    return this.storage.createReadUrl({
      key: storageKey,
      expiresInSeconds: catalogReadUrlTtlSeconds,
    });
  }
}

function platformProductWhere(query: PlatformProductListQueryDto): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p.scope::text = 'PLATFORM_DEFAULT'`,
    Prisma.sql`p.organization_id IS NULL`,
  ];
  const search = query.search?.trim();
  if (search) {
    conditions.push(
      Prisma.sql`(p.name ILIKE ${`%${search}%`} OR p.slug ILIKE ${`%${search.toLowerCase()}%`} OR c.name ILIKE ${`%${search}%`})`,
    );
  }
  if (query.status === "ACTIVE") {
    conditions.push(Prisma.sql`p.active = true`);
  } else if (query.status === "INACTIVE") {
    conditions.push(Prisma.sql`p.active = false`);
  } else if (query.status === "VTO_ENABLED") {
    conditions.push(Prisma.sql`p.active = true`);
    conditions.push(Prisma.sql`p.vto_enabled = true`);
  }
  return Prisma.join(conditions, " AND ");
}

function platformProductSelect(): Prisma.Sql {
  return Prisma.sql`
    SELECT
      p.id,
      p.name,
      p.slug,
      p.description,
      p.audience,
      p.category_id,
      c.name AS category_name,
      c.slug AS category_slug,
      p.active,
      p.vto_enabled,
      p.price_amount_cents,
      p.price_currency,
      p.product_url,
      p.garment_intent,
      p.garment_category,
      p.garment_photo_type,
      p.image_url,
      p.image_storage_key,
      p.image_content_type,
      p.image_width,
      p.image_height,
      p.created_at,
      p.updated_at
    FROM products p
    INNER JOIN product_categories c ON c.id = p.category_id
  `;
}

function boundedPositiveInt(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value && value > 0 ? value : fallback;
}

function slugFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || `product-${createSelfxId()}`;
}

function normalizeProductSlug(value: string): string {
  const slug = slugFromName(value).slice(0, 160);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throwProductInvalid("Product slug must be URL-safe.");
  }
  return slug;
}

function platformProductCatalogKey(audience: string, slug: string): string {
  return `platform:product:${audience.toLowerCase()}:${slug}`;
}

function normalizeProductImage(
  image:
    | {
        url?: string | null;
        storageKey?: string | null;
        contentType?: string | null;
        width?: number | null;
        height?: number | null;
      }
    | null
    | undefined,
): {
  url: string | null;
  storageKey: string | null;
  contentType: string | null;
  width: number | null;
  height: number | null;
} {
  const url = nullableTrim(image?.url ?? undefined);
  const storageKey = nullableTrim(image?.storageKey ?? undefined);
  if (!url && !storageKey) {
    throwProductInvalid("Product image is required.");
  }
  if (storageKey && !storageKey.startsWith("catalog/platform/")) {
    throwProductInvalid("Product image upload does not belong to the platform catalog.");
  }
  return {
    url,
    storageKey,
    contentType: nullableTrim(image?.contentType ?? undefined),
    width: positiveIntOrNull(image?.width),
    height: positiveIntOrNull(image?.height),
  };
}

function normalizePrice(
  amountCents: number | null | undefined,
  currency: string | null | undefined,
  defaultCurrency: string,
): { amountCents: number | null; currency: string | null } {
  if (amountCents === null) {
    return { amountCents: null, currency: null };
  }
  if (amountCents === undefined) {
    return {
      amountCents: null,
      currency: nullableTrim(currency ?? undefined)?.toUpperCase() ?? null,
    };
  }
  return {
    amountCents,
    currency:
      nullableTrim(currency ?? undefined)?.toUpperCase() ?? defaultCurrency,
  };
}

function normalizeUploadedImageContentType(value: string): string | null {
  const contentType = value.split(";")[0]?.trim().toLowerCase();
  return contentType && productUploadContentTypeSet.has(contentType)
    ? contentType
    : null;
}

function platformProductImageObjectKeyFor(contentType: string): string {
  const extension =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : "jpg";
  return `catalog/platform/${createSelfxId()}.${extension}`;
}

function positiveIntOrNull(value: number | null | undefined): number | null {
  return Number.isInteger(value) && value && value > 0 ? value : null;
}

function nullableTrim(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" ||
      (error.code === "P2010" &&
        isRecord(error.meta) &&
        error.meta.code === "23505"))
  );
}

function throwProductInvalid(message: string): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    ADMIN_CATALOG_ERROR_CODES.productInvalid,
    message,
  );
}

function throwProductSlugConflict(): never {
  throw new ApiErrorException(
    HttpStatus.CONFLICT,
    ADMIN_CATALOG_ERROR_CODES.productSlugConflict,
    "Platform product slug is already in use for this audience.",
  );
}
