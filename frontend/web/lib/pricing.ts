import { selfxApi } from "./api";

export type PricingPlanStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type PricingPlanChannel =
  "SHOPIFY" | "WOOCOMMERCE" | "KIOSK" | "PUBLIC_API";

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
  featureKeys: string[];
  assignedStoreCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanFeature {
  key: string;
  displayName: string;
  description: string | null;
  group: string;
  sortOrder: number;
  active: boolean;
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
  featureKeys?: string[];
}

export type PricingPlanUpdateInput = Partial<Omit<PricingPlanInput, "code">>;

export async function listPricingPlans(
  accessToken: string,
): Promise<PricingPlan[]> {
  const response = await selfxApi<{ data: PricingPlan[] }>(
    "/api/v1/admin/pricing/plans",
    { accessToken },
  );
  return response.data;
}

export async function listAvailablePricingPlans(
  accessToken: string,
): Promise<PricingPlan[]> {
  const response = await selfxApi<{ data: PricingPlan[] }>(
    "/api/v1/pricing/plans/available",
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
  input: PricingPlanUpdateInput,
): Promise<PricingPlan> {
  return selfxApi<PricingPlan>(`/api/v1/admin/pricing/plans/${planId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  });
}

export async function listPlanFeatures(
  accessToken: string,
): Promise<PlanFeature[]> {
  const response = await selfxApi<{ data: PlanFeature[] }>(
    "/api/v1/pricing/plans/features",
    { accessToken },
  );
  return response.data;
}

export async function updatePlanFeature(
  accessToken: string,
  featureKey: string,
  input: Partial<Omit<PlanFeature, "key">>,
): Promise<PlanFeature> {
  return selfxApi<PlanFeature>(
    `/api/v1/admin/pricing/features/${encodeURIComponent(featureKey)}`,
    {
      method: "PATCH",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}
