import { PricingPlanStatus, Prisma, type PricingPlan } from "@prisma/client";

import { createSelfxId } from "@selfx/database";

export const DEFAULT_STARTER_PLAN_CODE = "selfx-default-starter";
export const DEFAULT_STARTER_PLAN_NAME = "Default starter pack";
export const DEFAULT_TRIAL_CREDITS = 10;

export const DEFAULT_TRIAL_CHANNELS = [
  "SHOPIFY",
  "WOOCOMMERCE",
  "KIOSK",
  "PUBLIC_API",
] as const;

export const DEFAULT_TRIAL_FEATURE_KEYS = [
  "TRY_ON_WIDGET",
  "SHOPIFY_INTEGRATION",
  "WOOCOMMERCE_INTEGRATION",
  "KIOSK_MANAGEMENT",
  "MULTI_LANGUAGE",
  "ANALYTICS",
  "PRODUCT_ANALYTICS",
  "CUSTOM_LIMITS",
] as const;

type DefaultStarterPricingPlanClient = {
  pricingPlan: {
    upsert: (args: Prisma.PricingPlanUpsertArgs) => Promise<PricingPlan>;
  };
};

export async function ensureDefaultStarterPricingPlan(
  tx: DefaultStarterPricingPlanClient,
  currency: string,
): Promise<PricingPlan> {
  return tx.pricingPlan.upsert({
    where: { code: DEFAULT_STARTER_PLAN_CODE },
    create: {
      id: createSelfxId(),
      code: DEFAULT_STARTER_PLAN_CODE,
      name: DEFAULT_STARTER_PLAN_NAME,
      status: PricingPlanStatus.ACTIVE,
      channels: [...DEFAULT_TRIAL_CHANNELS],
      currency: normalizeCurrency(currency),
      monthlyPriceCents: 0,
      includedCredits: 0,
      trialCredits: DEFAULT_TRIAL_CREDITS,
      storeLocationLimit: 0,
      extraCreditPriceCents: null,
      kioskMonthlyRentCents: null,
      kioskDeviceLimit: null,
      metadata: defaultStarterPlanMetadata(),
    },
    update: {
      monthlyPriceCents: 0,
      includedCredits: 0,
      storeLocationLimit: 0,
      extraCreditPriceCents: null,
      kioskMonthlyRentCents: null,
      kioskDeviceLimit: null,
    },
  });
}

export function defaultStarterPlanMetadata(): Prisma.InputJsonObject {
  return {
    starterPack: true,
    featureKeys: [...DEFAULT_TRIAL_FEATURE_KEYS],
  };
}

function normalizeCurrency(currency: string): string {
  return /^[A-Z]{3}$/.test(currency.trim().toUpperCase())
    ? currency.trim().toUpperCase()
    : "USD";
}
