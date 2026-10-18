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
    ).rejects.toMatchObject(error("STORE_SYSTEM_ROLE_PROTECTED"));
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
});
