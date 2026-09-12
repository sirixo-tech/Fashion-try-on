import { selfxApi } from "./api";

export type PricingPlanStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type PricingPlanChannel = "SHOPIFY" | "KIOSK" | "PUBLIC_API";

export interface PricingPlan {
  id: string;
  code: string;
  name: string;
  status: PricingPlanStatus;
  channels: PricingPlanChannel[];
  currency: string;
  monthlyPriceCents: number;
  includedCredits: number;
  trialCredits: number;
  extraCreditPriceCents: number | null;
  kioskMonthlyRentCents: number | null;
  kioskDeviceLimit: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PricingPlanInput {
  code?: string;
  name: string;
  status?: PricingPlanStatus;
  channels: PricingPlanChannel[];
  currency: string;
  monthlyPriceCents: number;
  includedCredits: number;
  trialCredits: number;
  extraCreditPriceCents?: number | null;
  kioskMonthlyRentCents?: number | null;
  kioskDeviceLimit?: number | null;
  metadata?: Record<string, unknown> | null;
}

export async function listPricingPlans(
  accessToken: string,
): Promise<PricingPlan[]> {
  const response = await selfxApi<{ data: PricingPlan[] }>(
    "/api/v1/admin/pricing/plans",
    { accessToken },
  );
  return response.data;
}

export async function createPricingPlan(
  accessToken: string,
  input: PricingPlanInput & { code: string },
): Promise<PricingPlan> {
  return selfxApi<PricingPlan>("/api/v1/admin/pricing/plans", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export async function updatePricingPlan(
  accessToken: string,
  planId: string,
  input: PricingPlanInput,
): Promise<PricingPlan> {
  return selfxApi<PricingPlan>(`/api/v1/admin/pricing/plans/${planId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  });
}
