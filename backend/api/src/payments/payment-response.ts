import type { ShoppingPaymentAttempt } from "@prisma/client";
export const PAYMENT_SUMMARY_SELECT = {
  id: true,
  provider: true,
  environment: true,
  status: true,
  amountMinor: true,
  currency: true,
  providerReference: true,
  failureCode: true,
  createdAt: true,
  expiresAt: true,
  paidAt: true,
} as const;
export function paymentSummary(
  row: Pick<ShoppingPaymentAttempt, keyof typeof PAYMENT_SUMMARY_SELECT>,
) {
  return {
    id: row.id,
    provider: row.provider,
    environment: row.environment,
    status: row.status,
    amountMinor: row.amountMinor,
    currency: row.currency,
    providerReference: row.providerReference,
    failureCode: row.failureCode,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
  };
}
