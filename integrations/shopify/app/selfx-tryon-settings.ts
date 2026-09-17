export type ShopifyTryOnMode = "GARMENT" | "JEWELLERY" | "BOTH";
export type ShopifyTryOnVertical = Exclude<ShopifyTryOnMode, "BOTH">;
export type ShopifyProductVisibilityMode = "ALL" | "SELECTED" | "OFF";

export type ShopifyProductVisibilityRule = {
  mode: ShopifyProductVisibilityMode;
  selectedCollectionIds: string[];
  selectedProductIds: string[];
  exceptionProductIds: string[];
};

export type ShopifyProductVisibilityRules = Partial<
  Record<ShopifyTryOnVertical, ShopifyProductVisibilityRule>
>;

export function parseShopifyTryOnMode(value: unknown): ShopifyTryOnMode {
  if (value === "GARMENT" || value === "JEWELLERY" || value === "BOTH") {
    return value;
  }
  throw new Error("Choose Garments, Jewellery or Both for Try-On types.");
}

export function parseShopifyTryOnVertical(
  value: unknown,
): ShopifyTryOnVertical {
  if (value === "GARMENT" || value === "JEWELLERY") return value;
  throw new Error("Choose Garments or Jewellery before applying visibility.");
}

export function tryOnModeAllowsVertical(
  mode: ShopifyTryOnMode,
  vertical: ShopifyTryOnVertical,
): boolean {
  return mode === "BOTH" || mode === vertical;
}

export function parseShopifyProductVisibilityRules(
  value: unknown,
): ShopifyProductVisibilityRules {
  if (!isRecord(value)) return {};
  return {
    ...parseVisibilityRuleEntry(value, "GARMENT"),
    ...parseVisibilityRuleEntry(value, "JEWELLERY"),
  };
}

function parseVisibilityRuleEntry(
  value: Record<string, unknown>,
  vertical: ShopifyTryOnVertical,
): ShopifyProductVisibilityRules {
  const candidate = value[vertical];
  if (!isRecord(candidate)) return {};
  const mode = candidate.mode;
  if (mode !== "ALL" && mode !== "SELECTED" && mode !== "OFF") return {};
  return {
    [vertical]: {
      mode,
      selectedCollectionIds: stringArray(candidate.selectedCollectionIds),
      selectedProductIds: stringArray(candidate.selectedProductIds),
      exceptionProductIds: stringArray(candidate.exceptionProductIds),
    },
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter(
              (item): item is string =>
                typeof item === "string" && Boolean(item.trim()),
            )
            .map((item) => item.trim()),
        ),
      ]
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
