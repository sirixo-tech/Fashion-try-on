import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { AdminKiosksController } from "./admin-kiosks.controller.js";

describe("AdminKiosksController RBAC", () => {
  it("keeps global kiosk fleet enumeration platform-only", async () => {
    const kiosks = { listDevices: vi.fn() };
    const platformAuthorization = {
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
    const controller = new AdminKiosksController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "store-user" }),
      } as never,
      platformAuthorization as never,
      kiosks as never,
    );

    await expect(
      controller.list({ headers: { authorization: "Bearer store" } } as never),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({ code: "PLATFORM_PERMISSION_DENIED" }),
      }),
    });
    expect(platformAuthorization.requirePermission).toHaveBeenCalledWith(
      "store-user",
      PLATFORM_PERMISSIONS.kiosksView,
    );
    expect(kiosks.listDevices).not.toHaveBeenCalled();
  });
});
