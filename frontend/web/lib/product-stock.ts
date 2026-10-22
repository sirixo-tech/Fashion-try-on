import { selfxApi } from "@/lib/api";

export type StockOptionMode = "SINGLE" | "SIZE" | "COLOR" | "SIZE_COLOR";
export type StockPricingMode = "CONSTANT" | "VARIANT";
export type ProductColorImage = {
  color: string;
  storageKey: string;
  contentType: string;
  width: number;
  height: number;
  url?: string | null;
};
export type ProductStockVariant = {
  reservedStockQuantity?: number;
  availableStockQuantity?: number;
  id: string;
  size: string | null;
  color: string | null;
  stockQuantity: number;
  priceOverrideAmountCents: number | null;
  effectivePriceAmountCents: number | null;
};
export type ProductStock = {
  colorImages?: ProductColorImage[];
  taxRateBasisPoints?: number | null;
  totalReservedStockQuantity?: number;
  totalAvailableStockQuantity?: number;
  productId: string;
  configured: boolean;
  version: number;
  optionMode: StockOptionMode;
  pricingMode: StockPricingMode;
  basePriceAmountCents: number | null;
  priceCurrency: string | null;
  totalStockQuantity: number;
  variants: ProductStockVariant[];
};
export type ProductStockInput = {
  colorImages?: ProductColorImage[];
  taxRateBasisPoints?: number | null;
  expectedVersion: number;
  optionMode: StockOptionMode;
  pricingMode: StockPricingMode;
  reason: string;
  variants: Array<{
    size: string | null;
    color: string | null;
    stockQuantity: number;
    priceOverrideAmountCents: number | null;
  }>;
};
export function getProductStock(
  accessToken: string,
  storeId: string,
  productId: string,
) {
  return selfxApi<ProductStock>(
    `/api/v1/admin/stores/${storeId}/products/${productId}/stock`,
    { accessToken, cache: "no-store" },
  );
}
export function updateProductStock(
  accessToken: string,
  storeId: string,
  productId: string,
  input: ProductStockInput,
) {
  return selfxApi<ProductStock>(
    `/api/v1/admin/stores/${storeId}/products/${productId}/stock`,
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}

// Parse decimal input exactly; do not silently round money or fractional stock.
export function stockPriceToCents(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))
    throw new Error(
      "Prices must be non-negative amounts with up to two decimal places.",
    );
  const [whole, decimal = ""] = value.trim().split(".");
  const amount = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > 100_000_000)
    throw new Error("Price cannot exceed 1,000,000.");
  return amount;
}
export function stockQuantityFromInput(value: string): number {
  if (!/^\d+$/.test(value.trim()))
    throw new Error("Stock quantities must be whole numbers, including zero.");
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity > 1_000_000)
    throw new Error("Stock quantity cannot exceed 1,000,000 per option.");
  return quantity;
}
