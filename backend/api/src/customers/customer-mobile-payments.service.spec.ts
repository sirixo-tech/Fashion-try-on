import { describe, expect, it, vi } from "vitest";
import { CustomerMobilePaymentsService } from "./customer-mobile-payments.service.js";
import type { PrismaService } from "../database/prisma.service.js";

vi.mock("../payments/payment-snapshots.js", () => ({
  decryptPaymentSnapshot: () => ({ environment: "PRODUCTION" }),
}));
vi.mock("../payments/phonepe-mobile-checkout.js", () => ({
  mobileCheckoutStatus: async () => ({
    status: "COMPLETED",
    providerOrderId: "OMO_1",
  }),
  createMobileCheckout: vi.fn(),
}));

describe("customer mobile payment settlement", () => {
  it("grants a verified purchase exactly once, including first-purchase bonus", async () => {
    const purchase = {
      id: "00000000-0000-4000-8000-000000000001",
      customerId: "00000000-0000-4000-8000-000000000002",
      merchantOrderId: "SELFX_1",
      providerOrderId: "OMO_1",
      amountMinor: 500,
      environment: "PRODUCTION",
      billingPeriod: "ONE_TIME",
      credits: 10,
      bonusCredits: 2,
      status: "PENDING",
    };
    const grant = vi.fn().mockResolvedValue({});
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      customerMobilePurchase: {
        findUniqueOrThrow: vi.fn(async () => purchase),
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn(async ({ data }: { data: { status: string } }) => {
          purchase.status = data.status;
          return purchase;
        }),
      },
      customerPaidCreditGrant: { create: grant },
    };
    const db = {
      customerMobilePurchase: { findUnique: vi.fn(async () => purchase) },
      $transaction: async (callback: (client: typeof tx) => Promise<void>) =>
        callback(tx),
    } as unknown as PrismaService;
    const service = new CustomerMobilePaymentsService(db);
    await service.verify(purchase.id);
    await service.verify(purchase.id);
    expect(grant).toHaveBeenCalledTimes(1);
    expect(grant.mock.calls[0]![0].data.credits).toBe(12);
    expect(purchase.status).toBe("PAID");
  });
});
