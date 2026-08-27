"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@selfx/ui";

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

export function ProductSelectMenu<T extends string>({
  ariaLabel,
  value,
  options,
  disabled,
  className,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  disabled?: boolean;
  className?: string;
  onChange: (value: T) => void;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-between bg-background font-normal",
              className,
            )}
            aria-label={ariaLabel}
          />
        }
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDownIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="rounded-xl p-1">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className="gap-2 rounded-lg px-3 py-2"
            onClick={() => onChange(option.value)}
          >
            <span className="grid size-4 place-items-center">
              {option.value === value ? (
                <CheckIcon size={14} aria-hidden="true" />
              ) : null}
            </span>
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
