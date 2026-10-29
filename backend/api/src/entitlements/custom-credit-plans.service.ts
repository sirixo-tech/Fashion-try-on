import { Injectable } from "@nestjs/common";
import { CustomCreditChannel, PricingPlanStatus } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";

export const MOBILE_CUSTOM_CREDIT_LIMIT = 1000;
export const STORE_CUSTOM_CREDIT_LIMIT = 1000;
const MAX_QUOTE_MINOR = 2_000_000_000;

export function customCreditTotal(
  channel: CustomCreditChannel,
  quantity: number,
  unitPriceCents: number,
): number {
  const limit =
    channel === CustomCreditChannel.MOBILE
      ? MOBILE_CUSTOM_CREDIT_LIMIT
      : STORE_CUSTOM_CREDIT_LIMIT;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > limit)
    throw new ApiErrorException(
      400,
      "CUSTOM_CREDIT_QUANTITY_INVALID",
      `Choose 1 to ${limit.toLocaleString("en-US")} credits.`,
    );
  const total = quantity * unitPriceCents;
  const minimum = channel === CustomCreditChannel.MOBILE ? 100 : 1;
  if (
    !Number.isSafeInteger(total) ||
    total < minimum ||
    total > MAX_QUOTE_MINOR
  )
    throw new ApiErrorException(
      400,
      "CUSTOM_CREDIT_TOTAL_INVALID",
      "This credit quantity exceeds the supported quote amount.",
    );
  return total;
}

@Injectable()
export class CustomCreditPlansService {
  constructor(private readonly db: PrismaService) {}

  current(channel: CustomCreditChannel) {
    return this.db.customCreditPlan.findUnique({ where: { channel } });
  }

  async save(
    channel: CustomCreditChannel,
    actorUserId: string,
    input: {
      name: string;
      status: PricingPlanStatus;
      currency: string;
      unitPriceCents: number;
      expectedVersion: number;
    },
  ) {
    const minPrice = channel === CustomCreditChannel.MOBILE ? 100 : 1;
    if (
      input.name.trim().length < 2 ||
      input.name.trim().length > 160 ||
      !/^[A-Z]{3}$/.test(input.currency) ||
      (channel === CustomCreditChannel.MOBILE && input.currency !== "INR") ||
      (input.status !== PricingPlanStatus.ACTIVE &&
        input.status !== PricingPlanStatus.INACTIVE) ||
      !Number.isInteger(input.unitPriceCents) ||
      input.unitPriceCents < minPrice ||
      input.unitPriceCents > MAX_QUOTE_MINOR / STORE_CUSTOM_CREDIT_LIMIT ||
      !Number.isInteger(input.expectedVersion) ||
      input.expectedVersion < 0
    )
      throw new ApiErrorException(
        400,
        "CUSTOM_CREDIT_PLAN_INVALID",
        "Enter a valid custom credit plan and per-credit price.",
      );
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`custom-credit-plan:${channel}`}, 0))::text`;
      const previous = await tx.customCreditPlan.findUnique({
        where: { channel },
      });
      if ((previous?.version ?? 0) !== input.expectedVersion)
        throw new ApiErrorException(
          409,
          "CUSTOM_CREDIT_PLAN_CHANGED",
          "The plan changed. Refresh and try again.",
        );
      const plan = await tx.customCreditPlan.upsert({
        where: { channel },
        create: {
          id: createSelfxId(),
          channel,
          name: input.name.trim(),
          status: input.status,
          currency: input.currency,
          unitPriceCents: input.unitPriceCents,
          version: 1,
        },
        update: {
          name: input.name.trim(),
          status: input.status,
          currency: input.currency,
          unitPriceCents: input.unitPriceCents,
          version: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId,
          action: "CUSTOM_CREDIT_PLAN_SAVED",
          resourceType: "CUSTOM_CREDIT_PLAN",
          resourceId: plan.id,
          metadata: {
            channel,
            currency: plan.currency,
            unitPriceCents: plan.unitPriceCents,
            previousUnitPriceCents: previous?.unitPriceCents ?? null,
            version: plan.version,
          },
        },
      });
      return plan;
    });
  }

  async quote(channel: CustomCreditChannel, quantity: number) {
    const plan = await this.current(channel);
    if (!plan || plan.status !== PricingPlanStatus.ACTIVE)
      throw new ApiErrorException(
        503,
        "CUSTOM_CREDIT_PLAN_UNAVAILABLE",
        "Custom credit purchases are not available yet.",
      );
    return {
      planId: plan.id,
      channel,
      currency: plan.currency,
      quantity,
      unitPriceCents: plan.unitPriceCents,
      totalMinor: customCreditTotal(channel, quantity, plan.unitPriceCents),
    };
  }
}
