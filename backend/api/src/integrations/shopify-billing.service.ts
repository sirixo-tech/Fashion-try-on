import { createHash } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type PricingPlan } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import type {
  PrepareShopifyBillingDto,
  VerifyShopifyBillingDto,
} from "./dto/shopify-billing.dto.js";

type Snapshot = {
  name: string;
  currency: string;
  monthlyPriceCents: number;
  billingMode: string;
  creditUnitPriceCents: number | null;
  includedCredits: number;
  channels: string[];
  signature: string;
  planTerms: PricingPlan;
};
function snapshot(plan: PricingPlan): Snapshot {
  const value = {
    name: plan.name,
    currency: plan.currency,
    monthlyPriceCents: plan.monthlyPriceCents,
    billingMode: plan.billingMode,
    creditUnitPriceCents: plan.creditUnitPriceCents,
    includedCredits: plan.includedCredits,
    channels: Array.isArray(plan.channels)
      ? plan.channels.filter((c): c is string => typeof c === "string")
      : [],
  };
  return {
    ...value,
    signature: createHash("sha256")
      .update(JSON.stringify({ ...value, metadata: plan.metadata }))
      .digest("hex"),
    planTerms: JSON.parse(JSON.stringify(plan)),
  };
}
function billingError(message: string, code = "SHOPIFY_BILLING_INVALID") {
  return new ApiErrorException(HttpStatus.CONFLICT, code, message);
}
export function shopifyUsageTerms(rate: number, currency: string) {
  return `${currency} ${(rate / 100).toFixed(2)} per successfully generated SelfX Try-On across this Store's channels, up to the approved usage cap per 30-day billing period.`;
}

@Injectable()
export class ShopifyBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}
  private async integration(shop: string, active = true) {
    const item = await this.prisma.integration.findFirst({
      where: {
        type: "SHOPIFY",
        ...(active
          ? { status: "ACTIVE", organization: { status: "ACTIVE" } }
          : {}),
        metadata: { path: ["shopDomain"], equals: shop },
      },
    });
    if (!item)
      throw billingError(
        "Connect this Shopify shop to its approved SelfX Store first.",
      );
    return item;
  }
  async prepare(input: PrepareShopifyBillingDto) {
    if (process.env.SHOPIFY_BILLING_ENABLED !== "true")
      throw billingError("Shopify billing is not enabled in this deployment.");
    const integration = await this.integration(input.shop);
    const plan = await this.prisma.pricingPlan.findFirst({
      where: { id: input.planId, status: "ACTIVE" },
    });
    if (
      !plan ||
      !Array.isArray(plan.channels) ||
      !plan.channels.includes("SHOPIFY")
    )
      throw billingError("Choose an active Shopify-compatible SelfX plan.");
    const price = snapshot(plan);
    const active = await this.prisma.shopifyBillingAgreement.findFirst({
      where: {
        organizationId: integration.organizationId,
        status: "ACTIVE",
        periodEnd: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (
      active &&
      (active.pricingSnapshot as unknown as Snapshot).currency !==
        price.currency
    )
      throw billingError(
        "Choose a plan in your current billing currency. Shopify cannot defer a currency change until renewal.",
      );
    const usage = price.billingMode === "POSTPAID_PAYG";
    if (
      usage &&
      (!input.usageCapCents ||
        !price.creditUnitPriceCents ||
        input.usageCapCents < price.creditUnitPriceCents)
    )
      throw billingError(
        "Enter a usage spending cap covering at least one Try-On.",
      );
    if (!usage && price.monthlyPriceCents <= 0)
      throw billingError(
        "The free Starter allowance is assigned when you connect. This plan does not need Shopify payment approval.",
      );
    const agreement = await this.prisma.shopifyBillingAgreement.create({
      data: {
        id: createSelfxId(),
        organizationId: integration.organizationId,
        integrationId: integration.id,
        pricingPlanId: plan.id,
        shopDomain: input.shop,
        effectiveAfter: active?.periodEnd ?? null,
        usageCapCents: usage ? input.usageCapCents! : null,
        pricingSnapshot: price as unknown as Prisma.InputJsonObject,
      },
    });
    return {
      id: agreement.id,
      plan: price,
      usageCapCents: agreement.usageCapCents,
      usageTerms: usage
        ? shopifyUsageTerms(price.creditUnitPriceCents!, price.currency)
        : null,
    };
  }
  async attach(id: string, shop: string, subscriptionId: string) {
    const current = await this.prisma.shopifyBillingAgreement.findFirst({
      where: { id, shopDomain: shop, status: "PENDING" },
    });
    if (!current)
      throw billingError("The payment approval request is no longer valid.");
    const changed = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM organizations WHERE id = ${current.organizationId}::uuid FOR UPDATE`;
      const connection = await tx.integration.findFirst({
        where: {
          id: current.integrationId,
          status: "ACTIVE",
          organization: { status: "ACTIVE" },
        },
      });
      if (!connection)
        throw billingError("The Store connection is no longer active.");
      return tx.shopifyBillingAgreement.updateMany({
        where: {
          id,
          shopDomain: shop,
          status: "PENDING",
          OR: [
            { externalSubscriptionId: null },
            { externalSubscriptionId: subscriptionId },
          ],
        },
        data: { externalSubscriptionId: subscriptionId },
      });
    });
    if (changed.count !== 1)
      throw billingError(
        "This approval already belongs to another subscription.",
      );
    return { attached: true };
  }
  async list(shop: string) {
    const integration = await this.integration(shop, false);
    return this.prisma.shopifyBillingAgreement.findMany({
      where: {
        integrationId: integration.id,
        status: { in: ["PENDING", "ACTIVE", "FROZEN"] },
        externalSubscriptionId: { not: null },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 25,
      select: {
        id: true,
        externalSubscriptionId: true,
        status: true,
        effectiveAfter: true,
        approvedAt: true,
        pricingSnapshot: true,
      },
    });
  }
  async confirm(id: string, input: VerifyShopifyBillingDto) {
    const agreement = await this.prisma.shopifyBillingAgreement.findFirst({
      where: {
        id,
        shopDomain: input.shop,
        externalSubscriptionId: input.subscriptionId,
      },
      include: { pricingPlan: true },
    });
    if (!agreement)
      throw billingError(
        "Shopify subscription does not match this Store's approval.",
      );
    const price = agreement.pricingSnapshot as unknown as Snapshot;
    if (input.test !== (process.env.SHOPIFY_BILLING_TEST_MODE === "true"))
      throw billingError(
        "The Shopify billing environment does not match SelfX.",
      );
    if (input.status !== "ACTIVE" && input.status !== "ACCEPTED") {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM organizations WHERE id = ${agreement.organizationId}::uuid FOR UPDATE`;
        const latest = await tx.shopifyBillingAgreement.findUniqueOrThrow({
          where: { id },
        });
        if (
          ["CANCELLED", "DECLINED", "EXPIRED", "REPLACED"].includes(
            latest.status,
          )
        )
          return;
        if (
          input.status === "PENDING" &&
          ["ACTIVE", "FROZEN"].includes(latest.status)
        )
          return;
        await tx.shopifyBillingAgreement.update({
          where: { id },
          data: { status: input.status, checkedAt: new Date() },
        });
        if (
          latest.status === "ACTIVE" &&
          !(await tx.shopifyBillingAgreement.count({
            where: {
              organizationId: agreement.organizationId,
              status: "ACTIVE",
              id: { not: id },
            },
          }))
        ) {
          await tx.storeSubscription.updateMany({
            where: {
              organizationId: agreement.organizationId,
              metadata: { path: ["shopifyAgreementId"], equals: id },
            },
            data: { status: "CANCELLED", cancelledAt: new Date() },
          });
        }
      });
      return { active: false };
    }
    await this.integration(input.shop);
    if (
      input.currency !== price.currency ||
      input.recurringAmountCents !== price.monthlyPriceCents
    )
      throw billingError(
        "Shopify's approved amount does not match the selected SelfX plan.",
      );
    if (
      price.billingMode === "POSTPAID_PAYG" &&
      (!input.usageLineItemId ||
        input.usageCapCents !== agreement.usageCapCents ||
        input.usageTerms !==
          shopifyUsageTerms(price.creditUnitPriceCents!, price.currency))
    )
      throw billingError(
        "Shopify usage terms do not match the approved cap and rate.",
      );
    if (
      input.status === "ACCEPTED" ||
      (agreement.effectiveAfter && agreement.effectiveAfter > new Date())
    ) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM organizations WHERE id = ${agreement.organizationId}::uuid FOR UPDATE`;
        const latest = await tx.shopifyBillingAgreement.findUniqueOrThrow({
          where: { id },
        });
        if (
          ["CANCELLED", "DECLINED", "EXPIRED", "REPLACED"].includes(
            latest.status,
          )
        )
          throw billingError("This approval is no longer active.");
        if (latest.status === "ACTIVE") return;
        await tx.shopifyBillingAgreement.update({
          where: { id },
          data: {
            status: "PENDING",
            approvedAt: latest.approvedAt ?? new Date(),
            checkedAt: new Date(),
          },
        });
      });
      return {
        active: false,
        scheduled: true,
        effectiveAfter: agreement.effectiveAfter?.toISOString(),
      };
    }
    const end = new Date(input.periodEnd ?? "");
    if (
      !Number.isFinite(end.getTime()) ||
      end <= new Date() ||
      end.getTime() > Date.now() + 35 * 86400_000
    )
      throw billingError("Shopify returned an invalid subscription period.");
    const start = new Date(end.getTime() - 30 * 86400_000);
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM organizations WHERE id = ${agreement.organizationId}::uuid FOR UPDATE`;
        const store = await tx.organization.findUniqueOrThrow({
          where: { id: agreement.organizationId },
        });
        const connection = await tx.integration.findUniqueOrThrow({
          where: { id: agreement.integrationId },
        });
        if (store.status !== "ACTIVE" || connection.status !== "ACTIVE")
          throw billingError("This Store or its connection is inactive.");
        const latest = await tx.shopifyBillingAgreement.findUniqueOrThrow({
          where: { id },
        });
        if (
          ["CANCELLED", "DECLINED", "EXPIRED", "REPLACED"].includes(
            latest.status,
          )
        )
          throw billingError(
            "This Shopify subscription is no longer active. Choose a new approval.",
          );
        if (latest.periodEnd && end < latest.periodEnd) return;
        await tx.shopifyBillingAgreement.update({
          where: { id },
          data: {
            status: "ACTIVE",
            periodStart: start,
            periodEnd: end,
            approvedAt: latest.approvedAt ?? new Date(),
            checkedAt: new Date(),
            usageLineItemId: input.usageLineItemId ?? null,
          },
        });
        await this.entitlements.activatePlanForStore(
          {
            organizationId: agreement.organizationId,
            pricingPlanId: agreement.pricingPlanId,
            billingProvider: "SHOPIFY",
            shopifyAgreementId: id,
            approvedPlanSnapshot: price.planTerms,
            externalPeriod: { start, end },
          },
          tx,
        );
        const subscription = await tx.storeSubscription.findUniqueOrThrow({
          where: { organizationId: agreement.organizationId },
        });
        const metadata =
          subscription.metadata &&
          typeof subscription.metadata === "object" &&
          !Array.isArray(subscription.metadata)
            ? subscription.metadata
            : {};
        await tx.storeSubscription.update({
          where: { id: subscription.id },
          data: {
            metadata: {
              ...metadata,
              billingProvider: "SHOPIFY",
              shopifyAgreementId: id,
            },
          },
        });
        await tx.shopifyBillingAgreement.updateMany({
          where: {
            organizationId: agreement.organizationId,
            status: "ACTIVE",
            id: { not: id },
          },
          data: { status: "REPLACED" },
        });
      },
      { timeout: 15_000 },
    );
    return { active: true };
  }
  async pendingUsage(shop: string) {
    const integration = await this.integration(shop, false);
    // Charges are created only alongside a completed result with an approved
    // reservation. Never import old Store history into Shopify billing.
    await this.prisma.shopifyUsageReservation.updateMany({
      where: {
        agreement: { integrationId: integration.id },
        state: "RESERVED",
        OR: [
          { run: { is: { status: "FAILED" } } },
          { run: null, createdAt: { lt: new Date(Date.now() - 15 * 60_000) } },
        ],
      },
      data: { state: "RELEASED" },
    });
    return this.prisma.shopifyUsageCharge.findMany({
      where: {
        status: "PENDING",
        agreement: { integrationId: integration.id },
      },
      include: { agreement: { select: { usageLineItemId: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
  }
  async acknowledgeUsage(id: string, shop: string, usageRecordId: string) {
    const changed = await this.prisma.shopifyUsageCharge.updateMany({
      where: {
        id,
        agreement: { shopDomain: shop },
        OR: [
          { externalUsageRecordId: null },
          { externalUsageRecordId: usageRecordId },
        ],
      },
      data: { status: "SUBMITTED", externalUsageRecordId: usageRecordId },
    });
    if (changed.count !== 1)
      throw billingError("Usage receipt does not match the pending charge.");
    return { recorded: true };
  }
}
