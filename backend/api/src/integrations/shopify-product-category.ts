export function needsShopifyJewelleryClassification(
  metadata: unknown,
  productVertical: string,
): boolean {
  if (
    productVertical !== "GARMENT" ||
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return false;
  }
  const fields = metadata as Record<string, unknown>;
  return (
    fields.authoritativeSource === "SHOPIFY" &&
    fields.classificationSource !== "MANUAL" &&
    typeof fields.shopifyCategoryName === "string" &&
    (fields.shopifyCategoryName === "Apparel & Accessories > Jewelry" ||
      fields.shopifyCategoryName.startsWith(
        "Apparel & Accessories > Jewelry > ",
      ))
  );
}

export type ShopifyTryOnMode = "GARMENT" | "JEWELLERY" | "BOTH";

export function shopifyTryOnModeFromMetadata(
  metadata: unknown,
): ShopifyTryOnMode {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>).tryOnMode;
    if (value === "GARMENT" || value === "JEWELLERY" || value === "BOTH") {
      return value;
    }
  }
  return "BOTH";
}

export function shopifyTryOnModeAllowsProduct(
  metadata: unknown,
  productVertical: string,
): boolean {
  const mode = shopifyTryOnModeFromMetadata(metadata);
  return mode === "BOTH" || mode === productVertical;
}
