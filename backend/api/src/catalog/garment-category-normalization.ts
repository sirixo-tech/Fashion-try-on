import {
  SELFX_GARMENT_CATEGORIES,
  type SelfxGarmentCategory,
} from "@selfx/shared";

export function normalizeSelfxGarmentCategory(
  value: string | null | undefined,
  fallback: SelfxGarmentCategory = "TOP",
): SelfxGarmentCategory | null {
  const raw = value?.trim();
  if (!raw) {
    return fallback;
  }
  const normalized = raw.toUpperCase().replace(/[\s-]+/g, "_");
  switch (normalized) {
    case "TOP":
    case "TOPS":
    case "UPPER":
    case "UPPER_BODY":
      return "TOP";
    case "BOTTOM":
    case "BOTTOMS":
    case "LOWER":
    case "LOWER_BODY":
      return "BOTTOM";
    case "ONE_PIECE":
    case "ONEPIECE":
    case "DRESS":
    case "DRESSES":
      return "ONE_PIECE";
    case "AUTO":
      return "AUTO";
    default:
      return (SELFX_GARMENT_CATEGORIES as readonly string[]).includes(
        normalized,
      )
        ? (normalized as SelfxGarmentCategory)
        : null;
  }
}
