import { HttpStatus } from "@nestjs/common";
import { CreditLedgerChannel } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TRIAL_CREDITS,
  ENTITLEMENT_ERROR_CODES,
  EntitlementsService,
} from "./entitlements.service.js";

describe("EntitlementsService", () => {
  it("grants one-time trial credits for a store", async () => {
    const prisma = new FakeEntitlementsPrisma();
    const service = new EntitlementsService(prisma as never);

    await service.ensureTrialCredits("store-1");
    await service.ensureTrialCredits("store-1");

    expect(prisma.ledger).toHaveLength(1);
    expect(prisma.ledger[0]).toMatchObject({
      organizationId: "store-1",
      entryType: "TRIAL_GRANTED",
      quantity: DEFAULT_TRIAL_CREDITS,
      idempotencyKey: "trial:store-1:v1",
    });
    await expect(service.getCreditBalance("store-1")).resolves.toEqual({
      availableCredits: DEFAULT_TRIAL_CREDITS,
    });
  });

  it("consumes a Try-On credit from the shared store balance", async () => {
    const prisma = new FakeEntitlementsPrisma();
    const service = new EntitlementsService(prisma as never);

    const result = await service.consumeTryOnCredit({
      organizationId: "store-1",
      channel: CreditLedgerChannel.SHOPIFY,
      idempotencyKey: "tryon:shopify:session-1:request-1",
      tryOnSessionId: "session-1",
      productId: "product-1",
    });

    expect(result.balanceBefore).toBe(10);
    expect(result.balanceAfter).toBe(9);
    expect(result.entry).toMatchObject({
      entryType: "CREDIT_CONSUMED",
      channel: CreditLedgerChannel.SHOPIFY,
      quantity: -1,
      balanceAfter: 9,
    });
    await expect(service.getCreditBalance("store-1")).resolves.toEqual({
      availableCredits: 9,
    });
  });

  it("blocks generation when available credits are exhausted", async () => {
    const prisma = new FakeEntitlementsPrisma();
    const service = new EntitlementsService(prisma as never);

    await expect(
      service.consumeTryOnCredit({
        organizationId: "store-1",
        channel: CreditLedgerChannel.KIOSK,
        idempotencyKey: "tryon:kiosk:run-1",
        quantity: 11,
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.PAYMENT_REQUIRED,
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: ENTITLEMENT_ERROR_CODES.creditsExhausted,
        }),
      }),
    });
  });

  it("activates a pricing plan and grants included credits once per active period", async () => {
    const prisma = new FakeEntitlementsPrisma();
    prisma.plans.set("plan-1", {
      id: "plan-1",
      code: "shopify-growth",
      name: "Shopify Growth",
      status: "ACTIVE",
      channels: ["SHOPIFY"],
      currency: "USD",
      monthlyPriceCents: 4900,
      includedCredits: 100,
      trialCredits: 10,
      extraCreditPriceCents: 50,
      kioskMonthlyRentCents: null,
      kioskDeviceLimit: null,
    });
    const service = new EntitlementsService(prisma as never);

    const summary = await service.activatePlanForStore({
      organizationId: "store-1",
      pricingPlanId: "plan-1",
    });
    await service.activatePlanForStore({
      organizationId: "store-1",
      pricingPlanId: "plan-1",
    });

    expect(summary.availableCredits).toBe(DEFAULT_TRIAL_CREDITS + 100);
    expect(summary.subscription?.pricingPlan?.name).toBe("Shopify Growth");
    expect(
      prisma.ledger.filter((entry) => entry.entryType === "PLAN_GRANTED"),
    ).toHaveLength(1);
    await expect(service.getCreditBalance("store-1")).resolves.toEqual({
      availableCredits: DEFAULT_TRIAL_CREDITS + 100,
    });
  });

  it("adds manual Store credits as an admin adjustment", async () => {
    const prisma = new FakeEntitlementsPrisma();
    const service = new EntitlementsService(prisma as never);

    const summary = await service.topUpStoreCredits({
      organizationId: "store-1",
      quantity: 25,
      reason: "Launch allowance",
      actorUserId: "admin-1",
    });

    expect(summary.availableCredits).toBe(DEFAULT_TRIAL_CREDITS + 25);
    expect(prisma.ledger).toContainEqual(
      expect.objectContaining({
        entryType: "MANUAL_ADJUSTMENT",
        channel: CreditLedgerChannel.ADMIN,
        quantity: 25,
        balanceAfter: DEFAULT_TRIAL_CREDITS + 25,
        reason: "Launch allowance",
        metadata: expect.objectContaining({ actorUserId: "admin-1" }),
      }),
    );
  });
});

class FakeEntitlementsPrisma {
  subscriptions = new Map<string, Record<string, any>>();
  plans = new Map<string, Record<string, any>>();
  ledger: Record<string, any>[] = [];

  pricingPlan = {
    findFirst: vi.fn(
      ({ where }: { where: { id: string; status: string } }) => {
        const plan = this.plans.get(where.id);
        return plan?.status === where.status ? plan : null;
      },
    ),
  };

  storeSubscription = {
    upsert: vi.fn(
      ({
        where,
        create,
        update,
        select,
      }: {
        where: { organizationId: string };
        create: Record<string, any>;
        update?: Record<string, any>;
        select?: Record<string, boolean>;
      }) => {
        const existing = this.subscriptions.get(where.organizationId);
        if (existing) {
          if (update) {
            Object.assign(existing, update);
          }
          const result = {
            id: existing.id,
            pricingPlanId: existing.pricingPlanId ?? null,
          };
          if (select) {
            const selected = result as Record<string, any>;
            return Object.fromEntries(
              Object.keys(select).map((key) => [key, selected[key]]),
            );
          }
          return {
            id: existing.id,
            pricingPlanId: existing.pricingPlanId ?? null,
          };
        }
        this.subscriptions.set(create.organizationId, create);
        if (select) {
          return Object.fromEntries(
            Object.keys(select).map((key) => [key, create[key]]),
          );
        }
        return {
          id: create.id,
          pricingPlanId: create.pricingPlanId ?? null,
        };
      },
    ),
    findUnique: vi.fn(
      ({
        where,
        include,
      }: {
        where: { organizationId: string };
        include?: { pricingPlan?: boolean };
      }) => {
        const subscription = this.subscriptions.get(where.organizationId);
        if (!subscription) {
          return null;
        }
        return {
          ...subscription,
          pricingPlan:
            include?.pricingPlan && subscription.pricingPlanId
              ? this.plans.get(subscription.pricingPlanId) ?? null
              : undefined,
        };
      },
    ),
  };

  creditLedgerEntry = {
    aggregate: vi.fn(
      ({ where }: { where: { organizationId: string } }) => ({
        _sum: {
          quantity: this.ledger
            .filter((entry) => entry.organizationId === where.organizationId)
            .reduce((sum, entry) => sum + entry.quantity, 0),
        },
      }),
    ),
    create: vi.fn(({ data }: { data: Record<string, any> }) => {
      if (
        this.ledger.some(
          (entry) => entry.idempotencyKey === data.idempotencyKey,
        )
      ) {
        return this.ledger.find(
          (entry) => entry.idempotencyKey === data.idempotencyKey,
        );
      }
      const entry = { ...data };
      this.ledger.push(entry);
      return entry;
    }),
    findUnique: vi.fn(
      ({ where }: { where: { idempotencyKey: string } }) =>
        this.ledger.find(
          (entry) => entry.idempotencyKey === where.idempotencyKey,
        ) ?? null,
    ),
  };

  $transaction = vi.fn((callback: (tx: this) => unknown) => callback(this));
}
