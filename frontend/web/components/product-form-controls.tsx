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

export const productCategories = [
  { value: "Tops", label: "Tops", garmentCategory: "TOPS" },
  { value: "Bottoms", label: "Bottoms", garmentCategory: "BOTTOMS" },
  { value: "Dresses", label: "Dresses", garmentCategory: "DRESSES" },
  { value: "Outerwear", label: "Outerwear", garmentCategory: "OUTERWEAR" },
  {
    value: "Full outfit",
    label: "Full outfit",
    garmentCategory: "FULL_OUTFIT",
  },
] as const;

export const productGarmentIntents = [
  { value: "TOP", label: "Top" },
  { value: "BOTTOM", label: "Bottom" },
  { value: "FULL_OUTFIT", label: "Full outfit" },
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
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
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
            className="w-full justify-between bg-background font-normal"
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

export function garmentCategoryForProductCategory(categoryName: string): string {
  return (
    productCategories.find((category) => category.value === categoryName)
      ?.garmentCategory ?? "TOPS"
  );
}
