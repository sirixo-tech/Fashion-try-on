"use client";

import { CheckIcon } from "lucide-react";

import { cn } from "@selfx/ui";

export { SelectMenu as ProductSelectMenu } from "@selfx/ui";

export const productVerticals = [
  { value: "GARMENT", label: "Garments" },
  { value: "JEWELLERY", label: "Jewellery" },
] as const;

export const productAudiences = [
  { value: "UNISEX", label: "Unisex" },
  { value: "WOMEN", label: "Women" },
  { value: "MEN", label: "Men" },
  { value: "KIDS", label: "Kids" },
] as const;

export const productGarmentTypes = [
  {
    value: "Tops",
    label: "Tops",
    garmentIntent: "TOP",
    garmentCategory: "TOP",
  },
  {
    value: "Bottoms",
    label: "Bottoms",
    garmentIntent: "BOTTOM",
    garmentCategory: "BOTTOM",
  },
  {
    value: "Dresses",
    label: "Dresses",
    garmentIntent: "ONE_PIECE",
    garmentCategory: "ONE_PIECE",
  },
  {
    value: "Outerwear",
    label: "Outerwear",
    garmentIntent: "TOP",
    garmentCategory: "TOP",
  },
  {
    value: "Full outfit",
    label: "Full outfit",
    garmentIntent: "FULL_OUTFIT",
    garmentCategory: "FULL_OUTFIT",
  },
] as const;

export const productJewelleryTypes = [
  { value: "RING", label: "Rings", categoryName: "Rings" },
  { value: "BRACELET", label: "Bracelets", categoryName: "Bracelets" },
  { value: "NECKLACE", label: "Necklaces", categoryName: "Necklaces" },
  { value: "EARRING", label: "Earrings", categoryName: "Earrings" },
] as const;

const jewelleryProductImageMinDimension = 640;
const jewelleryProductImageMaxDimension = 4096;

export const platformCurrencyOptions = [
  { value: "USD", label: "$ USD" },
  { value: "INR", label: "₹ INR" },
  { value: "AED", label: "د.إ AED" },
  { value: "EUR", label: "€ EUR" },
  { value: "GBP", label: "£ GBP" },
] as const;

export function currencySymbolFor(currency: string): string {
  return (
    platformCurrencyOptions
      .find((option) => option.value === currency)
      ?.label.split(" ")[0] ?? currency
  );
}

export function ProductStatusToggle({
  active,
  disabled,
  onChange,
}: {
  active: boolean;
  disabled?: boolean;
  onChange: (active: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={active ? "Deactivate product" : "Activate product"}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-md text-sm font-medium text-foreground transition-opacity focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      onClick={() => onChange(!active)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors",
          active ? "border-primary bg-primary" : "border-input bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform",
            active ? "translate-x-5" : "translate-x-0",
          )}
        />
      </span>
      <span className="min-w-14">{active ? "Active" : "Inactive"}</span>
    </button>
  );
}

export function ProductToggleCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <span className="relative inline-flex size-5 shrink-0">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded border border-input bg-white text-primary transition-colors peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
          disabled ? "opacity-60" : "",
        )}
      >
        <CheckIcon
          aria-hidden="true"
          className={cn(
            "size-4 stroke-[3] transition-opacity",
            checked ? "opacity-100" : "opacity-0",
          )}
        />
      </span>
    </span>
  );
}

export function garmentIntentForProductType(typeName: string): string {
  return productTypeFor(typeName).garmentIntent;
}

export function garmentCategoryForProductType(typeName: string): string {
  const category = productTypeFor(typeName).garmentCategory;
  return category === "FULL_OUTFIT" ? "AUTO" : category;
}

export function normalizedProductTypeFor(
  typeName: string | null | undefined,
  garmentIntent?: string | null,
): (typeof productGarmentTypes)[number]["value"] {
  const byName = productTypeForName(typeName ?? "");
  if (byName) {
    return byName.value;
  }
  const byIntent = productGarmentTypes.find(
    (type) => type.garmentIntent === garmentIntent,
  );
  return byIntent?.value ?? productGarmentTypes[0].value;
}

export function normalizedJewelleryTypeFor(
  jewelleryType: string | null | undefined,
): (typeof productJewelleryTypes)[number]["value"] {
  const normalized = (jewelleryType ?? "").trim().toUpperCase();
  const type = productJewelleryTypes.find(
    (option) => option.value === normalized,
  );
  return type?.value ?? productJewelleryTypes[0].value;
}

export function jewelleryCategoryNameForType(
  jewelleryType: string | null | undefined,
): string {
  const normalized = normalizedJewelleryTypeFor(jewelleryType);
  return (
    productJewelleryTypes.find((option) => option.value === normalized)
      ?.categoryName ?? productJewelleryTypes[0].categoryName
  );
}

export function assertJewelleryProductImageDimensions(
  productVertical: string,
  dimensions: { width: number; height: number },
): void {
  if (productVertical !== "JEWELLERY") {
    return;
  }
  if (
    dimensions.width < jewelleryProductImageMinDimension ||
    dimensions.height < jewelleryProductImageMinDimension
  ) {
    throw new Error(
      "Jewellery product images must be at least 640 x 640 pixels.",
    );
  }
  if (
    dimensions.width > jewelleryProductImageMaxDimension ||
    dimensions.height > jewelleryProductImageMaxDimension
  ) {
    throw new Error(
      "Jewellery product images must not exceed 4096 x 4096 pixels.",
    );
  }
}

function productTypeFor(
  typeName: string,
): (typeof productGarmentTypes)[number] {
  return productTypeForName(typeName) ?? productGarmentTypes[0];
}

function productTypeForName(
  typeName: string,
): (typeof productGarmentTypes)[number] | undefined {
  const normalized = typeName
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-");
  switch (normalized) {
    case "top":
    case "tops":
    case "upper":
    case "upper-body":
      return productGarmentTypes[0];
    case "bottom":
    case "bottoms":
    case "lower":
    case "lower-body":
      return productGarmentTypes[1];
    case "dress":
    case "dresses":
    case "one-piece":
    case "onepiece":
      return productGarmentTypes[2];
    case "outerwear":
    case "jacket":
    case "jackets":
    case "coat":
    case "coats":
      return productGarmentTypes[3];
    case "full-outfit":
    case "full-outfits":
    case "outfit":
    case "outfits":
      return productGarmentTypes[4];
    default:
      return productGarmentTypes.find((type) => type.value === typeName);
  }
}
