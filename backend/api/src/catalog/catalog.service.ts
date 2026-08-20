import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import {
  type KioskCatalogCategoryDto,
  type KioskCatalogCategoryListResponseDto,
  type KioskCatalogCategoryQueryDto,
  type KioskCatalogProductDto,
  type KioskCatalogProductListResponseDto,
  type KioskCatalogQueryDto,
} from "./dto/kiosk-catalog.dto.js";

const defaultPage = 1;
const defaultPageSize = 20;
const maxPageSize = 100;
const catalogReadUrlTtlSeconds = 900;

type CatalogScope = "PLATFORM_DEFAULT" | "STORE";

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  audience: string;
  garment_intent: string;
  garment_category: string;
  garment_photo_type: string;
  image_url: string | null;
  image_storage_key: string | null;
  image_content_type: string | null;
  image_width: number | null;
  image_height: number | null;
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

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
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
    const context = await this.resolveCatalogContext(storeTenantId);
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
          p.id,
          p.name,
          p.description,
          p.audience,
          p.garment_intent,
          p.garment_category,
          p.garment_photo_type,
          p.image_url,
          p.image_storage_key,
          p.image_content_type,
          p.image_width,
          p.image_height,
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
    const context = await this.resolveCatalogContext(storeTenantId);
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

  private async resolveCatalogContext(
    storeTenantId: string | null,
  ): Promise<{ scope: CatalogScope; storeTenantId: string | null }> {
    if (!storeTenantId) {
      return { scope: "PLATFORM_DEFAULT", storeTenantId: null };
    }
    const rows = await this.prisma.$queryRaw<Array<{ has_products: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM products p
        INNER JOIN product_categories c ON c.id = p.category_id
        WHERE p.scope::text = 'STORE'
          AND p.organization_id = ${storeTenantId}::uuid
          AND p.active = true
          AND p.vto_enabled = true
          AND c.active = true
        LIMIT 1
      ) AS has_products
    `;
    return rows[0]?.has_products
      ? { scope: "STORE", storeTenantId }
      : { scope: "PLATFORM_DEFAULT", storeTenantId: null };
  }

  private mapProduct(row: ProductRow): KioskCatalogProductDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
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
      image: {
        url: row.image_url ?? this.catalogReadUrl(row.image_storage_key),
        contentType: row.image_content_type,
        width: row.image_width,
        height: row.image_height,
      },
    };
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
}

function productWhere(
  context: { scope: CatalogScope; storeTenantId: string | null },
  query: KioskCatalogQueryDto,
): Prisma.Sql {
  const conditions = baseProductConditions(context);
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
  const conditions = baseProductConditions(context);
  if (query.audience) {
    conditions.push(Prisma.sql`p.audience = ${query.audience}`);
  }
  return Prisma.join(conditions, " AND ");
}

function baseProductConditions(context: {
  scope: CatalogScope;
  storeTenantId: string | null;
}): Prisma.Sql[] {
  const conditions = [
    Prisma.sql`p.scope::text = ${context.scope}`,
    Prisma.sql`p.active = true`,
    Prisma.sql`p.vto_enabled = true`,
    Prisma.sql`c.active = true`,
  ];
  if (context.scope === "STORE" && context.storeTenantId) {
    conditions.push(
      Prisma.sql`p.organization_id = ${context.storeTenantId}::uuid`,
    );
  } else {
    conditions.push(Prisma.sql`p.organization_id IS NULL`);
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

function boundedPositiveInt(value: number | undefined, fallback: number): number {
  if (!Number.isInteger(value) || value === undefined || value < 1) {
    return fallback;
  }
  return value;
}
