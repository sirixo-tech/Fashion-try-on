import { selfxApi } from "./api";

export type CustomCreditChannel = "STORE" | "MOBILE";
export interface CustomCreditPlan {
  id: string;
  channel: CustomCreditChannel;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  currency: string;
  unitPriceCents: number;
  version: number;
}

export type CustomCreditPlanInput = Pick<
  CustomCreditPlan,
  "name" | "status" | "currency" | "unitPriceCents"
> & { expectedVersion: number };

export function getCustomCreditPlan(
  accessToken: string,
  channel: CustomCreditChannel,
) {
  return selfxApi<CustomCreditPlan | null>(
    `/api/v1/admin/custom-credit-plans/${channel}`,
    { accessToken },
  );
}

export function saveCustomCreditPlan(
  accessToken: string,
  channel: CustomCreditChannel,
  input: CustomCreditPlanInput,
) {
  return selfxApi<CustomCreditPlan>(
    `/api/v1/admin/custom-credit-plans/${channel}`,
    {
      accessToken,
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

export interface StoreCustomCreditQuote {
  planId: string;
  storeId: string;
  currency: string;
  quantity: number;
  unitPriceCents: number;
  totalMinor: number;
  checkoutAvailable: false;
}

export function quoteStoreCustomCredits(
  accessToken: string,
  storeId: string,
  quantity: number,
) {
  return selfxApi<StoreCustomCreditQuote>(
    `/api/v1/admin/stores/${storeId}/custom-credits/quote?quantity=${quantity}`,
    { accessToken },
  );
}
