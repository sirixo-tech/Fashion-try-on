import { HttpStatus, Injectable } from "@nestjs/common";
import { PricingPlanStatus, Prisma, type PricingPlan } from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  type CreatePricingPlanDto,
  type PricingPlanResponseDto,
  type UpdatePricingPlanDto,
} from "./dto/pricing-plan.dto.js";

export const PRICING_ERROR_CODES = {
  planCodeConflict: "PRICING_PLAN_CODE_CONFLICT",
  planNotFound: "PRICING_PLAN_NOT_FOUND",
} as const;

@Injectable()
export class PricingControlService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans(): Promise<PricingPlanResponseDto[]> {
    const plans = await this.prisma.pricingPlan.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return plans.map(toDto);
  }

  async createPlan(input: CreatePricingPlanDto): Promise<PricingPlanResponseDto> {
    try {
      const plan = await this.prisma.pricingPlan.create({
        data: {
          id: createSelfxId(),
          code: input.code.trim(),
          name: input.name.trim(),
          status: input.status ?? PricingPlanStatus.ACTIVE,
          channels: input.channels,
          currency: input.currency.trim().toUpperCase(),
          monthlyPriceCents: input.monthlyPriceCents,
          includedCredits: input.includedCredits,
          trialCredits: input.trialCredits,
          extraCreditPriceCents: input.extraCreditPriceCents ?? null,
          kioskMonthlyRentCents: input.kioskMonthlyRentCents ?? null,
          kioskDeviceLimit: input.kioskDeviceLimit ?? null,
          metadata: jsonMetadata(input.metadata),
        },
      });
      return toDto(plan);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ApiErrorException(
          HttpStatus.CONFLICT,
          PRICING_ERROR_CODES.planCodeConflict,
          "Pricing plan code is already in use.",
        );
      }
      throw error;
    }
  }

  async updatePlan(
    planId: string,
    input: UpdatePricingPlanDto,
  ): Promise<PricingPlanResponseDto> {
    try {
      const plan = await this.prisma.pricingPlan.update({
        where: { id: planId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.channels !== undefined ? { channels: input.channels } : {}),
          ...(input.currency !== undefined
            ? { currency: input.currency.trim().toUpperCase() }
            : {}),
          ...(input.monthlyPriceCents !== undefined
            ? { monthlyPriceCents: input.monthlyPriceCents }
            : {}),
          ...(input.includedCredits !== undefined
            ? { includedCredits: input.includedCredits }
            : {}),
          ...(input.trialCredits !== undefined
            ? { trialCredits: input.trialCredits }
            : {}),
          ...(input.extraCreditPriceCents !== undefined
            ? { extraCreditPriceCents: input.extraCreditPriceCents }
            : {}),
          ...(input.kioskMonthlyRentCents !== undefined
            ? { kioskMonthlyRentCents: input.kioskMonthlyRentCents }
            : {}),
          ...(input.kioskDeviceLimit !== undefined
            ? { kioskDeviceLimit: input.kioskDeviceLimit }
            : {}),
          ...(input.metadata !== undefined
            ? { metadata: jsonMetadata(input.metadata) }
            : {}),
        },
      });
      return toDto(plan);
    } catch (error) {
      if (isMissingRecord(error)) {
        throw new ApiErrorException(
          HttpStatus.NOT_FOUND,
          PRICING_ERROR_CODES.planNotFound,
          "Pricing plan was not found.",
        );
      }
      throw error;
    }
  }
}

function toDto(plan: PricingPlan): PricingPlanResponseDto {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    status: plan.status,
    channels: Array.isArray(plan.channels)
      ? plan.channels.filter(isKnownChannel)
      : [],
    currency: plan.currency,
    monthlyPriceCents: plan.monthlyPriceCents,
    includedCredits: plan.includedCredits,
    trialCredits: plan.trialCredits,
    extraCreditPriceCents: plan.extraCreditPriceCents,
    kioskMonthlyRentCents: plan.kioskMonthlyRentCents,
    kioskDeviceLimit: plan.kioskDeviceLimit,
    metadata:
      plan.metadata && typeof plan.metadata === "object"
        ? (plan.metadata as Record<string, unknown>)
        : null,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

function isKnownChannel(value: unknown): value is "SHOPIFY" | "KIOSK" | "PUBLIC_API" {
  return value === "SHOPIFY" || value === "KIOSK" || value === "PUBLIC_API";
}

function jsonMetadata(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === null || value === undefined
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonObject);
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function isMissingRecord(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}
