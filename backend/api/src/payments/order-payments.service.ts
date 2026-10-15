import { createHash } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import { paymentCallbackOrigin } from "./payment-execution-utils.js";
import { Prisma, type ShoppingPaymentAttempt } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { ApiErrorException } from "../common/api-error.exception.js";
import {
  CommerceService,
  type ShoppingDevice,
} from "../commerce/commerce.service.js";
import { reservedQuantities } from "../commerce/stock-reservations.js";
import { PrismaService } from "../database/prisma.service.js";
import { PhonePeTransport } from "./phonepe.transport.js";
import { attemptAdapter } from "./payment-snapshots.js";
import type { ProviderPaymentStatus } from "./payment-adapter.js";
import { paymentSummary } from "./payment-response.js";
const activeStatuses = ["PREPARING", "PENDING", "UNKNOWN"];
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const expected = (row: ShoppingPaymentAttempt) => ({
  transactionId: row.transactionId,
  amountMinor: row.amountMinor,
  currency: "INR" as const,
});

@Injectable()
export class OrderPaymentsService {
  private readonly buckets = new Map<
    string,
    { count: number; deadline: number }
  >();
  constructor(
    private readonly prisma: PrismaService,
    private readonly commerce: CommerceService,
    private readonly transport: PhonePeTransport,
  ) {}

  async start(
    device: ShoppingDevice,
    sessionId: string,
    orderId: string,
    idempotencyKey: string,
  ) {
    this.limit(`device:${device.id}`, 30);
    const result = await this.prisma.$transaction(
      async (tx) => {
        const order = await this.commerce.requirePaymentOrder(
          tx,
          device,
          sessionId,
          orderId,
          true,
        );
        await tx.$queryRaw`SELECT id FROM shopping_orders WHERE id = ${orderId}::uuid FOR UPDATE`;
        const current = await tx.shoppingOrder.findUniqueOrThrow({
          where: { id: orderId },
        });
        const old = await tx.shoppingPaymentAttempt.findUnique({
          where: {
            orderId_keyDigest: { orderId, keyDigest: digest(idempotencyKey) },
          },
        });
        if (old) return { attempt: old, created: false };
        if (
          current.status !== "AWAITING_PAYMENT" ||
          current.expiresAt <= new Date()
        )
          fail(
            "PAYMENT_ORDER_UNAVAILABLE",
            "This order cannot start a new payment.",
          );
        if (current.currency !== "INR" || current.totalCents < 1)
          fail(
            "PAYMENT_AMOUNT_UNSUPPORTED",
            "PhonePe requires a positive INR order total.",
          );
        if (
          await tx.shoppingPaymentEvent.findFirst({
            where: {
              reportedStatus: "SUCCEEDED",
              attempt: { orderId, status: { not: "SUCCEEDED" } },
            },
            select: { id: true },
          })
        )
          fail(
            "PAYMENT_CONFIRMATION_PENDING",
            "A success notification still needs verification. Check the existing payment instead of retrying.",
          );
        if (process.env.SELFX_PHONEPE_UAT_ENABLED !== "true")
          fail(
            "PAYMENT_NOT_ENABLED",
            "PhonePe test payments have not been enabled by SelfX.",
          );
        paymentCallbackOrigin();
        if (
          (await tx.shoppingPaymentAttempt.count({ where: { orderId } })) >= 10
        )
          fail(
            "PAYMENT_RETRY_LIMIT",
            "This order has reached its payment retry limit. Contact staff.",
          );
        const policies = await tx.$queryRaw<
          Array<{ enabled: boolean }>
        >`SELECT enabled FROM payment_gateway_policies WHERE provider = 'PHONEPE' FOR SHARE`;
        await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${order.organizationId}::uuid FOR SHARE`;
        const settings = await tx.storePaymentSettings.findUnique({
          where: { organizationId: order.organizationId },
        });
        const connection = await tx.storePaymentConnection.findUnique({
          where: {
            organizationId_provider: {
              organizationId: order.organizationId,
              provider: "PHONEPE",
            },
          },
        });
        if (
          settings?.selectedProvider !== "PHONEPE" ||
          !policies[0]?.enabled ||
          !connection ||
          connection.environment !== "UAT" ||
          !connection.dqrAccessConfirmed
        )
          fail(
            "PAYMENT_ACCOUNT_UNCONFIRMED",
            "Confirm the Store's UAT Dynamic QR access and select PhonePe before testing payments.",
          );
        const id = createSelfxId(),
          now = new Date();
        const attempt = await tx.shoppingPaymentAttempt.create({
          data: {
            id,
            organizationId: order.organizationId,
            orderId,
            provider: "PHONEPE",
            environment: "UAT",
            transactionId: `PX${id.replaceAll("-", "")}`,
            keyDigest: digest(idempotencyKey),
            status: "PREPARING",
            amountMinor: current.totalCents,
            currency: current.currency,
            connectionId: connection.id,
            encryptedPayload: connection.encryptedPayload,
            initializationVector: connection.initializationVector,
            authenticationTag: connection.authenticationTag,
            keyVersion: connection.keyVersion,
            expiresAt: current.expiresAt,
            leaseUntil: new Date(now.getTime() + 30000),
            nextCheckAt: new Date(now.getTime() + 30000),
          },
        });
        // Validate snapshot/decryption before any attempt can reach the provider.
        attemptAdapter(attempt).statusRequest(expected(attempt));
        await tx.shoppingOrder.update({
          where: { id: orderId },
          data: { status: "PAYMENT_PENDING" },
        });
        await audit(
          tx,
          order.organizationId,
          orderId,
          "SHOPPING_PAYMENT_STARTED",
          id,
        );
        return { attempt, created: true };
      },
      { timeout: 15000 },
    );
    if (result.created) {
      try {
        const seconds = Math.floor(
          (result.attempt.expiresAt.getTime() - Date.now()) / 1000,
        );
        if (seconds < 1) throw new Error("Payment reservation expired.");
        const adapter = attemptAdapter(result.attempt);
        const response = await this.transport.send(
          adapter.createRequest(
            expected(result.attempt),
            `${paymentCallbackOrigin()}/api/v1/payments/phonepe/${result.attempt.id}/callback`,
            seconds,
          ),
        );
        const qr = adapter.parseQr(response, expected(result.attempt));
        await this.prisma.shoppingPaymentAttempt.updateMany({
          where: { id: result.attempt.id, status: { in: activeStatuses } },
          data: {
            status: "PENDING",
            qrString: qr.qrString,
            failureCode: null,
            leaseUntil: null,
            nextCheckAt: new Date(Date.now() + 15000),
          },
        });
      } catch {
        await this.prisma.shoppingPaymentAttempt.updateMany({
          where: { id: result.attempt.id, status: { in: activeStatuses } },
          data: {
            status: "UNKNOWN",
            failureCode: "PAYMENT_REQUEST_UNCERTAIN",
            leaseUntil: null,
            nextCheckAt: new Date(Date.now() + 15000),
          },
        });
      }
    }
    return this.deviceAttempt(device, sessionId, orderId, result.attempt.id);
  }

  async deviceAttempt(
    device: ShoppingDevice,
    sessionId: string,
    orderId: string,
    attemptId: string,
    check = false,
  ) {
    this.limit(`device-read:${device.id}`, 120);
    await this.prisma.$transaction((tx) =>
      this.commerce.requirePaymentOrder(tx, device, sessionId, orderId),
    );
    const attempt = await this.prisma.shoppingPaymentAttempt.findFirst({
      where: { id: attemptId, orderId, organizationId: device.organizationId! },
    });
    if (!attempt) notFound();
    if (check) await this.reconcile(attempt.id);
    const row = await this.prisma.shoppingPaymentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
      include: { order: { select: { status: true } } },
    });
    return {
      ...paymentSummary(row),
      qrString:
        row.status === "PENDING" &&
        row.order.status === "PAYMENT_PENDING" &&
        row.expiresAt > new Date()
          ? row.qrString
          : null,
      testOnly: true as const,
      serverTime: new Date().toISOString(),
    };
  }

  async checkStaff(
    storeId: string,
    orderId: string,
    attemptId: string,
    actorUserId: string,
  ) {
    this.limit(`staff:${actorUserId}`, 60);
    const row = await this.prisma.shoppingPaymentAttempt.findFirst({
      where: { id: attemptId, orderId, organizationId: storeId },
    });
    if (!row) notFound();
    await this.reconcile(row.id, actorUserId);
    return this.commerce.getStaffOrder(storeId, orderId);
  }

  async callback(
    attemptId: string,
    encoded: string,
    signature: string,
    ip: string,
  ) {
    this.limit(`webhook:${ip}`, 1000);
    this.limit(`event:${attemptId}`, 60);
    const attempt = await this.prisma.shoppingPaymentAttempt.findUnique({
      where: { id: attemptId },
    });
    if (!attempt) notFound();
    let reported: ProviderPaymentStatus;
    try {
      if (signature.length > 128) throw new Error();
      reported = attemptAdapter(attempt).verifyCallback(
        encoded,
        signature,
        expected(attempt),
      );
    } catch {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        "PAYMENT_CALLBACK_INVALID",
        "Payment notification could not be verified.",
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.shoppingPaymentEvent.createMany({
        skipDuplicates: true,
        data: [
          {
            id: createSelfxId(),
            organizationId: attempt.organizationId,
            attemptId,
            digest: digest(encoded),
            reportedStatus: reported.status,
          },
        ],
      });
      if (inserted.count)
        await tx.shoppingPaymentAttempt.updateMany({
          where: { id: attemptId, status: { not: "SUCCEEDED" } },
          data: { nextCheckAt: new Date() },
        });
    });
    // Fast acknowledgement; durable nextCheckAt lets the worker recover after
    // restarts. The callback alone never marks an order paid.
    return { accepted: true };
  }

  async reconcile(attemptId: string, actorUserId: string | null = null) {
    const now = new Date();
    const claimed = await this.prisma.shoppingPaymentAttempt.updateMany({
      where: {
        id: attemptId,
        status: { not: "SUCCEEDED" },
        AND: [
          { OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
          { OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: now } }] },
        ],
      },
      data: {
        leaseUntil: new Date(now.getTime() + 30000),
        nextCheckAt: new Date(now.getTime() + 30000),
      },
    });
    if (!claimed.count) return;
    const row = await this.prisma.shoppingPaymentAttempt.findUniqueOrThrow({
      where: { id: attemptId },
    });
    let status: ProviderPaymentStatus;
    try {
      const adapter = attemptAdapter(row);
      status = adapter.parseStatus(
        await this.transport.send(adapter.statusRequest(expected(row))),
        expected(row),
      );
    } catch {
      await this.defer(row, "PAYMENT_STATUS_UNAVAILABLE");
      return;
    }
    if (status.status === "UNKNOWN") {
      await this.defer(row, "PAYMENT_STATUS_UNRESOLVED");
      return;
    }
    if (status.status === "PENDING") {
      await this.defer(row, null, "PENDING");
      return;
    }
    await this.applyTerminal(row, status, actorUserId);
  }

  async reconcileDue() {
    const now = new Date();
    const rows = await this.prisma.shoppingPaymentAttempt.findMany({
      where: {
        nextCheckAt: { lte: now },
        status: { not: "SUCCEEDED" },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      orderBy: [{ nextCheckAt: "asc" }, { id: "asc" }],
      take: 20,
      select: { id: true },
    });
    // A small bounded pool; no HTTP calls inside database transactions.
    for (let index = 0; index < rows.length; index += 4)
      await Promise.allSettled(
        rows.slice(index, index + 4).map((row) => this.reconcile(row.id)),
      );
    return rows.length;
  }

  private async defer(
    row: ShoppingPaymentAttempt,
    failureCode: string | null,
    status = "UNKNOWN",
  ) {
    const delay = Math.min(3600000, 15000 * 2 ** Math.min(row.checkCount, 8));
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM shopping_payment_attempts WHERE id = ${row.id}::uuid FOR UPDATE`;
      await tx.shoppingPaymentAttempt.updateMany({
        where: { id: row.id, status: { in: activeStatuses } },
        data: {
          status,
          failureCode,
          leaseUntil: null,
          nextCheckAt: new Date(Date.now() + delay),
          checkCount: { increment: 1 },
        },
      });
      // Preserve a failed attempt's state, but never discard verification work
      // for signed success evidence that arrived during a timed-out check.
      // The attempt lock also serializes callback scheduling with this update.
      const successEvidence = await tx.shoppingPaymentEvent.findFirst({
        where: { attemptId: row.id, reportedStatus: "SUCCEEDED" },
        select: { id: true },
      });
      await tx.shoppingPaymentAttempt.updateMany({
        where: { id: row.id, status: "FAILED" },
        data: {
          leaseUntil: null,
          nextCheckAt: successEvidence ? new Date(Date.now() + delay) : null,
          checkCount: { increment: 1 },
        },
      });
    });
  }

  private async applyTerminal(
    snapshot: ShoppingPaymentAttempt,
    payment: ProviderPaymentStatus,
    actorUserId: string | null,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM shopping_orders WHERE id = ${snapshot.orderId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM shopping_payment_attempts WHERE id = ${snapshot.id}::uuid FOR UPDATE`;
        const order = await tx.shoppingOrder.findUniqueOrThrow({
          where: { id: snapshot.orderId },
          include: { items: true },
        });
        const attempt = await tx.shoppingPaymentAttempt.findUniqueOrThrow({
          where: { id: snapshot.id },
        });
        if (attempt.status === "SUCCEEDED") return;
        if (
          attempt.organizationId !== order.organizationId ||
          attempt.amountMinor !== order.totalCents ||
          attempt.currency !== order.currency
        )
          throw new Error("Payment/order snapshot mismatch.");
        const now = new Date();
        // A signed success notification can race a lagging failed status response.
        // Keep checking rather than permitting another charge while they disagree.
        if (
          payment.status === "FAILED" &&
          (await tx.shoppingPaymentEvent.findFirst({
            where: { attemptId: attempt.id, reportedStatus: "SUCCEEDED" },
            select: { id: true },
          }))
        ) {
          const otherActive = await tx.shoppingPaymentAttempt.count({
            where: {
              orderId: order.id,
              id: { not: attempt.id },
              status: { in: activeStatuses },
            },
          });
          await tx.shoppingPaymentAttempt.update({
            where: { id: attempt.id },
            data: {
              status: otherActive ? "FAILED" : "UNKNOWN",
              failureCode: "PAYMENT_EVIDENCE_CONFLICT",
              leaseUntil: null,
              nextCheckAt: new Date(now.getTime() + 15000),
              checkCount: { increment: 1 },
            },
          });
          if (!order.paidAt && order.status !== "PAYMENT_PENDING") {
            const otherCartPending = await tx.shoppingOrder.findFirst({
              where: {
                sourceCartId: order.sourceCartId,
                id: { not: order.id },
                status: { in: ["AWAITING_PAYMENT", "PAYMENT_PENDING"] },
              },
              select: { id: true },
            });
            if (!otherCartPending)
              await tx.shoppingOrder.update({
                where: { id: order.id },
                data: { status: "PAYMENT_PENDING", cancelledAt: null },
              });
          }
          return;
        }
        await tx.shoppingPaymentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: payment.status === "SUCCEEDED" ? "SUCCEEDED" : "FAILED",
            paidAt: payment.status === "SUCCEEDED" ? now : null,
            providerReference: payment.providerReference,
            failureCode: payment.status === "FAILED" ? "PAYMENT_FAILED" : null,
            leaseUntil: null,
            nextCheckAt: null,
            checkCount: { increment: 1 },
          },
        });
        if (payment.status === "SUCCEEDED") {
          if (order.paidAt) {
            await tx.shoppingOrder.update({
              where: { id: order.id },
              data: {
                status: "PAID_REVIEW",
                paymentReviewReason: order.stockAllocatedAt
                  ? "DUPLICATE_PAYMENT"
                  : "STOCK_AND_DUPLICATE_PAYMENT",
              },
            });
            await audit(
              tx,
              order.organizationId,
              order.id,
              "SHOPPING_DUPLICATE_PAYMENT",
              attempt.id,
              actorUserId,
            );
          } else {
            const allocated = await allocateStock(tx, order);
            await tx.shoppingOrder.update({
              where: { id: order.id },
              data: {
                paidAt: now,
                cancelledAt: null,
                status: allocated ? "PAID" : "PAID_REVIEW",
                stockAllocatedAt: allocated ? now : null,
                paymentReviewReason: allocated ? null : "STOCK_UNAVAILABLE",
              },
            });
            const otherPending = await tx.shoppingOrder.findFirst({
              where: {
                sourceCartId: order.sourceCartId,
                id: { not: order.id },
                status: { in: ["AWAITING_PAYMENT", "PAYMENT_PENDING"] },
              },
              select: { id: true },
            });
            if (!otherPending) {
              await tx.shoppingCart.updateMany({
                where: {
                  id: order.sourceCartId,
                  organizationId: order.organizationId,
                },
                data: { version: { increment: 1 } },
              });
              await tx.shoppingCartItem.deleteMany({
                where: {
                  cartId: order.sourceCartId,
                  organizationId: order.organizationId,
                },
              });
            }
            await audit(
              tx,
              order.organizationId,
              order.id,
              allocated ? "SHOPPING_ORDER_PAID" : "SHOPPING_PAID_STOCK_REVIEW",
              attempt.id,
              actorUserId,
            );
          }
        } else if (!order.paidAt && order.status === "PAYMENT_PENDING") {
          const other = await tx.shoppingPaymentAttempt.count({
            where: { orderId: order.id, status: { in: activeStatuses } },
          });
          if (!other)
            await tx.shoppingOrder.update({
              where: { id: order.id },
              data: {
                status: order.expiresAt > now ? "AWAITING_PAYMENT" : "EXPIRED",
              },
            });
          await audit(
            tx,
            order.organizationId,
            order.id,
            "SHOPPING_PAYMENT_FAILED",
            attempt.id,
            actorUserId,
          );
        }
      },
      { timeout: 15000 },
    );
  }

  async retryAllocation(storeId: string, orderId: string, actorUserId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM shopping_orders WHERE id = ${orderId}::uuid AND organization_id = ${storeId}::uuid FOR UPDATE`;
        const order = await tx.shoppingOrder.findFirst({
          where: { id: orderId, organizationId: storeId },
          include: { items: true },
        });
        if (!order) notFound();
        if (
          !order.paidAt ||
          !["STOCK_UNAVAILABLE", "STOCK_AND_DUPLICATE_PAYMENT"].includes(
            order.paymentReviewReason ?? "",
          ) ||
          order.stockAllocatedAt
        )
          fail(
            "PAYMENT_ALLOCATION_UNAVAILABLE",
            "This order does not need stock recovery.",
          );
        if (!(await allocateStock(tx, order)))
          fail(
            "PAYMENT_STOCK_UNAVAILABLE",
            "Stock is still unavailable. Update stock before retrying.",
          );
        const duplicate =
          order.paymentReviewReason === "STOCK_AND_DUPLICATE_PAYMENT";
        await tx.shoppingOrder.update({
          where: { id: order.id },
          data: {
            status: duplicate ? "PAID_REVIEW" : "PAID",
            paymentReviewReason: duplicate ? "DUPLICATE_PAYMENT" : null,
            stockAllocatedAt: new Date(),
          },
        });
        await audit(
          tx,
          storeId,
          orderId,
          "SHOPPING_PAID_STOCK_RECOVERED",
          null,
          actorUserId,
        );
      },
      { timeout: 15000 },
    );
    return this.commerce.getStaffOrder(storeId, orderId);
  }

  private limit(key: string, max: number) {
    const now = Date.now(),
      old = this.buckets.get(key);
    if (old && old.deadline > now) {
      if (++old.count > max)
        throw new ApiErrorException(
          HttpStatus.TOO_MANY_REQUESTS,
          "PAYMENT_RATE_LIMITED",
          "Too many payment requests. Please wait.",
        );
    } else {
      if (this.buckets.size >= 10000)
        this.buckets.delete(this.buckets.keys().next().value!);
      this.buckets.set(key, { count: 1, deadline: now + 60000 });
    }
  }
}

async function allocateStock(
  tx: Prisma.TransactionClient,
  order: Prisma.ShoppingOrderGetPayload<{ include: { items: true } }>,
) {
  const productIds = [
    ...new Set(order.items.map((item) => item.productId)),
  ].sort();
  if (!productIds.length) return false;
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM products WHERE organization_id = ${order.organizationId}::uuid AND id IN (${Prisma.join(productIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`,
  );
  const variants = await tx.productVariant.findMany({
    where: {
      organizationId: order.organizationId,
      id: { in: order.items.map((item) => item.variantId) },
    },
  });
  const now = new Date(),
    held = await reservedQuantities(
      tx,
      order.organizationId,
      variants.map((item) => item.id),
      now,
    );
  const ownHold =
    ["AWAITING_PAYMENT", "PAYMENT_PENDING"].includes(order.status) &&
    order.expiresAt > now;
  if (
    order.items.some((item) => {
      const variant = variants.find((row) => row.id === item.variantId);
      return (
        !variant ||
        variant.stockQuantity -
          (held.get(item.variantId) ?? 0) +
          (ownHold ? item.quantity : 0) <
          item.quantity
      );
    })
  )
    return false;
  for (const item of order.items)
    await tx.productVariant.update({
      where: { id: item.variantId },
      data: { stockQuantity: { decrement: item.quantity } },
    });
  // A staff form opened before this sale must not overwrite the deducted stock.
  await tx.productStockSettings.updateMany({
    where: {
      organizationId: order.organizationId,
      productId: { in: productIds },
    },
    data: { version: { increment: 1 } },
  });
  return true;
}
function fail(code: string, message: string): never {
  throw new ApiErrorException(HttpStatus.CONFLICT, code, message);
}
function notFound(): never {
  throw new ApiErrorException(
    HttpStatus.NOT_FOUND,
    "SHOPPING_ORDER_NOT_FOUND",
    "Order or payment was not found.",
  );
}
async function audit(
  tx: Prisma.TransactionClient,
  storeId: string,
  orderId: string,
  action: string,
  attemptId: string | null,
  actorUserId: string | null = null,
) {
  await tx.auditLog.create({
    data: {
      id: createSelfxId(),
      organizationId: storeId,
      actorUserId,
      resourceType: "shopping_order",
      resourceId: orderId,
      action,
      metadata: { paymentAttemptId: attemptId },
    },
  });
}
