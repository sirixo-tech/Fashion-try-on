import { selfxApi } from "@/lib/api";
export type TaxMode = "OFF" | "INCLUSIVE" | "EXCLUSIVE";
export type StoreTax = {
  mode: TaxMode;
  rateBasisPoints: number;
  version: number;
};
export type ShoppingOrderItem = {
  id: string;
  productName: string;
  size: string | null;
  color: string | null;
  quantity: number;
  unitPriceCents: number;
  taxRateBasisPoints: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};
export type ShoppingOrder = {
  id: string;
  reference: string;
  status:
    | "AWAITING_PAYMENT"
    | "PAYMENT_PENDING"
    | "PAID"
    | "PAID_REVIEW"
    | "CANCELLED"
    | "EXPIRED";
  paidAt?: string | null;
  stockAllocatedAt?: string | null;
  paymentReviewReason?: string | null;
  paymentAttempts?: OrderPaymentSummary[];
  kioskDeviceId: string;
  currency: string;
  taxMode: TaxMode;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  createdAt: string;
  expiresAt: string;
  cancelledAt: string | null;
  serverTime: string;
  paymentAvailable: false;
  items: ShoppingOrderItem[];
};
export type OrderPaymentSummary = {
  id: string;
  provider: string;
  environment: string;
  status: string;
  amountMinor: number;
  currency: string;
  providerReference: string | null;
  failureCode: string | null;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
};
export type OrderList = {
  data: ShoppingOrder[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
};
const base = (storeId: string) => `/api/v1/admin/stores/${storeId}/shopping`;
export const checkOrderPayment = (
  accessToken: string,
  storeId: string,
  orderId: string,
  attemptId: string,
) =>
  selfxApi<ShoppingOrder>(
    `${base(storeId)}/orders/${orderId}/payments/${attemptId}/check`,
    { accessToken, method: "POST" },
  );
export const recoverOrderStock = (
  accessToken: string,
  storeId: string,
  orderId: string,
) =>
  selfxApi<ShoppingOrder>(`${base(storeId)}/orders/${orderId}/recover-stock`, {
    accessToken,
    method: "POST",
  });
export const getStoreTax = (accessToken: string, storeId: string) =>
  selfxApi<StoreTax>(`${base(storeId)}/tax`, {
    accessToken,
    cache: "no-store",
  });
export const updateStoreTax = (
  accessToken: string,
  storeId: string,
  input: StoreTax & { expectedVersion: number },
) =>
  selfxApi<StoreTax>(`${base(storeId)}/tax`, {
    accessToken,
    method: "PUT",
    body: JSON.stringify({
      expectedVersion: input.expectedVersion,
      mode: input.mode,
      rateBasisPoints: input.rateBasisPoints,
    }),
  });
export const listShoppingOrders = (
  accessToken: string,
  storeId: string,
  query: { page: number; status: string; search: string },
) => {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: "25",
  });
  if (query.status !== "ALL") params.set("status", query.status);
  if (query.search.trim()) params.set("search", query.search.trim());
  return selfxApi<OrderList>(`${base(storeId)}/orders?${params}`, {
    accessToken,
    cache: "no-store",
  });
};
export const getShoppingOrder = (
  accessToken: string,
  storeId: string,
  orderId: string,
) =>
  selfxApi<ShoppingOrder>(`${base(storeId)}/orders/${orderId}`, {
    accessToken,
    cache: "no-store",
  });
export const cancelShoppingOrder = (
  accessToken: string,
  storeId: string,
  orderId: string,
  reason: string,
) =>
  selfxApi<ShoppingOrder>(`${base(storeId)}/orders/${orderId}/cancel`, {
    accessToken,
    method: "POST",
    body: JSON.stringify({ reason }),
  });
export function parseTaxRate(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter a tax percentage with up to two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const rate = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(rate) || rate > 10000)
    throw new Error("Tax rate must be between 0% and 100%.");
  return rate;
}
export function shoppingMoney(amount: number, currency: string) {
  return `${currency} ${(amount / 100).toFixed(2)}`;
}
