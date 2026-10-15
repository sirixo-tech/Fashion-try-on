import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { ProductStockService } from "../stores/product-stock.service.js";
import { CommerceService, type ShoppingDevice } from "./commerce.service.js";

const databaseUrl = process.env.STOCK_TEST_DATABASE_URL;
if (
  databaseUrl &&
  (!["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname) ||
    !new URL(databaseUrl).pathname.endsWith("_test"))
)
  throw new Error("Use a disposable localhost database ending in _test.");
async function code(promise: Promise<unknown>, expected: string) {
  await expect(
    promise.catch((error: ApiErrorException) => error.getResponse()),
  ).resolves.toMatchObject({ error: { code: expected } });
}
describe.skipIf(!databaseUrl)("SHOPPING-2 PostgreSQL", () => {
  const prisma = new PrismaService({
    datasourceUrl: databaseUrl ?? "postgresql://unused@localhost/unused_test",
  });
  const commerce = new CommerceService(prisma),
    stock = new ProductStockService(prisma);
  const storeId = createSelfxId(),
    otherStore = createSelfxId(),
    actorId = createSelfxId(),
    categoryId = createSelfxId();
  const productIds: string[] = [],
    devices: ShoppingDevice[] = [];
  beforeAll(async () => {
    await prisma.$connect();
    for (const id of [storeId, otherStore])
      await prisma.organization.create({
        data: {
          id,
          name: "Shopping test",
          slug: `shopping-${id}`,
          status: "ACTIVE",
        },
      });
    await prisma.user.create({
      data: {
        id: actorId,
        email: `${actorId}@shopping.invalid`,
        passwordHash: "not-a-login",
      },
    });
    await prisma.productCategory.create({
      data: {
        id: categoryId,
        organizationId: storeId,
        scope: "STORE",
        catalogKey: categoryId,
        slug: "tops",
        name: "Tops",
      },
    });
  });
  afterAll(async () => {
    await prisma.shoppingOrder.deleteMany({
      where: { organizationId: storeId },
    });
    await prisma.shoppingCart.deleteMany({
      where: { organizationId: storeId },
    });
    await prisma.tryOnSession.deleteMany({
      where: { organizationId: storeId },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.productCategory.delete({ where: { id: categoryId } });
    await prisma.kioskDevice.deleteMany({
      where: { id: { in: devices.map((d) => d.id) } },
    });
    await prisma.storeTaxSettings.deleteMany({
      where: { organizationId: storeId },
    });
    await prisma.auditLog.deleteMany({ where: { organizationId: storeId } });
    await prisma.organization.deleteMany({
      where: { id: { in: [storeId, otherStore] } },
    });
    await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  });
  async function customer() {
    const device = {
      id: createSelfxId(),
      organizationId: storeId,
      assignmentScope: "ORGANIZATION" as const,
      storeId: null,
    };
    await prisma.kioskDevice.create({
      data: { ...device, displayName: "Shopping test", status: "ACTIVE" },
    });
    devices.push(device);
    const sessionId = createSelfxId();
    await prisma.tryOnSession.create({
      data: {
        id: sessionId,
        kioskDeviceId: device.id,
        assignmentScope: "ORGANIZATION",
        organizationId: storeId,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    return { device, sessionId };
  }
  async function product(quantity = 5, price = 10000) {
    const id = createSelfxId();
    productIds.push(id);
    await prisma.product.create({
      data: {
        id,
        catalogKey: id,
        organizationId: storeId,
        scope: "STORE",
        categoryId,
        name: "Original shirt",
        slug: id,
        audience: "UNISEX",
        garmentIntent: "TOP",
        garmentCategory: "TOP",
        active: true,
        vtoEnabled: true,
        imageUrl: "https://example.com/test-shirt.jpg",
        priceAmountCents: price,
        priceCurrency: "INR",
      },
    });
    const setup = await stock.update(storeId, id, actorId, {
      expectedVersion: 0,
      optionMode: "SIZE",
      pricingMode: "CONSTANT",
      reason: "Initial",
      variants: [{ size: "M", stockQuantity: quantity }],
    });
    return { id, variantId: setup.variants[0]!.id };
  }
  async function basket(
    c: Awaited<ReturnType<typeof customer>>,
    lines: Array<{ variantId: string; quantity: number }>,
  ) {
    return commerce.updateCart(c.device, c.sessionId, {
      expectedVersion: 0,
      items: lines,
    });
  }
  const checkout = (
    c: Awaited<ReturnType<typeof customer>>,
    quote: Awaited<ReturnType<typeof basket>>,
    key = createSelfxId(),
  ) =>
    commerce.checkout(c.device, c.sessionId, {
      expectedVersion: quote.version,
      quoteFingerprint: quote.quoteFingerprint,
      idempotencyKey: key,
    });
  async function setTax(
    mode: "OFF" | "INCLUSIVE" | "EXCLUSIVE",
    rateBasisPoints: number,
  ) {
    const before = await commerce.getTax(storeId);
    return commerce.updateTax(storeId, actorId, {
      expectedVersion: before.version,
      mode,
      rateBasisPoints,
    });
  }

  it("supports multi-item quantities and reserves only at checkout, never at cart add", async () => {
    await setTax("OFF", 0);
    const c = await customer(),
      a = await product(8),
      b = await product(4, 2500);
    const quote = await basket(c, [
      { variantId: a.variantId, quantity: 3 },
      { variantId: b.variantId, quantity: 2 },
    ]);
    expect(quote.totalCents).toBe(35000);
    expect((await stock.get(storeId, a.id)).totalReservedStockQuantity).toBe(0);
    const order = await checkout(c, quote);
    expect(order.items).toHaveLength(2);
    expect(
      new Date(order.expiresAt).getTime() - new Date(order.createdAt).getTime(),
    ).toBe(300000);
    expect((await stock.get(storeId, a.id)).totalAvailableStockQuantity).toBe(
      5,
    );
    await code(
      commerce.updateCart(c.device, c.sessionId, {
        expectedVersion: quote.version,
        items: [],
      }),
      "SHOPPING_ORDER_PENDING",
    );
    await commerce.cancelStaffOrder(storeId, order.id, actorId, "Test release");
  });
  it("rejects excessive quantity and cross-Store/other-device or ended-session access", async () => {
    const c = await customer(),
      other = await customer(),
      p = await product(1);
    await code(
      basket(c, [{ variantId: p.variantId, quantity: 2 }]),
      "SHOPPING_OUT_OF_STOCK",
    );
    await code(
      commerce.getCart(other.device, c.sessionId),
      "SHOPPING_NOT_FOUND",
    );
    await code(
      commerce.getCart(
        { ...c.device, organizationId: otherStore },
        c.sessionId,
      ),
      "SHOPPING_NOT_FOUND",
    );
    await prisma.tryOnSession.update({
      where: { id: c.sessionId },
      data: { status: "COMPLETED" },
    });
    await code(commerce.getCart(c.device, c.sessionId), "SHOPPING_NOT_FOUND");
  });
  it("only one concurrent checkout can reserve the last unit across kiosks", async () => {
    const a = await customer(),
      b = await customer(),
      p = await product(1);
    const qa = await basket(a, [{ variantId: p.variantId, quantity: 1 }]),
      qb = await basket(b, [{ variantId: p.variantId, quantity: 1 }]);
    const results = await Promise.allSettled([
      checkout(a, qa),
      checkout(b, qb),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(
      rejected?.status === "rejected" && rejected.reason.getResponse(),
    ).toMatchObject({ error: { code: "SHOPPING_OUT_OF_STOCK" } });
    const orders = await prisma.shoppingOrder.findMany({
      where: { items: { some: { variantId: p.variantId } } },
    });
    expect(orders).toHaveLength(1);
    await commerce.cancelStaffOrder(storeId, orders[0]!.id, actorId, "Release");
  });
  it("replays identical checkout retries and rejects key reuse with changed request", async () => {
    const c = await customer(),
      p = await product();
    const quote = await basket(c, [{ variantId: p.variantId, quantity: 1 }]),
      key = createSelfxId();
    const [first, repeated] = await Promise.all([
      checkout(c, quote, key),
      checkout(c, quote, key),
    ]);
    expect(first.id).toBe(repeated.id);
    expect(
      await prisma.shoppingOrder.count({
        where: { sourceCartId: quote.cartId! },
      }),
    ).toBe(1);
    await code(
      commerce.checkout(c.device, c.sessionId, {
        expectedVersion: quote.version,
        quoteFingerprint: "a".repeat(64),
        idempotencyKey: key,
      }),
      "SHOPPING_IDEMPOTENCY_CONFLICT",
    );
    await commerce.cancelDeviceOrder(c.device, c.sessionId, first.id);
    expect((await stock.get(storeId, p.id)).totalReservedStockQuantity).toBe(0);
  });
  it("snapshots tax/default/product override and rejects a price change before checkout", async () => {
    await setTax("EXCLUSIVE", 1800);
    const c = await customer(),
      p = await product(5, 10000);
    const current = await stock.get(storeId, p.id);
    await stock.update(storeId, p.id, actorId, {
      expectedVersion: current.version,
      optionMode: "SIZE",
      pricingMode: "CONSTANT",
      reason: "Product tax",
      taxRateBasisPoints: 500,
      variants: [{ size: "M", stockQuantity: 5 }],
    });
    const quote = await basket(c, [{ variantId: p.variantId, quantity: 2 }]);
    expect(quote.totalCents).toBe(21000);
    await prisma.product.update({
      where: { id: p.id },
      data: { priceAmountCents: 20000 },
    });
    await code(checkout(c, quote), "SHOPPING_QUOTE_CHANGED");
    const latest = await commerce.getCart(c.device, c.sessionId);
    const order = await checkout(c, latest);
    await prisma.product.update({
      where: { id: p.id },
      data: { priceAmountCents: 30000, name: "Changed shirt" },
    });
    await setTax("INCLUSIVE", 1800);
    const stored = await commerce.getStaffOrder(storeId, order.id);
    expect(stored.totalCents).toBe(42000);
    expect(stored.items[0]).toMatchObject({
      productName: "Original shirt",
      unitPriceCents: 20000,
      taxRateBasisPoints: 500,
    });
    await commerce.cancelStaffOrder(storeId, order.id, actorId, "Release");
  });
  it("uses included and no-tax modes, preserving exactly the entered total", async () => {
    await setTax("INCLUSIVE", 1800);
    const c = await customer(),
      p = await product(3, 11800);
    const quote = await basket(c, [{ variantId: p.variantId, quantity: 1 }]);
    expect(quote).toMatchObject({
      subtotalCents: 10000,
      taxCents: 1800,
      totalCents: 11800,
    });
    await setTax("OFF", 1800);
    expect(await commerce.getCart(c.device, c.sessionId)).toMatchObject({
      taxCents: 0,
      totalCents: 11800,
    });
  });
  it("protects held stock from staff reductions and releases it at expiry even before a sweep", async () => {
    const c = await customer(),
      p = await product(1);
    const quote = await basket(c, [{ variantId: p.variantId, quantity: 1 }]),
      order = await checkout(c, quote);
    const current = await stock.get(storeId, p.id);
    await code(
      stock.update(storeId, p.id, actorId, {
        expectedVersion: current.version,
        optionMode: "SIZE",
        pricingMode: "CONSTANT",
        reason: "Recount",
        variants: [{ size: "M", stockQuantity: 0 }],
      }),
      "PRODUCT_STOCK_RESERVED",
    );
    await prisma.shoppingOrder.update({
      where: { id: order.id },
      data: {
        createdAt: new Date(Date.now() - 600000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    expect((await stock.get(storeId, p.id)).totalAvailableStockQuantity).toBe(
      1,
    );
    expect((await commerce.getStaffOrder(storeId, order.id)).status).toBe(
      "EXPIRED",
    );
    expect(await commerce.expireDueOrders()).toBeGreaterThanOrEqual(1);
    expect(await commerce.expireDueOrders()).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { resourceId: order.id, action: "SHOPPING_ORDER_EXPIRED" },
      }),
    ).toBe(1);
    const retryQuote = await commerce.getCart(c.device, c.sessionId);
    const nextOrder = await checkout(c, retryQuote);
    expect(nextOrder.id).not.toBe(order.id);
    await commerce.cancelDeviceOrder(c.device, c.sessionId, nextOrder.id);
  });
  it("requires review after a tax change and rejects stale cart/tax versions", async () => {
    await setTax("OFF", 0);
    const c = await customer(),
      p = await product();
    const quote = await basket(c, [{ variantId: p.variantId, quantity: 1 }]);
    const tax = await commerce.getTax(storeId);
    await setTax("EXCLUSIVE", 1800);
    await code(checkout(c, quote), "SHOPPING_QUOTE_CHANGED");
    await code(
      commerce.updateTax(storeId, actorId, {
        expectedVersion: tax.version,
        mode: "OFF",
        rateBasisPoints: 0,
      }),
      "SHOPPING_TAX_VERSION_CONFLICT",
    );
    await code(
      commerce.updateCart(c.device, c.sessionId, {
        expectedVersion: 0,
        items: [],
      }),
      "SHOPPING_CART_VERSION_CONFLICT",
    );
    expect(
      await prisma.shoppingOrder.count({
        where: { sourceCartId: quote.cartId! },
      }),
    ).toBe(0);
  });

  it("rejects mixed currency and enforces tenant/quantity database constraints", async () => {
    const c = await customer(),
      a = await product(),
      b = await product();
    await prisma.product.update({
      where: { id: b.id },
      data: { priceCurrency: "USD" },
    });
    await code(
      basket(c, [
        { variantId: a.variantId, quantity: 1 },
        { variantId: b.variantId, quantity: 1 },
      ]),
      "SHOPPING_MIXED_CURRENCY",
    );
    const quote = await basket(c, [{ variantId: a.variantId, quantity: 1 }]);
    await expect(
      prisma.shoppingCartItem.update({
        where: {
          cartId_variantId: { cartId: quote.cartId!, variantId: a.variantId },
        },
        data: { quantity: 0 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.shoppingCartItem.update({
        where: {
          cartId_variantId: { cartId: quote.cartId!, variantId: a.variantId },
        },
        data: { organizationId: otherStore },
      }),
    ).rejects.toThrow();
  });

  it("keeps order history and prevents product deletion; cancellation is idempotent and tenant-scoped", async () => {
    const c = await customer(),
      p = await product();
    const quote = await basket(c, [{ variantId: p.variantId, quantity: 1 }]),
      order = await checkout(c, quote);
    await code(
      commerce.getStaffOrder(otherStore, order.id),
      "SHOPPING_NOT_FOUND",
    );
    await code(
      commerce.cancelStaffOrder(otherStore, order.id, actorId, "Wrong store"),
      "SHOPPING_NOT_FOUND",
    );
    await expect(
      prisma.product.delete({ where: { id: p.id } }),
    ).rejects.toThrow();
    await commerce.cancelStaffOrder(
      storeId,
      order.id,
      actorId,
      "Customer requested",
    );
    await commerce.cancelStaffOrder(
      storeId,
      order.id,
      actorId,
      "Duplicate retry",
    );
    expect(
      await prisma.auditLog.count({
        where: { resourceId: order.id, action: "SHOPPING_ORDER_CANCELLED" },
      }),
    ).toBe(1);
    const list = await commerce.listOrders(storeId, {
      search: order.reference,
      pageSize: 1,
    });
    expect(list.data.map((o) => o.id)).toEqual([order.id]);
    expect((await commerce.listOrders(otherStore, {})).data).toEqual([]);
  });
});
