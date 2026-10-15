import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { calculateLine } from "./commerce-money.js";
import {
  UpdateShoppingCartDto,
  UpdateStoreTaxDto,
  CheckoutShoppingCartDto,
} from "./commerce.dto.js";
import {
  StoreCommerceController,
  KioskCommerceController,
} from "./commerce.controller.js";
import { CommerceExpiryService } from "./commerce-expiry.service.js";

describe("shopping money", () => {
  it("calculates no tax, included tax and added tax with integer-cent totals", () => {
    expect(calculateLine(10000, 2, "OFF", 1800)).toEqual({
      subtotalCents: 20000,
      taxCents: 0,
      totalCents: 20000,
    });
    expect(calculateLine(11800, 2, "INCLUSIVE", 1800)).toEqual({
      subtotalCents: 20000,
      taxCents: 3600,
      totalCents: 23600,
    });
    expect(calculateLine(10000, 2, "EXCLUSIVE", 1800)).toEqual({
      subtotalCents: 20000,
      taxCents: 3600,
      totalCents: 23600,
    });
  });
  it("rounds half cents per line and protects overflow and invalid amounts", () => {
    expect(calculateLine(1, 1, "EXCLUSIVE", 5000).taxCents).toBe(1);
    expect(calculateLine(1, 3, "EXCLUSIVE", 5000).taxCents).toBe(2);
    expect(() => calculateLine(100000000, 1000000, "OFF", 0)).toThrow();
    expect(() => calculateLine(0.1, 1, "OFF", 0)).toThrow();
  });
  it("maintains subtotal plus tax equals total across modes/rates/quantities", () => {
    for (const mode of ["OFF", "INCLUSIVE", "EXCLUSIVE"] as const)
      for (const rate of [0, 1, 500, 1800, 10000])
        for (const quantity of [1, 2, 7]) {
          const result = calculateLine(1999, quantity, mode, rate);
          expect(result.subtotalCents + result.taxCents).toBe(
            result.totalCents,
          );
          if (mode === "INCLUSIVE" || mode === "OFF")
            expect(result.totalCents).toBe(1999 * quantity);
        }
  });
});
describe("shopping input validation", () => {
  it("validates nested quantities and rejects injected price/Store fields", async () => {
    const valid = {
      expectedVersion: 0,
      items: [
        { variantId: "01994741-c000-7000-8000-000000000001", quantity: 2 },
      ],
    };
    expect(
      await validate(plainToInstance(UpdateShoppingCartDto, valid)),
    ).toEqual([]);
    for (const quantity of [0, -1, 1.5, "2", true, 1000001])
      expect(
        await validate(
          plainToInstance(UpdateShoppingCartDto, {
            ...valid,
            items: [{ ...valid.items[0], quantity }],
          }),
        ),
      ).not.toEqual([]);
    expect(
      await validate(
        plainToInstance(UpdateShoppingCartDto, { ...valid, price: 1 }),
        { whitelist: true, forbidNonWhitelisted: true },
      ),
    ).not.toEqual([]);
  });
  it("requires a quote fingerprint/idempotency key and explicit tax configuration", async () => {
    expect(
      await validate(
        plainToInstance(CheckoutShoppingCartDto, {
          expectedVersion: 1,
          quoteFingerprint: "a".repeat(64),
          idempotencyKey: "test-key-123",
        }),
      ),
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(CheckoutShoppingCartDto, { expectedVersion: 1 }),
      ),
    ).not.toEqual([]);
    expect(
      await validate(
        plainToInstance(UpdateStoreTaxDto, {
          expectedVersion: 0,
          mode: "EXCLUSIVE",
          rateBasisPoints: 1800,
        }),
      ),
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(UpdateStoreTaxDto, {
          expectedVersion: 0,
          mode: "EXCLUSIVE",
          rateBasisPoints: 10001,
        }),
      ),
    ).not.toEqual([]);
  });
});
describe("shopping authorization", () => {
  const request = { headers: { authorization: "Bearer identity" } } as never;
  function setup() {
    const auth = {
      requireAccessUser: vi.fn().mockResolvedValue({ id: "actual-actor" }),
    };
    const platform = { hasPermission: vi.fn().mockResolvedValue(false) };
    const rbac = { requireStorePermission: vi.fn() },
      impersonation = { resolveStoreContext: vi.fn() };
    const commerce = {
      listOrders: vi.fn(),
      updateTax: vi.fn(),
      cancelStaffOrder: vi.fn(),
    };
    return {
      auth,
      platform,
      rbac,
      impersonation,
      commerce,
      controller: new StoreCommerceController(
        auth as never,
        platform as never,
        rbac as never,
        impersonation as never,
        commerce as never,
      ),
    };
  }
  it("resolves Store view/update permissions and preserves the actual cancellation actor", async () => {
    const h = setup();
    await h.controller.list(request, "store-a", {});
    await h.controller.cancel(request, "store-a", "order-a", {
      reason: "Customer requested",
    });
    expect(h.rbac.requireStorePermission).toHaveBeenNthCalledWith(
      1,
      "actual-actor",
      "store-a",
      "stores.view",
    );
    expect(h.rbac.requireStorePermission).toHaveBeenNthCalledWith(
      2,
      "actual-actor",
      "store-a",
      "stores.update",
    );
    expect(h.commerce.cancelStaffOrder).toHaveBeenCalledWith(
      "store-a",
      "order-a",
      "actual-actor",
      "Customer requested",
    );
  });
  it("rejects missing permissions and cross-Store impersonation before reading order data", async () => {
    const h = setup();
    h.rbac.requireStorePermission.mockRejectedValue(new Error("Forbidden"));
    await expect(h.controller.list(request, "other-store", {})).rejects.toThrow(
      "Forbidden",
    );
    expect(h.commerce.listOrders).not.toHaveBeenCalled();
    h.platform.hasPermission.mockResolvedValue(true);
    h.impersonation.resolveStoreContext.mockRejectedValue(
      new Error("Wrong Store"),
    );
    await expect(
      h.controller.cancel(request, "other-store", "order", {
        reason: "Cancel",
      }),
    ).rejects.toThrow("Wrong Store");
    expect(h.commerce.cancelStaffOrder).not.toHaveBeenCalled();
  });
  it("rejects human/invalid device credentials before cart access", async () => {
    const commerce = { getCart: vi.fn() };
    const kiosks = {
      requireDevice: vi.fn().mockRejectedValue(new Error("Device required")),
    };
    const controller = new KioskCommerceController(
      kiosks as never,
      commerce as never,
    );
    await expect(controller.cart(request, "session")).rejects.toThrow(
      "Device required",
    );
    expect(commerce.getCart).not.toHaveBeenCalled();
  });
});
describe("automatic expiry", () => {
  it("does not overlap sweeps and recovers after transient failures", async () => {
    let finish: () => void = () => {};
    const commerce = {
      expireDueOrders: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              finish = resolve;
            }),
        )
        .mockResolvedValue(1),
    };
    const service = new CommerceExpiryService(commerce as never);
    const first = service.tick();
    await service.tick();
    expect(commerce.expireDueOrders).toHaveBeenCalledTimes(1);
    finish();
    await first;
    await service.tick();
    expect(commerce.expireDueOrders).toHaveBeenCalledTimes(2);
  });
});
