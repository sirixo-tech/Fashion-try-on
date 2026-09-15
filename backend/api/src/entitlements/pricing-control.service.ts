import { HttpStatus, Injectable, Optional } from "@nestjs/common";
import { PricingPlanStatus, Prisma, type PricingPlan } from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { GarmentPreviewSettingsService } from "../try-on/garment-preview-settings.service.js";
import {
  DEFAULT_STARTER_PLAN_CODE,
  ensureDefaultStarterPricingPlan,
} from "./default-trial.js";
import {
  type CreatePricingPlanDto,
  type PricingPlanResponseDto,
  type UpdatePricingPlanDto,
} from "./dto/pricing-plan.dto.js";

export const PRICING_ERROR_CODES = {
  planCodeConflict: "PRICING_PLAN_CODE_CONFLICT",
  planNotFound: "PRICING_PLAN_NOT_FOUND",
} as const;

const planFeatureKeysMetadataKey = "featureKeys";

@Injectable()
export class PricingControlService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly platformSettings?: GarmentPreviewSettingsService,
  ) {}

  async listPlans(): Promise<PricingPlanResponseDto[]> {
    await ensureDefaultStarterPricingPlan(
      this.prisma,
      await this.platformDefaultCurrency(),
    );
    const plans = await this.prisma.pricingPlan.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return defaultStarterFirst(plans).map(toDto);
  }

  async listAvailablePlans(): Promise<PricingPlanResponseDto[]> {
    await ensureDefaultStarterPricingPlan(
      this.prisma,
      await this.platformDefaultCurrency(),
    );
    const plans = await this.prisma.pricingPlan.findMany({
      where: { status: PricingPlanStatus.ACTIVE },
      orderBy: [{ monthlyPriceCents: "asc" }, { createdAt: "desc" }],
    });
    return defaultStarterFirst(plans).map(toDto);
  }

  async createPlan(
    input: CreatePricingPlanDto,
  ): Promise<PricingPlanResponseDto> {
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
          metadata: jsonMetadataWithFeatureKeys(
            input.metadata,
            input.featureKeys,
          ),
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
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.pricingPlan.findUnique({
          where: { id: planId },
          select: { code: true, metadata: true },
        });
        if (!current) {
          throw missingRecordError();
        }
        const starterPlan = current.code === DEFAULT_STARTER_PLAN_CODE;
        const plan = await tx.pricingPlan.update({
          where: { id: planId },
          data: {
            ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.channels !== undefined
              ? { channels: input.channels }
              : {}),
            ...(input.currency !== undefined
              ? { currency: input.currency.trim().toUpperCase() }
              : {}),
            ...(starterPlan
              ? { monthlyPriceCents: 0 }
              : input.monthlyPriceCents !== undefined
                ? { monthlyPriceCents: input.monthlyPriceCents }
                : {}),
            ...(input.includedCredits !== undefined
              ? { includedCredits: input.includedCredits }
              : {}),
            ...(input.trialCredits !== undefined
              ? { trialCredits: input.trialCredits }
              : {}),
            ...(starterPlan
              ? { extraCreditPriceCents: null }
              : input.extraCreditPriceCents !== undefined
                ? { extraCreditPriceCents: input.extraCreditPriceCents }
                : {}),
            ...(starterPlan
              ? { kioskMonthlyRentCents: null }
              : input.kioskMonthlyRentCents !== undefined
                ? { kioskMonthlyRentCents: input.kioskMonthlyRentCents }
                : {}),
            ...(input.kioskDeviceLimit !== undefined
              ? { kioskDeviceLimit: input.kioskDeviceLimit }
              : {}),
            ...(input.metadata !== undefined || input.featureKeys !== undefined
              ? {
                  metadata: jsonMetadataWithFeatureKeys(
                    input.metadata ??
                      (isRecord(current.metadata) ? current.metadata : null),
                    input.featureKeys,
                  ),
                }
              : {}),
          },
        });
        await tx.storeSubscription.updateMany({
          where: { pricingPlanId: plan.id },
          data: {
            channels: jsonStringArray(plan.channels),
            includedCredits: plan.includedCredits,
            trialCredits: plan.trialCredits,
            metadata: subscriptionMetadataForPlan(plan),
          },
        });
        return toDto(plan);
      });
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
    featureKeys: featureKeysFromPricingPlanMetadata(plan.metadata),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export function featureKeysFromPricingPlanMetadata(
  value: Prisma.JsonValue | null | undefined,
): string[] {
  if (!isRecord(value)) {
    return [];
  }
  const featureKeys = value[planFeatureKeysMetadataKey];
  return Array.isArray(featureKeys)
    ? Array.from(
        new Set(
          featureKeys
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter(Boolean),
        ),
      )
    : [];
}

function isKnownChannel(
  value: unknown,
): value is "SHOPIFY" | "WOOCOMMERCE" | "KIOSK" | "PUBLIC_API" {
  return (
    value === "SHOPIFY" ||
    value === "WOOCOMMERCE" ||
    value === "KIOSK" ||
    value === "PUBLIC_API"
  );
}

function defaultStarterFirst(plans: PricingPlan[]): PricingPlan[] {
  return [
    ...plans.filter((plan) => plan.code === DEFAULT_STARTER_PLAN_CODE),
    ...plans.filter((plan) => plan.code !== DEFAULT_STARTER_PLAN_CODE),
  ];
}

function subscriptionMetadataForPlan(plan: {
  code: string;
  metadata: Prisma.JsonValue | null;
}): Prisma.InputJsonObject {
  return {
    pricingPlanCode: plan.code,
    featureKeys: featureKeysFromPricingPlanMetadata(plan.metadata),
  };
}

function jsonStringArray(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function jsonMetadata(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === null || value === undefined
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonObject);
}

function jsonMetadataWithFeatureKeys(
  metadata: Record<string, unknown> | null | undefined,
  featureKeys: string[] | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (featureKeys === undefined) {
    return jsonMetadata(metadata);
  }
  return {
    ...(metadata ?? {}),
    [planFeatureKeysMetadataKey]: cleanFeatureKeys(featureKeys),
  };
}

function cleanFeatureKeys(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toUpperCase())
        .filter((value) => /^[A-Z0-9_:-]{2,80}$/.test(value)),
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function missingRecordError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Missing record", {
    code: "P2025",
    clientVersion: "test",
  });
}
