import { HttpStatus, Injectable } from "@nestjs/common";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  type PlanFeatureResponseDto,
  type UpdatePlanFeatureDto,
} from "./dto/plan-feature.dto.js";

export const PRICING_FEATURES_SETTINGS_KEY = "platform.pricing_features";

export const PRICING_FEATURE_ERROR_CODES = {
  featureNotFound: "PRICING_FEATURE_NOT_FOUND",
} as const;

const defaultPlanFeatures = [
  {
    key: "TRY_ON_WIDGET",
    displayName: "Shopper Try-On widget",
    description:
      "Let shoppers launch virtual Try-On from commerce product pages.",
    group: "Commerce",
    sortOrder: 10,
  },
  {
    key: "SHOPIFY_INTEGRATION",
    displayName: "Shopify integration",
    description: "Connect Shopify storefronts to SelfX Try-On.",
    group: "Commerce",
    sortOrder: 20,
  },
  {
    key: "WOOCOMMERCE_INTEGRATION",
    displayName: "WooCommerce integration",
    description: "Connect WooCommerce storefronts to SelfX Try-On.",
    group: "Commerce",
    sortOrder: 30,
  },
  {
    key: "KIOSK_RENTAL",
    displayName: "Kiosk rental",
    description: "Use SelfX managed kiosk devices for in-store Try-On.",
    group: "Kiosks",
    sortOrder: 40,
  },
  {
    key: "KIOSK_MANAGEMENT",
    displayName: "Kiosk management",
    description: "Manage kiosk assignments, settings and operating status.",
    group: "Kiosks",
    sortOrder: 50,
  },
  {
    key: "PUBLIC_API",
    displayName: "Public API access",
    description: "Use SelfX Try-On through partner and developer APIs.",
    group: "Developer",
    sortOrder: 60,
  },
  {
    key: "MULTI_LANGUAGE",
    displayName: "Multi-language storefront",
    description: "Localize shopper-facing Try-On flows.",
    group: "Storefront",
    sortOrder: 70,
  },
  {
    key: "ANALYTICS",
    displayName: "Usage analytics",
    description:
      "View Try-On usage, credit consumption and performance insights.",
    group: "Analytics",
    sortOrder: 80,
  },
  {
    key: "PRODUCT_ANALYTICS",
    displayName: "Product analytics",
    description:
      "See most tried-on products and product-level conversion signals.",
    group: "Analytics",
    sortOrder: 90,
  },
  {
    key: "CUSTOM_LIMITS",
    displayName: "Custom limits",
    description: "Configure visitor and monthly Try-On usage caps.",
    group: "Controls",
    sortOrder: 100,
  },
] as const;

@Injectable()
export class PricingFeaturesService {
  constructor(private readonly prisma: PrismaService) {}

  async listFeatures(): Promise<PlanFeatureResponseDto[]> {
    const overrides = await this.getOverrides();
    return defaultPlanFeatures
      .map((feature) =>
        sanitizeFeature({
          ...feature,
          active: true,
          ...overrides[feature.key],
          key: feature.key,
        }),
      )
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.group.localeCompare(right.group) ||
          left.displayName.localeCompare(right.displayName),
      );
  }

  async updateFeature(
    featureKey: string,
    input: UpdatePlanFeatureDto,
  ): Promise<PlanFeatureResponseDto> {
    const existing = defaultPlanFeatures.find(
      (feature) => feature.key === featureKey,
    );
    if (!existing) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        PRICING_FEATURE_ERROR_CODES.featureNotFound,
        "Pricing feature was not found.",
      );
    }

    const overrides = await this.getOverrides();
    const next = sanitizeFeature({
      ...existing,
      active: true,
      ...overrides[featureKey],
      ...input,
      key: featureKey,
    });
    const nextOverrides = {
      ...overrides,
      [featureKey]: next,
    };

    await this.prisma.$executeRaw`
      INSERT INTO platform_settings ("key", "value")
      VALUES (${PRICING_FEATURES_SETTINGS_KEY}, ${JSON.stringify(nextOverrides)}::jsonb)
      ON CONFLICT ("key") DO UPDATE SET
        "value" = EXCLUDED."value",
        "updated_at" = CURRENT_TIMESTAMP
    `;
    return next;
  }

  async knownFeatureKeys(): Promise<Set<string>> {
    const features = await this.listFeatures();
    return new Set(
      features
        .filter((feature) => feature.active)
        .map((feature) => feature.key),
    );
  }

  private async getOverrides(): Promise<
    Record<string, Partial<PlanFeatureResponseDto>>
  > {
    const rows = await this.prisma.$queryRaw<Array<{ value: unknown }>>`
      SELECT "value"
      FROM platform_settings
      WHERE "key" = ${PRICING_FEATURES_SETTINGS_KEY}
      LIMIT 1
    `;
    const value = rows[0]?.value;
    if (!isRecord(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value).filter(
        ([key, entry]) => isKnownFeatureKey(key) && isRecord(entry),
      ),
    ) as Record<string, Partial<PlanFeatureResponseDto>>;
  }
}

export function knownPricingFeatureKeys(): string[] {
  return defaultPlanFeatures.map((feature) => feature.key);
}

function sanitizeFeature(value: {
  key: string;
  displayName?: unknown;
  description?: unknown;
  group?: unknown;
  sortOrder?: unknown;
  active?: unknown;
}): PlanFeatureResponseDto {
  return {
    key: value.key,
    displayName: cleanText(value.displayName, value.key, 80),
    description: cleanNullableText(value.description, 220),
    group: cleanText(value.group, "Core", 60),
    sortOrder:
      typeof value.sortOrder === "number" && Number.isFinite(value.sortOrder)
        ? Math.max(0, Math.trunc(value.sortOrder))
        : 0,
    active: typeof value.active === "boolean" ? value.active : true,
  };
}

function cleanText(
  value: unknown,
  fallback: string,
  maxLength: number,
): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return (trimmed || fallback).slice(0, maxLength);
}

function cleanNullableText(value: unknown, maxLength: number): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function isKnownFeatureKey(value: string): boolean {
  return defaultPlanFeatures.some((feature) => feature.key === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
