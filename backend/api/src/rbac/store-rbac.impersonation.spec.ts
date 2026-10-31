import { OrganizationStatus, UserStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { StoreRbacService } from "./store-rbac.service.js";

describe("Store role context during impersonation", () => {
  it("uses the selected application-wide role and rejects another Store", async () => {
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ status: UserStatus.ACTIVE, deletedAt: null }),
      },
      impersonationSession: {
        findFirst: vi.fn().mockResolvedValue({
          targetStoreId: "store-1",
          effectiveRoleCode: "staff",
        }),
      },
      organization: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ status: OrganizationStatus.ACTIVE }),
      },
      globalStoreRole: {
        findMany: vi.fn().mockResolvedValue([
          {
            systemCode: "staff",
            permissions: [
              {
                permission: { code: "analytics.view" },
              },
            ],
          },
        ]),
      },
    };
    const rbac = new StoreRbacService(prisma as never);
    vi.spyOn(rbac, "ensureStoreRbac").mockResolvedValue();

    const access = await rbac.effectivePermissions("admin-1", "store-1");
    expect(access.permissions).toEqual(["analytics.view"]);
    expect(access.platformBypass).toBe(false);
    expect(access.membershipId).toBeNull();
    await expect(
      rbac.effectivePermissions("admin-1", "store-2"),
    ).rejects.toMatchObject({
      response: { error: { code: "IMPERSONATION_STORE_MISMATCH" } },
    });
  });
});
