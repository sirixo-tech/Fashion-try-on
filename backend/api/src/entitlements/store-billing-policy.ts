import type { Prisma, PricingPlan, StoreSubscription } from "@prisma/client";

export function billingMetadata(
  value: Prisma.JsonValue | null,
): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
export function savedPlan(
  value: Prisma.JsonValue | undefined,
): PricingPlan | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.id === "string" &&
    typeof value.billingMode === "string"
    ? (value as unknown as PricingPlan)
    : null;
}
export function paygTerms(
  subscription: StoreSubscription & { pricingPlan: PricingPlan | null },
): PricingPlan | null {
  const metadata = billingMetadata(subscription.metadata);
  if (metadata.paygEnabled === false) return null;
  const terms = savedPlan(metadata.paygPlanTerms);
  if (terms?.billingMode === "POSTPAID_PAYG") return terms;
  return subscription.pricingPlan?.billingMode === "POSTPAID_PAYG"
    ? subscription.pricingPlan
    : null;
}

/** Revokes only the matching usage authority. Prepaid balance and its feature profile survive. */
export async function disableStorePayg(
  tx: Prisma.TransactionClient,
  organizationId: string,
  agreementId?: string,
) {
  const current = await tx.storeSubscription.findUnique({
    where: { organizationId },
  });
  if (!current) return;
  const metadata = billingMetadata(current.metadata);
  if (agreementId && metadata.shopifyAgreementId !== agreementId) return;
  const profile =
    savedPlan(metadata.creditPackTerms) ??
    savedPlan(metadata.prepaidProfileTerms);
  await tx.storeSubscription.update({
    where: { id: current.id },
    data: {
      status: "ACTIVE",
      cancelledAt: null,
      currentPeriodEnd: null,
      ...(profile
        ? {
            pricingPlanId: profile.id,
            channels: profile.channels as Prisma.InputJsonValue,
          }
        : {}),
      metadata: {
        ...metadata,
        paygEnabled: false,
        creditBillingVersion: 2,
        billingProvider: "CREDIT_BALANCE",
        ...(profile
          ? {
              creditPackTerms: profile as unknown as Prisma.InputJsonObject,
              featureKeys: billingMetadata(profile.metadata).featureKeys ?? [],
              storeLocationLimit: profile.storeLocationLimit,
            }
          : {}),
      },
    },
  });
}
