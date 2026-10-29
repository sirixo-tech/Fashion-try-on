import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";

export const CUSTOM_CREDIT_LIMIT = 1000;
export const SHARED_CREDIT_CURRENCY = "INR";
export const MAX_CHECKOUT_MINOR = 2_000_000_000;

export function creditTotalMinor(quantity: number, unitPriceCents: number): number {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > CUSTOM_CREDIT_LIMIT)
    throw new ApiErrorException(400, "CUSTOM_CREDIT_QUANTITY_INVALID", "Choose 1 to 1,000 credits.");
  const total = quantity * unitPriceCents;
  if (!Number.isSafeInteger(total) || total < 100 || total > MAX_CHECKOUT_MINOR)
    throw new ApiErrorException(400, "CREDIT_PRICE_INVALID", "This credit purchase cannot be priced safely.");
  return total;
}

@Injectable()
export class SharedCreditPriceService {
  constructor(private readonly db: PrismaService) {}

  async current(client: Prisma.TransactionClient | PrismaService = this.db) {
    return client.sharedCreditPrice.findUnique({ where: { currency: SHARED_CREDIT_CURRENCY } });
  }

  async save(actorUserId: string, unitPriceCents: number, expectedVersion: number) {
    if (!Number.isInteger(unitPriceCents) || unitPriceCents < 100 || unitPriceCents > 100_000 ||
        !Number.isInteger(expectedVersion) || expectedVersion < 0)
      throw new ApiErrorException(400, "CREDIT_PRICE_INVALID", "Set a valid INR price per credit.");
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('shared-credit-price:INR', 0))::text`;
      const previous = await tx.sharedCreditPrice.findUnique({ where: { currency: SHARED_CREDIT_CURRENCY } });
      if ((previous?.version ?? 0) !== expectedVersion)
        throw new ApiErrorException(409, "CREDIT_PRICE_CHANGED", "The credit price changed. Refresh and try again.");
      const now = new Date();
      const next = await tx.sharedCreditPrice.upsert({
        where: { currency: SHARED_CREDIT_CURRENCY },
        create: { currency: SHARED_CREDIT_CURRENCY, unitPriceCents, version: 1 },
        update: { unitPriceCents, version: { increment: 1 } },
      });
      if (previous?.unitPriceCents !== unitPriceCents) {
        const plans = await tx.pricingPlan.findMany({ where: {
          currency: SHARED_CREDIT_CURRENCY, billingMode: "POSTPAID_PAYG",
        }, select: { id: true, creditUnitPriceCents: true } });
        for (const plan of plans) {
          if (plan.creditUnitPriceCents === unitPriceCents) continue;
          await tx.pricingPlan.update({ where: { id: plan.id }, data: {
            creditUnitPriceCents: unitPriceCents,
            rates: { create: {
              id: createSelfxId(), currency: SHARED_CREDIT_CURRENCY,
              creditUnitPriceCents: unitPriceCents, effectiveAt: now,
            } },
          } });
        }
        await tx.pricingPlan.updateMany({ where: {
          currency: SHARED_CREDIT_CURRENCY, extraCreditPriceCents: { not: null },
        }, data: { extraCreditPriceCents: unitPriceCents } });
      }
      await tx.auditLog.create({ data: {
        id: createSelfxId(), actorUserId, organizationId: null,
        action: "SHARED_CREDIT_PRICE_UPDATED", resourceType: "SHARED_CREDIT_PRICE",
        resourceId: null,
        metadata: { currency: SHARED_CREDIT_CURRENCY, previousUnitPriceCents: previous?.unitPriceCents ?? null,
          unitPriceCents, version: next.version } as Prisma.InputJsonObject,
      } });
      return next;
    });
  }
}
