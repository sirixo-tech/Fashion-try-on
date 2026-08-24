import { HttpStatus, Injectable, Optional } from "@nestjs/common";
import {
  CatalogProductScope,
  KioskAssignmentScope,
  KioskDeviceStatus,
  OrganizationStatus,
  Prisma,
  type KioskDevice,
  type KioskDeviceConfiguration,
  type Organization,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { KioskService, mapDevice } from "../kiosks/kiosk.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import {
  GarmentPreviewSettingsService,
  type StoreGarmentPreviewSettingsDto,
} from "../try-on/garment-preview-settings.service.js";
import {
  AdminStoreStatus,
  type AdminStoreDetailResponseDto,
  type AdminStoreListQueryDto,
  type AdminStoreListResponseDto,
  type AdminStoreResponseDto,
  type CreateStoreProductDto,
  type CreateStoreProductImageUploadDto,
  type CreateAdminStoreDto,
  type PairStoreKioskDto,
  type StoreKioskDeviceResponseDto,
  type StoreKioskPairResponseDto,
  type StoreProductDto,
  type StoreProductListQueryDto,
  type StoreProductListResponseDto,
  type StoreProductImageUploadIntentDto,
  type UpdateStoreProductDto,
  type UpdateAdminStoreDto,
  pairStoreKioskToPairKioskDto,
} from "./dto/admin-store.dto.js";

export const STORE_ERROR_CODES = {
  storeNotFound: "STORE_NOT_FOUND",
  storeInactive: "STORE_INACTIVE",
  storeSlugConflict: "STORE_SLUG_CONFLICT",
  storeFeatureUnavailable: "STORE_FEATURE_UNAVAILABLE",
  kioskNotFound: "KIOSK_NOT_FOUND",
  kioskStoreMismatch: "KIOSK_STORE_MISMATCH",
  productNotFound: "PRODUCT_NOT_FOUND",
  productInvalid: "PRODUCT_INVALID",
  productSlugConflict: "PRODUCT_SLUG_CONFLICT",
} as const;

type DeviceWithAssignment = KioskDevice & {
  organization: { id: string; name: string } | null;
  store: { id: string; name: string } | null;
  configuration?: Pick<KioskDeviceConfiguration, "version"> | null;
};

type StoreProfile = {
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

type StoreStats = {
  totalKiosks: number;
  activeKiosks: number;
  offlineKiosks: number;
  lastActivityAt: Date | null;
};

type StoreProductRow = {
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
export class AdminStoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kiosks: KioskService,
    private readonly rbac: StoreRbacService,
    private readonly garmentPreviewSettings: GarmentPreviewSettingsService,
    @Optional() private readonly storage?: ObjectStorageService,
  ) {}

  async listStores(
    query: AdminStoreListQueryDto,
  ): Promise<AdminStoreListResponseDto> {
    const page = boundedPositiveInt(query.page, defaultPage);
    const pageSize = Math.min(
      boundedPositiveInt(query.pageSize, defaultPageSize),
      maxPageSize,
    );
    const where = storeWhere(query);
    const [total, stores] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        orderBy: storeOrderBy(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const stats = await this.kioskStatsForStores(
      stores.map((store) => store.id),
    );
    return {
      data: stores.map((store) => mapStore(store, stats.get(store.id))),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        hasMore: page * pageSize < total,
      },
    };
  }

  async createStore(
    input: CreateAdminStoreDto,
  ): Promise<AdminStoreResponseDto> {
    const slug = normalizeSlug(input.slug ?? slugFromName(input.name));
    try {
      const store = await this.prisma.$transaction(async (tx) => {
        const created = await tx.organization.create({
          data: {
            id: createSelfxId(),
            name: input.name.trim(),
            slug,
            status: OrganizationStatus.ACTIVE,
            timezone: input.timezone?.trim() || "UTC",
            settings: storeSettingsFromInput(input),
          },
        });
        await this.rbac.ensureStoreRbacInTransaction(tx, created.id, true);
        return created;
      });
      return mapStore(store);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ApiErrorException(
          HttpStatus.CONFLICT,
          STORE_ERROR_CODES.storeSlugConflict,
          "Store slug is already in use.",
        );
      }
      throw error;
    }
  }

  async getStore(storeId: string): Promise<AdminStoreDetailResponseDto> {
    const store = await this.findStoreOrThrow(storeId);
    const stats = await this.kioskStatsForStores([store.id]);
    return {
      ...mapStore(store, stats.get(store.id)),
      kiosks: await this.listStoreKiosks(store.id),
    };
  }

  async getVirtualTryOnSettings(
    storeId: string,
  ): Promise<StoreGarmentPreviewSettingsDto> {
    await this.findStoreOrThrow(storeId);
    return this.garmentPreviewSettings.storeSettings(storeId);
  }

  async updateVirtualTryOnSettings(
    storeId: string,
    input: { garmentPreviewEnabled: boolean },
  ): Promise<StoreGarmentPreviewSettingsDto> {
    const store = await this.findStoreOrThrow(storeId);
    const current = await this.garmentPreviewSettings.storeSettings(storeId);
    if (
      input.garmentPreviewEnabled &&
      (!current.platformGarmentPreviewEnabled ||
        !current.storeHasGarmentPreviewPermission)
    ) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        STORE_ERROR_CODES.storeFeatureUnavailable,
        "Captured garment preview is not available for this Store.",
      );
    }
    const settings = this.garmentPreviewSettings.storeSettingsFromValue(
      store.settings,
      input.garmentPreviewEnabled,
    );
    await this.prisma.organization.update({
      where: { id: storeId },
      data: { settings },
    });
    return this.garmentPreviewSettings.storeSettings(storeId);
  }

  async updateStore(
    storeId: string,
    input: UpdateAdminStoreDto,
  ): Promise<AdminStoreResponseDto> {
    await this.findStoreOrThrow(storeId);
    try {
      const updated = await this.prisma.organization.update({
        where: { id: storeId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.slug !== undefined
            ? { slug: normalizeSlug(input.slug) }
            : {}),
          ...(input.status !== undefined
            ? { status: organizationStatusFromStoreStatus(input.status) }
            : {}),
          ...(input.timezone !== undefined
            ? { timezone: input.timezone.trim() || "UTC" }
            : {}),
          settings: await this.updatedStoreSettings(storeId, input),
        },
      });
      return mapStore(updated);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ApiErrorException(
          HttpStatus.CONFLICT,
          STORE_ERROR_CODES.storeSlugConflict,
          "Store slug is already in use.",
        );
      }
      throw error;
    }
  }

  async deactivateStore(storeId: string): Promise<AdminStoreResponseDto> {
    await this.findStoreOrThrow(storeId);
    const store = await this.prisma.organization.update({
      where: { id: storeId },
      data: { status: OrganizationStatus.SUSPENDED },
    });
    return mapStore(store);
  }

  async activateStore(storeId: string): Promise<AdminStoreResponseDto> {
    await this.findStoreOrThrow(storeId);
    const store = await this.prisma.organization.update({
      where: { id: storeId },
      data: { status: OrganizationStatus.ACTIVE },
    });
    return mapStore(store);
  }

  async listStoreKiosks(storeId: string) {
    await this.findStoreOrThrow(storeId);
    const data = await this.prisma.kioskDevice.findMany({
      where: {
        organizationId: storeId,
        status: { not: KioskDeviceStatus.DELETED },
      },
      include: assignmentInclude(),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return { data: data.map((device) => mapDevice(device)) };
  }

  async listStoreProducts(
    storeId: string,
    query: StoreProductListQueryDto,
  ): Promise<StoreProductListResponseDto> {
    await this.findStoreOrThrow(storeId);
    const page = boundedPositiveInt(query.page, defaultPage);
    const pageSize = Math.min(
      boundedPositiveInt(query.pageSize, defaultPageSize),
      maxPageSize,
    );
    const where = storeProductWhere(storeId, query);
    const [countRows, rows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(*) AS total
        FROM products p
        INNER JOIN product_categories c ON c.id = p.category_id
        WHERE ${where}
      `,
      this.prisma.$queryRaw<StoreProductRow[]>`
        ${storeProductSelect()}
        WHERE ${where}
        ORDER BY p.updated_at DESC, p.name ASC, p.id ASC
        LIMIT ${pageSize}
        OFFSET ${(page - 1) * pageSize}
      `,
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    return {
      data: rows.map((row) => this.mapStoreProduct(row)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        hasMore: page * pageSize < total,
      },
    };
  }

  async createStoreProduct(
    storeId: string,
    input: CreateStoreProductDto,
  ): Promise<StoreProductDto> {
    await this.findStoreOrThrow(storeId);
    const category = await this.ensureStoreProductCategory(
      storeId,
      input.categoryName,
      input.audience,
    );
    const productId = createSelfxId();
    const slug = normalizeProductSlug(input.slug ?? slugFromName(input.name));
    const image = normalizeProductImage(storeId, input.image);
    const price = normalizePrice(input.priceAmountCents, input.priceCurrency);
    try {
      const rows = await this.prisma.$queryRaw<StoreProductRow[]>`
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
          ${storeProductCatalogKey(storeId, slug)},
          ${CatalogProductScope.STORE}::"CatalogProductScope",
          ${storeId}::uuid,
          ${category.id}::uuid,
          ${input.name.trim()},
          ${slug},
          ${nullableTrim(input.description ?? undefined)},
          ${input.audience?.trim() || "all"},
          ${input.active ?? true},
          ${input.vtoEnabled ?? true},
          ${price.amountCents},
          ${price.currency},
          ${nullableTrim(input.productUrl ?? undefined)},
          ${input.garmentIntent?.trim() || "TOP"},
          ${input.garmentCategory?.trim() || "TOPS"},
          ${input.garmentPhotoType?.trim() || "AUTO"},
          ${image.url},
          ${image.storageKey},
          ${image.contentType},
          ${image.width},
          ${image.height}
        )
        RETURNING
          id,
          name,
          slug,
          description,
          audience,
          category_id,
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
          image_height,
          created_at,
          updated_at,
          (SELECT name FROM product_categories WHERE id = category_id) AS category_name,
          (SELECT slug FROM product_categories WHERE id = category_id) AS category_slug
      `;
      const created = rows[0];
      if (!created) {
        throwProductInvalid("Product could not be created.");
      }
      return this.mapStoreProduct(created);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ApiErrorException(
          HttpStatus.CONFLICT,
          STORE_ERROR_CODES.productSlugConflict,
          "Product slug is already in use for this Store.",
        );
      }
      throw error;
    }
  }

  async updateStoreProduct(
    storeId: string,
    productId: string,
    input: UpdateStoreProductDto,
  ): Promise<StoreProductDto> {
    await this.findStoreOrThrow(storeId);
    await this.requireStoreProduct(storeId, productId);
    const assignments: Prisma.Sql[] = [];
    if (input.name !== undefined) {
      assignments.push(Prisma.sql`name = ${input.name.trim()}`);
    }
    if (input.slug !== undefined) {
      const slug = normalizeProductSlug(input.slug);
      assignments.push(Prisma.sql`slug = ${slug}`);
      assignments.push(
        Prisma.sql`catalog_key = ${storeProductCatalogKey(storeId, slug)}`,
      );
    }
    if (input.categoryName !== undefined) {
      const category = await this.ensureStoreProductCategory(
        storeId,
        input.categoryName,
        input.audience,
      );
      assignments.push(Prisma.sql`category_id = ${category.id}::uuid`);
    }
    if (input.description !== undefined) {
      assignments.push(
        Prisma.sql`description = ${nullableTrim(input.description ?? undefined)}`,
      );
    }
    if (input.audience !== undefined) {
      assignments.push(Prisma.sql`audience = ${input.audience.trim() || "all"}`);
    }
    if (
      input.priceAmountCents !== undefined ||
      input.priceCurrency !== undefined
    ) {
      const price = normalizePrice(input.priceAmountCents, input.priceCurrency);
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
        Prisma.sql`garment_category = ${input.garmentCategory.trim() || "TOPS"}`,
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
      const image = normalizeProductImage(storeId, input.image);
      assignments.push(Prisma.sql`image_url = ${image.url}`);
      assignments.push(Prisma.sql`image_storage_key = ${image.storageKey}`);
      assignments.push(Prisma.sql`image_content_type = ${image.contentType}`);
      assignments.push(Prisma.sql`image_width = ${image.width}`);
      assignments.push(Prisma.sql`image_height = ${image.height}`);
    }
    if (assignments.length === 0) {
      return this.getStoreProduct(storeId, productId);
    }
    assignments.push(Prisma.sql`updated_at = CURRENT_TIMESTAMP`);
    try {
      const rows = await this.prisma.$queryRaw<StoreProductRow[]>`
        UPDATE products
        SET ${Prisma.join(assignments, ", ")}
        WHERE id = ${productId}::uuid
          AND scope::text = 'STORE'
          AND organization_id = ${storeId}::uuid
        RETURNING
          id,
          name,
          slug,
          description,
          audience,
          category_id,
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
          image_height,
          created_at,
          updated_at,
          (SELECT name FROM product_categories WHERE id = category_id) AS category_name,
          (SELECT slug FROM product_categories WHERE id = category_id) AS category_slug
      `;
      if (!rows[0]) {
        throwStoreProductNotFound();
      }
      return this.mapStoreProduct(rows[0]);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ApiErrorException(
          HttpStatus.CONFLICT,
          STORE_ERROR_CODES.productSlugConflict,
          "Product slug is already in use for this Store.",
        );
      }
      throw error;
    }
  }

  async createStoreProductImageUploadIntent(
    storeId: string,
    input: CreateStoreProductImageUploadDto,
  ): Promise<StoreProductImageUploadIntentDto> {
    await this.findStoreOrThrow(storeId);
    const contentType = normalizeUploadedImageContentType(input.contentType);
    if (!contentType || input.sizeBytes > maxProductImageBytes) {
      throwProductInvalid("Product image upload is invalid.");
    }
    const storageKey = storeProductImageObjectKeyFor(storeId, contentType);
    const now = new Date();
    return {
      storageKey,
      uploadUrl: this.requireStorage().createUploadUrl({
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

  async pairStoreKiosk(
    actorUserId: string,
    storeId: string,
    input: PairStoreKioskDto,
  ): Promise<StoreKioskPairResponseDto> {
    const store = await this.findStoreOrThrow(storeId);
    assertStoreActive(store);
    return {
      device: await this.kiosks.pairKiosk(
        actorUserId,
        pairStoreKioskToPairKioskDto(input, store.id),
      ),
    };
  }

  async assignKioskToStore(
    actorUserId: string,
    storeId: string,
    kioskDeviceId: string,
  ): Promise<StoreKioskDeviceResponseDto> {
    const store = await this.findStoreOrThrow(storeId);
    assertStoreActive(store);
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.kioskDevice.findUnique({
        where: { id: kioskDeviceId },
      });
      if (!existing || existing.status === KioskDeviceStatus.DELETED) {
        throw new ApiErrorException(
          HttpStatus.NOT_FOUND,
          STORE_ERROR_CODES.kioskNotFound,
          "Kiosk device was not found.",
        );
      }
      const device = await tx.kioskDevice.update({
        where: { id: kioskDeviceId },
        data: {
          assignmentScope: KioskAssignmentScope.ORGANIZATION,
          organizationId: store.id,
          storeId: null,
        },
        include: assignmentInclude(),
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          action: "KIOSK_ASSIGNED",
          actorUserId,
          organizationId: store.id,
          resourceType: "kiosk_device",
          resourceId: kioskDeviceId,
          metadata: {
            assignment_scope: KioskAssignmentScope.ORGANIZATION,
            product_store_id: store.id,
          },
        },
      });
      return device;
    });
    return mapDevice(updated);
  }

  async getStoreKiosk(
    storeId: string,
    kioskDeviceId: string,
  ): Promise<StoreKioskDeviceResponseDto> {
    return mapDevice(await this.requireKioskInStore(storeId, kioskDeviceId));
  }

  async requireKioskInStore(
    storeId: string,
    kioskDeviceId: string,
  ): Promise<DeviceWithAssignment> {
    await this.findStoreOrThrow(storeId);
    const device = await this.prisma.kioskDevice.findUnique({
      where: { id: kioskDeviceId },
      include: assignmentInclude(),
    });
    if (!device || device.status === KioskDeviceStatus.DELETED) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        STORE_ERROR_CODES.kioskNotFound,
        "Kiosk device was not found.",
      );
    }
    if (device.organizationId !== storeId) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        STORE_ERROR_CODES.kioskStoreMismatch,
        "Kiosk device was not found for this store.",
      );
    }
    return device;
  }

  private async getStoreProduct(
    storeId: string,
    productId: string,
  ): Promise<StoreProductDto> {
    const rows = await this.prisma.$queryRaw<StoreProductRow[]>`
      ${storeProductSelect()}
      WHERE p.id = ${productId}::uuid
        AND p.scope::text = 'STORE'
        AND p.organization_id = ${storeId}::uuid
      LIMIT 1
    `;
    if (!rows[0]) {
      throwStoreProductNotFound();
    }
    return this.mapStoreProduct(rows[0]);
  }

  private async requireStoreProduct(
    storeId: string,
    productId: string,
  ): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM products
      WHERE id = ${productId}::uuid
        AND scope::text = 'STORE'
        AND organization_id = ${storeId}::uuid
      LIMIT 1
    `;
    if (!rows[0]) {
      throwStoreProductNotFound();
    }
  }

  private async ensureStoreProductCategory(
    storeId: string,
    name: string,
    audience?: string,
  ): Promise<{ id: string; name: string; slug: string }> {
    const categoryName = name.trim();
    if (!categoryName) {
      throwProductInvalid("Product category is required.");
    }
    const slug = slugFromName(categoryName);
    const catalogKey = `store:${storeId}:category:${slug}`;
    const existing = await this.prisma.productCategory.findUnique({
      where: { catalogKey },
      select: { id: true, name: true, slug: true },
    });
    if (existing) {
      return existing;
    }
    const created = await this.prisma.productCategory.create({
      data: {
        id: createSelfxId(),
        catalogKey,
        scope: CatalogProductScope.STORE,
        organizationId: storeId,
        name: categoryName,
        slug,
        audience: audience?.trim() || null,
        active: true,
      },
      select: { id: true, name: true, slug: true },
    });
    return created;
  }

  private mapStoreProduct(row: StoreProductRow): StoreProductDto {
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
    return this.requireStorage().createReadUrl({
      key: storageKey,
      expiresInSeconds: catalogReadUrlTtlSeconds,
    });
  }

  private requireStorage(): ObjectStorageService {
    if (!this.storage) {
      throw new ApiErrorException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "OBJECT_STORAGE_NOT_CONFIGURED",
        "Object storage is not configured for product images.",
      );
    }
    return this.storage;
  }

  private async findStoreOrThrow(storeId: string): Promise<Organization> {
    const store = await this.prisma.organization.findUnique({
      where: { id: storeId },
    });
    if (!store) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        STORE_ERROR_CODES.storeNotFound,
        "Store was not found.",
      );
    }
    return store;
  }

  private async updatedStoreSettings(
    storeId: string,
    input: UpdateAdminStoreDto,
  ): Promise<Prisma.InputJsonValue | undefined> {
    const profileInput = storeProfileInput(input);
    if (Object.keys(profileInput).length === 0) {
      return undefined;
    }
    const existing = await this.prisma.organization.findUnique({
      where: { id: storeId },
      select: { settings: true },
    });
    return mergeStoreProfile(existing?.settings, profileInput);
  }

  private async kioskStatsForStores(
    storeIds: string[],
  ): Promise<Map<string, StoreStats>> {
    const stats = new Map<string, StoreStats>();
    for (const storeId of storeIds) {
      stats.set(storeId, {
        totalKiosks: 0,
        activeKiosks: 0,
        offlineKiosks: 0,
        lastActivityAt: null,
      });
    }
    if (storeIds.length === 0) {
      return stats;
    }
    const grouped = await this.prisma.kioskDevice.groupBy({
      by: ["organizationId", "status"],
      where: {
        organizationId: { in: storeIds },
        status: { not: KioskDeviceStatus.DELETED },
      },
      _count: { _all: true },
      _max: { lastSeenAt: true },
    });
    for (const row of grouped) {
      if (!row.organizationId) {
        continue;
      }
      const current = stats.get(row.organizationId);
      if (!current) {
        continue;
      }
      current.totalKiosks += row._count._all;
      if (row.status === KioskDeviceStatus.ACTIVE) {
        current.activeKiosks += row._count._all;
      }
      if (
        row._max.lastSeenAt &&
        (!current.lastActivityAt ||
          row._max.lastSeenAt > current.lastActivityAt)
      ) {
        current.lastActivityAt = row._max.lastSeenAt;
      }
    }
    return stats;
  }
}

function storeWhere(
  query: AdminStoreListQueryDto,
): Prisma.OrganizationWhereInput {
  const search = query.search?.trim();
  return {
    ...(query.status ? { status: organizationStatusFilter(query.status) } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search.toLowerCase(), mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

function storeProductWhere(
  storeId: string,
  query: StoreProductListQueryDto,
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p.scope::text = 'STORE'`,
    Prisma.sql`p.organization_id = ${storeId}::uuid`,
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

function storeProductSelect(): Prisma.Sql {
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

function organizationStatusFilter(
  status: AdminStoreStatus,
): Prisma.EnumOrganizationStatusFilter | OrganizationStatus {
  if (status === AdminStoreStatus.ACTIVE) {
    return OrganizationStatus.ACTIVE;
  }
  return { not: OrganizationStatus.ACTIVE };
}

function storeOrderBy(
  sort: AdminStoreListQueryDto["sort"],
): Prisma.OrganizationOrderByWithRelationInput[] {
  switch (sort) {
    case "createdAsc":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "nameAsc":
      return [{ name: "asc" }, { id: "asc" }];
    case "nameDesc":
      return [{ name: "desc" }, { id: "desc" }];
    case "createdDesc":
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
}

function mapStore(
  store: Organization,
  stats: StoreStats = {
    totalKiosks: 0,
    activeKiosks: 0,
    offlineKiosks: 0,
    lastActivityAt: null,
  },
): AdminStoreResponseDto {
  const profile = storeProfileFromSettings(store.settings);
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    status: storeStatusFromOrganizationStatus(store.status),
    contactEmail: profile.contactEmail ?? null,
    contactPhone: profile.contactPhone ?? null,
    website: profile.website ?? null,
    address: profile.address ?? null,
    city: profile.city ?? null,
    stateRegion: profile.stateRegion ?? null,
    postalCode: profile.postalCode ?? null,
    country: profile.country ?? null,
    timezone: store.timezone,
    totalKiosks: stats.totalKiosks,
    activeKiosks: stats.activeKiosks,
    offlineKiosks: stats.offlineKiosks,
    lastActivityAt: stats.lastActivityAt?.toISOString() ?? null,
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
    internalLegacyModel: "ORGANIZATION_AS_STORE",
  };
}

function storeStatusFromOrganizationStatus(
  status: OrganizationStatus,
): AdminStoreStatus {
  return status === OrganizationStatus.ACTIVE
    ? AdminStoreStatus.ACTIVE
    : AdminStoreStatus.INACTIVE;
}

function organizationStatusFromStoreStatus(
  status: AdminStoreStatus,
): OrganizationStatus {
  return status === AdminStoreStatus.ACTIVE
    ? OrganizationStatus.ACTIVE
    : OrganizationStatus.SUSPENDED;
}

function storeSettingsFromInput(
  input: CreateAdminStoreDto,
): Prisma.InputJsonValue {
  return mergeStoreProfile(null, storeProfileInput(input));
}

function storeProfileInput(
  input: CreateAdminStoreDto | UpdateAdminStoreDto,
): StoreProfile {
  return {
    ...(input.contactEmail !== undefined
      ? { contactEmail: nullableTrim(input.contactEmail) }
      : {}),
    ...(input.contactPhone !== undefined
      ? { contactPhone: nullableTrim(input.contactPhone) }
      : {}),
    ...(input.website !== undefined
      ? { website: nullableTrim(input.website) }
      : {}),
    ...(input.address !== undefined
      ? { address: nullableTrim(input.address) }
      : {}),
    ...(input.city !== undefined ? { city: nullableTrim(input.city) } : {}),
    ...(input.stateRegion !== undefined
      ? { stateRegion: nullableTrim(input.stateRegion) }
      : {}),
    ...(input.postalCode !== undefined
      ? { postalCode: nullableTrim(input.postalCode) }
      : {}),
    ...(input.country !== undefined
      ? { country: nullableTrim(input.country) }
      : {}),
  };
}

function mergeStoreProfile(
  settings: Prisma.JsonValue | null | undefined,
  profile: StoreProfile,
): Prisma.InputJsonValue {
  const base = isRecord(settings) ? settings : {};
  const currentProfile = isRecord(base.storeProfile) ? base.storeProfile : {};
  return {
    ...base,
    storeProfile: {
      ...currentProfile,
      ...profile,
    },
  } as Prisma.InputJsonValue;
}

function storeProfileFromSettings(
  settings: Prisma.JsonValue | null,
): StoreProfile {
  if (!isRecord(settings) || !isRecord(settings.storeProfile)) {
    return {};
  }
  const profile = settings.storeProfile;
  return {
    contactEmail: stringOrNull(profile.contactEmail),
    contactPhone: stringOrNull(profile.contactPhone),
    website: stringOrNull(profile.website),
    address: stringOrNull(profile.address),
    city: stringOrNull(profile.city),
    stateRegion: stringOrNull(profile.stateRegion),
    postalCode: stringOrNull(profile.postalCode),
    country: stringOrNull(profile.country),
  };
}

function assertStoreActive(store: Organization): void {
  if (store.status !== OrganizationStatus.ACTIVE) {
    throw new ApiErrorException(
      HttpStatus.CONFLICT,
      STORE_ERROR_CODES.storeInactive,
      "Inactive stores cannot receive new kiosk assignments.",
    );
  }
}

function boundedPositiveInt(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isInteger(value) && value && value > 0 ? value : fallback;
}

function normalizeSlug(value: string): string {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      STORE_ERROR_CODES.storeSlugConflict,
      "Store slug must be URL-safe.",
    );
  }
  return slug;
}

function slugFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || `store-${createSelfxId()}`;
}

function normalizeProductSlug(value: string): string {
  const slug = slugFromName(value);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throwProductInvalid("Product slug must be URL-safe.");
  }
  return slug.slice(0, 160);
}

function storeProductCatalogKey(storeId: string, slug: string): string {
  return `store:${storeId}:product:${slug}`;
}

function normalizeProductImage(
  storeId: string,
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
  if (storageKey && !storageKey.startsWith(`catalog/stores/${storeId}/`)) {
    throwProductInvalid("Product image upload does not belong to this Store.");
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
    currency: nullableTrim(currency ?? undefined)?.toUpperCase() ?? "USD",
  };
}

function normalizeUploadedImageContentType(value: string): string | null {
  const contentType = value.split(";")[0]?.trim().toLowerCase();
  return contentType && productUploadContentTypeSet.has(contentType)
    ? contentType
    : null;
}

function storeProductImageObjectKeyFor(
  storeId: string,
  contentType: string,
): string {
  const extension =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : "jpg";
  return `catalog/stores/${storeId}/${createSelfxId()}.${extension}`;
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

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
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
    STORE_ERROR_CODES.productInvalid,
    message,
  );
}

function throwStoreProductNotFound(): never {
  throw new ApiErrorException(
    HttpStatus.NOT_FOUND,
    STORE_ERROR_CODES.productNotFound,
    "Product was not found for this Store.",
  );
}

function assignmentInclude() {
  return {
    organization: { select: { id: true, name: true } },
    store: { select: { id: true, name: true } },
    configuration: { select: { version: true } },
  } as const;
}
