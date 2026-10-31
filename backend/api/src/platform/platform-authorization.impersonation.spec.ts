import { describe, expect, it, vi } from "vitest";

import { PLATFORM_PERMISSIONS } from "./platform-permissions.js";
import { PlatformAuthorizationService } from "./platform-authorization.service.js";

describe("platform authority during Store view", () => {
  it("hides platform access and denies platform actions while a Store session is active", async () => {
    const prisma = {
      impersonationSession: {
        findFirst: vi.fn().mockResolvedValue({ id: "session-1" }),
      },
      platformRoleAssignment: { findFirst: vi.fn() },
    };
    const authorization = new PlatformAuthorizationService(prisma as never);

    expect(
      await authorization.hasPermission(
        "admin-1",
        PLATFORM_PERMISSIONS.storesCreate,
      ),
    ).toBe(false);
    expect(await authorization.isSuperadmin("admin-1")).toBe(false);
    expect(
      await authorization.allPlatformPermissionsForUser("admin-1"),
    ).toEqual([]);
    await expect(
      authorization.requirePermission(
        "admin-1",
        PLATFORM_PERMISSIONS.storesCreate,
      ),
    ).rejects.toMatchObject({
      response: { error: { code: "PLATFORM_PERMISSION_DENIED" } },
    });
    expect(prisma.platformRoleAssignment.findFirst).not.toHaveBeenCalled();
  });
});
