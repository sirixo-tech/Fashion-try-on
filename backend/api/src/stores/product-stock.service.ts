import { HttpStatus, Injectable } from "@nestjs/common";
import {
  Prisma,
  type Product,
  type ProductStockSettings,
  type ProductVariant,
} from "@prisma/client";
import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { reservedQuantities } from "../commerce/stock-reservations.js";
import {
  type ProductStockDto,
  type UpdateProductStockDto,
  type StockOptionMode,
  type StockPricingMode,
  STOCK_OPTION_MODES,
  STOCK_PRICING_MODES,
} from "./dto/product-stock.dto.js";

export const PRODUCT_STOCK_ERRORS = {
  notFound: "PRODUCT_NOT_FOUND",
  imported: "PRODUCT_STOCK_EXTERNALLY_MANAGED",
  invalid: "PRODUCT_STOCK_INVALID",
  conflict: "PRODUCT_STOCK_VERSION_CONFLICT",
  inactiveStore: "STORE_INACTIVE",
} as const;

type StockProduct = Product & {
  externalMappings: { id: string }[];
  stockSettings: (ProductStockSettings & { variants: ProductVariant[] }) | null;
  category: { active: boolean };
};

@Injectable()
export class ProductStockService {
  constructor(private readonly prisma: PrismaService) {}

  async get(storeId: string, productId: string): Promise<ProductStockDto> {
    return this.prisma.$transaction(
      async (tx) => {
        const product = await this.load(tx, storeId, productId);
        return stockResponse(
          product,
          await reservedQuantities(
            tx,
            storeId,
            product.stockSettings?.variants.map((v) => v.id) ?? [],
          ),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async getForKiosk(
    storeId: string | null,
    productId: string,
  ): Promise<ProductStockDto> {
    if (!storeId) throw notFound();
    return this.prisma.$transaction(
      async (tx) => {
        const product = await this.load(tx, storeId, productId, true);
        if (!product.active || !product.vtoEnabled || !product.category.active)
          throw notFound();
        return stockResponse(
          product,
          await reservedQuantities(
            tx,
            storeId!,
            product.stockSettings?.variants.map((v) => v.id) ?? [],
          ),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async update(
    storeId: string,
    productId: string,
    actorUserId: string,
    input: UpdateProductStockDto,
  ): Promise<ProductStockDto> {
    const variants = normalizeStockInput(input);
    return this.prisma.$transaction(
      async (tx) => {
        // Serialize initial setup and later edits on the same product, including
        // concurrent requests from different kiosks/staff. Tenant is in the lock.
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid AND organization_id = ${storeId}::uuid AND scope::text = 'STORE' FOR UPDATE`;
        const product = await this.load(tx, storeId, productId, true);
        if (
          !product.priceCurrency &&
          variants.some((variant) => variant.priceOverrideAmountCents !== null)
        ) {
          invalid(
            "Set the product's base price and currency before adding variant prices.",
          );
        }
        const reserved = await reservedQuantities(
          tx,
          storeId,
          product.stockSettings?.variants.map((v) => v.id) ?? [],
        );
        const before = stockResponse(product, reserved);
        if (input.expectedVersion !== before.version) {
          throw new ApiErrorException(
            HttpStatus.CONFLICT,
            PRODUCT_STOCK_ERRORS.conflict,
            "Stock was changed by another user. Reload the latest stock before saving.",
          );
        }
        const settings = {
          taxRateBasisPoints:
            input.taxRateBasisPoints === undefined
              ? (product.stockSettings?.taxRateBasisPoints ?? null)
              : input.taxRateBasisPoints,
          organizationId: storeId,
          optionMode: input.optionMode,
          pricingMode: input.pricingMode,
          version: before.version + 1,
        };
        for (const previous of product.stockSettings?.variants ?? []) {
          const incoming = variants.find(
            (v) => v.optionKey === previous.optionKey,
          );
          const held = reserved.get(previous.id) ?? 0;
          if (held > 0 && (!incoming || incoming.stockQuantity < held)) {
            throw new ApiErrorException(
              HttpStatus.CONFLICT,
              "PRODUCT_STOCK_RESERVED",
              "This option has reserved stock. Cancel or wait for unpaid orders before removing it or reducing its stock below the reserved quantity.",
            );
          }
        }
        await tx.productStockSettings.upsert({
          where: { productId },
          create: { productId, ...settings },
          update: settings,
        });
        // Retain identities for future order references. Removed options are
        // archived; adding the same normalized option restores its original ID.
        await tx.productVariant.updateMany({
          where: { organizationId: storeId, productId, active: true },
          data: { active: false },
        });
        for (const variant of variants) {
          await tx.productVariant.upsert({
            where: {
              productId_optionKey: { productId, optionKey: variant.optionKey },
            },
            create: {
              id: createSelfxId(),
              organizationId: storeId,
              productId,
              ...variant,
              active: true,
            },
            update: { ...variant, active: true },
          });
        }
        const after = stockResponse(
          await this.load(tx, storeId, productId),
          reserved,
        );
        await tx.auditLog.create({
          data: {
            id: createSelfxId(),
            organizationId: storeId,
            actorUserId,
            action: "STORE_PRODUCT_STOCK_UPDATED",
            resourceType: "Product",
            resourceId: productId,
            metadata: {
              reason: input.reason.trim(),
              before,
              after,
            } as unknown as Prisma.InputJsonObject,
          },
        });
        return after;
      },
      { timeout: 15_000 },
    );
  }

  private async load(
    tx: Prisma.TransactionClient,
    storeId: string,
    productId: string,
    writing = false,
  ): Promise<StockProduct> {
    const store = await tx.organization.findFirst({
      where: { id: storeId, status: { not: "ARCHIVED" } },
      select: { status: true },
    });
    if (!store) throw notFound();
    if (writing && store.status !== "ACTIVE") {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        PRODUCT_STOCK_ERRORS.inactiveStore,
        "Stock cannot be changed while the Store is inactive.",
      );
    }
    const product = await tx.product.findFirst({
      where: { id: productId, organizationId: storeId, scope: "STORE" },
      include: {
        externalMappings: { select: { id: true }, take: 1 },
        category: { select: { active: true } },
        stockSettings: {
          include: {
            variants: {
              where: { active: true },
              orderBy: [{ optionKey: "asc" }, { id: "asc" }],
              take: 101,
            },
          },
        },
      },
    });
    if (!product) throw notFound();
    if (product.externalMappings.length) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        PRODUCT_STOCK_ERRORS.imported,
        "Stock and pricing for imported products remain managed by the external shop. Use a SelfX-created product for Store stock.",
      );
    }
    if ((product.stockSettings?.variants.length ?? 0) > 100)
      invalid("A product supports up to 100 options.");
    return product;
  }
}

export function normalizeStockInput(input: UpdateProductStockDto) {
  if (
    input.taxRateBasisPoints != null &&
    (!Number.isInteger(input.taxRateBasisPoints) ||
      input.taxRateBasisPoints < 0 ||
      input.taxRateBasisPoints > 10000)
  )
    invalid("Tax override must be between 0% and 100%.");
  if (
    !Number.isInteger(input.expectedVersion) ||
    input.expectedVersion < 0 ||
    input.expectedVersion > 2_000_000_000 ||
    !STOCK_OPTION_MODES.includes(input.optionMode) ||
    !STOCK_PRICING_MODES.includes(input.pricingMode) ||
    typeof input.reason !== "string" ||
    !input.reason.trim() ||
    input.reason.length > 300 ||
    !Array.isArray(input.variants) ||
    input.variants.length < 1 ||
    input.variants.length > 100
  ) {
    invalid(
      "Provide valid options, pricing mode, version and an adjustment reason (up to 100 options).",
    );
  }
  if (input.optionMode === "SINGLE" && input.variants.length !== 1)
    invalid(
      "A product without sizes or colours has exactly one stock quantity.",
    );
  const keys = new Set<string>();
  return input.variants.map((variant) => {
    if (!variant || typeof variant !== "object")
      invalid("Invalid product option.");
    const size = normalizeLabel(variant.size);
    const color = normalizeLabel(variant.color);
    const needsSize =
      input.optionMode === "SIZE" || input.optionMode === "SIZE_COLOR";
    const needsColor =
      input.optionMode === "COLOR" || input.optionMode === "SIZE_COLOR";
    if (Boolean(size) !== needsSize || Boolean(color) !== needsColor)
      invalid("Every option must match the selected size/colour mode.");
    const price = variant.priceOverrideAmountCents ?? null;
    if (
      !Number.isInteger(variant.stockQuantity) ||
      variant.stockQuantity < 0 ||
      variant.stockQuantity > 1_000_000
    )
      invalid("Stock must be a whole number between 0 and 1,000,000.");
    if (
      price !== null &&
      (!Number.isInteger(price) || price < 0 || price > 100_000_000)
    )
      invalid("Variant price must be a valid non-negative amount in cents.");
    if (input.pricingMode === "CONSTANT" && price !== null)
      invalid(
        "Constant pricing uses the product price. Remove variant prices first.",
      );
    const optionKey = JSON.stringify([
      size?.toLowerCase() ?? null,
      color?.toLowerCase() ?? null,
    ]);
    if (keys.has(optionKey))
      invalid(
        "Duplicate size/colour options are not allowed (including differences in case or spacing).",
      );
    keys.add(optionKey);
    return {
      size,
      color,
      optionKey,
      stockQuantity: variant.stockQuantity,
      priceOverrideAmountCents: price,
    };
  });
}

function normalizeLabel(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > 80)
    invalid("Size and colour labels must be at most 80 characters.");
  const label = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (label.length > 80)
    invalid("Size and colour labels must be at most 80 characters.");
  return label || null;
}

function stockResponse(
  product: StockProduct,
  reserved = new Map<string, number>(),
): ProductStockDto {
  const settings = product.stockSettings;
  const pricingMode = (settings?.pricingMode ?? "CONSTANT") as StockPricingMode;
  const variants = (settings?.variants ?? []).map((variant) => ({
    id: variant.id,
    size: variant.size,
    color: variant.color,
    stockQuantity: variant.stockQuantity,
    reservedStockQuantity: reserved.get(variant.id) ?? 0,
    availableStockQuantity: Math.max(
      0,
      variant.stockQuantity - (reserved.get(variant.id) ?? 0),
    ),
    priceOverrideAmountCents:
      pricingMode === "VARIANT" ? variant.priceOverrideAmountCents : null,
    effectivePriceAmountCents:
      pricingMode === "VARIANT"
        ? (variant.priceOverrideAmountCents ?? product.priceAmountCents)
        : product.priceAmountCents,
  }));
  return {
    taxRateBasisPoints: settings?.taxRateBasisPoints ?? null,
    totalReservedStockQuantity: variants.reduce(
      (sum, v) => sum + v.reservedStockQuantity,
      0,
    ),
    totalAvailableStockQuantity: variants.reduce(
      (sum, v) => sum + v.availableStockQuantity,
      0,
    ),
    productId: product.id,
    configured: settings !== null,
    version: settings?.version ?? 0,
    optionMode: (settings?.optionMode ?? "SINGLE") as StockOptionMode,
    pricingMode,
    basePriceAmountCents: product.priceAmountCents,
    priceCurrency: product.priceCurrency,
    totalStockQuantity: variants.reduce(
      (sum, variant) => sum + variant.stockQuantity,
      0,
    ),
    variants,
  };
}

function invalid(message: string): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    PRODUCT_STOCK_ERRORS.invalid,
    message,
  );
}
function notFound() {
  return new ApiErrorException(
    HttpStatus.NOT_FOUND,
    PRODUCT_STOCK_ERRORS.notFound,
    "Store product was not found.",
  );
}
