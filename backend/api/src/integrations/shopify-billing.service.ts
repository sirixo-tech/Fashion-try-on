import { createHash, randomUUID } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type PricingPlan } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { assertPhonePeUsageSettled } from "../entitlements/phonepe-store-billing.js";
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
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM organizations WHERE id = ${integration.organizationId}::uuid FOR UPDATE`;
      const connection = await tx.integration.findFirst({
        where: {
          id: integration.id,
          status: "ACTIVE",
          organization: { status: "ACTIVE" },
        },
      });
      if (!connection)
        throw billingError("The Store connection is no longer active.");
      await assertPhonePeUsageSettled(tx, integration.organizationId);
      const requestKey = createHash("sha256")
        .update(`${integration.id}:${input.clientRequestId ?? randomUUID()}`)
        .digest("hex");
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            planId: input.planId,
            usageCapCents: input.usageCapCents ?? null,
          }),
        )
        .digest("hex");
      const preparedResponse = (
        agreement: import("@prisma/client").ShopifyBillingAgreement,
        createAllowed: boolean,
      ) => {
        const terms = agreement.pricingSnapshot as unknown as Snapshot;
        return {
          id: agreement.id,
          plan: terms,
          usageCapCents: agreement.usageCapCents,
          usageTerms:
            terms.billingMode === "POSTPAID_PAYG"
              ? shopifyUsageTerms(terms.creditUnitPriceCents!, terms.currency)
              : null,
          createAllowed,
          confirmationUrl:
            agreement.status === "PENDING" && !agreement.approvedAt
              ? agreement.confirmationUrl
              : null,
          status: agreement.status,
        };
      };
      const existing = await tx.shopifyBillingAgreement.findUnique({
        where: { requestKey },
      });
      if (existing) {
        if (existing.requestFingerprint !== fingerprint)
          throw billingError(
            "This request was already used for another plan or spending cap.",
            "PLAN_CHANGE_REQUEST_CONFLICT",
          );
        return preparedResponse(existing, false);
      }
      const phonePe = await tx.storePlanPurchase.findFirst({
        where: {
          organizationId: integration.organizationId,
          status: {
            in: [
              "INITIALIZING",
              "INITIATING",
              "PENDING",
              "UNKNOWN",
              "SCHEDULED",
              "REVIEW_REQUIRED",
            ],
          },
        },
      });
      if (phonePe)
        throw billingError(
          "Finish or resolve this Store's PhonePe payment before changing its billing provider.",
          "PLAN_CHANGE_PENDING",
        );
      const current = await tx.storeSubscription.findUnique({
        where: { organizationId: integration.organizationId },
        include: { pricingPlan: true },
      });
      if (
        current?.status === "ACTIVE" &&
        current.pricingPlan?.billingMode !== "POSTPAID_PAYG" &&
        (!current.currentPeriodEnd || current.currentPeriodEnd > new Date()) &&
        current.pricingPlan?.code !== "selfx-default-starter" &&
        !(
          current.metadata &&
          typeof current.metadata === "object" &&
          !Array.isArray(current.metadata) &&
          current.metadata.billingProvider === "SHOPIFY"
        )
      )
        throw billingError(
          "This Store already has a SelfX-billed paid plan. Finish its current billing period before moving billing to Shopify.",
          "BILLING_PROVIDER_CONFLICT",
        );
      const pending = await tx.shopifyBillingAgreement.findFirst({
        where: {
          organizationId: integration.organizationId,
          status: { in: ["PENDING", "FROZEN"] },
        },
        orderBy: { createdAt: "desc" },
      });
      if (pending) {
        if (
          pending.status === "PENDING" &&
          pending.requestFingerprint === fingerprint
        )
          return preparedResponse(pending, false);
        throw billingError(
          "Finish or cancel the pending Shopify change before choosing another plan.",
          "PLAN_CHANGE_PENDING",
        );
      }
      const active = await tx.shopifyBillingAgreement.findFirst({
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
      if (
        active?.pricingPlanId === plan.id &&
        active.usageCapCents === (usage ? input.usageCapCents! : null)
      )
        throw billingError(
          "This plan is already active. Your allowance has not been reset.",
          "PLAN_ALREADY_ACTIVE",
        );
      const agreement = await tx.shopifyBillingAgreement.create({
        data: {
          id: createSelfxId(),
          organizationId: integration.organizationId,
          integrationId: integration.id,
          pricingPlanId: plan.id,
          shopDomain: input.shop,
          requestKey,
          requestFingerprint: fingerprint,
          creationStartedAt: new Date(),
          effectiveAfter: active?.periodEnd ?? null,
          usageCapCents: usage ? input.usageCapCents! : null,
          pricingSnapshot: price as unknown as Prisma.InputJsonObject,
        },
      });
      return preparedResponse(agreement, true);
    });
  }
  async declineUncreated(id: string, shop: string) {
    // Only used for a definitive Shopify user error with no created subscription.
    await this.prisma.shopifyBillingAgreement.updateMany({
      where: {
        id,
        shopDomain: shop,
        status: "PENDING",
        externalSubscriptionId: null,
      },
      data: { status: "DECLINED", confirmationUrl: null },
    });
    return { recorded: true };
  }
  async attach(
    id: string,
    shop: string,
    subscriptionId: string,
    confirmationUrl?: string,
  ) {
    if (confirmationUrl) {
      const url = new URL(confirmationUrl);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        ![shop, "admin.shopify.com"].includes(url.hostname)
      )
        throw billingError("Invalid Shopify approval destination.");
    }
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
        data: {
          externalSubscriptionId: subscriptionId,
          ...(confirmationUrl ? { confirmationUrl } : {}),
        },
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
        creationStartedAt: true,
        createdAt: true,
      },
    });
  }
  async retireMissing(id: string, shop: string, subscriptionId: string) {
    const agreement = await this.prisma.shopifyBillingAgreement.findFirst({
      where: { id, shopDomain: shop, externalSubscriptionId: subscriptionId },
    });
    if (!agreement)
      throw billingError(
        "This approval does not belong to the authenticated shop.",
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${agreement.organizationId}::uuid FOR UPDATE`;
      await tx.shopifyBillingAgreement.updateMany({
        where: { id, status: { in: ["ACTIVE", "FROZEN", "PENDING"] } },
        data: {
          status: "CANCELLED",
          checkedAt: new Date(),
          confirmationUrl: null,
        },
      });
      await tx.storeSubscription.updateMany({
        where: {
          organizationId: agreement.organizationId,
          metadata: { path: ["shopifyAgreementId"], equals: id },
        },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
    });
    return { retired: true };
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
    // A cancelled prior installation cannot accept new usage receipts. Keep its
    // financial rows for review rather than charging them to a new subscription
    // or letting them prevent the merchant from approving a fresh plan.
    await this.prisma.shopifyUsageCharge.updateMany({
      where: {
        status: "PENDING",
        agreement: {
          integrationId: integration.id,
          status: { in: ["CANCELLED", "DECLINED", "EXPIRED", "REPLACED"] },
        },
      },
      data: { status: "REVIEW_REQUIRED" },
    });
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
