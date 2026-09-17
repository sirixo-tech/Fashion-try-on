import {
  type CommerceProductStatus,
  type SelfxCatalogProduct,
  type ShopifyProduct,
} from "./contracts.js";

export function mapShopifyProduct(
  product: ShopifyProduct,
  currencyCode: string,
): SelfxCatalogProduct {
  const featuredImageUrl =
    product.featuredMedia?.preview?.image?.url ??
    product.variants.find((variant) => variant.image?.url)?.image?.url ??
    null;
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
    shopifyCategoryId: product.category?.id ?? null,
    shopifyCategoryName: product.category?.fullName ?? null,
    suggestedJewelleryType: jewelleryTypeFromShopifyCategory(product.category),
    productUrl: product.onlineStoreUrl,
    featuredImageUrl,
    priceAmountCents: firstVariant?.priceAmountCents ?? null,
    priceCurrency: firstVariant ? currencyCode : null,
    sourceUpdatedAt: new Date(product.updatedAt).toISOString(),
    variants,
  };
}

export function jewelleryTypeFromShopifyCategory(
  category: ShopifyProduct["category"],
): SelfxCatalogProduct["suggestedJewelleryType"] {
  if (!category) return null;
  const parts = category.fullName.split(" > ").map((part) => part.trim());
  if (parts[0] !== "Apparel & Accessories" || parts[1] !== "Jewelry") {
    return null;
  }
  if (parts.length === 4) {
    return parts[2] === "Rings" &&
      (parts[3] === "Engagement Rings" || parts[3] === "Wedding Bands")
      ? "RING"
      : null;
  }
  if (parts.length !== 3) return null;
  const type = parts[2];
  if (type === "Rings") return "RING";
  if (type === "Earrings") return "EARRING";
  if (type === "Necklaces") return "NECKLACE";
  if (type === "Bracelets") return "BRACELET";
  return null;
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
