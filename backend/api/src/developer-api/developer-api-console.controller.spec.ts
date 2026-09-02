import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { STORE_PERMISSION_CODES } from "../rbac/store-permissions.js";
import { DeveloperApiConsoleController } from "./developer-api-console.controller.js";

describe("DeveloperApiConsoleController", () => {
  it("allows platform Developer API viewers to read global usage", async () => {
    const consoleService = {
      usageSummary: vi.fn().mockResolvedValue({ totals: {} }),
    };
    const controller = new DeveloperApiConsoleController(
      auth(),
      platformAuthorization(true) as never,
      rbac() as never,
      apiKeys() as never,
      consoleService as never,
      webhooks() as never,
    );

    await expect(controller.usage(request(), {})).resolves.toEqual({
      totals: {},
    });

    expect(consoleService.usageSummary).toHaveBeenCalledWith({});
  });

  it("authorizes API-key usage against the Store that owns the key", async () => {
    const storeRbac = rbac();
    const keyService = apiKeys();
    const consoleService = {
      usageSummary: vi.fn().mockResolvedValue({ totals: {} }),
    };
    const controller = new DeveloperApiConsoleController(
      auth(),
      platformAuthorization(false) as never,
      storeRbac as never,
      keyService as never,
      consoleService as never,
      webhooks() as never,
    );

    await controller.usage(request(), { apiKeyId: "key-1" });

    expect(keyService.storeIdForKey).toHaveBeenCalledWith("key-1");
    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "store-1",
      STORE_PERMISSION_CODES.developerApiView,
    );
  });

  it("rejects usage when apiKeyId and storeId point to different Stores", async () => {
    const consoleService = {
      usageSummary: vi.fn(),
    };
    const controller = new DeveloperApiConsoleController(
      auth(),
      platformAuthorization(false) as never,
      rbac() as never,
      apiKeys() as never,
      consoleService as never,
      webhooks() as never,
    );

    await expect(
      controller.usage(request(), { apiKeyId: "key-1", storeId: "store-b" }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: "DEVELOPER_API_SCOPE_MISMATCH",
        }),
      }),
    });
    expect(consoleService.usageSummary).not.toHaveBeenCalled();
  });

  it("rejects another Store's API-key usage for Store users", async () => {
    const storeRbac = rbacReject();
    const consoleService = {
      usageSummary: vi.fn(),
    };
    const controller = new DeveloperApiConsoleController(
      auth(),
      platformAuthorization(false) as never,
      storeRbac as never,
      apiKeys() as never,
      consoleService as never,
      webhooks() as never,
    );

    await expect(
      controller.usage(request(), { apiKeyId: "key-1" }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({ code: "STORE_PERMISSION_DENIED" }),
      }),
    });
    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "store-1",
      STORE_PERMISSION_CODES.developerApiView,
    );
    expect(consoleService.usageSummary).not.toHaveBeenCalled();
  });

  it("allows Store users with manage permission to create webhooks", async () => {
    const storeRbac = rbac();
    const consoleService = {
      credentialForStore: vi.fn().mockResolvedValue({ storeId: "store-1" }),
      webhookEndpoint: vi.fn().mockResolvedValue({ id: "endpoint-1" }),
    };
    const webhookService = {
      createEndpoint: vi
        .fn()
        .mockResolvedValue({ id: "endpoint-1", secret: "whsec_test" }),
    };
    const controller = new DeveloperApiConsoleController(
      auth(),
      platformAuthorization(false) as never,
      storeRbac as never,
      apiKeys() as never,
      consoleService as never,
      webhookService as never,
    );
    const dto = {
      storeId: "store-1",
      url: "https://example.com/selfx/webhooks",
      subscribedEvents: ["try_on.completed" as const],
    };

    await expect(controller.createWebhook(request(), dto)).resolves.toEqual({
      id: "endpoint-1",
      secret: "whsec_test",
    });

    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "store-1",
      STORE_PERMISSION_CODES.developerApiManage,
    );
    expect(webhookService.createEndpoint).toHaveBeenCalledWith(
      { storeId: "store-1" },
      dto,
    );
  });

  it("authorizes webhook updates against the endpoint Store", async () => {
    const storeRbac = rbac();
    const consoleService = {
      storeIdForWebhookEndpoint: vi.fn().mockResolvedValue("store-1"),
      credentialForStore: vi.fn().mockResolvedValue({ storeId: "store-1" }),
      webhookEndpoint: vi.fn().mockResolvedValue({ id: "endpoint-1" }),
    };
    const webhookService = { updateEndpoint: vi.fn() };
    const controller = new DeveloperApiConsoleController(
      auth(),
      platformAuthorization(false) as never,
      storeRbac as never,
      apiKeys() as never,
      consoleService as never,
      webhookService as never,
    );

    await controller.updateWebhook(request(), "endpoint-1", { enabled: false });

    expect(consoleService.storeIdForWebhookEndpoint).toHaveBeenCalledWith(
      "endpoint-1",
    );
    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "store-1",
      STORE_PERMISSION_CODES.developerApiManage,
    );
    expect(webhookService.updateEndpoint).toHaveBeenCalledWith(
      { storeId: "store-1" },
      "endpoint-1",
      { enabled: false },
    );
  });

  it("rejects global webhook listing without platform Developer API access", async () => {
    const platform = platformAuthorization(false);
    const consoleService = { listWebhookEndpoints: vi.fn() };
    const controller = new DeveloperApiConsoleController(
      auth(),
      platform as never,
      rbac() as never,
      apiKeys() as never,
      consoleService as never,
      webhooks() as never,
    );

    await expect(controller.listWebhooks(request(), {})).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({ code: "PLATFORM_PERMISSION_DENIED" }),
      }),
    });
    expect(platform.requirePermission).toHaveBeenCalledWith(
      "user-1",
      PLATFORM_PERMISSIONS.developerApiView,
    );
    expect(consoleService.listWebhookEndpoints).not.toHaveBeenCalled();
  });

  it("rejects another Store's webhook listing for Store users", async () => {
    const storeRbac = rbacReject();
    const consoleService = { listWebhookEndpoints: vi.fn() };
    const controller = new DeveloperApiConsoleController(
      auth(),
      platformAuthorization(false) as never,
      storeRbac as never,
      apiKeys() as never,
      consoleService as never,
      webhooks() as never,
    );

    await expect(
      controller.listWebhooks(request(), { storeId: "store-b" }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({ code: "STORE_PERMISSION_DENIED" }),
      }),
    });
    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "store-b",
      STORE_PERMISSION_CODES.developerApiView,
    );
    expect(consoleService.listWebhookEndpoints).not.toHaveBeenCalled();
  });

  it("rejects webhook delivery filters with mismatched Store and endpoint", async () => {
    const consoleService = {
      storeIdForWebhookEndpoint: vi.fn().mockResolvedValue("store-1"),
      listWebhookDeliveries: vi.fn(),
    };
    const controller = new DeveloperApiConsoleController(
      auth(),
      platformAuthorization(false) as never,
      rbac() as never,
      apiKeys() as never,
      consoleService as never,
      webhooks() as never,
    );

    await expect(
      controller.listWebhookDeliveries(request(), {
        endpointId: "endpoint-1",
        storeId: "store-b",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: "DEVELOPER_API_SCOPE_MISMATCH",
        }),
      }),
    });
    expect(consoleService.listWebhookDeliveries).not.toHaveBeenCalled();
  });

  it("rejects updating another Store's webhook for Store users", async () => {
    const storeRbac = rbacReject();
    const consoleService = {
      storeIdForWebhookEndpoint: vi.fn().mockResolvedValue("store-b"),
      credentialForStore: vi.fn(),
      webhookEndpoint: vi.fn(),
    };
    const webhookService = { updateEndpoint: vi.fn() };
    const controller = new DeveloperApiConsoleController(
      auth(),
      platformAuthorization(false) as never,
      storeRbac as never,
      apiKeys() as never,
      consoleService as never,
      webhookService as never,
    );

    await expect(
      controller.updateWebhook(request(), "endpoint-b", { enabled: false }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({ code: "STORE_PERMISSION_DENIED" }),
      }),
    });
    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "store-b",
      STORE_PERMISSION_CODES.developerApiManage,
    );
    expect(webhookService.updateEndpoint).not.toHaveBeenCalled();
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
  return { requireStorePermission: vi.fn() };
}

function rbacReject() {
  return {
    requireStorePermission: vi.fn().mockRejectedValue(
      new ApiErrorException(
        HttpStatus.FORBIDDEN,
        "STORE_PERMISSION_DENIED",
        "Store permission denied.",
      ),
    ),
  };
}

function apiKeys() {
  return { storeIdForKey: vi.fn().mockResolvedValue("store-1") };
}

function webhooks() {
  return {
    createEndpoint: vi.fn(),
    updateEndpoint: vi.fn(),
    disableEndpoint: vi.fn(),
  };
}

function request() {
  return { headers: { authorization: "Bearer token" } } as never;
}
