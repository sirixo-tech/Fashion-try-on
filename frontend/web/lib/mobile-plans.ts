import { selfxApi } from "./api";

export type MobilePlanStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type MobileBillingPeriod = "MONTHLY" | "ONE_TIME";

export interface MobilePlan {
  id: string;
  code: string;
  name: string;
  description: string;
  descriptionTranslations: Record<string, string>;
  status: MobilePlanStatus;
  currency: string;
  priceCents: number;
  billingPeriod: MobileBillingPeriod;
  includedCredits: number;
  trialCredits: number;
  createdAt: string;
  updatedAt: string;
}

export type MobilePlanInput = Omit<
  MobilePlan,
  "id" | "createdAt" | "updatedAt"
>;

export async function listMobilePlans(
  accessToken: string,
): Promise<MobilePlan[]> {
  const response = await selfxApi<{ data: MobilePlan[] }>(
    "/api/v1/admin/mobile-plans",
    { accessToken },
  );
  return response.data;
}

export async function createMobilePlan(
  accessToken: string,
  input: MobilePlanInput,
): Promise<MobilePlan> {
  return selfxApi<MobilePlan>("/api/v1/admin/mobile-plans", {
    accessToken,
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateMobilePlan(
  accessToken: string,
  planId: string,
  input: Partial<Omit<MobilePlanInput, "code">>,
): Promise<MobilePlan> {
  return selfxApi<MobilePlan>(`/api/v1/admin/mobile-plans/${planId}`, {
    accessToken,
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
