import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { StoreRbacController } from "./store-rbac.controller.js";

describe("StoreRbacController", () => {
  it("requires platform Store role management permission before creating roles", async () => {
    const platformAuthorization = {
      hasPermission: vi.fn().mockResolvedValue(false),
    };
    const permissionError = new ApiErrorException(
      HttpStatus.FORBIDDEN,
      "STORE_PERMISSION_DENIED",
      "Store permission denied.",
    );
    const storeRbac = {
      createRole: vi.fn(),
      requireStorePermission: vi.fn().mockRejectedValue(permissionError),
    };
    const controller = new StoreRbacController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "support-user" }),
      } as never,
      platformAuthorization as never,
      storeRbac as never,
    );

    await expect(
      controller.createRole(
        { headers: { authorization: "Bearer token" } } as never,
        "018fb642-4fcb-7d6d-8f35-00f1c6f9e001",
        { name: "Ops Lead", permissionCodes: ["stores.view"] },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({ code: "STORE_PERMISSION_DENIED" }),
      }),
    });
    expect(platformAuthorization.hasPermission).toHaveBeenCalledWith(
      "support-user",
      PLATFORM_PERMISSIONS.storeRolesManage,
    );
    expect(storeRbac.requireStorePermission).toHaveBeenCalledWith(
      "support-user",
      "018fb642-4fcb-7d6d-8f35-00f1c6f9e001",
      "roles.create",
    );
    expect(storeRbac.createRole).not.toHaveBeenCalled();
  });

  it("resolves effective permissions as an authenticated Store self-check", async () => {
    const rbac = {
      effectivePermissions: vi.fn().mockResolvedValue({
        storeId: "018fb642-4fcb-7d6d-8f35-00f1c6f9e001",
        permissions: ["stores.view"],
        platformBypass: false,
        membershipId: "018fb642-4fcb-7d6d-8f35-00f1c6f9e002",
      }),
    };
    const platformAuthorization = {
      requirePermission: vi.fn(),
      hasPermission: vi.fn(),
    };
    const controller = new StoreRbacController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "store-user" }),
      } as never,
      platformAuthorization as never,
      rbac as never,
    );

    await expect(
      controller.effectivePermissions(
        { headers: { authorization: "Bearer token" } } as never,
        "018fb642-4fcb-7d6d-8f35-00f1c6f9e001",
      ),
    ).resolves.toMatchObject({
      permissions: ["stores.view"],
      platformBypass: false,
    });
    expect(platformAuthorization.requirePermission).not.toHaveBeenCalled();
    expect(rbac.effectivePermissions).toHaveBeenCalledWith(
      "store-user",
      "018fb642-4fcb-7d6d-8f35-00f1c6f9e001",
    );
  });
});
