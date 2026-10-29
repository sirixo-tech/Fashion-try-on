import { describe, expect, it, vi } from "vitest";
import { CustomerMobilePaymentsService } from "./customer-mobile-payments.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { createMobileCheckout } from "../payments/phonepe-mobile-checkout.js";

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
  it("snapshots a custom mobile plan's unit price on the server", async () => {
    const priorFlag = process.env.SELFX_MOBILE_PHONEPE_ENABLED;
    process.env.SELFX_MOBILE_PHONEPE_ENABLED = "true";
    vi.mocked(createMobileCheckout).mockResolvedValue({
      providerOrderId: "OMO_2",
      checkoutUrl: "https://example.phonepe.com/pay",
    });
    const row = {
      id: "00000000-0000-4000-8000-000000000003",
      planId: null,
      customCreditPlanId: "00000000-0000-4000-8000-000000000004",
      customerId: "00000000-0000-4000-8000-000000000002",
      merchantOrderId: "SELFX_2",
      status: "INITIALIZING",
      amountMinor: 2700,
      currency: "INR",
      credits: 3,
      bonusCredits: 0,
      billingPeriod: "ONE_TIME",
      environment: "PRODUCTION",
      checkoutUrl: null as string | null,
      expiresAt: new Date(Date.now() + 100000),
    };
    const connection = { enabled: true, environment: "PRODUCTION" };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      customer: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }) },
      customerMobilePurchase: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(row),
      },
      mobilePaymentConnection: {
        findUnique: vi.fn().mockResolvedValue(connection),
      },
      customCreditPlan: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            id: row.customCreditPlanId,
            channel: "MOBILE",
            status: "ACTIVE",
            currency: "INR",
            unitPriceCents: 900,
          }),
      },
    };
    const db = {
      mobilePaymentConnection: {
        findUnique: vi.fn().mockResolvedValue(connection),
      },
      $transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
        run(tx),
      customerMobilePurchase: {
        updateMany: vi
          .fn()
          .mockImplementation(
            async ({
              data,
            }: {
              data: { status: string; checkoutUrl?: string };
            }) => {
              row.status = data.status;
              row.checkoutUrl = data.checkoutUrl ?? row.checkoutUrl;
              return { count: 1 };
            },
          ),
        findUniqueOrThrow: vi.fn().mockImplementation(async () => row),
      },
    };
    try {
      const result = await new CustomerMobilePaymentsService(
        db as unknown as PrismaService,
      ).start(
        row.customerId,
        { credits: 3 },
        "00000000-0000-4000-8000-000000000005",
      );
      expect(result.amountMinor).toBe(2700);
      expect(tx.customerMobilePurchase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            planId: null,
            customCreditPlanId: row.customCreditPlanId,
            amountMinor: 2700,
            credits: 3,
          }),
        }),
      );
      expect(createMobileCheckout).toHaveBeenCalledWith(
        expect.anything(),
        row.merchantOrderId,
        2700,
      );
    } finally {
      if (priorFlag === undefined)
        delete process.env.SELFX_MOBILE_PHONEPE_ENABLED;
      else process.env.SELFX_MOBILE_PHONEPE_ENABLED = priorFlag;
    }
  });

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
