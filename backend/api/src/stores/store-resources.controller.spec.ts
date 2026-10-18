import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { AdminStoresController } from "./admin-stores.controller.js";
import { StoreKiosksController } from "./store-kiosks.controller.js";
import { ProductStockController } from "./product-stock.controller.js";
import { ApiErrorException } from "../common/api-error.exception.js";

const request = { headers: { authorization: "Bearer identity" } } as never;
function harness(allow = false) {
  const auth = {
    requireAccessUser: vi.fn().mockResolvedValue({ id: "actual-user" }),
  };
  const platform = {
    hasPermission: vi.fn().mockResolvedValue(true),
    requirePermission: vi.fn(),
  };
  const rbac = {
    requireStoreResourcePermission: allow
      ? vi.fn()
      : vi
          .fn()
          .mockRejectedValue(
            new ApiErrorException(403, "STORE_PERMISSION_DENIED", "Denied"),
          ),
    effectivePermissions: vi.fn().mockResolvedValue({ permissions: [] }),
  };
  const impersonation = { resolveStoreContext: vi.fn() };
  const stores = {
    listStoreProducts: vi.fn(),
    createStoreProduct: vi.fn(),
    updateStoreProduct: vi.fn(),
    deleteStoreProduct: vi.fn(),
    createStoreProductImageUploadIntent: vi.fn(),
    setImportedProductsVtoEnabled: vi.fn(),
    listStoreKiosks: vi.fn(),
    pairStoreKiosk: vi.fn(),
    getStoreKiosk: vi.fn(),
    requireKioskInStore: vi.fn(),
    getStore: vi.fn().mockResolvedValue({ kiosks: { data: [] } }),
  };
  const config = {
    requestStoreCatalogSync: vi.fn(),
    getAdminConfiguration: vi.fn(),
    updateAdminConfiguration: vi.fn(),
    createAdminAssetUploadIntent: vi.fn(),
  };
  const kiosks = {
    updateDevice: vi.fn(),
    pairExistingKiosk: vi.fn(),
    revokeDevice: vi.fn(),
    activateDevice: vi.fn(),
    deactivateDevice: vi.fn(),
    deleteDevice: vi.fn(),
  };
  const stock = { get: vi.fn(), update: vi.fn() };
  return {
    auth,
    platform,
    rbac,
    impersonation,
    stores,
    config,
    kiosks,
    stock,
    admin: new AdminStoresController(
      auth as never,
      platform as never,
      stores as never,
      config as never,
      rbac as never,
      impersonation as never,
    ),
    lifecycle: new StoreKiosksController(
      auth as never,
      rbac as never,
      impersonation as never,
      kiosks as never,
    ),
    stockController: new ProductStockController(
      auth as never,
      rbac as never,
      impersonation as never,
      stock as never,
    ),
  };
}

describe("Store resource routes require membership even for platform authority", () => {
  const operations = [
    [
      "product list",
      (h: ReturnType<typeof harness>) =>
        h.admin.listProducts(request, "store-a", {}),
    ],
    [
      "product create",
      (h: ReturnType<typeof harness>) =>
        h.admin.createProduct(request, "store-a", {} as never),
    ],
    [
      "product update",
      (h: ReturnType<typeof harness>) =>
        h.admin.updateProduct(request, "store-a", "product", {}),
    ],
    [
      "product delete",
      (h: ReturnType<typeof harness>) =>
        h.admin.deleteProduct(request, "store-a", "product"),
    ],
    [
      "product upload",
      (h: ReturnType<typeof harness>) =>
        h.admin.createProductImageUploadIntent(request, "store-a", {} as never),
    ],
    [
      "product sync",
      (h: ReturnType<typeof harness>) =>
        h.admin.requestProductCatalogSync(request, "store-a", {
          productVertical: "GARMENT",
        }),
    ],
    [
      "imported product eligibility",
      (h: ReturnType<typeof harness>) =>
        h.admin.setImportedProductVto(request, "store-a", {} as never),
    ],
    [
      "kiosk list",
      (h: ReturnType<typeof harness>) => h.admin.listKiosks(request, "store-a"),
    ],
    [
      "kiosk pair",
      (h: ReturnType<typeof harness>) =>
        h.admin.pairKiosk(request, "store-a", {} as never),
    ],
    [
      "kiosk get",
      (h: ReturnType<typeof harness>) =>
        h.admin.getKiosk(request, "store-a", "device"),
    ],
    [
      "configuration read",
      (h: ReturnType<typeof harness>) =>
        h.admin.getKioskConfiguration(request, "store-a", "device"),
    ],
    [
      "configuration write",
      (h: ReturnType<typeof harness>) =>
        h.admin.updateKioskConfiguration(
          request,
          "store-a",
          "device",
          {} as never,
        ),
    ],
    [
      "configuration upload",
      (h: ReturnType<typeof harness>) =>
        h.admin.createKioskConfigurationAssetUploadIntent(
          request,
          "store-a",
          "device",
          {} as never,
        ),
    ],
    [
      "stock read",
      (h: ReturnType<typeof harness>) =>
        h.stockController.get(request, "store-a", "product"),
    ],
    [
      "stock write",
      (h: ReturnType<typeof harness>) =>
        h.stockController.update(request, "store-a", "product", {} as never),
    ],
    [
      "kiosk metadata",
      (h: ReturnType<typeof harness>) =>
        h.lifecycle.update(request, "store-a", "device", {
          displayName: "Screen",
        }),
    ],
    [
      "kiosk re-pair",
      (h: ReturnType<typeof harness>) =>
        h.lifecycle.pairExisting(request, "store-a", "device", {
          pairingCode: "123456",
        }),
    ],
    [
      "kiosk revoke",
      (h: ReturnType<typeof harness>) =>
        h.lifecycle.revoke(request, "store-a", "device"),
    ],
    [
      "kiosk activate",
      (h: ReturnType<typeof harness>) =>
        h.lifecycle.activate(request, "store-a", "device"),
    ],
    [
      "kiosk deactivate",
      (h: ReturnType<typeof harness>) =>
        h.lifecycle.deactivate(request, "store-a", "device"),
    ],
    [
      "kiosk removal",
      (h: ReturnType<typeof harness>) =>
        h.lifecycle.delete(request, "store-a", "device"),
    ],
  ] as const;
  it.each(operations)(
    "rejects %s without calling resource services",
    async (_label, operation) => {
      const h = harness();
      await expect(operation(h)).rejects.toMatchObject({ status: 403 });
      expect(h.rbac.requireStoreResourcePermission).toHaveBeenCalledWith(
        "actual-user",
        "store-a",
        expect.any(String),
      );
      for (const service of [h.stores, h.config, h.kiosks, h.stock])
        for (const fn of Object.values(service))
          expect(fn).not.toHaveBeenCalled();
      expect(h.platform.hasPermission).not.toHaveBeenCalled();
    },
  );
  it("passes the Store and actual actor to lifecycle mutations", async () => {
    const h = harness(true);
    await h.lifecycle.update(request, "store-a", "device", {
      displayName: "Screen",
    });
    await h.lifecycle.pairExisting(request, "store-a", "device", {
      pairingCode: "004281",
    });
    await h.lifecycle.revoke(request, "store-a", "device");
    expect(h.kiosks.updateDevice).toHaveBeenCalledWith(
      "actual-user",
      "device",
      { displayName: "Screen" },
      "store-a",
    );
    expect(h.kiosks.pairExistingKiosk).toHaveBeenCalledWith(
      "actual-user",
      "device",
      { pairingCode: "004281" },
      "store-a",
    );
    expect(h.kiosks.revokeDevice).toHaveBeenCalledWith(
      "actual-user",
      "device",
      "store-a",
    );
  });
  it("checks device ownership before reading or writing configuration", async () => {
    const h = harness(true);
    h.stores.requireKioskInStore.mockRejectedValue(new Error("Other Store"));
    await expect(
      h.admin.getKioskConfiguration(request, "store-a", "foreign"),
    ).rejects.toThrow("Other Store");
    await expect(
      h.admin.updateKioskConfiguration(
        request,
        "store-a",
        "foreign",
        {} as never,
      ),
    ).rejects.toThrow("Other Store");
    expect(h.config.getAdminConfiguration).not.toHaveBeenCalled();
    expect(h.config.updateAdminConfiguration).not.toHaveBeenCalled();
  });
  it("does not expose embedded kiosk details through a platform Store view", async () => {
    const h = harness(true);
    await h.admin.get(request, "store-a");
    expect(h.rbac.effectivePermissions).toHaveBeenCalledWith(
      "actual-user",
      "store-a",
      false,
    );
    expect(h.stores.getStore).toHaveBeenCalledWith("store-a", false);
  });
});
