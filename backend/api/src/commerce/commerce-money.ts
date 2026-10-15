import { HttpStatus } from "@nestjs/common";
import { ApiErrorException } from "../common/api-error.exception.js";
import { type TaxMode } from "./commerce.dto.js";

export const MAX_ORDER_CENTS = 2_000_000_000;
export function commerceError(
  code: string,
  message: string,
  status: HttpStatus = HttpStatus.CONFLICT,
): never {
  throw new ApiErrorException(status, code, message);
}
export function calculateLine(
  unitPriceCents: number,
  quantity: number,
  mode: TaxMode,
  rateBasisPoints: number,
) {
  if (
    !Number.isInteger(unitPriceCents) ||
    unitPriceCents < 0 ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    !Number.isInteger(rateBasisPoints) ||
    rateBasisPoints < 0 ||
    rateBasisPoints > 10000
  ) {
    commerceError(
      "SHOPPING_PRICE_INVALID",
      "Product price, quantity or tax rate is invalid.",
      HttpStatus.BAD_REQUEST,
    );
  }
  const amount = BigInt(unitPriceCents) * BigInt(quantity);
  const rate = BigInt(mode === "OFF" ? 0 : rateBasisPoints);
  const rounded = (numerator: bigint, denominator: bigint) =>
    (2n * numerator + denominator) / (2n * denominator);
  const subtotal =
    mode === "INCLUSIVE" ? rounded(amount * 10000n, 10000n + rate) : amount;
  const tax =
    mode === "INCLUSIVE" ? amount - subtotal : rounded(subtotal * rate, 10000n);
  const total = subtotal + tax;
  if (total > BigInt(MAX_ORDER_CENTS))
    commerceError(
      "SHOPPING_TOTAL_TOO_LARGE",
      "The order exceeds the supported total. Reduce the quantity.",
    );
  return {
    subtotalCents: Number(subtotal),
    taxCents: Number(tax),
    totalCents: Number(total),
  };
}
