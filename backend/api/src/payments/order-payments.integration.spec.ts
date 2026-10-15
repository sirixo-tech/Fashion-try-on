import "reflect-metadata";
import { createHash } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { CommerceService } from "../commerce/commerce.service.js";
import { ProductStockService } from "../stores/product-stock.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PaymentSettingsService } from "./payment-settings.service.js";
import { OrderPaymentsService } from "./order-payments.service.js";
import { PhonePeTransport } from "./phonepe.transport.js";
import { attemptAdapter } from "./payment-snapshots.js";
import type { ProviderRequest } from "./payment-adapter.js";
const url = process.env.PAYMENT_TEST_DATABASE_URL;
if (
  url &&
  (!["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test"))
)
  throw new Error("Disposable local test database required.");
const salt = "fixture-salt-not-a-real-credential";
async function code(promise: Promise<unknown>, expected: string) {
  await expect(
    promise.catch((error: ApiErrorException) => error.getResponse()),
  ).resolves.toMatchObject({ error: { code: expected } });
}
describe.skipIf(!url)("PAYMENTS-1B real PostgreSQL, simulated PhonePe", () => {
  const db = new PrismaService({
    datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
  });
  const commerce = new CommerceService(db),
    stock = new ProductStockService(db),
    config = new PaymentSettingsService(db);
  const send = vi.fn<(request: ProviderRequest) => Promise<unknown>>();
  const service = new OrderPaymentsService(db, commerce, {
    send,
  } as unknown as PhonePeTransport);
  const storeId = createSelfxId(),
    actor = createSelfxId(),
    categoryId = createSelfxId();
  const savedEnv = new Map<string, string | undefined>();
  beforeAll(async () => {
    for (const [name, value] of Object.entries({
      SELFX_PAYMENT_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString("base64"),
      SELFX_PAYMENT_ENCRYPTION_KEY_VERSION: "fixture_v1",
      SELFX_PHONEPE_UAT_ENABLED: "true",
      SELFX_PAYMENT_CALLBACK_BASE_URL: "https://callbacks.example.test",
    })) {
      savedEnv.set(name, process.env[name]);
      process.env[name] = value;
    }
    await db.$connect();
    await db.organization.create({
      data: { id: storeId, name: "Payments", slug: storeId, status: "ACTIVE" },
    });
    await db.user.create({
      data: {
        id: actor,
        email: `${actor}@payment.invalid`,
        passwordHash: "not-a-login",
      },
    });
    await db.productCategory.create({
      data: {
        id: categoryId,
        organizationId: storeId,
        scope: "STORE",
        catalogKey: categoryId,
        slug: categoryId,
        name: "Tops",
      },
    });
    const policy = (await config.listGateways()).data.find(
      (row) => row.provider === "PHONEPE",
    )!;
    await config.updatePolicy("PHONEPE", actor, {
      expectedVersion: policy.version,
      enabled: true,
    });
    await configure(true);
  });
  afterAll(async () => {
    await db.shoppingPaymentEvent.deleteMany({
      where: { organizationId: storeId },
    });
    await db.shoppingPaymentAttempt.deleteMany({
      where: { organizationId: storeId },
    });
    await db.shoppingOrder.deleteMany({ where: { organizationId: storeId } });
    await db.shoppingCart.deleteMany({ where: { organizationId: storeId } });
    await db.tryOnSession.deleteMany({ where: { organizationId: storeId } });
    await db.kioskDevice.deleteMany({ where: { organizationId: storeId } });
    await db.product.deleteMany({ where: { organizationId: storeId } });
    await db.productCategory.delete({ where: { id: categoryId } });
    await db.storePaymentSettings.deleteMany({
      where: { organizationId: storeId },
    });
    await db.storePaymentConnection.deleteMany({
      where: { organizationId: storeId },
    });
    await db.auditLog.deleteMany({ where: { actorUserId: actor } });
    await db.auditLog.deleteMany({ where: { organizationId: storeId } });
    await db.organization.delete({ where: { id: storeId } });
    await db.user.delete({ where: { id: actor } });
    await db.$disconnect();
    for (const [name, value] of savedEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  beforeEach(() => {
    send.mockReset();
    send.mockImplementation(async (request) => {
      if (request.method === "POST") {
        const body = JSON.parse(
          Buffer.from(JSON.parse(request.body!).request, "base64").toString(),
        );
        return {
          success: true,
          code: "SUCCESS",
          data: {
            merchantId: body.merchantId,
            transactionId: body.transactionId,
            amount: body.amount,
            qrString: `upi://pay?pa=fixture@ybl&am=${(body.amount / 100).toFixed(2)}&tr=${body.transactionId}`,
          },
        };
      }
      const txId = request.url.split("/").at(-2)!;
      const row = await db.shoppingPaymentAttempt.findUniqueOrThrow({
        where: { transactionId: txId },
      });
      return evidence(row);
    });
  });
  async function configure(confirmed: boolean, merchantId = "fixture_mid") {
    let settings = await config.getStore(storeId);
    settings = await config.savePhonePe(storeId, actor, {
      expectedVersion: settings.version,
      merchantId,
      saltIndex: "1",
      saltKey: salt,
      environment: "UAT",
      dqrAccessConfirmed: confirmed,
    });
    await config.select(storeId, actor, {
      expectedVersion: settings.version,
      provider: "PHONEPE",
    });
  }
  async function customer() {
    const device = {
      id: createSelfxId(),
      organizationId: storeId,
      assignmentScope: "ORGANIZATION" as const,
      storeId: null,
    };
    await db.kioskDevice.create({
      data: { ...device, status: "ACTIVE", displayName: "Payment fixture" },
    });
    const sessionId = createSelfxId();
    await db.tryOnSession.create({
      data: {
        id: sessionId,
        organizationId: storeId,
        kioskDeviceId: device.id,
        assignmentScope: "ORGANIZATION",
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    return { device, sessionId };
  }
  async function product(quantity = 5) {
    const id = createSelfxId();
    await db.product.create({
      data: {
        id,
        catalogKey: id,
        organizationId: storeId,
        scope: "STORE",
        categoryId,
        name: "Shirt",
        slug: id,
        audience: "UNISEX",
        garmentIntent: "TOP",
        garmentCategory: "TOP",
        active: true,
        vtoEnabled: true,
        imageUrl: "https://example.test/shirt.jpg",
        priceAmountCents: 10000,
        priceCurrency: "INR",
      },
    });
    const configured = await stock.update(storeId, id, actor, {
      expectedVersion: 0,
      optionMode: "SINGLE",
      pricingMode: "CONSTANT",
      reason: "Fixture",
      variants: [{ stockQuantity: quantity }],
    });
    return { id, variantId: configured.variants[0]!.id };
  }
  async function checkout(
    p?: Awaited<ReturnType<typeof product>>,
    quantity = 1,
  ) {
    const customerData = await customer(),
      item = p ?? (await product());
    const quote = await commerce.updateCart(
      customerData.device,
      customerData.sessionId,
      { expectedVersion: 0, items: [{ variantId: item.variantId, quantity }] },
    );
    const order = await commerce.checkout(
      customerData.device,
      customerData.sessionId,
      {
        expectedVersion: quote.version,
        quoteFingerprint: quote.quoteFingerprint,
        idempotencyKey: createSelfxId(),
      },
    );
    return { ...customerData, item, order };
  }
  const start = (
    c: Awaited<ReturnType<typeof checkout>>,
    key = createSelfxId(),
  ) => service.start(c.device, c.sessionId, c.order.id, key);
  async function due(id: string) {
    await db.shoppingPaymentAttempt.update({
      where: { id },
      data: { nextCheckAt: new Date(0), leaseUntil: null },
    });
  }
  async function reconcile(id: string) {
    await due(id);
    await service.reconcile(id);
  }
  function evidence(
    row: { transactionId: string; amountMinor: number },
    code = "PAYMENT_SUCCESS",
  ) {
    return {
      success: code !== "PAYMENT_ERROR",
      code,
      data: {
        merchantId: "fixture_mid",
        transactionId: row.transactionId,
        amount: row.amountMinor,
        paymentState:
          code === "PAYMENT_SUCCESS"
            ? "COMPLETED"
            : code === "PAYMENT_ERROR"
              ? "FAILED"
              : "PENDING",
        providerReferenceId: `REF_${row.transactionId}`,
      },
    };
  }
  async function notification(attemptId: string, response?: unknown) {
    const row = await db.shoppingPaymentAttempt.findUniqueOrThrow({
      where: { id: attemptId },
    });
    const encoded = Buffer.from(
      JSON.stringify(response ?? evidence(row)),
    ).toString("base64");
    const signature =
      createHash("sha256")
        .update(encoded + salt)
        .digest("hex") + "###1";
    return { encoded, signature };
  }
  it("creates once under concurrent retries and blocks overlapping attempts", async () => {
    const c = await checkout(),
      key = createSelfxId();
    const results = await Promise.all([start(c, key), start(c, key)]);
    expect(results[0].id).toBe(results[1].id);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (
        await service.deviceAttempt(
          c.device,
          c.sessionId,
          c.order.id,
          results[0].id,
        )
      ).qrString,
    ).toContain("upi://pay");
    await code(start(c), "PAYMENT_ORDER_UNAVAILABLE");
    expect(
      await db.shoppingPaymentAttempt.count({ where: { orderId: c.order.id } }),
    ).toBe(1);
    expect(JSON.stringify(results)).not.toContain(salt);
  });
  it("confirms payment once, deducts stock once, advances stock revision and clears the paid cart", async () => {
    const c = await checkout(undefined, 2),
      attempt = await start(c);
    await due(attempt.id);
    await Promise.all([
      service.reconcile(attempt.id),
      service.reconcile(attempt.id),
    ]);
    expect(await commerce.getStaffOrder(storeId, c.order.id)).toMatchObject({
      status: "PAID",
      paymentReviewReason: null,
      paymentAttempts: [{ status: "SUCCEEDED", environment: "UAT" }],
    });
    const stored = await stock.get(storeId, c.item.id);
    expect(stored.variants[0]!.stockQuantity).toBe(3);
    expect(stored.version).toBe(2);
    expect((await commerce.getCart(c.device, c.sessionId)).items).toHaveLength(
      0,
    );
    await reconcile(attempt.id);
    expect(
      (await stock.get(storeId, c.item.id)).variants[0]!.stockQuantity,
    ).toBe(3);
    expect(
      await db.auditLog.count({
        where: { resourceId: c.order.id, action: "SHOPPING_ORDER_PAID" },
      }),
    ).toBe(1);
    const safe = JSON.stringify(
      await commerce.getStaffOrder(storeId, c.order.id),
    );
    expect(safe).not.toContain("encryptedPayload");
    expect(safe).not.toContain(salt);
    expect(safe).not.toContain("fixture_mid");
  });
  it("authenticates and deduplicates callbacks, acknowledges before a separate status check", async () => {
    const c = await checkout(),
      attempt = await start(c),
      n = await notification(attempt.id);
    await expect(
      service.callback(attempt.id, n.encoded, "bad", "fixture-ip"),
    ).rejects.toThrow();
    expect(
      await db.shoppingPaymentEvent.count({ where: { attemptId: attempt.id } }),
    ).toBe(0);
    await Promise.all([
      service.callback(attempt.id, n.encoded, n.signature, "fixture-ip"),
      service.callback(attempt.id, n.encoded, n.signature, "fixture-ip"),
    ]);
    expect(
      await db.shoppingPaymentEvent.count({ where: { attemptId: attempt.id } }),
    ).toBe(1);
    expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
      "PAYMENT_PENDING",
    );
    await service.reconcileDue();
    expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
      "PAID",
    );
  });
  it("does not trust signed callback evidence when the amount or merchant differs", async () => {
    const c = await checkout(),
      attempt = await start(c),
      row = await db.shoppingPaymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });
    const response = evidence(row);
    response.data.amount++;
    const n = await notification(attempt.id, response);
    await expect(
      service.callback(attempt.id, n.encoded, n.signature, "fixture-ip"),
    ).rejects.toThrow();
    send.mockResolvedValueOnce(response);
    await reconcile(attempt.id);
    expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
      "PAYMENT_PENDING",
    );
    expect(
      (
        await db.shoppingPaymentAttempt.findUniqueOrThrow({
          where: { id: attempt.id },
        })
      ).status,
    ).toBe("UNKNOWN");
    expect(
      (await stock.get(storeId, c.item.id)).variants[0]!.stockQuantity,
    ).toBe(5);
  });
  it("preserves unresolved payments through expiry/restart, hides expired QR and prevents cancellation or a second checkout", async () => {
    const c = await checkout(),
      attempt = await start(c);
    await db.shoppingOrder.update({
      where: { id: c.order.id },
      data: {
        expiresAt: new Date(Date.now() - 1),
        createdAt: new Date(Date.now() - 400000),
      },
    });
    await db.shoppingPaymentAttempt.update({
      where: { id: attempt.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await commerce.expireDueOrders();
    expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
      "PAYMENT_PENDING",
    );
    expect(
      (await stock.get(storeId, c.item.id)).totalAvailableStockQuantity,
    ).toBe(5);
    expect(
      (
        await service.deviceAttempt(
          c.device,
          c.sessionId,
          c.order.id,
          attempt.id,
        )
      ).qrString,
    ).toBeNull();
    await expect(
      commerce.cancelStaffOrder(storeId, c.order.id, actor, "cancel"),
    ).rejects.toThrow();
    const quote = await commerce.getCart(c.device, c.sessionId);
    await code(
      commerce.checkout(c.device, c.sessionId, {
        expectedVersion: quote.version,
        quoteFingerprint: quote.quoteFingerprint,
        idempotencyKey: createSelfxId(),
      }),
      "SHOPPING_ORDER_PENDING",
    );
    const restarted = new OrderPaymentsService(db, commerce, {
      send,
    } as unknown as PhonePeTransport);
    await due(attempt.id);
    await restarted.reconcileDue();
    expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
      "PAID",
    );
  });
  it("retains an UNKNOWN attempt after request timeout without issuing another QR on replay", async () => {
    const c = await checkout(),
      key = createSelfxId();
    send.mockRejectedValueOnce(new Error("simulated timeout"));
    const attempt = await start(c, key);
    expect(attempt.status).toBe("UNKNOWN");
    expect(attempt.qrString).toBeNull();
    expect((await start(c, key)).id).toBe(attempt.id);
    expect(send).toHaveBeenCalledTimes(1);
    await code(start(c), "PAYMENT_ORDER_UNAVAILABLE");
    await reconcile(attempt.id);
    expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
      "PAID",
    );
  });
  it("keeps pending/network/unknown status unresolved and does not consume stock", async () => {
    const c = await checkout(),
      attempt = await start(c),
      row = await db.shoppingPaymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });
    send.mockResolvedValueOnce(evidence(row, "PAYMENT_PENDING"));
    await reconcile(attempt.id);
    expect(
      (
        await db.shoppingPaymentAttempt.findUniqueOrThrow({
          where: { id: attempt.id },
        })
      ).status,
    ).toBe("PENDING");
    send.mockRejectedValueOnce(new Error("network"));
    await reconcile(attempt.id);
    expect(
      (
        await db.shoppingPaymentAttempt.findUniqueOrThrow({
          where: { id: attempt.id },
        })
      ).status,
    ).toBe("UNKNOWN");
    send.mockResolvedValueOnce(evidence(row, "NEW_CODE"));
    await reconcile(attempt.id);
    expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
      "PAYMENT_PENDING",
    );
    expect(
      (await stock.get(storeId, c.item.id)).variants[0]!.stockQuantity,
    ).toBe(5);
  });
  it("allows a retry only after verified failure and preserves a successful retry against older failure events", async () => {
    const c = await checkout(),
      attempt = await start(c),
      row = await db.shoppingPaymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });
    send.mockResolvedValueOnce(evidence(row, "PAYMENT_ERROR"));
    await reconcile(attempt.id);
    expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
      "AWAITING_PAYMENT",
    );
    const retry = await start(c);
    await reconcile(retry.id);
    const n = await notification(attempt.id, evidence(row, "PAYMENT_ERROR"));
    await service.callback(attempt.id, n.encoded, n.signature, "fixture-ip");
    send.mockResolvedValueOnce(evidence(row, "PAYMENT_ERROR"));
    await reconcile(attempt.id);
    expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
      "PAID",
    );
    expect(
      (await stock.get(storeId, c.item.id)).variants[0]!.stockQuantity,
    ).toBe(4);
  });
  it("recovers late success without stealing another order's reserved last unit, then lets staff allocate replenished stock", async () => {
    const p = await product(1),
      c = await checkout(p),
      attempt = await start(c);
    await db.shoppingOrder.update({
      where: { id: c.order.id },
      data: {
        createdAt: new Date(Date.now() - 400000),
        expiresAt: new Date(Date.now() - 1),
      },
    });
    const competing = await checkout(p);
    await reconcile(attempt.id);
    expect(await commerce.getStaffOrder(storeId, c.order.id)).toMatchObject({
      status: "PAID_REVIEW",
      paymentReviewReason: "STOCK_UNAVAILABLE",
      stockAllocatedAt: null,
    });
    expect((await stock.get(storeId, p.id)).variants[0]!.stockQuantity).toBe(1);
    await code(
      service.retryAllocation(storeId, c.order.id, actor),
      "PAYMENT_STOCK_UNAVAILABLE",
    );
    const current = await stock.get(storeId, p.id);
    await stock.update(storeId, p.id, actor, {
      expectedVersion: current.version,
      optionMode: "SINGLE",
      pricingMode: "CONSTANT",
      reason: "Replenish",
      variants: [{ stockQuantity: 2 }],
    });
    await service.retryAllocation(storeId, c.order.id, actor);
    expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
      "PAID",
    );
    expect((await stock.get(storeId, p.id)).totalAvailableStockQuantity).toBe(
      0,
    );
    await expect(
      service.retryAllocation(storeId, c.order.id, actor),
    ).rejects.toThrow();
    await commerce.cancelStaffOrder(
      storeId,
      competing.order.id,
      actor,
      "fixture complete",
    );
  });
  it("flags duplicate successful attempts without double stock deduction", async () => {
    const c = await checkout(),
      first = await start(c),
      row = await db.shoppingPaymentAttempt.findUniqueOrThrow({
        where: { id: first.id },
      });
    send.mockResolvedValueOnce(evidence(row, "PAYMENT_ERROR"));
    await reconcile(first.id);
    const second = await start(c);
    await reconcile(second.id);
    await reconcile(first.id);
    expect(await commerce.getStaffOrder(storeId, c.order.id)).toMatchObject({
      status: "PAID_REVIEW",
      paymentReviewReason: "DUPLICATE_PAYMENT",
    });
    expect(
      (await stock.get(storeId, c.item.id)).variants[0]!.stockQuantity,
    ).toBe(4);
  });
  it("keeps contradictory success notification and failed status unresolved", async () => {
    const c = await checkout(),
      attempt = await start(c),
      row = await db.shoppingPaymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });
    const n = await notification(attempt.id);
    await service.callback(attempt.id, n.encoded, n.signature, "fixture-ip");
    send.mockResolvedValueOnce(evidence(row, "PAYMENT_ERROR"));
    await reconcile(attempt.id);
    expect(
      (
        await db.shoppingPaymentAttempt.findUniqueOrThrow({
          where: { id: attempt.id },
        })
      ).failureCode,
    ).toBe("PAYMENT_EVIDENCE_CONFLICT");
    await code(start(c), "PAYMENT_ORDER_UNAVAILABLE");
    await reconcile(attempt.id);
    expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
      "PAID",
    );
  });
  it("blocks retries when a signed late success arrives after a previously failed attempt", async () => {
    const c = await checkout(),
      attempt = await start(c),
      row = await db.shoppingPaymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });
    send.mockResolvedValueOnce(evidence(row, "PAYMENT_ERROR"));
    await reconcile(attempt.id);
    const n = await notification(attempt.id);
    await service.callback(attempt.id, n.encoded, n.signature, "fixture-ip");
    await code(start(c), "PAYMENT_CONFIRMATION_PENDING");
    send.mockResolvedValueOnce(evidence(row, "PAYMENT_ERROR"));
    await reconcile(attempt.id);
    expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
      "PAYMENT_PENDING",
    );
    await reconcile(attempt.id);
    expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
      "PAID",
    );
  });
  it("retains late success verification when its callback arrives during a timed-out failed-attempt check", async () => {
    const c = await checkout(),
      attempt = await start(c),
      row = await db.shoppingPaymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });
    send.mockResolvedValueOnce(evidence(row, "PAYMENT_ERROR"));
    await reconcile(attempt.id);
    const n = await notification(attempt.id);
    send.mockImplementationOnce(async () => {
      await service.callback(attempt.id, n.encoded, n.signature, "fixture-ip");
      throw new Error("simulated timeout after notification");
    });
    await reconcile(attempt.id);
    const pendingVerification =
      await db.shoppingPaymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });
    expect(pendingVerification.status).toBe("FAILED");
    expect(pendingVerification.nextCheckAt).not.toBeNull();
    await code(start(c), "PAYMENT_CONFIRMATION_PENDING");
    await due(attempt.id);
    await service.reconcileDue();
    expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
      "PAID",
    );
  });
  it("uses the original encrypted account snapshot after credentials change", async () => {
    const c = await checkout(),
      attempt = await start(c);
    await configure(true, "replacement_mid");
    const row = await db.shoppingPaymentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(
      attemptAdapter(row).statusRequest({
        transactionId: row.transactionId,
        amountMinor: row.amountMinor,
        currency: "INR",
      }).url,
    ).toContain("fixture_mid");
    await reconcile(attempt.id);
    expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
      "PAID",
    );
    await configure(true);
  });
  it("rejects unconfirmed access, disabled execution and a wrong device/session without provider calls", async () => {
    const c = await checkout();
    await configure(false);
    await code(start(c), "PAYMENT_ACCOUNT_UNCONFIRMED");
    await configure(true);
    process.env.SELFX_PHONEPE_UAT_ENABLED = "false";
    await code(start(c), "PAYMENT_NOT_ENABLED");
    process.env.SELFX_PHONEPE_UAT_ENABLED = "true";
    const other = await customer();
    await expect(
      service.start(other.device, other.sessionId, c.order.id, createSelfxId()),
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("reconciliation remains independent of kiosk revocation and ended session", async () => {
    const c = await checkout(),
      attempt = await start(c);
    await db.tryOnSession.update({
      where: { id: c.sessionId },
      data: { status: "EXPIRED" },
    });
    await db.kioskDevice.update({
      where: { id: c.device.id },
      data: { status: "REVOKED" },
    });
    await expect(
      service.deviceAttempt(c.device, c.sessionId, c.order.id, attempt.id),
    ).rejects.toThrow();
    await reconcile(attempt.id);
    expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
      "PAID",
    );
  });
  it("rejects a stale stock edit opened before payment and protects the remaining reservations", async () => {
    const p = await product(2),
      c = await checkout(p),
      attempt = await start(c);
    const before = await stock.get(storeId, p.id);
    await reconcile(attempt.id);
    await code(
      stock.update(storeId, p.id, actor, {
        expectedVersion: before.version,
        optionMode: "SINGLE",
        pricingMode: "CONSTANT",
        reason: "Old count",
        variants: [{ stockQuantity: 2 }],
      }),
      "PRODUCT_STOCK_VERSION_CONFLICT",
    );
    expect((await stock.get(storeId, p.id)).variants[0]!.stockQuantity).toBe(1);
  });
  it("allocates a multi-item paid order atomically when one expired item is no longer available", async () => {
    const a = await product(1),
      b = await product(1),
      c = await customer();
    const quote = await commerce.updateCart(c.device, c.sessionId, {
      expectedVersion: 0,
      items: [
        { variantId: a.variantId, quantity: 1 },
        { variantId: b.variantId, quantity: 1 },
      ],
    });
    const order = await commerce.checkout(c.device, c.sessionId, {
      expectedVersion: quote.version,
      quoteFingerprint: quote.quoteFingerprint,
      idempotencyKey: createSelfxId(),
    });
    const attempt = await service.start(
      c.device,
      c.sessionId,
      order.id,
      createSelfxId(),
    );
    await db.shoppingOrder.update({
      where: { id: order.id },
      data: {
        createdAt: new Date(Date.now() - 400000),
        expiresAt: new Date(Date.now() - 1),
      },
    });
    await checkout(b);
    await reconcile(attempt.id);
    expect((await commerce.getStaffOrder(storeId, order.id)).status).toBe(
      "PAID_REVIEW",
    );
    expect((await stock.get(storeId, a.id)).variants[0]!.stockQuantity).toBe(1);
    expect((await stock.get(storeId, b.id)).variants[0]!.stockQuantity).toBe(1);
  });
  it("continues verification using a retained prior encryption key after rotation", async () => {
    const c = await checkout(),
      attempt = await start(c);
    const oldKey = process.env.SELFX_PAYMENT_ENCRYPTION_KEY!,
      oldVersion = process.env.SELFX_PAYMENT_ENCRYPTION_KEY_VERSION!;
    const previous = process.env.SELFX_PAYMENT_PREVIOUS_ENCRYPTION_KEYS;
    try {
      process.env.SELFX_PAYMENT_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
        "base64",
      );
      process.env.SELFX_PAYMENT_ENCRYPTION_KEY_VERSION = "rotated_v2";
      process.env.SELFX_PAYMENT_PREVIOUS_ENCRYPTION_KEYS = JSON.stringify({
        [oldVersion]: oldKey,
      });
      await reconcile(attempt.id);
      expect((await commerce.getStaffOrder(storeId, c.order.id)).status).toBe(
        "PAID",
      );
    } finally {
      process.env.SELFX_PAYMENT_ENCRYPTION_KEY = oldKey;
      process.env.SELFX_PAYMENT_ENCRYPTION_KEY_VERSION = oldVersion;
      if (previous === undefined)
        delete process.env.SELFX_PAYMENT_PREVIOUS_ENCRYPTION_KEYS;
      else process.env.SELFX_PAYMENT_PREVIOUS_ENCRYPTION_KEYS = previous;
    }
  });
});
