import {
  type CommerceProductStatus,
  type SelfxCatalogProduct,
  type ShopifyProduct,
} from "./contracts.js";

export function mapShopifyProduct(
  product: ShopifyProduct,
  currencyCode: string,
): SelfxCatalogProduct {
  const featuredImageUrl = product.featuredMedia?.preview?.image?.url ?? null;
  const variants = product.variants.map((variant) => ({
    externalVariantId: variant.id,
    sku: nullableTrim(variant.sku),
    title: nullableTrim(variant.title),
    priceAmountCents: moneyToCents(variant.price),
    priceCurrency: currencyCode,
    imageUrl: variant.image?.url ?? featuredImageUrl,
    available: variant.availableForSale,
  }));
  const firstVariant = variants[0];
  return {
    externalProductId: product.id,
    title: product.title.trim(),
    handle: nullableTrim(product.handle),
    description: nullableTrim(product.description),
    status: mapStatus(product.status),
    productUrl: product.onlineStoreUrl,
    featuredImageUrl,
    priceAmountCents: firstVariant?.priceAmountCents ?? null,
    priceCurrency: firstVariant ? currencyCode : null,
    sourceUpdatedAt: new Date(product.updatedAt).toISOString(),
    variants,
  };
}

export function moneyToCents(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }
  return Math.round(amount * 100);
}

function mapStatus(status: ShopifyProduct["status"]): CommerceProductStatus {
  if (status === "ACTIVE") {
    return "ACTIVE";
  }
  if (status === "ARCHIVED") {
    return "ARCHIVED";
  }
  return "DRAFT";
}

function nullableTrim(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
