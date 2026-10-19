import "reflect-metadata";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { PrismaClient } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { AccessControlService } from "./access-control.service.js";
import { PlatformAuthorizationService } from "./platform-authorization.service.js";
import { PLATFORM_PERMISSIONS } from "./platform-permissions.js";
const url = process.env.USERS_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test"))
)
  throw new Error("Disposable localhost test database required.");
describe.skipIf(!url)("Platform RBAC — Superadmin, Admin and Staff", () => {
  const db = new PrismaClient({
    datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
  });
  const access = new AccessControlService(db as PrismaService),
    authorization = new PlatformAuthorizationService(db as PrismaService);
  let ids: string[];
  let maps: { id: string; permissions: { permissionId: string }[] }[];
  beforeAll(async () => {
    await db.$connect();
    await access.listPlatformRoles();
  });
  beforeEach(async () => {
    ids = [];
    maps = await db.platformAccessRole.findMany({
      select: { id: true, permissions: { select: { permissionId: true } } },
    });
  });
  afterEach(async () => {
    for (const map of maps) {
      await db.platformAccessRolePermission.deleteMany({
        where: { roleId: map.id },
      });
      await db.platformAccessRolePermission.createMany({
        data: map.permissions.map((p) => ({
          id: createSelfxId(),
          roleId: map.id,
          permissionId: p.permissionId,
        })),
      });
    }
    await db.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
    await db.platformUserAccessRole.deleteMany({
      where: { userId: { in: ids } },
    });
    await db.platformRoleAssignment.deleteMany({
      where: { userId: { in: ids } },
    });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  });
  afterAll(() => db.$disconnect());
  async function user(role?: "SELFX_SUPER_ADMIN" | "SELFX_STAFF_ADMIN") {
    const id = createSelfxId();
    ids.push(id);
    await db.user.create({
      data: { id, email: `${id}@platform.test`, passwordHash: "test-only" },
    });
    if (role)
      await db.platformRoleAssignment.create({
        data: { id: createSelfxId(), userId: id, role },
      });
    return id;
  }
  const error = (code: string) => ({ response: { error: { code } } });
  it("uses only the two ordinary Platform roles and forbids custom role creation", async () => {
    const actor = await user("SELFX_SUPER_ADMIN");
    expect(
      (await access.listPlatformRoles()).data.map((r) => r.name).sort(),
    ).toEqual(["Platform Admin", "Platform Staff"]);
    await expect(
      access.createPlatformRole(actor, { name: "Kiosk Viewer" }),
    ).rejects.toMatchObject(error("FIXED_ROLES_ONLY"));
  });
  it("grants and revokes ordinary Platform authority immediately from database assignments", async () => {
    const actor = await user("SELFX_SUPER_ADMIN"),
      target = await user();
    const role = (await access.listPlatformRoles()).data.find(
      (r) => r.systemCode === "platform-staff-admin",
    )!;
    await access.replaceUserPlatformRoles(actor, target, {
      roleIds: [role.id],
    });
    await expect(
      authorization.requirePermission(target, PLATFORM_PERMISSIONS.storesView),
    ).resolves.toBeUndefined();
    await access.replaceUserPlatformRoles(actor, target, { roleIds: [] });
    await expect(
      authorization.requirePermission(target, PLATFORM_PERMISSIONS.storesView),
    ).rejects.toMatchObject(error("PLATFORM_PERMISSION_DENIED"));
  });
  it("protects Superadmins from ordinary role assignment and keeps exclusive permissions protected", async () => {
    const actor = await user("SELFX_SUPER_ADMIN"),
      protectedUser = await user("SELFX_SUPER_ADMIN"),
      ordinary = await user("SELFX_STAFF_ADMIN");
    await expect(
      access.replaceUserPlatformRoles(actor, protectedUser, { roleIds: [] }),
    ).rejects.toMatchObject(error("SELFX_SUPERADMIN_PROTECTED"));
    const role = (await access.listPlatformRoles()).data.find(
      (r) => r.systemCode === "platform-support-admin",
    )!;
    const admin = (await access.listPlatformRoles()).data.find(
      (r) => r.systemCode === "platform-staff-admin",
    )!;
    await access.replacePlatformRolePermissions(actor, admin.id, {
      permissionCodes: [PLATFORM_PERMISSIONS.platformRolesManage],
    });
    await expect(
      access.replacePlatformRolePermissions(ordinary, role.id, {
        permissionCodes: [PLATFORM_PERMISSIONS.permissionsManage],
      }),
    ).rejects.toMatchObject(error("SELFX_SUPERADMIN_PROTECTED"));
  });
  it("persists revocations for bootstrap and ordinary assignments without restoring defaults", async () => {
    const actor = await user("SELFX_SUPER_ADMIN"),
      legacy = await user("SELFX_STAFF_ADMIN"),
      dynamic = await user();
    const admin = (await access.listPlatformRoles()).data.find(
      (r) => r.systemCode === "platform-staff-admin",
    )!;
    await access.replacePlatformRolePermissions(actor, admin.id, {
      permissionCodes: [PLATFORM_PERMISSIONS.storesView],
    });
    await access.replaceUserPlatformRoles(actor, dynamic, {
      roleIds: [admin.id],
    });
    await access.replaceUserPlatformRoles(actor, legacy, {
      roleIds: [admin.id],
    });
    expect(
      (await access.listPlatformRoles()).data.find(
        (role) => role.id === admin.id,
      )?.assignedUsersCount,
    ).toBe(2);
    for (const id of [legacy, dynamic])
      expect(
        await authorization.hasPermission(id, PLATFORM_PERMISSIONS.storesView),
      ).toBe(true);
    const current = (await access.listPlatformRoles()).data.find(
      (r) => r.id === admin.id,
    )!;
    await access.replacePlatformRolePermissions(actor, admin.id, {
      permissionCodes: [],
      expectedUpdatedAt: current.updatedAt,
    });
    const fresh = new AccessControlService(db as PrismaService);
    expect(
      (await fresh.listPlatformRoles()).data.find((r) => r.id === admin.id)
        ?.permissions,
    ).toEqual([]);
    for (const id of [legacy, dynamic])
      expect(
        await authorization.hasPermission(id, PLATFORM_PERMISSIONS.storesView),
      ).toBe(false);
    expect(
      await authorization.hasPermission(actor, PLATFORM_PERMISSIONS.storesView),
    ).toBe(true);
    await expect(
      access.replacePlatformRolePermissions(actor, admin.id, {
        permissionCodes: [],
        expectedUpdatedAt: current.updatedAt,
      }),
    ).rejects.toMatchObject(error("ROLE_CHANGED"));
  });
  it("allows delegated platform managers to edit Staff only within held permissions", async () => {
    const actor = await user("SELFX_SUPER_ADMIN"),
      manager = await user("SELFX_STAFF_ADMIN");
    const roles = (await access.listPlatformRoles()).data;
    const admin = roles.find((r) => r.systemCode === "platform-staff-admin")!,
      staff = roles.find((r) => r.systemCode === "platform-support-admin")!;
    await access.replacePlatformRolePermissions(actor, admin.id, {
      permissionCodes: [
        PLATFORM_PERMISSIONS.platformRolesManage,
        PLATFORM_PERMISSIONS.storesView,
      ],
    });
    await access.replacePlatformRolePermissions(actor, staff.id, {
      permissionCodes: [],
    });
    await expect(
      access.replacePlatformRolePermissions(manager, admin.id, {
        permissionCodes: [],
      }),
    ).rejects.toMatchObject(error("ROLE_MANAGEMENT_DENIED"));
    await expect(
      access.updatePlatformRole(manager, admin.id, { isActive: false }),
    ).rejects.toMatchObject(error("ROLE_MANAGEMENT_DENIED"));
    await expect(
      access.replacePlatformRolePermissions(manager, staff.id, {
        permissionCodes: [PLATFORM_PERMISSIONS.storesView],
      }),
    ).resolves.toMatchObject({ id: staff.id });
    await expect(
      access.replacePlatformRolePermissions(manager, staff.id, {
        permissionCodes: [PLATFORM_PERMISSIONS.platformUsersManage],
      }),
    ).rejects.toMatchObject(error("PLATFORM_PERMISSION_DENIED"));
    await expect(
      access.replacePlatformRolePermissions(manager, staff.id, {
        permissionCodes: [PLATFORM_PERMISSIONS.permissionsManage],
      }),
    ).rejects.toMatchObject(error("SELFX_SUPERADMIN_PROTECTED"));
  });
  it("rejects renamed and legacy custom role assignments", async () => {
    const actor = await user("SELFX_SUPER_ADMIN"),
      target = await user();
    const role = (await access.listPlatformRoles()).data[0]!;
    await expect(
      access.updatePlatformRole(actor, role.id, { name: "Manager" }),
    ).rejects.toMatchObject(error("FIXED_ROLES_ONLY"));
    await expect(
      access.replaceUserPlatformRoles(actor, target, {
        roleIds: [createSelfxId()],
      }),
    ).rejects.toMatchObject(error("PLATFORM_ROLE_NOT_FOUND"));
  });
  it.each([
    "PLATFORM_PRODUCTS_MANAGE",
    "KIOSKS_VIEW",
    "KIOSKS_PAIR",
    "KIOSKS_UPDATE",
    "KIOSKS_ASSIGN",
    "KIOSKS_REVOKE",
    "KIOSKS_DELETE",
    "KIOSKS_CONFIGURE",
  ])(
    "retires %s even when historic role rows retain it",
    async (retiredCode) => {
      const actor = await user("SELFX_SUPER_ADMIN");
      const role = (await access.listPlatformRoles()).data.find(
        (r) => r.systemCode === "platform-support-admin",
      )!;
      const historic = await db.permission.upsert({
        where: { code: retiredCode },
        create: {
          id: createSelfxId(),
          code: retiredCode,
          module: "platform.products",
          label: "Historic platform catalog permission",
          action: "manage",
          applicability: "PLATFORM_ONLY",
        },
        update: {},
      });
      await db.platformAccessRolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: historic.id },
        },
        create: {
          id: createSelfxId(),
          roleId: role.id,
          permissionId: historic.id,
        },
        update: {},
      });
      try {
        expect(
          (await access.listPermissions()).data.some(
            (p) => p.code === retiredCode,
          ),
        ).toBe(false);
        const returnedRole = (await access.listPlatformRoles()).data.find(
          (r) => r.id === role.id,
        )!;
        expect(
          returnedRole.permissions.some((p) => p.code === retiredCode),
        ).toBe(false);
        expect(returnedRole.permissionsCount).toBe(
          returnedRole.permissions.length,
        );
        await expect(
          access.replacePlatformRolePermissions(actor, role.id, {
            permissionCodes: [historic.code],
          }),
        ).rejects.toMatchObject(error("GLOBAL_PERMISSION_INVALID"));
        expect(
          await authorization.hasPermission(actor, historic.code as never),
        ).toBe(false);
        expect(
          (await authorization.allPlatformPermissionsForUser(actor)).some(
            (p) => p === retiredCode,
          ),
        ).toBe(false);
      } finally {
        await db.platformAccessRolePermission.deleteMany({
          where: { roleId: role.id, permissionId: historic.id },
        });
      }
    },
  );
});
