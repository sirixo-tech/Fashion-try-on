import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import {
  ProductStockController,
  KioskProductStockController,
} from "./product-stock.controller.js";
import { UpdateProductStockDto } from "./dto/product-stock.dto.js";
import {
  normalizeStockInput,
  ProductStockService,
} from "./product-stock.service.js";

const input = (
  overrides: Partial<UpdateProductStockDto> = {},
): UpdateProductStockDto => ({
  expectedVersion: 0,
  optionMode: "SINGLE",
  pricingMode: "CONSTANT",
  reason: "Initial count",
  variants: [{ stockQuantity: 0 }],
  ...overrides,
});
function expectInvalid(operation: () => unknown, message: RegExp) {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ApiErrorException);
  const response = (caught as ApiErrorException).getResponse() as {
    error: { code: string; message: string };
  };
  expect(response.error.code).toBe("PRODUCT_STOCK_INVALID");
  expect(response.error.message).toMatch(message);
}

describe("stock validation", () => {
  it("normalizes combinations and rejects case/spacing-equivalent duplicates", () => {
    expect(
      normalizeStockInput(
        input({
          optionMode: "SIZE_COLOR",
          variants: [{ size: " M ", color: " Navy   Blue ", stockQuantity: 2 }],
        }),
      )[0],
    ).toMatchObject({ size: "M", color: "Navy Blue" });
    expectInvalid(
      () =>
        normalizeStockInput(
          input({
            optionMode: "SIZE_COLOR",
            variants: [
              { size: " M ", color: " Navy   Blue ", stockQuantity: 2 },
              { size: "m", color: "navy blue", stockQuantity: 4 },
            ],
          }),
        ),
      /Duplicate/,
    );
  });
  it.each(["SINGLE", "SIZE", "COLOR", "SIZE_COLOR"] as const)(
    "supports %s options",
    (optionMode) => {
      expect(
        normalizeStockInput(
          input({
            optionMode,
            variants: [
              {
                size: optionMode.includes("SIZE") ? "M" : null,
                color: optionMode.includes("COLOR") ? "Black" : null,
                stockQuantity: 0,
              },
            ],
          }),
        ),
      ).toHaveLength(1);
    },
  );
  it.each([-1, 0.5, 1_000_001, NaN])(
    "rejects invalid quantity %s",
    (stockQuantity) => {
      expectInvalid(
        () => normalizeStockInput(input({ variants: [{ stockQuantity }] })),
        /Stock/,
      );
    },
  );
  it("rejects wrong option shape, multiple standard options and hidden constant-price overrides", () => {
    expectInvalid(
      () => normalizeStockInput(input({ optionMode: "SIZE" })),
      /match/,
    );
    expectInvalid(
      () =>
        normalizeStockInput(
          input({ variants: [{ stockQuantity: 0 }, { stockQuantity: 1 }] }),
        ),
      /exactly one/,
    );
    expectInvalid(
      () =>
        normalizeStockInput(
          input({
            variants: [{ stockQuantity: 1, priceOverrideAmountCents: 99 }],
          }),
        ),
      /Constant/,
    );
  });
  it("does not accept fractional/negative prices, blank reasons or unbounded option lists", () => {
    for (const price of [-1, 1.5, 100_000_001]) {
      expect(() =>
        normalizeStockInput(
          input({
            pricingMode: "VARIANT",
            variants: [{ stockQuantity: 1, priceOverrideAmountCents: price }],
          }),
        ),
      ).toThrow();
    }
    expect(() => normalizeStockInput(input({ reason: " " }))).toThrow();
    expect(() =>
      normalizeStockInput(
        input({
          variants: Array.from({ length: 101 }, () => ({ stockQuantity: 1 })),
        }),
      ),
    ).toThrow();
  });
  it("validates nested JSON fields without coercing booleans or strings into quantities", async () => {
    const good = plainToInstance(UpdateProductStockDto, input());
    expect(
      await validate(good, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    for (const stockQuantity of [true, "5", null]) {
      const bad = plainToInstance(UpdateProductStockDto, {
        ...input(),
        variants: [{ stockQuantity }],
      });
      expect(await validate(bad)).not.toEqual([]);
    }
    const bad = plainToInstance(UpdateProductStockDto, {
      ...input(),
      organizationId: "other-store",
    });
    expect(
      await validate(bad, { whitelist: true, forbidNonWhitelisted: true }),
    ).not.toEqual([]);
  });
});

function controllerSetup() {
  const auth = {
    requireAccessUser: vi.fn().mockResolvedValue({ id: "actual-user" }),
  };
  const platform = { hasPermission: vi.fn().mockResolvedValue(false) };
  const rbac = { requireStorePermission: vi.fn() };
  const impersonation = { resolveStoreContext: vi.fn() };
  const stock = { get: vi.fn(), update: vi.fn() };
  return {
    auth,
    platform,
    rbac,
    impersonation,
    stock,
    controller: new ProductStockController(
      auth as never,
      platform as never,
      rbac as never,
      impersonation as never,
      stock as never,
    ),
  };
}
const request = { headers: { authorization: "Bearer identity" } } as never;

describe("stock authorization", () => {
  it("uses resource Store permissions and retains the actual audit actor", async () => {
    const h = controllerSetup();
    await h.controller.get(request, "store-a", "product-a");
    await h.controller.update(request, "store-a", "product-a", input());
    expect(h.rbac.requireStorePermission).toHaveBeenNthCalledWith(
      1,
      "actual-user",
      "store-a",
      "stores.view",
    );
    expect(h.rbac.requireStorePermission).toHaveBeenNthCalledWith(
      2,
      "actual-user",
      "store-a",
      "stores.update",
    );
    expect(h.stock.update).toHaveBeenCalledWith(
      "store-a",
      "product-a",
      "actual-user",
      input(),
    );
  });
  it("does not read or mutate when Store permissions fail", async () => {
    const h = controllerSetup();
    h.rbac.requireStorePermission.mockRejectedValue(new Error("Forbidden"));
    await expect(
      h.controller.get(request, "store-b", "product-b"),
    ).rejects.toThrow("Forbidden");
    await expect(
      h.controller.update(request, "store-b", "product-b", input()),
    ).rejects.toThrow("Forbidden");
    expect(h.stock.get).not.toHaveBeenCalled();
    expect(h.stock.update).not.toHaveBeenCalled();
  });
  it("enforces impersonation Store scope even for platform-authorized actors", async () => {
    const h = controllerSetup();
    h.platform.hasPermission.mockResolvedValue(true);
    h.impersonation.resolveStoreContext.mockRejectedValue(
      new Error("Wrong impersonation Store"),
    );
    await expect(
      h.controller.update(request, "other-store", "product", input()),
    ).rejects.toThrow(/impersonation/);
    expect(h.stock.update).not.toHaveBeenCalled();
  });
  it("requires staff authentication before any Store operation", async () => {
    const h = controllerSetup();
    h.auth.requireAccessUser.mockRejectedValue(new Error("Unauthorized"));
    await expect(h.controller.get(request, "store", "product")).rejects.toThrow(
      "Unauthorized",
    );
    expect(h.stock.get).not.toHaveBeenCalled();
  });
  it("uses current device Store context, with no client-supplied Store scope", async () => {
    const kiosks = {
      requireDevice: vi
        .fn()
        .mockResolvedValue({ organizationId: "current-store" }),
    };
    const stock = { getForKiosk: vi.fn() };
    const controller = new KioskProductStockController(
      kiosks as never,
      stock as never,
    );
    await controller.get(request, "product");
    expect(stock.getForKiosk).toHaveBeenCalledWith("current-store", "product");
    kiosks.requireDevice.mockRejectedValue(new Error("Inactive device"));
    stock.getForKiosk.mockClear();
    await expect(controller.get(request, "product")).rejects.toThrow(
      "Inactive device",
    );
    expect(stock.getForKiosk).not.toHaveBeenCalled();
  });
  it("rejects any imported product mapping, including archived mappings", async () => {
    const tx = {
      organization: {
        findFirst: vi.fn().mockResolvedValue({ status: "ACTIVE" }),
      },
      product: {
        findFirst: vi.fn().mockResolvedValue({
          externalMappings: [{ id: "archived-mapping" }],
        }),
      },
    };
    const service = new ProductStockService({
      $transaction: (fn: (client: unknown) => unknown) => fn(tx),
    } as never);
    await expect(service.get("store", "product")).rejects.toMatchObject({
      getResponse: expect.any(Function),
    });
    try {
      await service.get("store", "product");
    } catch (error) {
      expect((error as ApiErrorException).getResponse()).toMatchObject({
        error: { code: "PRODUCT_STOCK_EXTERNALLY_MANAGED" },
      });
    }
  });
});
