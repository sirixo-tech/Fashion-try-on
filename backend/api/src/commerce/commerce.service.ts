import { createHash, randomBytes } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type KioskDevice } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import {
  type CheckoutShoppingCartDto,
  type ShoppingOrderListQueryDto,
  type UpdateShoppingCartDto,
  type UpdateStoreTaxDto,
  type TaxMode,
} from "./commerce.dto.js";
import {
  calculateLine,
  commerceError,
  MAX_ORDER_CENTS,
} from "./commerce-money.js";
import { reservedQuantities } from "./stock-reservations.js";
import {
  PAYMENT_SUMMARY_SELECT,
  paymentSummary,
} from "../payments/payment-response.js";

export const RESERVATION_MS = 5 * 60 * 1000;
export type ShoppingDevice = Pick<
  KioskDevice,
  "id" | "organizationId" | "assignmentScope" | "storeId"
>;
const orderInclude = {
  items: { orderBy: { id: "asc" as const } },
  paymentAttempts: {
    select: PAYMENT_SUMMARY_SELECT,
    orderBy: { createdAt: "desc" as const },
    take: 10,
  },
};
type OrderRecord = Prisma.ShoppingOrderGetPayload<{
  include: typeof orderInclude;
}>;
type CartRecord = Prisma.ShoppingCartGetPayload<{ include: { items: true } }>;
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

@Injectable()
export class CommerceService {
  private readonly requestBuckets = new Map<
    string,
    { count: number; resetAt: number }
  >();
  constructor(private readonly prisma: PrismaService) {}

  async getTax(storeId: string) {
    await this.requireStore(this.prisma, storeId);
    return taxResponse(
      await this.prisma.storeTaxSettings.findUnique({
        where: { organizationId: storeId },
      }),
    );
  }
  async updateTax(
    storeId: string,
    actorUserId: string,
    input: UpdateStoreTaxDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${storeId}::uuid FOR UPDATE`;
      await this.requireStore(tx, storeId, true);
      const before = taxResponse(
        await tx.storeTaxSettings.findUnique({
          where: { organizationId: storeId },
        }),
      );
      if (input.expectedVersion !== before.version)
        commerceError(
          "SHOPPING_TAX_VERSION_CONFLICT",
          "Tax settings changed. Reload before saving.",
        );
      const after = await tx.storeTaxSettings.upsert({
        where: { organizationId: storeId },
        create: {
          organizationId: storeId,
          mode: input.mode,
          rateBasisPoints: input.mode === "OFF" ? 0 : input.rateBasisPoints,
          version: 1,
        },
        update: {
          mode: input.mode,
          rateBasisPoints: input.mode === "OFF" ? 0 : input.rateBasisPoints,
          version: { increment: 1 },
        },
      });
      await this.audit(tx, storeId, actorUserId, "STORE_TAX_UPDATED", storeId, {
        before,
        after: taxResponse(after),
      });
      return taxResponse(after);
    });
  }

  async getCart(device: ShoppingDevice, sessionId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const storeId = await this.requireSession(tx, device, sessionId);
        const cart = await tx.shoppingCart.findUnique({
          where: { sessionId },
          include: { items: true },
        });
        return this.quote(tx, storeId, sessionId, cart);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async updateCart(
    device: ShoppingDevice,
    sessionId: string,
    input: UpdateShoppingCartDto,
  ) {
    this.limitDevice(device.id, "cart", 120);
    const ids = input.items.map((item) => item.variantId);
    if (new Set(ids).size !== ids.length)
      commerceError(
        "SHOPPING_CART_INVALID",
        "Each variant may occur only once in a cart.",
        HttpStatus.BAD_REQUEST,
      );
    return this.prisma.$transaction(
      async (tx) => {
        const storeId = await this.requireSession(tx, device, sessionId, true);
        const existing = await tx.shoppingCart.findUnique({
          where: { sessionId },
          include: { items: true },
        });
        if ((existing?.version ?? 0) !== input.expectedVersion)
          commerceError(
            "SHOPPING_CART_VERSION_CONFLICT",
            "Your cart changed. Reload before editing.",
          );
        if (existing)
          await this.requireNoPendingOrder(tx, storeId, existing.id);
        const candidates = await tx.productVariant.findMany({
          where: { id: { in: ids }, organizationId: storeId, active: true },
        });
        if (candidates.length !== ids.length)
          commerceError(
            "SHOPPING_PRODUCT_UNAVAILABLE",
            "A selected product option is unavailable.",
          );
        const cart = await tx.shoppingCart.upsert({
          where: { sessionId },
          create: {
            id: createSelfxId(),
            sessionId,
            organizationId: storeId,
            kioskDeviceId: device.id,
            version: 1,
          },
          update: { version: { increment: 1 } },
        });
        await tx.shoppingCartItem.deleteMany({
          where: { cartId: cart.id, organizationId: storeId },
        });
        if (input.items.length)
          await tx.shoppingCartItem.createMany({
            data: input.items.map((item) => ({
              ...item,
              cartId: cart.id,
              organizationId: storeId,
            })),
          });
        const result = await this.quote(tx, storeId, sessionId, {
          ...cart,
          items: input.items.map((item) => ({
            ...item,
            cartId: cart.id,
            organizationId: storeId,
          })),
        });
        if (input.items.length && !result.canCheckout)
          commerceError(
            result.issues[0]?.code ?? "SHOPPING_CART_INVALID",
            "A selected item is unavailable, exceeds available stock, or has no valid price.",
          );
        return result;
      },
      { timeout: 15000 },
    );
  }

  async checkout(
    device: ShoppingDevice,
    sessionId: string,
    input: CheckoutShoppingCartDto,
  ) {
    this.limitDevice(device.id, "checkout", 30);
    const keyDigest = digest(input.idempotencyKey);
    const fingerprint = digest([
      device.organizationId,
      sessionId,
      input.expectedVersion,
      input.quoteFingerprint,
    ]);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const storeId = await this.requireSession(
            tx,
            device,
            sessionId,
            true,
          );
          await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${storeId}::uuid FOR SHARE`;
          const now = new Date();
          const previous = await tx.shoppingCheckoutRequest.findUnique({
            where: {
              kioskDeviceId_keyDigest: { kioskDeviceId: device.id, keyDigest },
            },
            include: { order: { include: orderInclude } },
          });
          if (previous && previous.expiresAt > now) {
            if (
              previous.fingerprint !== fingerprint ||
              previous.order.organizationId !== storeId
            )
              commerceError(
                "SHOPPING_IDEMPOTENCY_CONFLICT",
                "This checkout key was used for a different request.",
              );
            return orderResponse(previous.order);
          }
          if (previous)
            await tx.shoppingCheckoutRequest.delete({
              where: {
                kioskDeviceId_keyDigest: {
                  kioskDeviceId: device.id,
                  keyDigest,
                },
              },
            });
          const cart = await tx.shoppingCart.findUnique({
            where: { sessionId },
            include: { items: true },
          });
          if (!cart || cart.version !== input.expectedVersion)
            commerceError(
              "SHOPPING_CART_VERSION_CONFLICT",
              "Reload your cart before checkout.",
            );
          await this.requireNoPendingOrder(tx, storeId, cart.id);
          const variants = await tx.productVariant.findMany({
            where: {
              id: { in: cart.items.map((item) => item.variantId) },
              organizationId: storeId,
            },
            select: { productId: true },
          });
          const productIds = [
            ...new Set(variants.map((variant) => variant.productId)),
          ].sort();
          if (productIds.length)
            await tx.$queryRaw(
              Prisma.sql`SELECT id FROM products WHERE organization_id = ${storeId}::uuid AND id IN (${Prisma.join(productIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`,
            );
          const quote = await this.quote(tx, storeId, sessionId, cart);
          if (quote.quoteFingerprint !== input.quoteFingerprint)
            commerceError(
              "SHOPPING_QUOTE_CHANGED",
              "Prices or taxes changed. Review the latest total before checkout.",
            );
          if (
            !quote.canCheckout ||
            !quote.currency ||
            quote.totalCents === null
          )
            commerceError(
              quote.issues[0]?.code ?? "SHOPPING_CART_EMPTY",
              "Your cart cannot be checked out. Review availability and pricing.",
            );
          const createdAt = new Date();
          const order = await tx.shoppingOrder.create({
            data: {
              id: createSelfxId(),
              reference: `SX-${randomBytes(8).toString("hex").toUpperCase()}`,
              organizationId: storeId,
              kioskDeviceId: device.id,
              sourceCartId: cart.id,
              currency: quote.currency,
              taxMode: quote.taxMode,
              subtotalCents: quote.subtotalCents!,
              taxCents: quote.taxCents!,
              totalCents: quote.totalCents,
              createdAt,
              expiresAt: new Date(createdAt.getTime() + RESERVATION_MS),
            },
          });
          await tx.shoppingOrderItem.createMany({
            data: quote.items.map((item) => ({
              id: createSelfxId(),
              orderId: order.id,
              organizationId: storeId,
              productId: item.productId,
              variantId: item.variantId,
              productName: item.productName,
              size: item.size,
              color: item.color,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents!,
              taxRateBasisPoints: item.taxRateBasisPoints,
              subtotalCents: item.subtotalCents!,
              taxCents: item.taxCents!,
              totalCents: item.totalCents!,
            })),
          });
          await tx.shoppingCheckoutRequest.create({
            data: {
              kioskDeviceId: device.id,
              keyDigest,
              fingerprint,
              orderId: order.id,
              expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
            },
          });
          await this.audit(
            tx,
            storeId,
            null,
            "SHOPPING_ORDER_CREATED",
            order.id,
            {
              kioskDeviceId: device.id,
              reference: order.reference,
              totalCents: order.totalCents,
            },
          );
          return orderResponse(
            await tx.shoppingOrder.findUniqueOrThrow({
              where: { id: order.id },
              include: orderInclude,
            }),
          );
        },
        { timeout: 15000 },
      );
    } catch (error) {
      // A concurrent key reuse on another session rolls the whole transaction
      // back. Never leave the losing order/reservations behind.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        commerceError(
          "SHOPPING_IDEMPOTENCY_CONFLICT",
          "Checkout is already being processed. Retry with the same request.",
        );
      throw error;
    }
  }

  async getDeviceOrder(
    device: ShoppingDevice,
    sessionId: string,
    orderId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const storeId = await this.requireSession(tx, device, sessionId);
      const cart = await tx.shoppingCart.findUnique({ where: { sessionId } });
      if (!cart) this.notFound();
      const order = await tx.shoppingOrder.findFirst({
        where: {
          id: orderId,
          organizationId: storeId,
          kioskDeviceId: device.id,
          sourceCartId: cart.id,
        },
        include: orderInclude,
      });
      if (!order) this.notFound();
      return orderResponse(order);
    });
  }
  async requirePaymentOrder(
    tx: Prisma.TransactionClient,
    device: ShoppingDevice,
    sessionId: string,
    orderId: string,
    lock = false,
  ) {
    const storeId = await this.requireSession(tx, device, sessionId, lock);
    const cart = await tx.shoppingCart.findUnique({ where: { sessionId } });
    if (!cart) this.notFound();
    const order = await tx.shoppingOrder.findFirst({
      where: {
        id: orderId,
        organizationId: storeId,
        kioskDeviceId: device.id,
        sourceCartId: cart.id,
      },
    });
    if (!order) this.notFound();
    return order;
  }
  async cancelDeviceOrder(
    device: ShoppingDevice,
    sessionId: string,
    orderId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const storeId = await this.requireSession(tx, device, sessionId, true);
      const cart = await tx.shoppingCart.findUnique({ where: { sessionId } });
      if (!cart) this.notFound();
      return this.cancel(tx, storeId, orderId, null, "Customer cancelled", {
        kioskDeviceId: device.id,
        sourceCartId: cart.id,
      });
    });
  }
  async cancelStaffOrder(
    storeId: string,
    orderId: string,
    actorUserId: string,
    reason: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireStore(tx, storeId, true);
      return this.cancel(tx, storeId, orderId, actorUserId, reason);
    });
  }
  async listOrders(storeId: string, query: ShoppingOrderListQueryDto) {
    await this.requireStore(this.prisma, storeId);
    const now = new Date();
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 25;
    const where: Prisma.ShoppingOrderWhereInput = {
      organizationId: storeId,
      ...(query.search?.trim()
        ? { reference: { contains: query.search.trim(), mode: "insensitive" } }
        : {}),
      ...(query.status === "EXPIRED"
        ? {
            OR: [
              { status: "EXPIRED" },
              { status: "AWAITING_PAYMENT", expiresAt: { lte: now } },
            ],
          }
        : query.status === "AWAITING_PAYMENT"
          ? { status: "AWAITING_PAYMENT", expiresAt: { gt: now } }
          : query.status
            ? { status: query.status }
            : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.shoppingOrder.count({ where }),
      this.prisma.shoppingOrder.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((row) =>
        orderResponse({ ...row, items: [], paymentAttempts: [] }),
      ),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        hasMore: page * pageSize < total,
      },
    };
  }
  async getStaffOrder(storeId: string, orderId: string) {
    await this.requireStore(this.prisma, storeId);
    const order = await this.prisma.shoppingOrder.findFirst({
      where: { organizationId: storeId, id: orderId },
      include: orderInclude,
    });
    if (!order) this.notFound();
    return orderResponse(order);
  }

  async expireDueOrders(now = new Date()) {
    const due = await this.prisma.shoppingOrder.findMany({
      where: { status: "AWAITING_PAYMENT", expiresAt: { lte: now } },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: 100,
      select: { id: true, organizationId: true },
    });
    let count = 0;
    for (const order of due) {
      count += await this.prisma.$transaction(async (tx) => {
        const changed = await tx.shoppingOrder.updateMany({
          where: {
            id: order.id,
            status: "AWAITING_PAYMENT",
            expiresAt: { lte: now },
          },
          data: { status: "EXPIRED", cancelledAt: now },
        });
        if (changed.count)
          await this.audit(
            tx,
            order.organizationId,
            null,
            "SHOPPING_ORDER_EXPIRED",
            order.id,
            {},
          );
        return changed.count;
      });
    }
    await this.prisma.shoppingCheckoutRequest.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    await this.prisma.shoppingCart.deleteMany({
      where: {
        session: {
          OR: [{ status: { not: "ACTIVE" } }, { expiresAt: { lte: now } }],
        },
      },
    });
    return count;
  }

  private async quote(
    tx: Prisma.TransactionClient,
    storeId: string,
    sessionId: string,
    cart: CartRecord | null,
  ) {
    const now = new Date();
    const tax = taxResponse(
      await tx.storeTaxSettings.findUnique({
        where: { organizationId: storeId },
      }),
    );
    const cartItems = [...(cart?.items ?? [])].sort((a, b) =>
      a.variantId.localeCompare(b.variantId),
    );
    const variants = await tx.productVariant.findMany({
      where: {
        id: { in: cartItems.map((item) => item.variantId) },
        organizationId: storeId,
      },
      include: {
        stockSettings: {
          include: {
            product: {
              include: {
                category: true,
                externalMappings: { select: { id: true }, take: 1 },
              },
            },
          },
        },
      },
    });
    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    const reserved = await reservedQuantities(
      tx,
      storeId,
      variants.map((variant) => variant.id),
      now,
    );
    const issues: Array<{ variantId: string; code: string }> = [];
    const items = cartItems.map((line) => {
      const variant = byId.get(line.variantId);
      if (!variant)
        commerceError(
          "SHOPPING_PRODUCT_UNAVAILABLE",
          "A cart option is no longer available.",
        );
      const settings = variant.stockSettings,
        product = settings.product;
      const available = Math.max(
        0,
        variant.stockQuantity - (reserved.get(variant.id) ?? 0),
      );
      if (
        !variant.active ||
        !product.active ||
        !product.category.active ||
        product.externalMappings.length
      )
        issues.push({
          variantId: variant.id,
          code: "SHOPPING_PRODUCT_UNAVAILABLE",
        });
      if (available < line.quantity)
        issues.push({ variantId: variant.id, code: "SHOPPING_OUT_OF_STOCK" });
      const unitPriceCents =
        settings.pricingMode === "VARIANT"
          ? (variant.priceOverrideAmountCents ?? product.priceAmountCents)
          : product.priceAmountCents;
      const validPrice =
        unitPriceCents !== null &&
        /^[A-Z]{3}$/.test(product.priceCurrency ?? "");
      if (!validPrice)
        issues.push({ variantId: variant.id, code: "SHOPPING_PRICE_INVALID" });
      const rate =
        tax.mode === "OFF"
          ? 0
          : (settings.taxRateBasisPoints ?? tax.rateBasisPoints);
      const money = validPrice
        ? calculateLine(unitPriceCents!, line.quantity, tax.mode, rate)
        : { subtotalCents: null, taxCents: null, totalCents: null };
      return {
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        size: variant.size,
        color: variant.color,
        quantity: line.quantity,
        unitPriceCents,
        currency: product.priceCurrency,
        availableStockQuantity: available,
        taxRateBasisPoints: rate,
        ...money,
      };
    });
    const currencies = new Set(items.map((item) => item.currency));
    if (currencies.size > 1)
      issues.push({ variantId: "", code: "SHOPPING_MIXED_CURRENCY" });
    const priced =
      items.every((item) => item.totalCents !== null) && currencies.size <= 1;
    const totalCents = priced
      ? items.reduce((sum, item) => sum + item.totalCents!, 0)
      : null;
    if (totalCents !== null && totalCents > MAX_ORDER_CENTS)
      commerceError(
        "SHOPPING_TOTAL_TOO_LARGE",
        "The cart exceeds the supported total.",
      );
    const activeOrder = cart
      ? await tx.shoppingOrder.findFirst({
          where: {
            organizationId: storeId,
            sourceCartId: cart.id,
            OR: [
              { status: "AWAITING_PAYMENT", expiresAt: { gt: now } },
              { status: "PAYMENT_PENDING" },
            ],
          },
          select: { id: true, expiresAt: true },
        })
      : null;
    return {
      cartId: cart?.id ?? null,
      version: cart?.version ?? 0,
      items,
      issues,
      currency: currencies.size === 1 ? (items[0]?.currency ?? null) : null,
      taxMode: tax.mode,
      subtotalCents: priced
        ? items.reduce((sum, item) => sum + item.subtotalCents!, 0)
        : null,
      taxCents: priced
        ? items.reduce((sum, item) => sum + item.taxCents!, 0)
        : null,
      totalCents,
      canCheckout: items.length > 0 && issues.length === 0 && !activeOrder,
      activeOrderId: activeOrder?.id ?? null,
      quoteFingerprint: digest([
        storeId,
        sessionId,
        cart?.version ?? 0,
        tax.mode,
        tax.rateBasisPoints,
        tax.version,
        items.map((item) => [
          item.variantId,
          item.productId,
          item.productName,
          item.size,
          item.color,
          item.quantity,
          item.unitPriceCents,
          item.currency,
          item.taxRateBasisPoints,
          item.subtotalCents,
          item.taxCents,
          item.totalCents,
        ]),
      ]),
      serverTime: now.toISOString(),
      paymentAvailable: false as const,
    };
  }

  private async requireNoPendingOrder(
    tx: Prisma.TransactionClient,
    storeId: string,
    cartId: string,
  ) {
    const expired = await tx.shoppingOrder.findMany({
      where: {
        organizationId: storeId,
        sourceCartId: cartId,
        status: "AWAITING_PAYMENT",
        expiresAt: { lte: new Date() },
      },
      select: { id: true },
    });
    for (const order of expired) {
      const changed = await tx.shoppingOrder.updateMany({
        where: { id: order.id, status: "AWAITING_PAYMENT" },
        data: { status: "EXPIRED", cancelledAt: new Date() },
      });
      if (changed.count)
        await this.audit(
          tx,
          storeId,
          null,
          "SHOPPING_ORDER_EXPIRED",
          order.id,
          {},
        );
    }
    if (
      await tx.shoppingOrder.findFirst({
        where: {
          organizationId: storeId,
          sourceCartId: cartId,
          OR: [
            { status: "AWAITING_PAYMENT", expiresAt: { gt: new Date() } },
            { status: "PAYMENT_PENDING" },
          ],
        },
        select: { id: true },
      })
    )
      commerceError(
        "SHOPPING_ORDER_PENDING",
        "Cancel the current unpaid order before changing or checking out this cart.",
      );
  }
  private async requireSession(
    tx: Prisma.TransactionClient,
    device: ShoppingDevice,
    sessionId: string,
    lock = false,
  ): Promise<string> {
    if (
      !device.organizationId ||
      device.assignmentScope !== "ORGANIZATION" ||
      device.storeId !== null
    )
      this.notFound();
    if (lock) {
      await tx.$queryRaw`SELECT id FROM kiosk_devices WHERE id = ${device.id}::uuid FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM try_on_sessions WHERE id = ${sessionId}::uuid AND organization_id = ${device.organizationId}::uuid AND kiosk_device_id = ${device.id}::uuid FOR UPDATE`;
    }
    const current = await tx.kioskDevice.findFirst({
      where: {
        id: device.id,
        organizationId: device.organizationId,
        assignmentScope: "ORGANIZATION",
        storeId: null,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!current) this.notFound();
    await this.requireStore(tx, device.organizationId, true);
    const session = await tx.tryOnSession.findFirst({
      where: {
        id: sessionId,
        organizationId: device.organizationId,
        kioskDeviceId: device.id,
        assignmentScope: "ORGANIZATION",
        storeId: null,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!session) this.notFound();
    return device.organizationId;
  }
  private async requireStore(
    tx: Pick<Prisma.TransactionClient, "organization">,
    storeId: string,
    active = false,
  ) {
    const store = await tx.organization.findFirst({
      where: { id: storeId, status: active ? "ACTIVE" : { not: "ARCHIVED" } },
      select: { id: true },
    });
    if (!store) this.notFound();
  }
  private async cancel(
    tx: Prisma.TransactionClient,
    storeId: string,
    orderId: string,
    actorUserId: string | null,
    reason: string,
    extra: Prisma.ShoppingOrderWhereInput = {},
  ) {
    const changed = await tx.shoppingOrder.updateMany({
      where: {
        id: orderId,
        organizationId: storeId,
        ...extra,
        status: "AWAITING_PAYMENT",
        expiresAt: { gt: new Date() },
      },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    const order = await tx.shoppingOrder.findFirst({
      where: { id: orderId, organizationId: storeId, ...extra },
      include: orderInclude,
    });
    if (!order) this.notFound();
    if (["PAYMENT_PENDING", "PAID", "PAID_REVIEW"].includes(order.status))
      commerceError(
        "SHOPPING_ORDER_NOT_CANCELLABLE",
        "This payment is pending or confirmed. Check its status or contact staff; it cannot be cancelled as unpaid.",
      );
    if (changed.count)
      await this.audit(
        tx,
        storeId,
        actorUserId,
        "SHOPPING_ORDER_CANCELLED",
        orderId,
        { reason },
      );
    return orderResponse(order);
  }
  private async audit(
    tx: Prisma.TransactionClient,
    storeId: string,
    actorUserId: string | null,
    action: string,
    resourceId: string,
    metadata: Prisma.InputJsonObject,
  ) {
    await tx.auditLog.create({
      data: {
        id: createSelfxId(),
        organizationId: storeId,
        actorUserId,
        action,
        resourceType: "Shopping",
        resourceId,
        metadata,
      },
    });
  }
  private notFound(): never {
    commerceError(
      "SHOPPING_NOT_FOUND",
      "Shopping resource was not found.",
      HttpStatus.NOT_FOUND,
    );
  }
  private limitDevice(deviceId: string, operation: string, maximum: number) {
    const now = Date.now(),
      key = `${operation}:${deviceId}`;
    for (const [bucketKey, bucket] of this.requestBuckets)
      if (bucket.resetAt <= now) this.requestBuckets.delete(bucketKey);
    const existing = this.requestBuckets.get(key);
    if (existing) {
      if (++existing.count > maximum)
        commerceError(
          "SHOPPING_RATE_LIMITED",
          "Too many shopping requests. Please wait a moment.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
    } else {
      if (this.requestBuckets.size >= 10000)
        commerceError(
          "SHOPPING_RATE_LIMITED",
          "Shopping is busy. Please try again shortly.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      this.requestBuckets.set(key, { count: 1, resetAt: now + 60000 });
    }
  }
}

function taxResponse(
  settings: { mode: string; rateBasisPoints: number; version: number } | null,
) {
  return {
    mode: (settings?.mode ?? "OFF") as TaxMode,
    rateBasisPoints: settings?.rateBasisPoints ?? 0,
    version: settings?.version ?? 0,
  };
}
function orderResponse(order: OrderRecord) {
  return {
    ...order,
    status:
      order.status === "AWAITING_PAYMENT" && order.expiresAt <= new Date()
        ? "EXPIRED"
        : order.status,
    createdAt: order.createdAt.toISOString(),
    expiresAt: order.expiresAt.toISOString(),
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    paidAt: order.paidAt?.toISOString() ?? null,
    stockAllocatedAt: order.stockAllocatedAt?.toISOString() ?? null,
    paymentAttempts: order.paymentAttempts.map(paymentSummary),
    serverTime: new Date().toISOString(),
    paymentAvailable: false as const,
  };
}
