import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service.js";
import { PhonePeTransport } from "../payments/phonepe.transport.js";
import { CustomerMobilePaymentsService } from "./customer-mobile-payments.service.js";

vi.mock("../payments/payment-snapshots.js", () => ({
  decryptPaymentSnapshot: () => ({
    mode: "DQR",
    environment: "PRODUCTION",
    merchantId: "fixture_merchant",
    providerStoreId: "fixture_store",
    saltIndex: "1",
    saltKey: "fixture-key-not-a-real-secret",
    apiBaseUrl: "https://mercury-t2.phonepe.com",
  }),
}));

const customerId = "00000000-0000-4000-8000-000000000002";
const id = "00000000-0000-4000-8000-000000000001";
const pending = () => ({
  success: true,
  code: "PAYMENT_PENDING",
  data: {
    merchantId: "fixture_merchant",
    transactionId: "fixture_tx",
    amount: 500,
    paymentState: "PENDING",
  },
});
const completed = () => ({
  success: true,
  code: "PAYMENT_SUCCESS",
  data: {
    merchantId: "fixture_merchant",
    transactionId: "fixture_tx",
    amount: 500,
    paymentState: "COMPLETED",
  },
});

function fixture() {
  const row = {
    id,
    customerId,
    planId: null,
    merchantOrderId: "fixture_tx",
    providerOrderId: "fixture_tx",
    status: "PENDING",
    amountMinor: 500,
    currency: "INR",
    credits: 5,
    bonusCredits: 0,
    billingPeriod: "ONE_TIME",
    checkoutUrl: "upi://pay",
    environment: "PRODUCTION",
    expiresAt: new Date(Date.now() + 60000),
  };
  const updateMany = vi.fn(async ({ where, data }: {
    where: { status?: string };
    data: { status: string };
  }) => {
    if (where.status && row.status !== where.status) return { count: 0 };
    row.status = data.status;
    return { count: 1 };
  });
  const grant = vi.fn().mockResolvedValue({});
  const purchase = {
    findFirst: vi.fn(async () => row),
    findUnique: vi.fn(async () => row),
    findUniqueOrThrow: vi.fn(async () => row),
    updateMany,
    update: vi.fn(async ({ data }: { data: { status: string } }) => {
      row.status = data.status;
      return row;
    }),
    count: vi.fn().mockResolvedValue(0),
  };
  const tx = {
    customerMobilePurchase: purchase,
    customerPaidCreditGrant: { create: grant },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  const db = {
    ...tx,
    $transaction: async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
  };
  return { row, grant, service: new CustomerMobilePaymentsService(db as unknown as PrismaService) };
}

afterEach(() => vi.restoreAllMocks());

describe("mobile Dynamic QR cancellation", () => {
  it("cancels only after provider confirmation and leaves credits ungranted", async () => {
    const { row, grant, service } = fixture();
    const send = vi.spyOn(PhonePeTransport.prototype, "send").mockImplementation(async (request) =>
      request.url.endsWith("/cancel")
        ? { success: true, code: "SUCCESS" }
        : pending(),
    );
    expect((await service.cancel(customerId, id)).status).toBe("CANCELLED");
    expect(row.status).toBe("CANCELLED");
    expect(grant).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
    expect((await service.cancel(customerId, id)).status).toBe("CANCELLED");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("still settles a signed late success after a cancellation response", async () => {
    const { row, grant, service } = fixture();
    let paid = false;
    vi.spyOn(PhonePeTransport.prototype, "send").mockImplementation(async (request) =>
      request.url.endsWith("/cancel")
        ? { success: true, code: "SUCCESS" }
        : paid ? completed() : pending(),
    );
    expect((await service.cancel(customerId, id)).status).toBe("CANCELLED");
    paid = true;
    expect((await service.status(customerId, id)).status).toBe("PAID");
    expect(row.status).toBe("PAID");
    expect(grant).toHaveBeenCalledTimes(1);
  });

  it("does not release an order PhonePe says was already completed", async () => {
    const { row, grant, service } = fixture();
    vi.spyOn(PhonePeTransport.prototype, "send").mockImplementation(async (request) =>
      request.url.endsWith("/cancel")
        ? { success: false, code: "PAYMENT_ALREADY_COMPLETED" }
        : pending(),
    );
    expect((await service.cancel(customerId, id)).status).toBe("CANCELLING");
    expect(row.status).toBe("CANCELLING");
    expect(grant).not.toHaveBeenCalled();
  });

  it("grants credits if the provider completed payment before cancellation", async () => {
    const { row, grant, service } = fixture();
    const send = vi.spyOn(PhonePeTransport.prototype, "send").mockResolvedValue(completed());
    expect((await service.cancel(customerId, id)).status).toBe("PAID");
    expect(row.status).toBe("PAID");
    expect(grant).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps a payment pending when PhonePe cannot confirm cancellation", async () => {
    const { row, grant, service } = fixture();
    vi.spyOn(PhonePeTransport.prototype, "send").mockImplementation(async (request) => {
      if (request.url.endsWith("/cancel")) throw new Error("timeout");
      return pending();
    });
    await expect(service.cancel(customerId, id)).rejects.toMatchObject({
      response: { error: { code: "MOBILE_PAYMENT_CANCEL_UNCONFIRMED" } },
    });
    expect(row.status).toBe("PENDING");
    expect(grant).not.toHaveBeenCalled();
  });
});
