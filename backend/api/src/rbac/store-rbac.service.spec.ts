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
import { StoreRbacService } from "./store-rbac.service.js";
import { STORE_PERMISSION_REGISTRY } from "./store-permissions.js";
import { RolesWorkspaceController } from "./roles-workspace.controller.js";
import { AccessControlService } from "../platform/access-control.service.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";

const url = process.env.USERS_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test"))
)
  throw new Error("Disposable localhost test database required.");
describe.skipIf(!url)("Store RBAC — fixed Store Admin and Staff roles", () => {
  const db = new PrismaClient({
    datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
  });
  const rbac = new StoreRbacService(db as PrismaService);
  let users: string[], stores: string[];
  beforeAll(() => db.$connect());
  beforeEach(() => {
    users = [];
    stores = [];
  });
  afterEach(async () => {
    await db.impersonationSession.deleteMany({
      where: { actorUserId: { in: users } },
    });
    await db.auditLog.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: users } },
          { organizationId: { in: stores } },
        ],
      },
    });
    await db.storeMembershipRole.deleteMany({
      where: { orgId: { in: stores } },
    });
    await db.organizationMembership.deleteMany({
      where: { orgId: { in: stores } },
    });
    await db.storeRolePermission.deleteMany({
      where: { role: { orgId: { in: stores } } },
    });
    await db.storeRole.deleteMany({ where: { orgId: { in: stores } } });
    await db.storePermissionGrant.deleteMany({
      where: { storeTenantId: { in: stores } },
    });
    await db.organization.deleteMany({ where: { id: { in: stores } } });
    await db.platformRoleAssignment.deleteMany({
      where: { userId: { in: users } },
    });
    await db.platformUserAccessRole.deleteMany({
      where: { userId: { in: users } },
    });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });
  afterAll(() => db.$disconnect());
  async function user() {
    const id = createSelfxId();
    users.push(id);
    await db.user.create({
      data: { id, email: `${id}@rbac.test`, passwordHash: "test-only" },
    });
    return id;
  }
  async function store() {
    const id = createSelfxId();
    stores.push(id);
    await db.organization.create({
      data: { id, name: "RBAC Store", slug: id, status: "ACTIVE" },
    });
    await db.$transaction((tx) =>
      rbac.ensureStoreRbacInTransaction(tx, id, true),
    );
    return id;
  }
  async function member(userId: string, orgId: string, systemCode = "staff") {
    const role = await db.storeRole.findUniqueOrThrow({
      where: { orgId_systemCode: { orgId, systemCode } },
    });
    const id = createSelfxId();
    await db.organizationMembership.create({
      data: {
        id,
        orgId,
        userId,
        role: "STORE_STAFF",
        status: "ACTIVE",
        storeScopeMode: "ALL_STORES",
        roleAssignments: { create: { id: createSelfxId(), roleId: role.id } },
      },
    });
    return { id, roleId: role.id };
  }
  const error = (code: string) => ({ response: { error: { code } } });
  const request = { headers: { authorization: "Bearer test-token" } } as never;
  const access = new AccessControlService(db as PrismaService);
  const impersonation = new StoreImpersonationService(db as PrismaService);
  function workspace(actorId: string) {
    return new RolesWorkspaceController(
      { requireAccessUser: async () => ({ id: actorId }) } as never,
      db as PrismaService,
      access,
      rbac,
      impersonation,
    );
  }
  it("keeps platform Store role viewing separate from delegated Store role management", async () => {
    const superadmin = await user(),
      actor = await user(),
      tenant = await store();
    await db.platformRoleAssignment.create({
      data: {
        id: createSelfxId(),
        userId: superadmin,
        role: "SELFX_SUPER_ADMIN",
      },
    });
    const staff = (await access.listPlatformRoles()).data.find(
      (r) => r.systemCode === "platform-support-admin",
    )!;
    const original = staff.permissions.map((p) => p.code);
    try {
      await access.replacePlatformRolePermissions(superadmin, staff.id, {
        permissionCodes: ["STORE_ROLES_VIEW"],
      });
      await access.replaceUserPlatformRoles(superadmin, actor, {
        roleIds: [staff.id],
      });
      const controller = workspace(actor);
      const context = await controller.context(request, {});
      expect(context.canViewPlatform).toBe(false);
      expect(context.stores.data.map((s) => s.id)).toContain(tenant);
      const current = await controller.store(request, tenant);
      expect(current.policy).toMatchObject({
        canView: true,
        canEditAdmin: false,
        canEditStaff: false,
      });
      const admin = current.roles.find((r) => r.systemCode === "store-admin")!;
      await expect(
        rbac.replaceRolePermissions(actor, tenant, admin.id, {
          permissionCodes: admin.permissions.map((p) => p.code),
        }),
      ).rejects.toMatchObject(error("ROLE_MANAGEMENT_DENIED"));
      await access.replacePlatformRolePermissions(superadmin, staff.id, {
        permissionCodes: ["STORE_ROLES_MANAGE"],
      });
      expect(
        (await controller.store(request, tenant)).policy.canEditAdmin,
      ).toBe(true);
      await expect(
        rbac.replaceRolePermissions(actor, tenant, admin.id, {
          permissionCodes: admin.permissions
            .map((p) => p.code)
            .filter((c) => c !== "products.manage"),
        }),
      ).resolves.toMatchObject({ id: admin.id });
      expect((await controller.store(request, tenant)).canEditCeiling).toBe(
        false,
      );
    } finally {
      await access.replacePlatformRolePermissions(superadmin, staff.id, {
        permissionCodes: original,
      });
    }
  }, 20000);
  it("exposes only a member's Store roles and derives editing capability from actual authority", async () => {
    const actor = await user(),
      staff = await user(),
      tenant = await store(),
      foreign = await store();
    await member(actor, tenant, "store-admin");
    await member(staff, tenant);
    const controller = workspace(actor);
    const context = await controller.context(request, {});
    expect(context.canViewPlatform).toBe(false);
    expect(context.roles).toEqual([]);
    expect(context.stores.data.map((s) => s.id)).toEqual([tenant]);
    const result = await controller.store(request, tenant);
    expect(result.roles.map((r) => r.systemCode).sort()).toEqual([
      "staff",
      "store-admin",
    ]);
    expect(result.policy).toMatchObject({
      canEditAdmin: false,
      canEditStaff: true,
    });
    expect(result.canEditCeiling).toBe(false);
    await expect(controller.store(request, foreign)).rejects.toMatchObject(
      error("ROLE_MANAGEMENT_DENIED"),
    );
    await expect(workspace(staff).store(request, tenant)).rejects.toMatchObject(
      error("ROLE_MANAGEMENT_DENIED"),
    );
    await expect(
      access.replaceStorePermissionGrants(actor, tenant, {
        permissionCodes: [],
      }),
    ).rejects.toMatchObject(error("ROLE_MANAGEMENT_DENIED"));
  });
  it("makes role management read-only during impersonation and restricts the Store selector to its target", async () => {
    const actor = await user(),
      tenant = await store(),
      other = await store();
    await db.platformRoleAssignment.create({
      data: { id: createSelfxId(), userId: actor, role: "SELFX_SUPER_ADMIN" },
    });
    const controller = workspace(actor);
    const context = await controller.context(request, { pageSize: 1 });
    expect(context).toMatchObject({
      canViewPlatform: true,
      canEditPlatformAdmin: true,
    });
    expect(context.stores.data).toHaveLength(1);
    expect(context.stores.hasMore).toBe(true);
    const before = await controller.store(request, tenant);
    expect(before.canEditCeiling).toBe(true);
    await impersonation.startSession(actor, tenant);
    const current = await controller.context(request, {});
    expect(current.canViewPlatform).toBe(false);
    expect(current.stores.data.map((s) => s.id)).toEqual([tenant]);
    expect((await controller.store(request, tenant)).policy).toMatchObject({
      canEditAdmin: false,
      canEditStaff: false,
    });
    await expect(controller.store(request, other)).rejects.toMatchObject(
      error("IMPERSONATION_STORE_MISMATCH"),
    );
    await expect(
      rbac.replaceRolePermissions(actor, tenant, before.roles[0]!.id, {
        permissionCodes: [],
      }),
    ).rejects.toMatchObject(error("ROLE_MANAGEMENT_DENIED"));
    await expect(
      access.replaceStorePermissionGrants(actor, tenant, {
        permissionCodes: [],
      }),
    ).rejects.toMatchObject(error("ROLE_MANAGEMENT_DENIED"));
    const platformRole = (await access.listPlatformRoles()).data[0]!;
    await expect(
      access.replacePlatformRolePermissions(actor, platformRole.id, {
        permissionCodes: [],
      }),
    ).rejects.toMatchObject(error("ROLE_MANAGEMENT_DENIED"));
  });
  it("applies the Store ceiling immediately and rejects stale ceiling saves", async () => {
    const actor = await user(),
      admin = await user(),
      tenant = await store();
    await member(admin, tenant, "store-admin");
    await db.platformRoleAssignment.create({
      data: { id: createSelfxId(), userId: actor, role: "SELFX_SUPER_ADMIN" },
    });
    const current = await workspace(actor).store(request, tenant);
    const codes = current.permissions
      .filter((p) => p.granted && p.code !== "products.manage")
      .map((p) => p.code);
    await access.replaceStorePermissionGrants(actor, tenant, {
      permissionCodes: codes,
      expectedUpdatedAt: current.ceilingUpdatedAt,
    });
    expect(
      (await rbac.effectivePermissions(admin, tenant)).permissions,
    ).not.toContain("products.manage");
    await expect(
      access.replaceStorePermissionGrants(actor, tenant, {
        permissionCodes: codes,
        expectedUpdatedAt: current.ceilingUpdatedAt,
      }),
    ).rejects.toMatchObject(error("ROLE_CHANGED"));
  });
  it("persists Staff revocations across role loading and enforces them for assigned users", async () => {
    const admin = await user(),
      staff = await user(),
      tenant = await store();
    await member(admin, tenant, "store-admin");
    const assignment = await member(staff, tenant);
    const current = (await rbac.listRoles(tenant, {})).data.find(
      (r) => r.id === assignment.roleId,
    )!;
    const saved = await rbac.replaceRolePermissions(admin, tenant, current.id, {
      permissionCodes: current.permissions
        .map((p) => p.code)
        .filter((c) => c !== "products.manage"),
      expectedUpdatedAt: current.updatedAt,
    });
    const fresh = new StoreRbacService(db as PrismaService);
    await fresh.ensureStoreRbac(tenant);
    expect(
      (await fresh.listRoles(tenant, {})).data
        .find((r) => r.id === current.id)
        ?.permissions.map((p) => p.code),
    ).not.toContain("products.manage");
    expect(
      (await fresh.effectivePermissions(staff, tenant)).permissions,
    ).not.toContain("products.manage");
    await expect(
      rbac.replaceRolePermissions(admin, tenant, current.id, {
        permissionCodes: current.permissions.map((p) => p.code),
        expectedUpdatedAt: current.updatedAt,
      }),
    ).rejects.toMatchObject(error("ROLE_CHANGED"));
    await expect(
      rbac.replaceRolePermissions(admin, tenant, saved.id, {
        permissionCodes: current.permissions.map((p) => p.code),
        expectedUpdatedAt: saved.updatedAt,
      }),
    ).resolves.toMatchObject({ id: current.id });
  });
  it("limits Store Admin delegation to Staff operations and their own Store", async () => {
    const admin = await user(),
      staff = await user(),
      tenant = await store(),
      foreign = await store();
    const adminMember = await member(admin, tenant, "store-admin");
    const staffMember = await member(staff, tenant);
    const current = (await rbac.listRoles(tenant, {})).data.find(
      (r) => r.id === staffMember.roleId,
    )!;
    await expect(
      rbac.replaceRolePermissions(staff, tenant, current.id, {
        permissionCodes: [],
      }),
    ).rejects.toMatchObject(error("ROLE_MANAGEMENT_DENIED"));
    await expect(
      rbac.replaceRolePermissions(admin, tenant, adminMember.roleId, {
        permissionCodes: [],
      }),
    ).rejects.toMatchObject(error("ROLE_MANAGEMENT_DENIED"));
    await expect(
      rbac.replaceRolePermissions(admin, tenant, current.id, {
        permissionCodes: ["users.update"],
      }),
    ).rejects.toMatchObject(error("ROLE_MANAGEMENT_DENIED"));
    await expect(
      rbac.replaceRolePermissions(admin, foreign, current.id, {
        permissionCodes: [],
      }),
    ).rejects.toMatchObject(error("STORE_ROLE_NOT_FOUND"));
    const permission = await db.permission.findUniqueOrThrow({
      where: { code: "products.manage" },
    });
    await db.storeRolePermission.deleteMany({
      where: { roleId: adminMember.roleId, permissionId: permission.id },
    });
    await rbac.replaceRolePermissions(admin, tenant, current.id, {
      permissionCodes: [],
    });
    await expect(
      rbac.replaceRolePermissions(admin, tenant, current.id, {
        permissionCodes: ["products.manage"],
      }),
    ).rejects.toMatchObject(error("ROLE_MANAGEMENT_DENIED"));
    await db.storePermissionGrant.deleteMany({
      where: { storeTenantId: tenant, permissionId: permission.id },
    });
    const superadmin = await user();
    await db.platformRoleAssignment.create({
      data: {
        id: createSelfxId(),
        userId: superadmin,
        role: "SELFX_SUPER_ADMIN",
      },
    });
    await expect(
      rbac.replaceRolePermissions(superadmin, tenant, current.id, {
        permissionCodes: ["products.manage"],
      }),
    ).rejects.toMatchObject(error("ROLE_MANAGEMENT_DENIED"));
  });
  it("lets Superadmin configure Store Admin while retaining core administration", async () => {
    const actor = await user(),
      tenant = await store();
    await db.platformRoleAssignment.create({
      data: { id: createSelfxId(), userId: actor, role: "SELFX_SUPER_ADMIN" },
    });
    const role = (await rbac.listRoles(tenant, {})).data.find(
      (r) => r.systemCode === "store-admin",
    )!;
    await expect(
      rbac.replaceRolePermissions(actor, tenant, role.id, {
        permissionCodes: [],
      }),
    ).rejects.toMatchObject(error("ROLE_MANAGEMENT_DENIED"));
    const codes = role.permissions
      .map((p) => p.code)
      .filter((c) => c !== "products.manage");
    const result = await rbac.replaceRolePermissions(actor, tenant, role.id, {
      permissionCodes: codes,
    });
    expect(result.permissions.map((p) => p.code)).toEqual(
      expect.arrayContaining(["users.update", "roles.assign"]),
    );
    expect(result.permissions.map((p) => p.code)).not.toContain(
      "products.manage",
    );
    expect(
      await db.auditLog.count({
        where: { actorUserId: actor, resourceId: role.id },
      }),
    ).toBe(1);
    const staff = (await rbac.listRoles(tenant, {})).data.find(
      (r) => r.systemCode === "staff",
    )!;
    await expect(
      rbac.replaceRolePermissions(actor, tenant, staff.id, {
        permissionCodes: ["roles.assign"],
      }),
    ).rejects.toMatchObject(error("ROLE_MANAGEMENT_DENIED"));
  });
  it("enforces cross-Store isolation and rejects foreign role assignment", async () => {
    const id = await user(),
      a = await store(),
      b = await store(),
      membership = await member(id, a);
    await expect(
      rbac.requireStorePermission(id, a, "products.manage"),
    ).resolves.toBeUndefined();
    await expect(
      rbac.requireStorePermission(id, b, "products.manage"),
    ).rejects.toMatchObject(error("STORE_PERMISSION_DENIED"));
    const foreign = await db.storeRole.findUniqueOrThrow({
      where: { orgId_systemCode: { orgId: b, systemCode: "staff" } },
    });
    await expect(
      rbac.replaceUserRoles(id, a, membership.id, { roleIds: [foreign.id] }),
    ).rejects.toMatchObject(error("STORE_ROLE_TENANT_MISMATCH"));
    await expect(
      rbac.updateUserStatus(id, b, membership.id, { status: "SUSPENDED" }),
    ).rejects.toMatchObject(error("STORE_MEMBERSHIP_NOT_FOUND"));
  });
  it("gives Staff daily operations without profile, payments, users or role administration", async () => {
    const id = await user(),
      tenant = await store();
    await member(id, tenant);
    const resolved = await rbac.effectivePermissions(id, tenant);
    expect(resolved.permissions).toEqual(
      expect.arrayContaining([
        "products.manage",
        "kiosks.configure",
        "analytics.view",
      ]),
    );
    for (const code of [
      "stores.update",
      "users.deactivate",
      "roles.assign",
    ] as const)
      await expect(
        rbac.requireStorePermission(id, tenant, code),
      ).rejects.toMatchObject(error("STORE_PERMISSION_DENIED"));
    const access = await rbac.listRoles(tenant, { page: 1, pageSize: 25 });
    expect(access.data.map((r) => r.name).sort()).toEqual([
      "Staff",
      "Store Admin",
    ]);
  });
  it("revokes access immediately for inactive accounts, links, Stores and permission ceilings", async () => {
    const id = await user(),
      tenant = await store(),
      membership = await member(id, tenant);
    const permission = await db.permission.findUniqueOrThrow({
      where: { code: "products.manage" },
    });
    await db.storePermissionGrant.deleteMany({
      where: { storeTenantId: tenant, permissionId: permission.id },
    });
    expect(
      (await rbac.effectivePermissions(id, tenant)).permissions,
    ).not.toContain("products.manage");
    await db.organizationMembership.update({
      where: { id: membership.id },
      data: { status: "SUSPENDED" },
    });
    expect((await rbac.effectivePermissions(id, tenant)).permissions).toEqual(
      [],
    );
    await db.organizationMembership.update({
      where: { id: membership.id },
      data: { status: "ACTIVE" },
    });
    await db.user.update({ where: { id }, data: { status: "DISABLED" } });
    expect((await rbac.effectivePermissions(id, tenant)).permissions).toEqual(
      [],
    );
    await db.user.update({ where: { id }, data: { status: "ACTIVE" } });
    await db.organization.update({
      where: { id: tenant },
      data: { status: "SUSPENDED" },
    });
    expect((await rbac.effectivePermissions(id, tenant)).permissions).toEqual(
      [],
    );
  });
  it("protects fixed roles and initializes their permission maps idempotently", async () => {
    const id = await user(),
      tenant = await store();
    const staff = await db.storeRole.findUniqueOrThrow({
      where: { orgId_systemCode: { orgId: tenant, systemCode: "staff" } },
    });
    await expect(
      rbac.createRole(id, tenant, { name: "Manager" }),
    ).rejects.toMatchObject(error("FIXED_ROLES_ONLY"));
    await expect(
      rbac.updateRole(id, tenant, staff.id, { name: "Manager" }),
    ).rejects.toMatchObject(error("FIXED_ROLES_ONLY"));
    await expect(
      rbac.replaceRolePermissions(id, tenant, staff.id, {
        permissionCodes: ["users.deactivate"],
      }),
    ).rejects.toMatchObject(error("ROLE_MANAGEMENT_DENIED"));
    await expect(rbac.deleteRole(id, tenant, staff.id)).rejects.toMatchObject(
      error("STORE_SYSTEM_ROLE_PROTECTED"),
    );
    await Promise.all([
      rbac.ensureStoreRbac(tenant),
      rbac.ensureStoreRbac(tenant),
    ]);
    expect(await db.storeRole.count({ where: { orgId: tenant } })).toBe(2);
    expect(
      await db.permission.count({
        where: { code: { in: STORE_PERMISSION_REGISTRY.map((p) => p.code) } },
      }),
    ).toBe(STORE_PERMISSION_REGISTRY.length);
  });
  it("protects the final Store Admin from role removal and suspension", async () => {
    const id = await user(),
      tenant = await store(),
      membership = await member(id, tenant, "store-admin");
    await expect(
      rbac.updateUserStatus(id, tenant, membership.id, { status: "SUSPENDED" }),
    ).rejects.toMatchObject(error("STORE_SYSTEM_ROLE_PROTECTED"));
    await expect(
      rbac.replaceUserRoles(id, tenant, membership.id, { roleIds: [] }),
    ).rejects.toMatchObject(error("STORE_SYSTEM_ROLE_PROTECTED"));
    const replacement = await user();
    await member(replacement, tenant, "store-admin");
    await expect(
      rbac.updateUserStatus(replacement, tenant, membership.id, {
        status: "SUSPENDED",
      }),
    ).resolves.toMatchObject({ status: "SUSPENDED" });
  });
  it("keeps Store role authority separate from protected Platform authority", async () => {
    const id = await user(),
      tenant = await store();
    await member(id, tenant, "store-admin");
    expect((await rbac.effectivePermissions(id, tenant)).platformBypass).toBe(
      false,
    );
    const superId = await user();
    await db.platformRoleAssignment.create({
      data: { id: createSelfxId(), userId: superId, role: "SELFX_SUPER_ADMIN" },
    });
    expect(
      (await rbac.effectivePermissions(superId, tenant)).platformBypass,
    ).toBe(true);
    const platformAccess = await rbac.effectivePermissions(superId, tenant);
    expect(
      platformAccess.permissions.some(
        (code) => code.startsWith("kiosks.") || code === "products.manage",
      ),
    ).toBe(false);
    expect(platformAccess.resourcePermissions).toEqual([]);
    await expect(
      rbac.requireStoreResourcePermission(superId, tenant, "stores.view"),
    ).rejects.toMatchObject(error("STORE_PERMISSION_DENIED"));
    await expect(
      rbac.requireStorePermission(superId, tenant, "kiosks.pair"),
    ).rejects.toMatchObject(error("STORE_PERMISSION_DENIED"));
    await expect(
      rbac.requireStorePermission(superId, tenant, "products.manage"),
    ).rejects.toMatchObject(error("STORE_PERMISSION_DENIED"));
    await member(superId, tenant, "staff");
    await expect(
      rbac.requireStoreResourcePermission(superId, tenant, "products.manage"),
    ).resolves.toBeUndefined();
    await expect(
      rbac.requireStoreResourcePermission(superId, tenant, "kiosks.configure"),
    ).resolves.toBeUndefined();
    await expect(
      rbac.requireStoreResourcePermission(superId, tenant, "kiosks.pair"),
    ).rejects.toMatchObject(error("STORE_PERMISSION_DENIED"));
    const ownAccess = await rbac.effectivePermissions(superId, tenant);
    expect(ownAccess.resourcePermissions).toContain("products.manage");
    expect(ownAccess.resourcePermissions).not.toContain("kiosks.pair");
  });
  it("allows only actual Store Admins to manage payment accounts, even if Staff receive integration permissions", async () => {
    const tenant = await store(),
      admin = await user(),
      staff = await user(),
      platform = await user();
    await member(admin, tenant, "store-admin");
    const staffLink = await member(staff, tenant, "staff");
    for (const code of ["integrations.view", "integrations.manage"]) {
      const permission = await db.permission.findUniqueOrThrow({
        where: { code },
      });
      await db.storeRolePermission.create({
        data: {
          id: createSelfxId(),
          roleId: staffLink.roleId,
          permissionId: permission.id,
        },
      });
    }
    await db.platformRoleAssignment.create({
      data: {
        id: createSelfxId(),
        userId: platform,
        role: "SELFX_SUPER_ADMIN",
      },
    });
    await expect(
      rbac.requireStorePaymentPermission(admin, tenant, true),
    ).resolves.toBeUndefined();
    await expect(
      rbac.requireStorePaymentPermission(staff, tenant, false),
    ).resolves.toBeUndefined();
    await expect(
      rbac.requireStorePaymentPermission(staff, tenant, true),
    ).rejects.toMatchObject(error("STORE_PERMISSION_DENIED"));
    await expect(
      rbac.requireStorePaymentPermission(platform, tenant, true),
    ).rejects.toMatchObject(error("STORE_PERMISSION_DENIED"));
    await expect(
      rbac.requireStorePaymentPermission(platform, tenant, false),
    ).rejects.toMatchObject(error("STORE_PERMISSION_DENIED"));
    expect(
      (await rbac.effectivePermissions(platform, tenant)).paymentAccess,
    ).toEqual({ view: false, manage: false });
    await db.organizationMembership.updateMany({
      where: { orgId: tenant, userId: admin },
      data: { status: "SUSPENDED" },
    });
    await expect(
      rbac.requireStorePaymentPermission(admin, tenant, true),
    ).rejects.toThrow();
  });
});
