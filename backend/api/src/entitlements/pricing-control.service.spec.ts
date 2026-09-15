import { HttpStatus } from "@nestjs/common";
import { PricingPlanStatus, Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STARTER_PLAN_CODE,
  DEFAULT_TRIAL_CREDITS,
  DEFAULT_TRIAL_FEATURE_KEYS,
} from "./default-trial.js";
import {
  PRICING_ERROR_CODES,
  PricingControlService,
} from "./pricing-control.service.js";

describe("PricingControlService", () => {
  it("creates and lists pricing plans from the central catalog", async () => {
    const prisma = new FakePricingPrisma();
    const service = new PricingControlService(
      prisma as never,
      createPlatformSettingsMock("INR") as never,
    );

    const created = await service.createPlan({
      code: "shopify-starter",
      name: "Shopify Starter",
      channels: ["SHOPIFY"],
      currency: "USD",
      monthlyPriceCents: 9900,
      includedCredits: 1000,
      trialCredits: 10,
      featureKeys: ["TRY_ON_WIDGET", "SHOPIFY_INTEGRATION"],
    });

    expect(created).toMatchObject({
      code: "shopify-starter",
      name: "Shopify Starter",
      status: PricingPlanStatus.ACTIVE,
      channels: ["SHOPIFY"],
      monthlyPriceCents: 9900,
      includedCredits: 1000,
      trialCredits: 10,
      featureKeys: ["TRY_ON_WIDGET", "SHOPIFY_INTEGRATION"],
      metadata: {
        featureKeys: ["TRY_ON_WIDGET", "SHOPIFY_INTEGRATION"],
      },
    });
    await expect(service.listPlans()).resolves.toEqual([
      expect.objectContaining({
        code: DEFAULT_STARTER_PLAN_CODE,
        name: "Default starter pack",
        currency: "INR",
        includedCredits: 0,
        trialCredits: DEFAULT_TRIAL_CREDITS,
        featureKeys: [...DEFAULT_TRIAL_FEATURE_KEYS],
        metadata: expect.objectContaining({
          starterPack: true,
        }),
      }),
      created,
    ]);
  });

  it("lists the default starter pack when no pricing plans exist yet", async () => {
    const prisma = new FakePricingPrisma();
    const service = new PricingControlService(prisma as never);

    await expect(service.listPlans()).resolves.toEqual([
      expect.objectContaining({
        code: DEFAULT_STARTER_PLAN_CODE,
        name: "Default starter pack",
        trialCredits: DEFAULT_TRIAL_CREDITS,
      }),
    ]);
  });

  it("updates plan pricing and kiosk rental fields", async () => {
    const prisma = new FakePricingPrisma();
    const service = new PricingControlService(prisma as never);
    const created = await service.createPlan({
      code: "kiosk-standard",
      name: "Kiosk Standard",
      channels: ["KIOSK"],
      currency: "USD",
      monthlyPriceCents: 19900,
      includedCredits: 5000,
      trialCredits: 10,
    });

    const updated = await service.updatePlan(created.id, {
      name: "Kiosk Standard Plus",
      kioskMonthlyRentCents: 800000,
      kioskDeviceLimit: 2,
    });

    expect(updated).toMatchObject({
      id: created.id,
      name: "Kiosk Standard Plus",
      kioskMonthlyRentCents: 800000,
      kioskDeviceLimit: 2,
    });
    expect(prisma.storeSubscription.updateMany).toHaveBeenCalledWith({
      where: { pricingPlanId: created.id },
      data: expect.objectContaining({
        includedCredits: 5000,
        trialCredits: 10,
      }),
    });
  });

  it("keeps the default starter plan free while allowing plan edits", async () => {
    const prisma = new FakePricingPrisma();
    const service = new PricingControlService(prisma as never);
    const [starterPlan] = await service.listPlans();
    if (!starterPlan) {
      throw new Error("Default starter plan was not listed.");
    }

    const updated = await service.updatePlan(starterPlan.id, {
      name: "Launch starter",
      monthlyPriceCents: 9900,
      extraCreditPriceCents: 99,
      featureKeys: ["TRY_ON_WIDGET"],
    });

    expect(updated).toMatchObject({
      code: DEFAULT_STARTER_PLAN_CODE,
      name: "Launch starter",
      monthlyPriceCents: 0,
      extraCreditPriceCents: null,
      kioskMonthlyRentCents: null,
      featureKeys: ["TRY_ON_WIDGET"],
    });
  });

  it("updates plan feature keys without replacing other metadata", async () => {
    const prisma = new FakePricingPrisma();
    const service = new PricingControlService(prisma as never);
    const created = await service.createPlan({
      code: "growth",
      name: "Growth",
      channels: ["SHOPIFY"],
      currency: "USD",
      monthlyPriceCents: 9900,
      includedCredits: 1000,
      trialCredits: 10,
      metadata: { source: "manual" },
    });

    const updated = await service.updatePlan(created.id, {
      featureKeys: ["ANALYTICS", "PRODUCT_ANALYTICS"],
    });

    expect(updated.metadata).toEqual({
      source: "manual",
      featureKeys: ["ANALYTICS", "PRODUCT_ANALYTICS"],
    });
    expect(updated.featureKeys).toEqual(["ANALYTICS", "PRODUCT_ANALYTICS"]);
  });

  it("lists only active plans as customer-available plans", async () => {
    const prisma = new FakePricingPrisma();
    const service = new PricingControlService(prisma as never);
    const active = await service.createPlan({
      code: "woocommerce-starter",
      name: "WooCommerce Starter",
      channels: ["WOOCOMMERCE"],
      currency: "USD",
      monthlyPriceCents: 2900,
      includedCredits: 250,
      trialCredits: 10,
    });
    await service.createPlan({
      code: "archived-plan",
      name: "Archived Plan",
      status: PricingPlanStatus.ARCHIVED,
      channels: ["SHOPIFY"],
      currency: "USD",
      monthlyPriceCents: 100,
      includedCredits: 10,
      trialCredits: 0,
    });

    await expect(service.listAvailablePlans()).resolves.toEqual([
      expect.objectContaining({ code: DEFAULT_STARTER_PLAN_CODE }),
      active,
    ]);
  });

  it("rejects duplicate plan codes", async () => {
    const prisma = new FakePricingPrisma();
    const service = new PricingControlService(prisma as never);
    const input = {
      code: "shopify-starter",
      name: "Shopify Starter",
      channels: ["SHOPIFY" as const],
      currency: "USD",
      monthlyPriceCents: 9900,
      includedCredits: 1000,
      trialCredits: 10,
    };
    await service.createPlan(input);

    await expect(service.createPlan(input)).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: PRICING_ERROR_CODES.planCodeConflict,
        }),
      }),
    });
  });
});

class FakePricingPrisma {
  plans: Record<string, any>[] = [];

  pricingPlan = {
    upsert: vi.fn(
      ({
        where,
        create,
        update,
      }: {
        where: { code: string };
        create: Record<string, any>;
        update: Record<string, any>;
      }) => {
        const existing = this.plans.find((plan) => plan.code === where.code);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const now = new Date("2026-09-12T00:00:00.000Z");
        const plan = {
          extraCreditPriceCents: null,
          kioskMonthlyRentCents: null,
          kioskDeviceLimit: null,
          metadata: null,
          ...create,
          createdAt: now,
          updatedAt: now,
        };
        this.plans.push(plan);
        return plan;
      },
    ),
    findMany: vi.fn(
      ({
        where,
        orderBy,
      }: { where?: Record<string, any>; orderBy?: any } = {}) => {
        const rows = where?.status
          ? this.plans.filter((plan) => plan.status === where.status)
          : [...this.plans];
        return rows.sort((left, right) => {
          if (Array.isArray(orderBy) && orderBy[0]?.monthlyPriceCents) {
            return (
              left.monthlyPriceCents - right.monthlyPriceCents ||
              right.createdAt.getTime() - left.createdAt.getTime()
            );
          }
          return (
            String(left.status).localeCompare(String(right.status)) ||
            right.createdAt.getTime() - left.createdAt.getTime()
          );
        });
      },
    ),
    create: vi.fn(({ data }: { data: Record<string, any> }) => {
      if (this.plans.some((plan) => plan.code === data.code)) {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "test",
        });
      }
      const now = new Date("2026-09-12T00:00:00.000Z");
      const plan = {
        extraCreditPriceCents: null,
        kioskMonthlyRentCents: null,
        kioskDeviceLimit: null,
        metadata: null,
        ...data,
        createdAt: now,
        updatedAt: now,
      };
      this.plans.push(plan);
      return plan;
    }),
    update: vi.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, any>;
      }) => {
        const index = this.plans.findIndex((plan) => plan.id === where.id);
        if (index === -1) {
          throw new Prisma.PrismaClientKnownRequestError("Missing record", {
            code: "P2025",
            clientVersion: "test",
          });
        }
        const updated = {
          ...this.plans[index],
          ...data,
          updatedAt: new Date("2026-09-12T00:05:00.000Z"),
        };
        this.plans[index] = updated;
        return updated;
      },
    ),
    findUnique: vi.fn(
      ({
        where,
        select,
      }: {
        where: { id?: string; code?: string };
        select?: Record<string, boolean>;
      }) => {
        const plan = this.plans.find((item) =>
          where.id ? item.id === where.id : item.code === where.code,
        );
        if (!plan) {
          return null;
        }
        if (select?.metadata) {
          return {
            ...(select.code ? { code: plan.code } : {}),
            metadata: plan.metadata,
          };
        }
        return plan;
      },
    ),
  };

  storeSubscription = {
    updateMany: vi.fn(),
  };

  $transaction = vi.fn((callback: (tx: this) => unknown) => callback(this));
}

function createPlatformSettingsMock(currency: string) {
  return {
    platformDefaultCurrency: vi.fn().mockResolvedValue(currency),
  };
}
