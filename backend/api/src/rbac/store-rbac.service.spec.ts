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
import {
  GlobalStoreRolesService,
  readGlobalStoreRoles,
} from "./global-store-roles.service.js";
import { AccessControlService } from "../platform/access-control.service.js";
import { RolesWorkspaceController } from "./roles-workspace.controller.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import { STORE_ADMIN_REQUIRED_PERMISSIONS } from "./role-management-policy.js";

const url = process.env.USERS_TEST_DATABASE_URL;
if (
  url &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test"))
)
  throw new Error("Disposable localhost test database required.");
describe.skipIf(!url)("Application-wide Store roles", () => {
  const db = new PrismaClient({
    datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
  });
  const rbac = new StoreRbacService(db as PrismaService);
  const global = new GlobalStoreRolesService(db as PrismaService);
  const access = new AccessControlService(db as PrismaService);
  const impersonation = new StoreImpersonationService(db as PrismaService);
  let users: string[], stores: string[];
  let baseline: Awaited<ReturnType<typeof readGlobalStoreRoles>>;
  beforeAll(() => db.$connect());
  beforeEach(async () => {
    users = [];
    stores = [];
    baseline = await readGlobalStoreRoles(db);
  });
  afterEach(async () => {
    for (const role of baseline) {
      await db.globalStoreRolePermission.deleteMany({
        where: { roleId: role.id },
      });
      if (role.permissions.length)
        await db.globalStoreRolePermission.createMany({
          data: role.permissions.map((p) => ({
            id: createSelfxId(),
            roleId: role.id,
            permissionId: p.permissionId,
          })),
        });
      await db.globalStoreRole.update({
        where: { id: role.id },
        data: { updatedAt: role.updatedAt },
      });
    }
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
    await db.platformUserAccessRole.deleteMany({
      where: { userId: { in: users } },
    });
    await db.platformRoleAssignment.deleteMany({
      where: { userId: { in: users } },
    });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });
  afterAll(() => db.$disconnect());
  async function user(superadmin = false) {
    const id = createSelfxId();
    users.push(id);
    await db.user.create({
      data: { id, email: `${id}@global-roles.test`, passwordHash: "test-only" },
    });
    if (superadmin)
      await db.platformRoleAssignment.create({
        data: { id: createSelfxId(), userId: id, role: "SELFX_SUPER_ADMIN" },
      });
    return id;
  }
  async function store() {
    const id = createSelfxId();
    stores.push(id);
    await db.organization.create({
      data: { id, name: "Global role test", slug: id, status: "ACTIVE" },
    });
    await rbac.ensureStoreRbac(id);
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
  async function save(actor: string, code: string, codes: string[]) {
    const role = (await readGlobalStoreRoles(db)).find(
      (r) => r.systemCode === code,
    )!;
    return global.replace(actor, code, {
      permissionCodes: codes,
      expectedUpdatedAt: role.updatedAt.toISOString(),
    });
  }
  function controller(actor: string, authSessionId?: string) {
    return new RolesWorkspaceController(
      {
        requireAccessUser: async () => ({ id: actor, authSessionId }),
      } as never,
      db as PrismaService,
      access,
      rbac,
      impersonation,
    );
  }
  const request = { headers: { authorization: "Bearer test" } } as never;
  const denied = { response: { error: { code: "ROLE_MANAGEMENT_DENIED" } } };

  it.each(["store-admin", "staff"])(
    "defaults %s to product management and preserves global revocation",
    async (roleCode) => {
      const definition = baseline.find((role) => role.systemCode === roleCode)!;
      expect(
        definition.permissions.map((entry) => entry.permission.code),
      ).toContain("products.manage");
      const actor = await user(true),
        a = await store(),
        b = await store(),
        operator = await user();
      await member(operator, a, roleCode);
      await member(operator, b, roleCode);
      for (const tenant of [a, b])
        await expect(
          rbac.requireStoreResourcePermission(
            operator,
            tenant,
            "products.manage",
          ),
        ).resolves.toBeUndefined();
      await save(
        actor,
        roleCode,
        definition.permissions
          .map((entry) => entry.permission.code)
          .filter((code) => code !== "products.manage"),
      );
      const future = await store();
      await member(operator, future, roleCode);
      const fresh = new StoreRbacService(db as PrismaService);
      for (const tenant of [a, b, future]) {
        await fresh.ensureStoreRbac(tenant);
        await expect(
          fresh.requireStoreResourcePermission(
            operator,
            tenant,
            "products.manage",
          ),
        ).rejects.toMatchObject({
          response: { error: { code: "STORE_PERMISSION_DENIED" } },
        });
        await expect(
          fresh.requireStoreResourcePermission(operator, tenant, "stores.view"),
        ).resolves.toBeUndefined();
      }
    },
  );

  it("retires stored Developer API grants from Store roles, runtime permissions and permission lists", async () => {
    const actor = await user(true),
      tenant = await store(),
      admin = await user();
    await member(admin, tenant, "store-admin");
    const permission = await db.permission.upsert({
      where: { code: "developer_api.view" },
      create: {
        id: createSelfxId(),
        code: "developer_api.view",
        module: "developer_api",
        action: "view",
        label: "Retired Store API access",
        applicability: "STORE",
      },
      update: {},
    });
    const role = (await readGlobalStoreRoles(db)).find(
      (r) => r.systemCode === "store-admin",
    )!;
    await db.globalStoreRolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: permission.id },
      },
      create: {
        id: createSelfxId(),
        roleId: role.id,
        permissionId: permission.id,
      },
      update: {},
    });
    const workspace = await global.workspace(actor);
    expect(
      workspace.permissions.some((p) => p.code.startsWith("developer_api.")),
    ).toBe(false);
    expect(
      workspace.roles
        .flatMap((r) => r.permissions)
        .some((p) => p.code.startsWith("developer_api.")),
    ).toBe(false);
    expect(
      (await rbac.effectivePermissions(admin, tenant, false)).permissions,
    ).not.toContain("developer_api.view");
    expect(
      (await access.listPermissions()).data.some((p) =>
        p.code.startsWith("developer_api."),
      ),
    ).toBe(false);
    await expect(
      save(actor, "store-admin", [
        ...STORE_ADMIN_REQUIRED_PERMISSIONS,
        "developer_api.view",
      ]),
    ).rejects.toMatchObject({
      response: { error: { code: "STORE_PERMISSION_INVALID" } },
    });
  });

  it("applies revocation and grant immediately to Staff in multiple Stores and future Stores", async () => {
    const actor = await user(true),
      a = await store(),
      b = await store(),
      staffA = await user(),
      staffB = await user();
    await member(staffA, a);
    await member(staffB, b);
    await save(actor, "staff", ["stores.view"]);
    for (const [id, tenant] of [
      [staffA, a],
      [staffB, b],
    ])
      expect(
        (await rbac.effectivePermissions(id!, tenant!, false)).permissions,
      ).toEqual(["stores.view"]);
    const c = await store(),
      staffC = await user();
    await member(staffC, c);
    expect(
      (await rbac.effectivePermissions(staffC, c, false)).permissions,
    ).toEqual(["stores.view"]);
    await save(actor, "staff", ["stores.view", "products.manage"]);
    const fresh = new StoreRbacService(db as PrismaService);
    for (const [id, tenant] of [
      [staffA, a],
      [staffB, b],
      [staffC, c],
    ])
      expect(
        (await fresh.effectivePermissions(id!, tenant!, false)).permissions,
      ).toContain("products.manage");
    expect(
      (await fresh.listRoles(c, {})).data
        .find((r) => r.systemCode === "staff")
        ?.permissions.map((p) => p.code),
    ).toEqual(["products.manage", "stores.view"]);
  });

  it("supports intentionally empty global maps without reseeding on reads or onboarding", async () => {
    const actor = await user(true),
      tenant = await store(),
      staff = await user();
    await member(staff, tenant);
    await save(actor, "staff", []);
    await rbac.ensureStoreRbac(tenant);
    await store();
    expect(
      (await rbac.effectivePermissions(staff, tenant, false)).permissions,
    ).toEqual([]);
    expect(
      (await global.workspace(actor)).roles.find(
        (r) => r.systemCode === "staff",
      )?.permissions,
    ).toEqual([]);
  });

  it("updates Store Admin globally without changing Staff or platform authority", async () => {
    const actor = await user(true),
      a = await store(),
      b = await store(),
      admin = await user();
    await member(admin, a, "store-admin");
    await member(admin, b, "store-admin");
    await save(actor, "store-admin", STORE_ADMIN_REQUIRED_PERMISSIONS);
    for (const tenant of [a, b]) {
      const resolved = await rbac.effectivePermissions(admin, tenant, false);
      expect(resolved.permissions).toEqual(
        [...STORE_ADMIN_REQUIRED_PERMISSIONS].sort(),
      );
      expect(resolved.platformBypass).toBe(false);
    }
    expect(
      (await readGlobalStoreRoles(db)).find((r) => r.systemCode === "staff")
        ?.permissions,
    ).toHaveLength(
      baseline.find((r) => r.systemCode === "staff")!.permissions.length,
    );
  });

  it("rejects Store Admin/Staff/global-viewer mutation through new and legacy routes", async () => {
    const tenant = await store(),
      admin = await user(),
      staff = await user();
    const adminLink = await member(admin, tenant, "store-admin");
    await member(staff, tenant);
    for (const actor of [admin, staff]) {
      await expect(save(actor, "staff", [])).rejects.toMatchObject(denied);
      await expect(
        rbac.replaceRolePermissions(actor, tenant, adminLink.roleId, {
          permissionCodes: [],
        }),
      ).rejects.toMatchObject(denied);
      await expect(
        access.replaceStorePermissionGrants(actor, tenant, {
          permissionCodes: [],
        }),
      ).rejects.toMatchObject(denied);
    }
  });

  it("allows only explicit Platform Store role management and keeps viewers read-only", async () => {
    const superadmin = await user(true),
      actor = await user();
    const platformRole = (await access.listPlatformRoles()).data.find(
      (r) => r.systemCode === "platform-support-admin",
    )!;
    const previous = platformRole.permissions.map((p) => p.code);
    try {
      await access.replacePlatformRolePermissions(superadmin, platformRole.id, {
        permissionCodes: ["STORE_ROLES_VIEW"],
      });
      await access.replaceUserPlatformRoles(superadmin, actor, {
        roleIds: [platformRole.id],
      });
      expect((await global.workspace(actor)).canEdit).toBe(false);
      await expect(save(actor, "staff", [])).rejects.toMatchObject(denied);
      await access.replacePlatformRolePermissions(superadmin, platformRole.id, {
        permissionCodes: ["STORE_ROLES_MANAGE"],
      });
      expect((await global.workspace(actor)).canEdit).toBe(true);
      await expect(
        save(actor, "staff", ["users.update", "roles.assign"]),
      ).resolves.toMatchObject({
        canEdit: true,
      });
    } finally {
      await access.replacePlatformRolePermissions(superadmin, platformRole.id, {
        permissionCodes: previous,
      });
    }
  }, 20000);

  it("allows Platform-managed Staff administration grants across Stores and preserves revocation", async () => {
    const actor = await user(true),
      operator = await user(),
      a = await store(),
      b = await store();
    await member(operator, a);
    await member(operator, b);
    const codes = [
      "stores.view",
      "users.update",
      "roles.assign",
      "integrations.manage",
    ];
    const workspace = await save(actor, "staff", codes);
    expect(workspace.staffAssignableCodes).toEqual(
      workspace.permissions.map((p) => p.code),
    );
    for (const tenant of [a, b]) {
      expect(
        (await rbac.effectivePermissions(operator, tenant, false)).permissions,
      ).toEqual([...codes].sort());
    }
    // Store roles never gain authority to edit the shared maps themselves.
    await expect(save(operator, "staff", codes)).rejects.toMatchObject(denied);
    await save(actor, "staff", ["stores.view"]);
    const future = await store();
    await member(operator, future);
    for (const tenant of [a, b, future]) {
      expect(
        (await rbac.effectivePermissions(operator, tenant, false)).permissions,
      ).toEqual(["stores.view"]);
    }
  });

  it("rejects platform codes, unknown roles, and removal of essential Admin permissions", async () => {
    const actor = await user(true);
    await expect(
      save(actor, "staff", ["PERMISSIONS_MANAGE"]),
    ).rejects.toMatchObject({
      response: { error: { code: "STORE_PERMISSION_INVALID" } },
    });
    await expect(save(actor, "store-admin", [])).rejects.toMatchObject(denied);
    await expect(
      global.replace(actor, "protected-superadmin", { permissionCodes: [] }),
    ).rejects.toMatchObject({
      response: { error: { code: "GLOBAL_STORE_ROLE_NOT_FOUND" } },
    });
  });

  it("requires the current version and permits exactly one concurrent save", async () => {
    const actor = await user(true);
    const role = (await readGlobalStoreRoles(db)).find(
      (r) => r.systemCode === "staff",
    )!;
    await expect(
      global.replace(actor, "staff", { permissionCodes: [] }),
    ).rejects.toMatchObject({
      response: { error: { code: "ROLE_VERSION_REQUIRED" } },
    });
    const results = await Promise.allSettled(
      [[], ["stores.view"]].map((permissionCodes) =>
        global.replace(actor, "staff", {
          permissionCodes,
          expectedUpdatedAt: role.updatedAt.toISOString(),
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { response: { error: { code: "ROLE_CHANGED" } } },
    });
  });

  it("audits one global change with actor, before/after codes, and no tenant", async () => {
    const actor = await user(true);
    await save(actor, "staff", []);
    const audit = await db.auditLog.findFirstOrThrow({
      where: {
        actorUserId: actor,
        action: "GLOBAL_STORE_ROLE_PERMISSIONS_UPDATED",
      },
    });
    expect(audit.organizationId).toBeNull();
    expect(audit.metadata).toMatchObject({
      scope: "ALL_STORES",
      system_code: "staff",
      permission_codes: [],
      previous_permission_codes: expect.arrayContaining(["products.manage"]),
    });
    expect(
      await db.auditLog.count({
        where: { actorUserId: actor, action: audit.action },
      }),
    ).toBe(1);
  });

  it("returns all shared definitions without Store selection or leaking counts to Store viewers", async () => {
    const actor = await user(true),
      tenant = await store(),
      admin = await user();
    await member(admin, tenant, "store-admin");
    const platform = await controller(actor).context(request);
    expect(platform.storeRoles.roles.map((r) => r.systemCode).sort()).toEqual([
      "staff",
      "store-admin",
    ]);
    expect(platform).not.toHaveProperty("stores");
    expect(platform.storeRoles.canEdit).toBe(true);
    const merchant = await controller(admin).context(request);
    expect(merchant.canViewPlatform).toBe(false);
    expect(merchant.storeRoles.canEdit).toBe(false);
    expect(
      merchant.storeRoles.roles.every((r) => r.assignedUsersCount === null),
    ).toBe(true);
  });

  it("counts a multi-Store user once for the shared role", async () => {
    const actor = await user(true),
      a = await store(),
      b = await store(),
      staff = await user();
    await member(staff, a);
    await member(staff, b);
    expect(
      (await global.workspace(actor)).roles.find(
        (r) => r.systemCode === "staff",
      )?.assignedUsersCount,
    ).toBe(1);
  });

  it("blocks global reads and changes during impersonation, allowing only target-Store compatibility reads", async () => {
    const actor = await user(true),
      tenant = await store(),
      other = await store();
    const authSessionId = createSelfxId();
    await db.userSession.create({
      data: {
        id: authSessionId,
        userId: actor,
        refreshTokenHash: "test-refresh-token-hash",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await impersonation.startSession(actor, authSessionId, tenant);
    await expect(
      controller(actor, authSessionId).context(request),
    ).rejects.toMatchObject(denied);
    await expect(save(actor, "staff", [])).rejects.toMatchObject(denied);
    expect(
      (await controller(actor, authSessionId).store(request, tenant)).policy
        .canEditStaff,
    ).toBe(false);
    await expect(
      controller(actor, authSessionId).store(request, other),
    ).rejects.toMatchObject({
      response: { error: { code: "IMPERSONATION_STORE_MISMATCH" } },
    });
  });

  it("preserves cross-Store isolation and rejects assigning another Store's role IDs", async () => {
    const id = await user(),
      a = await store(),
      b = await store(),
      link = await member(id, a);
    await expect(
      rbac.requireStoreResourcePermission(id, a, "products.manage"),
    ).resolves.toBeUndefined();
    await expect(
      rbac.requireStoreResourcePermission(id, b, "products.manage"),
    ).rejects.toMatchObject({
      response: { error: { code: "STORE_PERMISSION_DENIED" } },
    });
    const foreign = await db.storeRole.findUniqueOrThrow({
      where: { orgId_systemCode: { orgId: b, systemCode: "staff" } },
    });
    await expect(
      rbac.replaceUserRoles(id, a, link.id, { roleIds: [foreign.id] }),
    ).rejects.toMatchObject({
      response: { error: { code: "STORE_ROLE_TENANT_MISMATCH" } },
    });
  });

  it("keeps inactive/deleted users, links, roles and suspended Stores denied", async () => {
    const id = await user(),
      tenant = await store(),
      link = await member(id, tenant);
    await db.organizationMembership.update({
      where: { id: link.id },
      data: { deletedAt: new Date(), status: "REVOKED" },
    });
    expect(
      (await rbac.effectivePermissions(id, tenant, false)).permissions,
    ).toEqual([]);
    await db.organizationMembership.update({
      where: { id: link.id },
      data: { deletedAt: null, status: "SUSPENDED" },
    });
    expect(
      (await rbac.effectivePermissions(id, tenant, false)).permissions,
    ).toEqual([]);
    await db.organizationMembership.update({
      where: { id: link.id },
      data: { status: "ACTIVE" },
    });
    await db.storeRole.update({
      where: { id: link.roleId },
      data: { isActive: false },
    });
    expect(
      (await rbac.effectivePermissions(id, tenant, false)).permissions,
    ).toEqual([]);
    await db.storeRole.update({
      where: { id: link.roleId },
      data: { isActive: true },
    });
    await db.organization.update({
      where: { id: tenant },
      data: { status: "SUSPENDED" },
    });
    expect(
      (await rbac.effectivePermissions(id, tenant, false)).permissions,
    ).toEqual([]);
  });

  it("does not grant operational Store access to Platform users without membership", async () => {
    const actor = await user(true),
      tenant = await store();
    const resolved = await rbac.effectivePermissions(actor, tenant);
    expect(resolved.resourcePermissions).toEqual([]);
    expect(resolved.paymentAccess).toEqual({ view: false, manage: false });
    await expect(
      rbac.requireStoreResourcePermission(actor, tenant, "products.manage"),
    ).rejects.toMatchObject({
      response: { error: { code: "STORE_PERMISSION_DENIED" } },
    });
  });

  it("preserves final active Store Admin membership protections", async () => {
    const id = await user(),
      tenant = await store(),
      link = await member(id, tenant, "store-admin");
    await expect(
      rbac.replaceUserRoles(id, tenant, link.id, { roleIds: [] }),
    ).rejects.toMatchObject({
      response: { error: { code: "STORE_SYSTEM_ROLE_PROTECTED" } },
    });
    await expect(
      rbac.updateUserStatus(id, tenant, link.id, { status: "SUSPENDED" }),
    ).rejects.toMatchObject({
      response: { error: { code: "STORE_SYSTEM_ROLE_PROTECTED" } },
    });
  });

  it("ignores legacy per-Store maps and grants so global permission changes apply consistently", async () => {
    const actor = await user(true),
      tenant = await store(),
      staff = await user(),
      link = await member(staff, tenant);
    await db.storeRolePermission.deleteMany({ where: { roleId: link.roleId } });
    await db.storePermissionGrant.deleteMany({
      where: { storeTenantId: tenant },
    });
    await save(actor, "staff", ["products.manage"]);
    expect(
      (await rbac.effectivePermissions(staff, tenant, false)).permissions,
    ).toEqual(["products.manage"]);
    await expect(
      access.replaceStorePermissionGrants(actor, tenant, {
        permissionCodes: [],
      }),
    ).rejects.toMatchObject(denied);
  });
});
