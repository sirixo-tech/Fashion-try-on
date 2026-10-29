import { PricingPlanStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { MobilePlansService } from "./mobile-plans.service.js";
import { AdminMobilePlansController } from "./admin-mobile-plans.controller.js";
import { creditTotalMinor } from "./shared-credit-price.service.js";

const plan = {
  id: "00000000-0000-4000-8000-000000000001",
  code: "style-20",
  name: "Style 20",
  description: "Twenty personal looks",
  status: PricingPlanStatus.ACTIVE,
  currency: "INR",
  priceCents: 19900,
  billingPeriod: "MONTHLY",
  includedCredits: 20,
  trialCredits: 2,
  createdAt: new Date("2026-10-29T00:00:00.000Z"),
  updatedAt: new Date("2026-10-29T00:00:00.000Z"),
};

describe("mobile plan catalog", () => {
  it("quotes custom credits from the shared rate with a 1,000-credit limit", () => {
    expect(creditTotalMinor(1, 900)).toBe(900);
    expect(creditTotalMinor(1000, 900)).toBe(900000);
    expect(() => creditTotalMinor(0, 900)).toThrow();
    expect(() => creditTotalMinor(1001, 900)).toThrow();
  });

  it("reprices mobile plans when the shared credit rate changes", async () => {
    const prisma = { mobilePlan: { findMany: vi.fn().mockResolvedValue([plan]) } };
    const shared = { current: vi.fn().mockResolvedValue({ unitPriceCents: 900 }) };
    const service = new MobilePlansService(prisma as never, shared as never);
    expect((await service.listActive())[0]?.priceCents).toBe(18000);
    shared.current.mockResolvedValue({ unitPriceCents: 1200 });
    expect((await service.listActive())[0]?.priceCents).toBe(24000);
  });
  it("returns only active plans to customers without touching credit accounts", async () => {
    const prisma = {
      mobilePlan: {
        findMany: vi.fn().mockResolvedValue([plan]),
      },
      customerCreditAccount: { upsert: vi.fn() },
    };
    const service = new MobilePlansService(prisma as never);
    const result = await service.listActive();
    expect(prisma.mobilePlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: PricingPlanStatus.ACTIVE },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({ code: "style-20", includedCredits: 20 }),
    ]);
    expect(prisma.customerCreditAccount.upsert).not.toHaveBeenCalled();
  });

  it("requires platform pricing permission before listing or creating plans", async () => {
    const auth = {
      requireAccessUser: vi.fn().mockResolvedValue({ id: "staff-1" }),
    };
    const authorization = {
      requirePermission: vi.fn().mockRejectedValue(new Error("Denied")),
    };
    const plans = { listAll: vi.fn(), create: vi.fn() };
    const controller = new AdminMobilePlansController(
      auth as never,
      authorization as never,
      plans as never,
    );
    const request = { headers: { authorization: "Bearer test" } } as never;
    await expect(controller.list(request)).rejects.toThrow("Denied");
    await expect(controller.create(request, {} as never)).rejects.toThrow(
      "Denied",
    );
    expect(plans.listAll).not.toHaveBeenCalled();
    expect(plans.create).not.toHaveBeenCalled();
  });
});
