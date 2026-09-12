import { HttpStatus } from "@nestjs/common";
import { PricingPlanStatus, Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  PRICING_ERROR_CODES,
  PricingControlService,
} from "./pricing-control.service.js";

describe("PricingControlService", () => {
  it("creates and lists pricing plans from the central catalog", async () => {
    const prisma = new FakePricingPrisma();
    const service = new PricingControlService(prisma as never);

    const created = await service.createPlan({
      code: "shopify-starter",
      name: "Shopify Starter",
      channels: ["SHOPIFY"],
      currency: "USD",
      monthlyPriceCents: 9900,
      includedCredits: 1000,
      trialCredits: 10,
    });

    expect(created).toMatchObject({
      code: "shopify-starter",
      name: "Shopify Starter",
      status: PricingPlanStatus.ACTIVE,
      channels: ["SHOPIFY"],
      monthlyPriceCents: 9900,
      includedCredits: 1000,
      trialCredits: 10,
    });
    await expect(service.listPlans()).resolves.toEqual([created]);
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
    findMany: vi.fn(() =>
      [...this.plans].sort((left, right) =>
        String(left.status).localeCompare(String(right.status)) ||
        right.createdAt.getTime() - left.createdAt.getTime(),
      ),
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
  };
}
