import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Optional } from "@nestjs/common";
import {
  CreditLedgerChannel,
  CreditLedgerEntryType,
  Prisma,
  PricingPlanStatus,
  StoreSubscriptionStatus,
  type CreditLedgerEntry,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { GarmentPreviewSettingsService } from "../try-on/garment-preview-settings.service.js";
import {
  DEFAULT_TRIAL_CREDITS,
  DEFAULT_TRIAL_FEATURE_KEYS,
  ensureDefaultStarterPricingPlan,
} from "./default-trial.js";
import { featureKeysFromPricingPlanMetadata } from "./pricing-control.service.js";

export const ENTITLEMENT_ERROR_CODES = {
  creditsExhausted: "SELFX_CREDITS_EXHAUSTED",
  featureUnavailable: "SELFX_FEATURE_UNAVAILABLE",
  pricingPlanUnavailable: "PRICING_PLAN_UNAVAILABLE",
} as const;

export interface CreditBalance {
  availableCredits: number;
}

export interface StoreCreditSummary {
  availableCredits: number;
  subscription: {
    id: string;
    status: StoreSubscriptionStatus;
    channels: string[];
    includedCredits: number;
    trialCredits: number;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    featureKeys: string[];
    pricingPlan: {
      id: string;
      code: string;
      name: string;
      currency: string;
      monthlyPriceCents: number;
      includedCredits: number;
      storeLocationLimit: number | null;
      extraCreditPriceCents: number | null;
      kioskMonthlyRentCents: number | null;
      kioskDeviceLimit: number | null;
      channels: string[];
      featureKeys: string[];
    } | null;
  } | null;
}

export interface ConsumeTryOnCreditInput {
  organizationId: string;
  channel: CreditLedgerChannel;
  idempotencyKey: string;
  quantity?: number;
  reason?: string;
  tryOnSessionId?: string | null;
  kioskTryOnRunId?: string | null;
  productId?: string | null;
  integrationId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export interface ConsumeTryOnCreditResult {
  entry: CreditLedgerEntry;
  balanceBefore: number;
  balanceAfter: number;
}

export interface ManualCreditAdjustmentInput {
  organizationId: string;
  quantity: number;
  reason?: string;
  actorUserId?: string | null;
}

export interface StoreCreditDiagnostics {
  availableCredits: number;
  totals: {
    grantedCredits: number;
    consumedCredits: number;
    manualAdjustments: number;
    netCredits: number;
  };
  byChannel: Array<{
    channel: string;
    consumedCredits: number;
    runs: number;
  }>;
  topProducts: Array<{
    productId: string;
    productName: string;
    productSlug: string;
    consumedCredits: number;
    runs: number;
  }>;
  recentLedgerEntries: Array<{
    id: string;
    entryType: string;
    channel: string | null;
    quantity: number;
    balanceAfter: number | null;
    reason: string | null;
    productId: string | null;
    occurredAt: string;
  }>;
}

type EntitlementTx = Pick<
  PrismaService,
  "creditLedgerEntry" | "storeSubscription" | "pricingPlan"
>;

@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly platformSettings?: GarmentPreviewSettingsService,
  ) {}

  async getCreditBalance(organizationId: string): Promise<CreditBalance> {
    return this.getCreditBalanceWithClient(organizationId, this.prisma);
  }

  async getStoreCreditSummary(
    organizationId: string,
  ): Promise<StoreCreditSummary> {
    await this.ensureTrialCredits(organizationId);
    return this.getStoreCreditSummaryWithClient(organizationId, this.prisma);
  }

  async getStoreFeatureKeys(organizationId: string): Promise<string[]> {
    const summary = await this.getStoreCreditSummary(organizationId);
    return summary.subscription?.featureKeys ?? [];
  }

  async assertStoreHasFeature(
    organizationId: string,
    featureKey: string,
  ): Promise<void> {
    const featureKeys = await this.getStoreFeatureKeys(organizationId);
    if (!featureKeys.includes(featureKey)) {
      throw new ApiErrorException(
        HttpStatus.PAYMENT_REQUIRED,
        ENTITLEMENT_ERROR_CODES.featureUnavailable,
        "This feature is not included in the Store's current SelfX plan.",
      );
    }
  }

  async activatePlanForStore(
    input: {
      organizationId: string;
      pricingPlanId: string;
    },
    transaction?: Prisma.TransactionClient,
  ): Promise<StoreCreditSummary> {
    const activate = async (tx: Prisma.TransactionClient) => {
      const now = new Date();
      const plan = await tx.pricingPlan.findFirst({
        where: {
          id: input.pricingPlanId,
          status: PricingPlanStatus.ACTIVE,
        },
      });
      if (!plan) {
        throw pricingPlanUnavailable();
      }
      await this.ensureTrialCredits(input.organizationId, tx);

      const current = await tx.storeSubscription.findUnique({
        where: { organizationId: input.organizationId },
      });
      const sameActivePeriod =
        current?.pricingPlanId === plan.id &&
        current.status === StoreSubscriptionStatus.ACTIVE &&
        current.currentPeriodEnd != null &&
        current.currentPeriodEnd > now;
      const currentPeriodStart = sameActivePeriod
        ? current.currentPeriodStart
        : now;
      const currentPeriodEnd = sameActivePeriod
        ? current.currentPeriodEnd
        : addMonths(now, 1);

      const subscription = await tx.storeSubscription.upsert({
        where: { organizationId: input.organizationId },
        create: {
          id: createSelfxId(),
          organizationId: input.organizationId,
          pricingPlanId: plan.id,
          status: StoreSubscriptionStatus.ACTIVE,
          channels: jsonStringArray(plan.channels),
          includedCredits: plan.includedCredits,
          trialCredits: plan.trialCredits,
          currentPeriodStart,
          currentPeriodEnd,
          metadata: subscriptionMetadataForPlan(plan),
        },
        update: {
          pricingPlanId: plan.id,
          status: StoreSubscriptionStatus.ACTIVE,
          channels: jsonStringArray(plan.channels),
          includedCredits: plan.includedCredits,
          trialCredits: plan.trialCredits,
          currentPeriodStart,
          currentPeriodEnd,
          metadata: subscriptionMetadataForPlan(plan),
        },
        select: { id: true },
      });

      if (!sameActivePeriod && plan.includedCredits > 0) {
        const balance = await this.getCreditBalanceWithClient(
          input.organizationId,
          tx,
        );
        await this.createLedgerEntryIdempotently(tx, {
          id: createSelfxId(),
          organizationId: input.organizationId,
          subscriptionId: subscription.id,
          pricingPlanId: plan.id,
          entryType: CreditLedgerEntryType.PLAN_GRANTED,
          channel: null,
          quantity: plan.includedCredits,
          balanceAfter: balance.availableCredits + plan.includedCredits,
          idempotencyKey: planGrantIdempotencyKey({
            organizationId: input.organizationId,
            pricingPlanId: plan.id,
            periodStart: currentPeriodStart,
          }),
          reason: `Activated ${plan.name}`,
          metadata: {
            pricingPlanCode: plan.code,
            includedCredits: plan.includedCredits,
            storeLocationLimit: plan.storeLocationLimit,
            featureKeys: featureKeysFromPricingPlanMetadata(plan.metadata),
          },
          occurredAt: now,
        });
      }

      return this.getStoreCreditSummaryWithClient(input.organizationId, tx);
    };
    return transaction
      ? activate(transaction)
      : this.prisma.$transaction(activate);
  }

  async topUpStoreCredits(
    input: ManualCreditAdjustmentInput,
  ): Promise<StoreCreditSummary> {
    const quantity = cleanPositiveAdjustment(input.quantity);
    return this.prisma.$transaction(async (tx) => {
      await this.ensureTrialCredits(input.organizationId, tx);
      const subscription = await tx.storeSubscription.findUnique({
        where: { organizationId: input.organizationId },
        select: { id: true, pricingPlanId: true },
      });
      const balance = await this.getCreditBalanceWithClient(
        input.organizationId,
        tx,
      );
      await tx.creditLedgerEntry.create({
        data: {
          id: createSelfxId(),
          organizationId: input.organizationId,
          subscriptionId: subscription?.id ?? null,
          pricingPlanId: subscription?.pricingPlanId ?? null,
          entryType: CreditLedgerEntryType.MANUAL_ADJUSTMENT,
          channel: CreditLedgerChannel.ADMIN,
          quantity,
          balanceAfter: balance.availableCredits + quantity,
          idempotencyKey: `manual:${input.organizationId}:${randomUUID()}`,
          reason: cleanReason(input.reason) ?? "Manual credit top-up",
          metadata: {
            adjustmentSource: "SELFX_ADMIN",
            actorUserId: input.actorUserId ?? null,
          },
        },
      });
      return this.getStoreCreditSummaryWithClient(input.organizationId, tx);
    });
  }

  async getStoreCreditDiagnostics(
    organizationId: string,
  ): Promise<StoreCreditDiagnostics> {
    await this.ensureTrialCredits(organizationId);
    const [balance, typeRows, channelRows, productRows, recentLedgerEntries] =
      await Promise.all([
        this.getCreditBalance(organizationId),
        this.prisma.creditLedgerEntry.groupBy({
          by: ["entryType"],
          where: { organizationId },
          _sum: { quantity: true },
        }),
        this.prisma.creditLedgerEntry.groupBy({
          by: ["channel"],
          where: {
            organizationId,
            entryType: CreditLedgerEntryType.CREDIT_CONSUMED,
          },
          _sum: { quantity: true },
          _count: { _all: true },
        }),
        this.prisma.creditLedgerEntry.groupBy({
          by: ["productId"],
          where: {
            organizationId,
            entryType: CreditLedgerEntryType.CREDIT_CONSUMED,
            productId: { not: null },
          },
          _sum: { quantity: true },
          _count: { _all: true },
          orderBy: { _count: { productId: "desc" } },
          take: 5,
        }),
        this.prisma.creditLedgerEntry.findMany({
          where: { organizationId },
          orderBy: { occurredAt: "desc" },
          take: 12,
          select: {
            id: true,
            entryType: true,
            channel: true,
            quantity: true,
            balanceAfter: true,
            reason: true,
            productId: true,
            occurredAt: true,
          },
        }),
      ]);
    const productIds = productRows
      .map((row) => row.productId)
      .filter((productId): productId is string => Boolean(productId));
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, slug: true },
        })
      : [];
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    return {
      availableCredits: balance.availableCredits,
      totals: creditTotals(typeRows),
      byChannel: channelRows.map((row) => ({
        channel: row.channel ?? "UNKNOWN",
        consumedCredits: Math.abs(row._sum.quantity ?? 0),
        runs: row._count._all,
      })),
      topProducts: productRows
        .filter((row) => row.productId)
        .map((row) => {
          const product = productsById.get(row.productId!);
          return {
            productId: row.productId!,
            productName: product?.name ?? "Unknown product",
            productSlug: product?.slug ?? "",
            consumedCredits: Math.abs(row._sum.quantity ?? 0),
            runs: row._count._all,
          };
        }),
      recentLedgerEntries: recentLedgerEntries.map((entry) => ({
        id: entry.id,
        entryType: entry.entryType,
        channel: entry.channel,
        quantity: entry.quantity,
        balanceAfter: entry.balanceAfter,
        reason: entry.reason,
        productId: entry.productId,
        occurredAt: entry.occurredAt.toISOString(),
      })),
    };
  }

  async ensureTrialCredits(
    organizationId: string,
    tx: EntitlementTx = this.prisma,
  ): Promise<void> {
    const now = new Date();
    const defaultPlan = await ensureDefaultStarterPricingPlan(
      tx,
      await this.platformDefaultCurrency(),
    );
    const subscription = await tx.storeSubscription.upsert({
      where: { organizationId },
      create: {
        id: createSelfxId(),
        organizationId,
        pricingPlanId: defaultPlan.id,
        status: "TRIALING",
        channels: jsonStringArray(defaultPlan.channels),
        includedCredits: defaultPlan.includedCredits,
        trialCredits: defaultPlan.trialCredits,
        trialStartedAt: now,
        metadata: subscriptionMetadataForPlan(defaultPlan),
      },
      update: {},
      select: { id: true, pricingPlanId: true, status: true },
    });
    const effectiveSubscription =
      subscription.status === StoreSubscriptionStatus.TRIALING &&
      subscription.pricingPlanId === null
        ? await tx.storeSubscription.update({
            where: { organizationId },
            data: {
              pricingPlanId: defaultPlan.id,
              channels: jsonStringArray(defaultPlan.channels),
              includedCredits: defaultPlan.includedCredits,
              trialCredits: defaultPlan.trialCredits,
              metadata: subscriptionMetadataForPlan(defaultPlan),
            },
            select: { id: true, pricingPlanId: true },
          })
        : subscription;

    await this.createLedgerEntryIdempotently(tx, {
      id: createSelfxId(),
      organizationId,
      subscriptionId: effectiveSubscription.id,
      pricingPlanId: effectiveSubscription.pricingPlanId,
      entryType: CreditLedgerEntryType.TRIAL_GRANTED,
      channel: null,
      quantity: defaultPlan.trialCredits,
      balanceAfter: null,
      idempotencyKey: trialGrantIdempotencyKey(organizationId),
      reason: "Initial SelfX trial credits",
      metadata: {
        pricingPlanCode: defaultPlan.code,
        trialCredits: defaultPlan.trialCredits,
      },
      occurredAt: now,
    });
  }

  async assertCanGenerateTryOn(input: {
    organizationId: string;
    quantity?: number;
  }): Promise<CreditBalance> {
    await this.ensureTrialCredits(input.organizationId);
    const balance = await this.getCreditBalance(input.organizationId);
    const quantity = cleanQuantity(input.quantity);
    if (balance.availableCredits < quantity) {
      throw creditsExhausted();
    }
    return balance;
  }

  async consumeTryOnCredit(
    input: ConsumeTryOnCreditInput,
  ): Promise<ConsumeTryOnCreditResult> {
    const quantity = cleanQuantity(input.quantity);
    return this.prisma.$transaction(async (tx) => {
      await this.ensureTrialCredits(input.organizationId, tx);

      const existing = await tx.creditLedgerEntry.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        const balance = await this.getCreditBalanceWithClient(
          input.organizationId,
          tx,
        );
        return {
          entry: existing,
          balanceBefore: balance.availableCredits,
          balanceAfter: existing.balanceAfter ?? balance.availableCredits,
        };
      }

      const balance = await this.getCreditBalanceWithClient(
        input.organizationId,
        tx,
      );
      if (balance.availableCredits < quantity) {
        throw creditsExhausted();
      }

      const balanceAfter = balance.availableCredits - quantity;
      const entry = await tx.creditLedgerEntry.create({
        data: {
          id: createSelfxId(),
          organizationId: input.organizationId,
          entryType: CreditLedgerEntryType.CREDIT_CONSUMED,
          channel: input.channel,
          quantity: -quantity,
          balanceAfter,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason ?? "Try-On generation",
          tryOnSessionId: input.tryOnSessionId ?? null,
          kioskTryOnRunId: input.kioskTryOnRunId ?? null,
          productId: input.productId ?? null,
          integrationId: input.integrationId ?? null,
          metadata: input.metadata,
        },
      });
      return {
        entry,
        balanceBefore: balance.availableCredits,
        balanceAfter,
      };
    });
  }

  private async getCreditBalanceWithClient(
    organizationId: string,
    tx: Pick<PrismaService, "creditLedgerEntry">,
  ): Promise<CreditBalance> {
    const aggregate = await tx.creditLedgerEntry.aggregate({
      where: { organizationId },
      _sum: { quantity: true },
    });
    return {
      availableCredits: aggregate._sum.quantity ?? 0,
    };
  }

  private async getStoreCreditSummaryWithClient(
    organizationId: string,
    tx: Pick<PrismaService, "creditLedgerEntry" | "storeSubscription">,
  ): Promise<StoreCreditSummary> {
    const [balance, subscription] = await Promise.all([
      this.getCreditBalanceWithClient(organizationId, tx),
      tx.storeSubscription.findUnique({
        where: { organizationId },
        include: { pricingPlan: true },
      }),
    ]);

    return {
      availableCredits: balance.availableCredits,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            channels: jsonArrayToStrings(subscription.channels),
            includedCredits: subscription.includedCredits,
            trialCredits: subscription.trialCredits,
            currentPeriodStart:
              subscription.currentPeriodStart?.toISOString() ?? null,
            currentPeriodEnd:
              subscription.currentPeriodEnd?.toISOString() ?? null,
            trialStartedAt: subscription.trialStartedAt?.toISOString() ?? null,
            trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
            featureKeys: subscriptionFeatureKeys(subscription),
            pricingPlan: subscription.pricingPlan
              ? {
                  id: subscription.pricingPlan.id,
                  code: subscription.pricingPlan.code,
                  name: subscription.pricingPlan.name,
                  currency: subscription.pricingPlan.currency,
                  monthlyPriceCents: subscription.pricingPlan.monthlyPriceCents,
                  includedCredits: subscription.pricingPlan.includedCredits,
                  storeLocationLimit:
                    subscription.pricingPlan.storeLocationLimit,
                  extraCreditPriceCents:
                    subscription.pricingPlan.extraCreditPriceCents,
                  kioskMonthlyRentCents:
                    subscription.pricingPlan.kioskMonthlyRentCents,
                  kioskDeviceLimit: subscription.pricingPlan.kioskDeviceLimit,
                  channels: jsonArrayToStrings(
                    subscription.pricingPlan.channels,
                  ),
                  featureKeys: featureKeysFromPricingPlanMetadata(
                    subscription.pricingPlan.metadata,
                  ),
                }
              : null,
          }
        : null,
    };
  }

  private async createLedgerEntryIdempotently(
    tx: Pick<PrismaService, "creditLedgerEntry">,
    data: Prisma.CreditLedgerEntryUncheckedCreateInput,
  ): Promise<void> {
    try {
      await tx.creditLedgerEntry.create({ data });
    } catch (error) {
      if (!isUniqueConflict(error)) {
        throw error;
      }
    }
  }

  private async platformDefaultCurrency(): Promise<string> {
    try {
      return (
        (await this.platformSettings?.platformDefaultCurrency())?.trim() ||
        "USD"
      ).toUpperCase();
    } catch {
      return "USD";
    }
  }
}

function subscriptionMetadataForPlan(plan: {
  code: string;
  storeLocationLimit: number | null;
  metadata: Prisma.JsonValue | null;
}): Prisma.InputJsonObject {
  return {
    pricingPlanCode: plan.code,
    storeLocationLimit: plan.storeLocationLimit,
    featureKeys: featureKeysFromPricingPlanMetadata(plan.metadata),
  };
}

function subscriptionFeatureKeys(subscription: {
  status: StoreSubscriptionStatus;
  pricingPlanId: string | null;
  metadata: Prisma.JsonValue | null;
  pricingPlan?: { metadata: Prisma.JsonValue | null } | null;
}): string[] {
  if (subscription.pricingPlan) {
    const pricingPlanFeatureKeys = featureKeysFromPricingPlanMetadata(
      subscription.pricingPlan.metadata,
    );
    if (pricingPlanFeatureKeys.length > 0) {
      return pricingPlanFeatureKeys;
    }
  }
  const featureKeys = featureKeysFromPricingPlanMetadata(subscription.metadata);
  if (featureKeys.length > 0) {
    return featureKeys;
  }
  if (
    subscription.status === StoreSubscriptionStatus.TRIALING &&
    subscription.pricingPlanId === null
  ) {
    return [...DEFAULT_TRIAL_FEATURE_KEYS];
  }
  return [];
}

function cleanQuantity(value: number | undefined): number {
  return value && Number.isInteger(value) && value > 0 ? value : 1;
}

function cleanPositiveAdjustment(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > 1_000_000) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      "SELFX_CREDIT_ADJUSTMENT_INVALID",
      "Manual credit top-up must be a positive whole number up to 1,000,000.",
    );
  }
  return value;
}

function cleanReason(value: string | undefined): string | null {
  const clean = value?.trim();
  return clean ? clean.slice(0, 240) : null;
}

function creditTotals(
  rows: Array<{
    entryType: CreditLedgerEntryType;
    _sum: { quantity: number | null };
  }>,
): StoreCreditDiagnostics["totals"] {
  let grantedCredits = 0;
  let consumedCredits = 0;
  let manualAdjustments = 0;
  let netCredits = 0;
  for (const row of rows) {
    const quantity = row._sum.quantity ?? 0;
    netCredits += quantity;
    if (row.entryType === CreditLedgerEntryType.CREDIT_CONSUMED) {
      consumedCredits += Math.abs(quantity);
    } else if (row.entryType === CreditLedgerEntryType.MANUAL_ADJUSTMENT) {
      manualAdjustments += quantity;
    } else if (quantity > 0) {
      grantedCredits += quantity;
    }
  }
  return { grantedCredits, consumedCredits, manualAdjustments, netCredits };
}

function trialGrantIdempotencyKey(organizationId: string): string {
  return `trial:${organizationId}:v1`;
}

function planGrantIdempotencyKey(input: {
  organizationId: string;
  pricingPlanId: string;
  periodStart: Date | null;
}): string {
  return [
    "plan",
    input.organizationId,
    input.pricingPlanId,
    input.periodStart?.toISOString() ?? "no-period",
  ].join(":");
}

function addMonths(value: Date, months: number): Date {
  const next = new Date(value);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function jsonStringArray(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return jsonArrayToStrings(value);
}

function jsonArrayToStrings(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function creditsExhausted(): ApiErrorException {
  return new ApiErrorException(
    HttpStatus.PAYMENT_REQUIRED,
    ENTITLEMENT_ERROR_CODES.creditsExhausted,
    "SelfX Try-On credits are exhausted. Choose a plan or add credits to continue.",
  );
}

function pricingPlanUnavailable(): ApiErrorException {
  return new ApiErrorException(
    HttpStatus.NOT_FOUND,
    ENTITLEMENT_ERROR_CODES.pricingPlanUnavailable,
    "Pricing plan is not active or was not found.",
  );
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
