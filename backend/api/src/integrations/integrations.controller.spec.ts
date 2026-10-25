import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { STORE_PERMISSION_CODES } from "../rbac/store-permissions.js";
import { IntegrationsController } from "./integrations.controller.js";

describe("IntegrationsController", () => {
  it("allows Platform integration viewers to monitor Shopify without Store management", async () => {
    const integrations = {
      shopifyOverview: vi.fn().mockResolvedValue({ data: [] }),
    };
    const storeRbac = rbac();
    const controller = new IntegrationsController(
      auth(),
      platformAuthorization(true) as never,
      storeRbac as never,
      integrations as never,
      oauth() as never,
    );
    await controller.shopifyOverview(request(), { page: 2 });
    expect(integrations.shopifyOverview).toHaveBeenCalledWith({ page: 2 });
    expect(storeRbac.requireStorePermission).not.toHaveBeenCalled();
  });
  it("rejects a merchant's unscoped Shopify overview before reading data", async () => {
    const integrations = { shopifyOverview: vi.fn() };
    const controller = new IntegrationsController(
      auth(),
      platformAuthorization(false) as never,
      rbac() as never,
      integrations as never,
      oauth() as never,
    );
    await expect(controller.shopifyOverview(request(), {})).rejects.toThrow();
    expect(integrations.shopifyOverview).not.toHaveBeenCalled();
  });
  it("rejects a Shopify overview for an unauthorized Store", async () => {
    const integrations = { shopifyOverview: vi.fn() };
    const storeRbac = rbacReject();
    const controller = new IntegrationsController(
      auth(),
      platformAuthorization(false) as never,
      storeRbac as never,
      integrations as never,
      oauth() as never,
    );
    await expect(
      controller.shopifyOverview(request(), { storeId: "other-store" }),
    ).rejects.toThrow();
    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "other-store",
      STORE_PERMISSION_CODES.integrationsView,
    );
    expect(integrations.shopifyOverview).not.toHaveBeenCalled();
  });
  it("allows platform integration viewers to read the WooCommerce overview without Store management", async () => {
    const integrations = {
      wooCommerceOverview: vi.fn().mockResolvedValue({ data: [] }),
    };
    const storeRbac = rbac();
    const controller = new IntegrationsController(
      auth(),
      platformAuthorization(true) as never,
      storeRbac as never,
      integrations as never,
      oauth() as never,
    );
    await controller.wooCommerceOverview(request(), { page: 2 });
    expect(integrations.wooCommerceOverview).toHaveBeenCalledWith({ page: 2 });
    expect(storeRbac.requireStorePermission).not.toHaveBeenCalled();
  });

  it("rejects a merchant's unscoped WooCommerce overview before reading any data", async () => {
    const integrations = { wooCommerceOverview: vi.fn() };
    const controller = new IntegrationsController(
      auth(),
      platformAuthorization(false) as never,
      rbac() as never,
      integrations as never,
      oauth() as never,
    );
    await expect(
      controller.wooCommerceOverview(request(), {}),
    ).rejects.toThrow();
    expect(integrations.wooCommerceOverview).not.toHaveBeenCalled();
  });

  it("checks the requested Store before returning WooCommerce statistics", async () => {
    const integrations = { wooCommerceOverview: vi.fn() };
    const storeRbac = rbacReject();
    const controller = new IntegrationsController(
      auth(),
      platformAuthorization(false) as never,
      storeRbac as never,
      integrations as never,
      oauth() as never,
    );
    await expect(
      controller.wooCommerceOverview(request(), { storeId: "other-store" }),
    ).rejects.toThrow();
    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "other-store",
      STORE_PERMISSION_CODES.integrationsView,
    );
    expect(integrations.wooCommerceOverview).not.toHaveBeenCalled();
  });
  it("returns a visible completion page with a SelfX link after OAuth", async () => {
    const shopify = oauth();
    shopify.complete.mockResolvedValue({
      storeId: "store-1",
      syncStatus: "COMPLETED",
    });
    shopify.successRedirect.mockReturnValue(
      "https://app.selfx.test/app/integrations/shopify?storeId=store-1&oauth=success",
    );
    const reply = {
      header: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    const controller = new IntegrationsController(
      auth(),
      platformAuthorization(false) as never,
      rbac() as never,
      {} as never,
      shopify as never,
    );

    await controller.completeShopifyOauth({} as never, reply as never);

    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.send).toHaveBeenCalledWith(
      expect.stringContaining("Shopify connection saved"),
    );
    expect(reply.send.mock.calls[0]?.[0]).toContain(
      "storeId=store-1&amp;oauth=success",
    );
  });

  it.each(["start", "sync"] as const)(
    "does not let platform integration authority %s a Store catalog operation",
    async (operation) => {
      const storeRbac = rbac();
      storeRbac.requireStoreResourcePermission.mockRejectedValue(
        new ApiErrorException(
          HttpStatus.FORBIDDEN,
          "STORE_PERMISSION_DENIED",
          "Store permission denied.",
        ),
      );
      const shopify = oauth();
      const controller = new IntegrationsController(
        auth(),
        platformAuthorization(true) as never,
        storeRbac as never,
        { integrationStoreId: vi.fn().mockResolvedValue("store-1") } as never,
        shopify as never,
      );
      const result =
        operation === "start"
          ? controller.startShopifyOauth(request(), {
              storeId: "store-1",
              shop: "merchant.myshopify.com",
            })
          : controller.syncShopify(request(), "integration-1");
      await expect(result).rejects.toMatchObject({
        response: expect.objectContaining({
          error: expect.objectContaining({ code: "STORE_PERMISSION_DENIED" }),
        }),
      });
      expect(shopify.start).not.toHaveBeenCalled();
      expect(shopify.sync).not.toHaveBeenCalled();
    },
  );

  it("starts Shopify OAuth only after Store manage authorization", async () => {
    const storeRbac = rbac();
    const shopify = oauth();
    shopify.start.mockResolvedValue({
      authorizationUrl: "https://merchant.myshopify.com/admin/oauth/authorize",
      expiresAt: "2026-09-07T12:10:00.000Z",
    });
    const controller = new IntegrationsController(
      auth(),
      platformAuthorization(false) as never,
      storeRbac as never,
      {} as never,
      shopify as never,
    );

    await controller.startShopifyOauth(request(), {
      storeId: "store-1",
      shop: "merchant.myshopify.com",
    });

    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "store-1",
      STORE_PERMISSION_CODES.integrationsManage,
    );
    expect(shopify.start).toHaveBeenCalledWith(
      "user-1",
      "store-1",
      "merchant.myshopify.com",
    );
    expect(storeRbac.requireStoreResourcePermission).toHaveBeenCalledWith(
      "user-1",
      "store-1",
      STORE_PERMISSION_CODES.productsManage,
    );
  });

  it("authorizes a manual Shopify sync against its owning Store", async () => {
    const storeRbac = rbac();
    const shopify = oauth();
    const integrations = {
      integrationStoreId: vi.fn().mockResolvedValue("store-1"),
    };
    const controller = new IntegrationsController(
      auth(),
      platformAuthorization(false) as never,
      storeRbac as never,
      integrations as never,
      shopify as never,
    );

    await controller.syncShopify(request(), "integration-1");

    expect(shopify.sync).toHaveBeenCalledWith("user-1", "integration-1");
    expect(storeRbac.requireStoreResourcePermission).toHaveBeenCalledWith(
      "user-1",
      "store-1",
      STORE_PERMISSION_CODES.productsManage,
    );
    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "store-1",
      STORE_PERMISSION_CODES.integrationsManage,
    );
  });

  it("allows platform integration viewers to list globally", async () => {
    const integrations = {
      listIntegrations: vi.fn().mockResolvedValue({ data: [] }),
    };
    const controller = new IntegrationsController(
      auth(),
      platformAuthorization(true) as never,
      rbac() as never,
      integrations as never,
      oauth() as never,
    );

    await expect(controller.list(request(), {})).resolves.toEqual({ data: [] });

    expect(integrations.listIntegrations).toHaveBeenCalledWith({});
  });

  it("allows Store users with manage permission to register an integration", async () => {
    const storeRbac = rbac();
    const integrations = {
      upsertIntegration: vi.fn().mockResolvedValue({ id: "integration-1" }),
    };
    const controller = new IntegrationsController(
      auth(),
      platformAuthorization(false) as never,
      storeRbac as never,
      integrations as never,
      oauth() as never,
    );
    const dto = { storeId: "store-1", type: "SHOPIFY" as const };

    await controller.upsert(request(), dto);

    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "store-1",
      STORE_PERMISSION_CODES.integrationsManage,
    );
    expect(integrations.upsertIntegration).toHaveBeenCalledWith("user-1", dto);
  });

  it("authorizes credential creation against the owning Store", async () => {
    const storeRbac = rbac();
    const integrations = {
      integrationStoreId: vi.fn().mockResolvedValue("store-1"),
      createCredential: vi
        .fn()
        .mockResolvedValue({ credential: {}, secret: "selfx_shopify" }),
    };
    const controller = new IntegrationsController(
      auth(),
      platformAuthorization(false) as never,
      storeRbac as never,
      integrations as never,
      oauth() as never,
    );
    const dto = {
      name: "Plugin",
      scopes: ["catalog:sync" as const],
    };

    await controller.createCredential(request(), "integration-1", dto);

    expect(integrations.integrationStoreId).toHaveBeenCalledWith(
      "integration-1",
    );
    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "store-1",
      STORE_PERMISSION_CODES.integrationsManage,
    );
    expect(integrations.createCredential).toHaveBeenCalledWith(
      "user-1",
      "integration-1",
      dto,
    );
  });

  it("authorizes credential revocation against the owning Store", async () => {
    const storeRbac = rbac();
    const integrations = {
      credentialStoreId: vi.fn().mockResolvedValue("store-1"),
      revokeCredential: vi
        .fn()
        .mockResolvedValue({ id: "credential-1", status: "REVOKED" }),
    };
    const controller = new IntegrationsController(
      auth(),
      platformAuthorization(false) as never,
      storeRbac as never,
      integrations as never,
      oauth() as never,
    );

    await controller.revokeCredential(request(), "credential-1");

    expect(integrations.credentialStoreId).toHaveBeenCalledWith("credential-1");
    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "store-1",
      STORE_PERMISSION_CODES.integrationsManage,
    );
    expect(integrations.revokeCredential).toHaveBeenCalledWith(
      "user-1",
      "credential-1",
    );
  });

  it("rejects global listing without platform integration access", async () => {
    const platform = platformAuthorization(false);
    const integrations = { listIntegrations: vi.fn() };
    const controller = new IntegrationsController(
      auth(),
      platform as never,
      rbac() as never,
      integrations as never,
      oauth() as never,
    );

    await expect(controller.list(request(), {})).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({ code: "PLATFORM_PERMISSION_DENIED" }),
      }),
    });
    expect(platform.requirePermission).toHaveBeenCalledWith(
      "user-1",
      PLATFORM_PERMISSIONS.integrationsView,
    );
    expect(integrations.listIntegrations).not.toHaveBeenCalled();
  });

  it("rejects another Store's integration for Store users", async () => {
    const storeRbac = rbacReject();
    const integrations = {
      integrationStoreId: vi.fn().mockResolvedValue("store-b"),
      disconnectIntegration: vi.fn(),
    };
    const controller = new IntegrationsController(
      auth(),
      platformAuthorization(false) as never,
      storeRbac as never,
      integrations as never,
      oauth() as never,
    );

    await expect(
      controller.disconnect(request(), "integration-b"),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({ code: "STORE_PERMISSION_DENIED" }),
      }),
    });
    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "store-b",
      STORE_PERMISSION_CODES.integrationsManage,
    );
    expect(integrations.disconnectIntegration).not.toHaveBeenCalled();
  });
});

function auth() {
  return {
    requireAccessUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  } as never;
}

function platformAuthorization(hasPermission: boolean) {
  return {
    hasPermission: vi.fn().mockResolvedValue(hasPermission),
    requirePermission: vi
      .fn()
      .mockRejectedValue(
        new ApiErrorException(
          HttpStatus.FORBIDDEN,
          "PLATFORM_PERMISSION_DENIED",
          "Platform permission denied.",
        ),
      ),
  };
}

function rbac() {
  return {
    requireStorePermission: vi.fn(),
    requireStoreResourcePermission: vi.fn(),
  };
}

function rbacReject() {
  return {
    requireStorePermission: vi
      .fn()
      .mockRejectedValue(
        new ApiErrorException(
          HttpStatus.FORBIDDEN,
          "STORE_PERMISSION_DENIED",
          "Store permission denied.",
        ),
      ),
  };
}

function oauth() {
  return {
    start: vi.fn(),
    complete: vi.fn(),
    sync: vi.fn(),
    successRedirect: vi.fn(),
  };
}

function request() {
  return { headers: { authorization: "Bearer token" } } as never;
}
