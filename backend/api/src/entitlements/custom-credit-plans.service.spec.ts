import { CustomCreditChannel, PricingPlanStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  CustomCreditPlansService,
  customCreditTotal,
} from "./custom-credit-plans.service.js";

describe("custom credit plans", () => {
  it("quotes only Mobile custom credits and validates quantities", async () => {
    const rows = {
      MOBILE: {
        id: "mobile-plan",
        channel: CustomCreditChannel.MOBILE,
        status: PricingPlanStatus.ACTIVE,
        currency: "INR",
        unitPriceCents: 900,
      },
    };
    const db = {
      customCreditPlan: {
        findUnique: vi.fn(
          async ({ where }: { where: { channel: keyof typeof rows } }) =>
            rows[where.channel],
        ),
      },
    };
    const plans = new CustomCreditPlansService(db as never);
    expect((await plans.quote(CustomCreditChannel.MOBILE, 10)).totalMinor).toBe(
      9000,
    );
    await expect(plans.quote(CustomCreditChannel.STORE, 10)).rejects.toThrow();
    await expect(
      plans.quote(CustomCreditChannel.MOBILE, 1001),
    ).rejects.toThrow();
    expect(() =>
      customCreditTotal(CustomCreditChannel.STORE, 10, 600),
    ).toThrow();
  });

  it("writes only Mobile custom plans", async () => {
    const upsert = vi.fn().mockResolvedValue({
      id: "mobile-plan",
      channel: "MOBILE",
      currency: "INR",
      unitPriceCents: 900,
      version: 1,
    });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      customCreditPlan: { findUnique: vi.fn().mockResolvedValue(null), upsert },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      pricingPlan: { updateMany: vi.fn() },
    };
    const db = {
      $transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
        run(tx),
    };
    const plans = new CustomCreditPlansService(db as never);
    await plans.save(
      CustomCreditChannel.MOBILE,
      "00000000-0000-4000-8000-000000000001",
      {
        name: "Mobile custom credits",
        status: PricingPlanStatus.ACTIVE,
        currency: "INR",
        unitPriceCents: 900,
        expectedVersion: 0,
      },
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { channel: "MOBILE" } }),
    );
    expect(tx.pricingPlan.updateMany).not.toHaveBeenCalled();
    await expect(
      plans.save(CustomCreditChannel.STORE, "actor", {
        name: "Store custom credits",
        status: PricingPlanStatus.ACTIVE,
        currency: "INR",
        unitPriceCents: 500,
        expectedVersion: 2,
      }),
    ).rejects.toThrow();
  });
});
