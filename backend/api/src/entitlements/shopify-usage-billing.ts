import { createHash } from "node:crypto";
import { HttpStatus } from "@nestjs/common";
import type { Prisma, KioskTryOnRun, PricingPlan } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { ApiErrorException } from "../common/api-error.exception.js";
export function shopifyManaged(metadata: Prisma.JsonValue | null) {
  return (
    !!metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    metadata.billingProvider === "SHOPIFY"
  );
}
export async function effectiveShopifyPlan(
  tx: Pick<Prisma.TransactionClient, "shopifyBillingAgreement">,
  metadata: Prisma.JsonValue | null,
  fallback: PricingPlan | null,
): Promise<PricingPlan | null> {
  if (!shopifyManaged(metadata)) return fallback;
  const id = (metadata as { shopifyAgreementId?: string }).shopifyAgreementId;
  if (!id) return fallback;
  const agreement = await tx.shopifyBillingAgreement.findUnique({
    where: { id },
  });
  const terms = (
    agreement?.pricingSnapshot as { planTerms?: PricingPlan } | undefined
  )?.planTerms;
  return terms?.id === agreement?.pricingPlanId ? terms! : fallback;
}
export async function assertShopifyBillingActive(
  tx: Pick<Prisma.TransactionClient, "shopifyBillingAgreement">,
  organizationId: string,
  metadata: Prisma.JsonValue | null,
) {
  if (!shopifyManaged(metadata)) return;
  const id = (metadata as { shopifyAgreementId?: string }).shopifyAgreementId;
  if (
    !id ||
    !(await tx.shopifyBillingAgreement.findFirst({
      where: {
        id,
        organizationId,
        status: "ACTIVE",
        periodEnd: { gt: new Date() },
      },
    }))
  )
    throw new ApiErrorException(
      HttpStatus.PAYMENT_REQUIRED,
      "SHOPIFY_BILLING_APPROVAL_REQUIRED",
      "This Store needs an active, verified Shopify subscription.",
    );
}

export async function reserveShopifyUsage(
  tx: Prisma.TransactionClient,
  organizationId: string,
  requestKey: string,
  metadata: Prisma.JsonValue | null,
) {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata) ||
    metadata.billingProvider !== "SHOPIFY"
  )
    return undefined;
  const agreementId =
    typeof metadata.shopifyAgreementId === "string"
      ? metadata.shopifyAgreementId
      : "";
  const agreement = await tx.shopifyBillingAgreement.findFirst({
    where: {
      id: agreementId,
      organizationId,
      status: "ACTIVE",
      periodEnd: { gt: new Date() },
    },
  });
  if (
    !agreement?.usageCapCents ||
    !agreement.periodEnd ||
    !agreement.usageLineItemId
  )
    throw new ApiErrorException(
      HttpStatus.PAYMENT_REQUIRED,
      "SHOPIFY_BILLING_APPROVAL_REQUIRED",
      "Approve the Store's current Shopify usage terms before generating.",
    );
  const price = agreement.pricingSnapshot as { creditUnitPriceCents?: number };
  const amount = price.creditUnitPriceCents;
  if (!amount) throw new Error("Shopify usage rate is unavailable.");
  const digest = createHash("sha256")
    .update(`${organizationId}:${requestKey}`)
    .digest("hex");
  const existing = await tx.shopifyUsageReservation.findUnique({
    where: { requestDigest: digest },
  });
  if (existing && existing.state !== "RELEASED") return existing.id;
  await tx.shopifyUsageReservation.updateMany({
    where: {
      agreementId,
      state: "RESERVED",
      OR: [
        { run: { is: { status: "FAILED" } } },
        { run: null, createdAt: { lt: new Date(Date.now() - 15 * 60_000) } },
      ],
    },
    data: { state: "RELEASED" },
  });
  const reserved = await tx.shopifyUsageReservation.aggregate({
    where: {
      agreementId,
      periodEnd: agreement.periodEnd,
      state: { in: ["RESERVED", "CONFIRMED"] },
    },
    _sum: { amountCents: true },
  });
  if ((reserved._sum.amountCents ?? 0) + amount > agreement.usageCapCents)
    throw new ApiErrorException(
      HttpStatus.TOO_MANY_REQUESTS,
      "SHOPIFY_USAGE_CAP_REACHED",
      "This Store has reached its approved Shopify usage spending cap.",
    );
  const result = await tx.shopifyUsageReservation.upsert({
    where: { requestDigest: digest },
    create: {
      id: createSelfxId(),
      agreementId,
      requestDigest: digest,
      amountCents: amount,
      periodEnd: agreement.periodEnd,
    },
    update: {
      agreementId,
      state: "RESERVED",
      amountCents: amount,
      periodEnd: agreement.periodEnd,
    },
  });
  return result.id;
}

export async function settleShopifyUsage(
  tx: Prisma.TransactionClient,
  run: KioskTryOnRun,
) {
  if (!run.shopifyReservationId) return;
  const reservation = await tx.shopifyUsageReservation.findUniqueOrThrow({
    where: { id: run.shopifyReservationId },
    include: { agreement: true },
  });
  if (!["RESERVED", "CONFIRMED"].includes(reservation.state))
    throw new Error("This usage allowance is no longer reserved.");
  const generation = await tx.billableGeneration.findUniqueOrThrow({
    where: { runId: run.id },
  });
  const price = reservation.agreement.pricingSnapshot as { currency: string };
  await tx.shopifyUsageCharge.createMany({
    data: [
      {
        id: createSelfxId(),
        agreementId: reservation.agreementId,
        billableGenerationId: generation.id,
        amountCents: reservation.amountCents,
        currency: price.currency,
        idempotencyKey: createHash("sha256")
          .update(`shopify-usage:${generation.id}`)
          .digest("hex"),
      },
    ],
    skipDuplicates: true,
  });
  await tx.shopifyUsageReservation.update({
    where: { id: reservation.id },
    data: { state: "CONFIRMED" },
  });
}
