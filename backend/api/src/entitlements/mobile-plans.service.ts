import { HttpStatus, Injectable, Optional } from "@nestjs/common";
import { Prisma, PricingPlanStatus, type MobilePlan } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { SharedCreditPriceService, MAX_CHECKOUT_MINOR } from "./shared-credit-price.service.js";
import {
  type CreateMobilePlanDto,
  type MobilePlanResponseDto,
  type UpdateMobilePlanDto,
} from "./dto/mobile-plan.dto.js";

@Injectable()
export class MobilePlansService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly sharedPrice?: SharedCreditPriceService) {}

  async listAll(): Promise<MobilePlanResponseDto[]> {
    const plans = await this.prisma.mobilePlan.findMany({
      orderBy: [{ status: "asc" }, { priceCents: "asc" }, { createdAt: "asc" }],
    });
    const rate = await this.sharedPrice?.current();
    return plans.map((plan) => toDto(plan, rate?.unitPriceCents));
  }

  async listActive(): Promise<MobilePlanResponseDto[]> {
    const plans = await this.prisma.mobilePlan.findMany({
      where: { status: PricingPlanStatus.ACTIVE },
      orderBy: [{ priceCents: "asc" }, { createdAt: "asc" }],
    });
    const rate = await this.sharedPrice?.current();
    return plans.map((plan) => toDto(plan, rate?.unitPriceCents));
  }

  async create(
    input: CreateMobilePlanDto,
    actorUserId: string,
  ): Promise<MobilePlanResponseDto> {
    assertPlanName(input.name);
    const rate = await this.sharedPrice?.current();
    const effectivePrice = effectivePlanPrice(input.currency, input.includedCredits, input.priceCents, rate?.unitPriceCents);
    try {
      const plan = await this.prisma.$transaction(async (tx) => {
        const created = await tx.mobilePlan.create({
          data: {
            id: createSelfxId(),
            code: input.code,
            name: input.name.trim(),
            description: input.description?.trim() ?? "",
            status: input.status ?? PricingPlanStatus.INACTIVE,
            currency: input.currency,
            priceCents: effectivePrice,
            billingPeriod: input.billingPeriod,
            includedCredits: input.includedCredits,
            trialCredits: input.trialCredits ?? 0,
          },
        });
        await tx.auditLog.create({
          data: {
            id: createSelfxId(),
            actorUserId,
            action: "MOBILE_PLAN_CREATED",
            resourceType: "MOBILE_PLAN",
            resourceId: created.id,
            metadata: { code: created.code, status: created.status },
          },
        });
        return created;
      });
      return toDto(plan, rate?.unitPriceCents);
    } catch (error) {
      if (isUniqueConflict(error))
        throw new ApiErrorException(
          HttpStatus.CONFLICT,
          "MOBILE_PLAN_CODE_CONFLICT",
          "Mobile plan code is already in use.",
        );
      throw error;
    }
  }

  async update(
    planId: string,
    input: UpdateMobilePlanDto,
    actorUserId: string,
  ): Promise<MobilePlanResponseDto> {
    const current = await this.prisma.mobilePlan.findUnique({
      where: { id: planId },
    });
    if (!current)
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "MOBILE_PLAN_NOT_FOUND",
        "Mobile plan not found.",
      );
    if (input.code !== undefined && input.code !== current.code)
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        "MOBILE_PLAN_CODE_IMMUTABLE",
        "Plan code cannot be changed.",
      );
    if (input.name !== undefined) assertPlanName(input.name);
    const rate = await this.sharedPrice?.current();
    const effectivePrice = effectivePlanPrice(input.currency ?? current.currency,
      input.includedCredits ?? current.includedCredits, input.priceCents ?? current.priceCents,
      rate?.unitPriceCents);
    const { code: _code, ...changes } = input;
    const plan = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.mobilePlan.update({
        where: { id: planId },
        data: {
          ...changes,
          priceCents: effectivePrice,
          ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
          ...(changes.description !== undefined
            ? { description: changes.description.trim() }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId,
          action: "MOBILE_PLAN_UPDATED",
          resourceType: "MOBILE_PLAN",
          resourceId: updated.id,
          metadata: { code: updated.code, status: updated.status },
        },
      });
      return updated;
    });
    return toDto(plan, rate?.unitPriceCents);
  }
}

function toDto(plan: MobilePlan, unitPriceCents?: number): MobilePlanResponseDto {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    status: plan.status,
    currency: plan.currency,
    priceCents: effectivePlanPrice(plan.currency, plan.includedCredits, plan.priceCents, unitPriceCents),
    billingPeriod: plan.billingPeriod,
    includedCredits: plan.includedCredits,
    trialCredits: plan.trialCredits,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

function effectivePlanPrice(currency: string, credits: number, storedPrice: number, unitPriceCents?: number) {
  if (currency !== "INR" || unitPriceCents === undefined) return storedPrice;
  const amount = credits * unitPriceCents;
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > MAX_CHECKOUT_MINOR)
    throw new ApiErrorException(400, "MOBILE_PLAN_PRICE_INVALID", "This plan exceeds the supported checkout amount.");
  return amount;
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function assertPlanName(name: string): void {
  if (name.trim().length < 2) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      "MOBILE_PLAN_NAME_INVALID",
      "Plan name must have at least two characters.",
    );
  }
}
