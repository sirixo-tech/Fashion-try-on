import { HttpStatus } from "@nestjs/common";
import {
  CreditLedgerChannel,
  Prisma,
  type KioskTryOnRun,
  type PricingPlan,
  type StoreSubscription,
  type StoreBillingCycle,
  type UsageEvent,
} from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { monthlyBillingPeriod } from "./billing-period.js";
import {
  reserveShopifyUsage,
  settleShopifyUsage,
  assertShopifyBillingActive,
  shopifyManaged,
  effectiveShopifyPlan,
} from "./shopify-usage-billing.js";

type BillingTx = Prisma.TransactionClient;
type SubscriptionWithPlan = StoreSubscription & {
  pricingPlan: PricingPlan | null;
};

export interface PostpaidSummary {
  billingMode: "POSTPAID_PAYG";
  timezone: "UTC";
  periodStart: string;
  periodEnd: string;
  currency: string;
  creditUnitPriceCents: number;
  billableCredits: number;
  historicalCredits: number;
  estimatedAmountCents: string;
}

export async function lockBillingSubscription(
  tx: BillingTx,
  organizationId: string,
) {
  await tx.$queryRaw`SELECT id FROM store_subscriptions WHERE organization_id = ${organizationId}::uuid FOR UPDATE`;
}

/** Admission captures commercial terms before any expensive provider call. */
export async function prepareRunBilling(
  db: PrismaService,
  input: {
    organizationId: string | null;
    assignmentScope: string;
    channel: CreditLedgerChannel;
    requestKey?: string;
  },
): Promise<{
  billingChannel: CreditLedgerChannel;
  billingCycleId?: string;
  shopifyReservationId?: string;
}> {
  const data = { billingChannel: input.channel };
  if (!input.organizationId || input.assignmentScope === "PLATFORM")
    return data;
  const organizationId = input.organizationId;
  const initial = await db.storeSubscription.findUnique({
    where: { organizationId },
    include: { pricingPlan: true },
  });
  if (
    initial?.pricingPlan?.billingMode !== "POSTPAID_PAYG" &&
    !shopifyManaged(initial?.metadata ?? null)
  )
    return data;
  return db.$transaction(async (tx) => {
    await lockBillingSubscription(tx, organizationId);
    const subscription = await tx.storeSubscription.findUniqueOrThrow({
      where: { organizationId },
      include: { pricingPlan: true },
    });
    subscription.pricingPlan = await effectiveShopifyPlan(
      tx,
      subscription.metadata,
      subscription.pricingPlan,
    );
    await assertShopifyBillingActive(tx, organizationId, subscription.metadata);
    if (subscription.pricingPlan?.billingMode !== "POSTPAID_PAYG") return data;
    if (
      subscription.status !== "ACTIVE" ||
      !Array.isArray(subscription.channels) ||
      !subscription.channels.includes(input.channel)
    ) {
      throw new ApiErrorException(
        HttpStatus.PAYMENT_REQUIRED,
        "SELFX_SUBSCRIPTION_UNAVAILABLE",
        "This Store's subscription does not permit this generation.",
      );
    }
    const cycle = await ensurePostpaidCycle(tx, subscription);
    const shopifyReservationId = await reserveShopifyUsage(
      tx,
      organizationId,
      input.requestKey ?? createSelfxId(),
      subscription.metadata,
    );
    return { ...data, billingCycleId: cycle.id, shopifyReservationId };
  });
}

export async function ensurePostpaidCycle(
  tx: BillingTx,
  subscription: SubscriptionWithPlan,
  at = new Date(),
  firstRate?: PricingPlan,
): Promise<StoreBillingCycle> {
  const plan = await effectiveShopifyPlan(
    tx,
    subscription.metadata,
    firstRate ?? subscription.pricingPlan,
  );
  if (
    !plan ||
    plan.billingMode !== "POSTPAID_PAYG" ||
    !plan.creditUnitPriceCents
  ) {
    throw new Error("A configured postpaid rate is required.");
  }
  const anchor =
    subscription.billingAnchorAt ??
    subscription.trialStartedAt ??
    subscription.createdAt;
  let { start, end } = monthlyBillingPeriod(anchor, at);
  if (shopifyManaged(subscription.metadata)) {
    const id = (subscription.metadata as { shopifyAgreementId?: string })
      .shopifyAgreementId;
    const agreement = id
      ? await tx.shopifyBillingAgreement.findFirst({
          where: {
            id,
            organizationId: subscription.organizationId,
            status: "ACTIVE",
          },
        })
      : null;
    if (agreement?.periodStart && agreement.periodEnd) {
      start = agreement.periodStart;
      end = agreement.periodEnd;
    }
  }
  const existing = await tx.storeBillingCycle.findUnique({
    where: {
      subscriptionId_periodStart: {
        subscriptionId: subscription.id,
        periodStart: start,
      },
    },
  });
  if (existing) {
    await tx.storeSubscription.updateMany({
      where: { id: subscription.id, pricingPlanId: subscription.pricingPlanId },
      data: {
        billingAnchorAt: anchor,
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
    });
    return existing;
  }
  // Historical entry uses the switch-date price. Subsequent cycles use the version in effect at their start.
  const frozenShopifyTerms = shopifyManaged(subscription.metadata);
  const rate =
    firstRate || frozenShopifyTerms
      ? null
      : await tx.pricingPlanRate.findFirst({
          where: { pricingPlanId: plan.id, effectiveAt: { lte: start } },
          orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
        });
  const earliest =
    rate || firstRate || frozenShopifyTerms
      ? null
      : await tx.pricingPlanRate.findFirst({
          where: { pricingPlanId: plan.id },
          orderBy: [{ effectiveAt: "asc" }, { id: "asc" }],
        });
  const terms = rate ?? earliest ?? plan;
  const cycle = await tx.storeBillingCycle.upsert({
    where: {
      subscriptionId_periodStart: {
        subscriptionId: subscription.id,
        periodStart: start,
      },
    },
    create: {
      id: createSelfxId(),
      organizationId: subscription.organizationId,
      subscriptionId: subscription.id,
      pricingPlanId: plan.id,
      periodStart: start,
      periodEnd: end,
      currency: terms.currency,
      creditUnitPriceCents: terms.creditUnitPriceCents!,
    },
    update: {},
  });
  await tx.storeSubscription.update({
    where: { id: subscription.id },
    data: {
      billingAnchorAt: anchor,
      currentPeriodStart: start,
      currentPeriodEnd: end,
    },
  });
  return cycle;
}

/** Invoke in the same transaction that commits the usable result. One durable row per run. */
export async function recordSuccessfulGeneration(
  tx: BillingTx,
  run: KioskTryOnRun,
) {
  if (
    run.status !== "COMPLETED" ||
    !run.organizationId ||
    run.assignmentScope === "PLATFORM"
  )
    return;
  await lockBillingSubscription(tx, run.organizationId);
  const covered = await prepaidRunIds(tx, run.organizationId, [run]);
  let billingCycleId = run.billingCycleId;
  if (!billingCycleId && !covered.has(run.id)) {
    const subscription = await tx.storeSubscription.findUnique({
      where: { organizationId: run.organizationId },
      include: { pricingPlan: true },
    });
    if (
      subscription?.status === "ACTIVE" &&
      subscription.pricingPlan?.billingMode === "POSTPAID_PAYG"
    ) {
      billingCycleId = (await ensurePostpaidCycle(tx, subscription)).id;
    }
  }
  const coverage = covered.has(run.id)
    ? "PREPAID"
    : billingCycleId
      ? "POSTPAID"
      : "UNBILLED";
  await tx.billableGeneration.createMany({
    data: [
      {
        id: createSelfxId(),
        organizationId: run.organizationId,
        runId: run.id,
        channel: channelForRun(run),
        coverage,
        billingCycleId: coverage === "POSTPAID" ? billingCycleId : null,
        completedAt: run.completedAt ?? new Date(),
      },
    ],
    skipDuplicates: true,
  });
  await settleShopifyUsage(tx, run);
}

export async function getPostpaidSummary(
  tx: BillingTx,
  subscription: SubscriptionWithPlan,
): Promise<PostpaidSummary | null> {
  if (subscription.pricingPlan?.billingMode !== "POSTPAID_PAYG") return null;
  const cycle =
    subscription.status === "ACTIVE"
      ? await ensurePostpaidCycle(tx, subscription)
      : await tx.storeBillingCycle.findFirst({
          where: {
            organizationId: subscription.organizationId,
            subscriptionId: subscription.id,
          },
          orderBy: { periodStart: "desc" },
        });
  if (!cycle) return null;
  const [billableCredits, historicalCredits] = await Promise.all([
    tx.billableGeneration.count({
      where: {
        organizationId: subscription.organizationId,
        billingCycleId: cycle.id,
        coverage: "POSTPAID",
      },
    }),
    tx.billableGeneration.count({
      where: {
        organizationId: subscription.organizationId,
        billingCycleId: cycle.id,
        coverage: "POSTPAID",
        historical: true,
      },
    }),
  ]);
  return {
    billingMode: "POSTPAID_PAYG",
    timezone: "UTC",
    periodStart: cycle.periodStart.toISOString(),
    periodEnd: cycle.periodEnd.toISOString(),
    currency: cycle.currency,
    creditUnitPriceCents: cycle.creditUnitPriceCents,
    billableCredits,
    historicalCredits,
    estimatedAmountCents: (
      BigInt(billableCredits) * BigInt(cycle.creditUnitPriceCents)
    ).toString(),
  };
}

/** Only current-cycle, server-verifiable successes. Never infer a charge from an analytics total. */
export async function importCurrentCycleHistory(
  tx: BillingTx,
  cycle: StoreBillingCycle,
  until: Date,
) {
  const organizationId = cycle.organizationId;
  const interval = { gte: cycle.periodStart, lt: until };
  let cursor: string | undefined;
  for (;;) {
    const runs = await tx.kioskTryOnRun.findMany({
      where: {
        organizationId,
        assignmentScope: { not: "PLATFORM" },
        status: "COMPLETED",
        completedAt: interval,
        OR: [
          { look: { isNot: null } },
          { tryOnSessionId: null, resultImage: { startsWith: "data:image/" } },
        ],
      },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (runs.length === 0) break;
    const covered = await prepaidRunIds(tx, organizationId, runs);
    await tx.billableGeneration.createMany({
      data: runs.map((run) => ({
        id: createSelfxId(),
        organizationId,
        runId: run.id,
        channel: channelForRun(run),
        coverage: covered.has(run.id)
          ? ("PREPAID" as const)
          : ("UNBILLED" as const),
        completedAt: run.completedAt!,
        historical: true,
      })),
      skipDuplicates: true,
    });
    if (covered.size)
      await tx.billableGeneration.updateMany({
        where: {
          organizationId,
          runId: { in: [...covered] },
          coverage: "UNBILLED",
        },
        data: { coverage: "PREPAID" },
      });
    cursor = runs.at(-1)!.id;
  }
  cursor = undefined;
  for (;;) {
    const events: UsageEvent[] = await tx.usageEvent.findMany({
      where: {
        organizationId,
        assignmentScope: { not: "PLATFORM" },
        channel: "KIOSK",
        eventName: "KIOSK_TRY_ON_GENERATED",
        status: "COMPLETED",
        kioskTryOnRunId: { not: null },
        occurredAt: interval,
      },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (events.length === 0) break;
    const covered = await prepaidRunIds(
      tx,
      organizationId,
      events.map((event) => ({
        id: event.kioskTryOnRunId!,
        tryOnSessionId: null,
        clientRequestId: "",
      })),
    );
    await tx.billableGeneration.createMany({
      data: events.map((event) => ({
        id: createSelfxId(),
        organizationId,
        runId: event.kioskTryOnRunId!,
        channel: CreditLedgerChannel.KIOSK,
        coverage: covered.has(event.kioskTryOnRunId!)
          ? ("PREPAID" as const)
          : ("UNBILLED" as const),
        completedAt: event.occurredAt,
        historical: true,
      })),
      skipDuplicates: true,
    });
    if (covered.size)
      await tx.billableGeneration.updateMany({
        where: {
          organizationId,
          runId: { in: [...covered] },
          coverage: "UNBILLED",
        },
        data: { coverage: "PREPAID" },
      });
    cursor = events.at(-1)!.id;
  }
  await tx.$executeRaw`UPDATE billable_generations AS generation SET coverage = 'PREPAID'
    WHERE generation.organization_id = ${organizationId}::uuid AND generation.coverage = 'UNBILLED'
      AND generation.completed_at >= ${cycle.periodStart} AND generation.completed_at < ${until}
      AND EXISTS (SELECT 1 FROM credit_ledger_entries AS debit
        WHERE debit.organization_id = generation.organization_id AND debit.kiosk_try_on_run_id = generation.run_id
          AND debit.entry_type = 'CREDIT_CONSUMED' AND debit.quantity < 0)`;
  await tx.billableGeneration.updateMany({
    where: { organizationId, coverage: "UNBILLED", completedAt: interval },
    data: { coverage: "POSTPAID", billingCycleId: cycle.id, historical: true },
  });
}

function channelForRun(
  run: Pick<
    KioskTryOnRun,
    "billingChannel" | "apiKeyId" | "kioskDeviceId" | "catalogSource"
  >,
): CreditLedgerChannel | null {
  return (
    run.billingChannel ??
    (run.apiKeyId
      ? "PUBLIC_API"
      : run.kioskDeviceId
        ? "KIOSK"
        : run.catalogSource === "SHOPIFY"
          ? "SHOPIFY"
          : run.catalogSource === "WOOCOMMERCE"
            ? "WOOCOMMERCE"
            : null)
  );
}

async function prepaidRunIds(
  tx: BillingTx,
  organizationId: string,
  runs: Array<{
    id: string;
    tryOnSessionId: string | null;
    clientRequestId: string;
  }>,
) {
  const keys = new Map(
    runs
      .filter((run) => run.tryOnSessionId)
      .map((run) => [
        `tryon:shopify:${run.tryOnSessionId}:${run.clientRequestId}`,
        run.id,
      ]),
  );
  const debits = await tx.creditLedgerEntry.findMany({
    where: {
      organizationId,
      entryType: "CREDIT_CONSUMED",
      quantity: { lt: 0 },
      OR: [
        { kioskTryOnRunId: { in: runs.map((run) => run.id) } },
        { idempotencyKey: { in: [...keys.keys()] } },
      ],
    },
    select: { kioskTryOnRunId: true, idempotencyKey: true },
  });
  return new Set(
    debits.flatMap((debit) => {
      const id = debit.kioskTryOnRunId ?? keys.get(debit.idempotencyKey);
      return id ? [id] : [];
    }),
  );
}
