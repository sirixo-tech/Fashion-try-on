import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { STORE_PERMISSION_CODES } from "../rbac/store-permissions.js";
import { DeveloperApiKeyController } from "./developer-api-key.controller.js";

describe("DeveloperApiKeyController", () => {
  it("allows platform Developer API viewers to list keys globally", async () => {
    const apiKeys = { listKeys: vi.fn().mockResolvedValue({ data: [] }) };
    const controller = new DeveloperApiKeyController(
      auth(),
      platformAuthorization(true) as never,
      rbac() as never,
      apiKeys as never,
    );

    await expect(controller.list(request(), {})).resolves.toEqual({ data: [] });

    expect(apiKeys.listKeys).toHaveBeenCalledWith({});
  });

  it("allows Store users with manage permission to create keys for their Store", async () => {
    const storeRbac = rbac();
    const apiKeys = {
      createKey: vi
        .fn()
        .mockResolvedValue({ apiKey: {}, secret: "selfx_test" }),
    };
    const controller = new DeveloperApiKeyController(
      auth(),
      platformAuthorization(false) as never,
      storeRbac as never,
      apiKeys as never,
    );
    const dto = {
      storeId: "store-1",
      name: "Partner",
      environment: "TEST" as const,
      scopes: ["tryon:create" as const],
    };

    await controller.create(request(), dto);

    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "store-1",
      STORE_PERMISSION_CODES.developerApiManage,
    );
    expect(apiKeys.createKey).toHaveBeenCalledWith("user-1", dto);
  });

  it("authorizes revoke against the Store that owns the key", async () => {
    const storeRbac = rbac();
    const apiKeys = {
      storeIdForKey: vi.fn().mockResolvedValue("store-1"),
      revokeKey: vi.fn().mockResolvedValue({ id: "key-1", status: "REVOKED" }),
    };
    const controller = new DeveloperApiKeyController(
      auth(),
      platformAuthorization(false) as never,
      storeRbac as never,
      apiKeys as never,
    );

    await controller.revoke(request(), "key-1");

    expect(apiKeys.storeIdForKey).toHaveBeenCalledWith("key-1");
    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "user-1",
      "store-1",
      STORE_PERMISSION_CODES.developerApiManage,
    );
    expect(apiKeys.revokeKey).toHaveBeenCalledWith("user-1", "key-1");
  });

  it("rejects global listing without platform Developer API access", async () => {
    const platform = platformAuthorization(false);
    const apiKeys = { listKeys: vi.fn() };
    const controller = new DeveloperApiKeyController(
      auth(),
      platform as never,
      rbac() as never,
      apiKeys as never,
    );

    await expect(controller.list(request(), {})).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({ code: "PLATFORM_PERMISSION_DENIED" }),
      }),
    });
    expect(platform.requirePermission).toHaveBeenCalledWith(
      "user-1",
      PLATFORM_PERMISSIONS.developerApiView,
    );
    expect(apiKeys.listKeys).not.toHaveBeenCalled();
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

function request() {
  return { headers: { authorization: "Bearer token" } } as never;
}
