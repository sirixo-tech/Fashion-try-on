import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { PasswordService } from "../auth/password.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { UsersService } from "./users.service.js";
import { type UpdateUserDto } from "./dto/users.dto.js";

const url = process.env.USERS_TEST_DATABASE_URL;
if (
  url &&
  (!["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test"))
)
  throw new Error("Disposable localhost test database required.");
describe.skipIf(!url)("Users — real PostgreSQL", () => {
  const db = new PrismaClient({
    datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
  });
  const passwords = new PasswordService();
  const rbac = new StoreRbacService(db as PrismaService);
  const service = new UsersService(db as PrismaService, passwords, rbac);
  const ids: string[] = [],
    storeIds: string[] = [],
    roleIds: string[] = [],
    planIds: string[] = [];
  let admin: string,
    user: string,
    other: string,
    store: string,
    archived: string,
    second: string,
    storeRole: string,
    otherRole: string,
    platformRole: string;
  let hash: string;
  async function cleanup() {
    await db.productStockSettings.deleteMany({
      where: { organizationId: { in: storeIds } },
    });
    await db.product.deleteMany({
      where: { organizationId: { in: storeIds } },
    });
    await db.productCategory.deleteMany({
      where: { organizationId: { in: storeIds } },
    });
    await db.storeSubscription.deleteMany({
      where: { organizationId: { in: storeIds } },
    });
    await db.pricingPlan.deleteMany({ where: { id: { in: planIds } } });
    await db.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
    await db.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
    await db.userSession.deleteMany({ where: { userId: { in: ids } } });
    await db.platformUserAccessRole.deleteMany({
      where: { userId: { in: ids } },
    });
    await db.platformRoleAssignment.deleteMany({
      where: { userId: { in: ids } },
    });
    await db.platformAccessRole.deleteMany({ where: { id: { in: roleIds } } });
    await db.storeMembershipRole.deleteMany({
      where: { orgId: { in: storeIds } },
    });
    await db.membershipStoreScope.deleteMany({
      where: { membership: { orgId: { in: storeIds } } },
    });
    await db.organizationMembership.deleteMany({
      where: { orgId: { in: storeIds } },
    });
    await db.storeRolePermission.deleteMany({
      where: { role: { orgId: { in: storeIds } } },
    });
    await db.storeRole.deleteMany({ where: { orgId: { in: storeIds } } });
    await db.storePermissionGrant.deleteMany({
      where: { storeTenantId: { in: storeIds } },
    });
    await db.organization.deleteMany({ where: { id: { in: storeIds } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    ids.length = storeIds.length = roleIds.length = planIds.length = 0;
  }
  async function input(
    overrides: Partial<UpdateUserDto> = {},
  ): Promise<UpdateUserDto> {
    const current = await service.get(user);
    return {
      version: current.version,
      displayName: current.displayName!,
      email: current.email,
      status: current.status,
      memberships: [],
      ...overrides,
    };
  }
  async function owner(userId = user, orgId = store) {
    return db.organizationMembership.create({
      data: {
        id: createSelfxId(),
        userId,
        orgId,
        role: "ORGANIZATION_OWNER",
        storeScopeMode: "ALL_STORES",
        status: "ACTIVE",
      },
    });
  }
  const code = (value: string) => ({ response: { error: { code: value } } });
  beforeAll(async () => {
    await db.$connect();
    hash = await passwords.hashPassword("Original password 123!");
  });
  beforeEach(async () => {
    await cleanup();
    [admin, user, other] = [createSelfxId(), createSelfxId(), createSelfxId()];
    ids.push(admin, user, other);
    await db.user.createMany({
      data: ids.map((id, i) => ({
        id,
        email: `users-${i}-${id}@example.invalid`,
        displayName: ["Super", "Avinash", "Other"][i],
        passwordHash: hash,
      })),
    });
    await db.platformRoleAssignment.create({
      data: { id: createSelfxId(), userId: admin, role: "SELFX_SUPER_ADMIN" },
    });
    [store, archived, second] = [
      createSelfxId(),
      createSelfxId(),
      createSelfxId(),
    ];
    storeIds.push(store, archived, second);
    await db.organization.createMany({
      data: storeIds.map((id, i) => ({
        id,
        name: ["Avinash stores", "Archived Store", "Other Store"][i]!,
        slug: `users-test-${id}`,
        status: i === 1 ? "ARCHIVED" : "ACTIVE",
      })),
    });
    await rbac.ensureStoreRbac(store);
    await rbac.ensureStoreRbac(second);
    storeRole = (
      await db.storeRole.findUniqueOrThrow({
        where: {
          orgId_systemCode: { orgId: store, systemCode: "store-admin" },
        },
      })
    ).id;
    otherRole = (
      await db.storeRole.findUniqueOrThrow({
        where: { orgId_systemCode: { orgId: second, systemCode: "staff" } },
      })
    ).id;
    const permission = await db.permission.findUniqueOrThrow({
      where: { code: "stores.view" },
    });
    await db.storePermissionGrant.create({
      data: {
        id: createSelfxId(),
        storeTenantId: store,
        permissionId: permission.id,
      },
    });
    platformRole = (
      await db.platformAccessRole.findUniqueOrThrow({
        where: { systemCode: "platform-support-admin" },
      })
    ).id;
  }, 20000);
  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });
  it("lists searchable, paginated users with archived Store membership and no secrets", async () => {
    await owner(user, archived);
    const result = await service.list({
      page: 1,
      pageSize: 1,
      search: "Avinash",
      storeId: archived,
    });
    expect(result.pagination.total).toBe(1);
    expect(result.data[0]!.memberships[0]).toMatchObject({
      storeStatus: "ARCHIVED",
      membershipRole: "ORGANIZATION_OWNER",
    });
    expect(JSON.stringify(result)).not.toContain("passwordHash");
    expect(JSON.stringify(result)).not.toContain(hash);
  });
  it("edits name, normalized login email and password, invalidating sessions and reset links", async () => {
    await db.userSession.create({
      data: {
        id: createSelfxId(),
        userId: user,
        refreshTokenHash: "old-refresh-hash",
        expiresAt: new Date(Date.now() + 100000),
      },
    });
    await db.passwordResetToken.create({
      data: {
        id: createSelfxId(),
        userId: user,
        tokenHash: "a".repeat(64),
        credentialsVersion: 0,
        expiresAt: new Date(Date.now() + 100000),
      },
    });
    const result = await service.update(
      admin,
      user,
      await input({
        displayName: "New name",
        email: "NEW-LOGIN@example.invalid",
        newPassword: "Replacement password 123!",
      }),
    );
    expect(result.email).toBe("new-login@example.invalid");
    const stored = await db.user.findUniqueOrThrow({ where: { id: user } });
    expect(stored.credentialsVersion).toBe(1);
    expect(
      await passwords.verifyPassword(
        stored.passwordHash,
        "Replacement password 123!",
      ),
    ).toBe(true);
    expect(
      (await db.userSession.findFirstOrThrow({ where: { userId: user } }))
        .revokedAt,
    ).not.toBeNull();
    expect(
      (
        await db.passwordResetToken.findFirstOrThrow({
          where: { userId: user },
        })
      ).usedAt,
    ).not.toBeNull();
    const audit = await db.auditLog.findFirstOrThrow({
      where: { resourceId: user, action: "USER_ACCOUNT_UPDATED" },
    });
    expect(JSON.stringify(audit)).not.toContain("Replacement password");
  });
  it("preserves the password and session version when optional password is blank", async () => {
    await service.update(
      admin,
      user,
      await input({ displayName: "Renamed", newPassword: "" }),
    );
    expect(
      await db.user.findUnique({
        where: { id: user },
        select: { passwordHash: true, credentialsVersion: true },
      }),
    ).toEqual({ passwordHash: hash, credentialsVersion: 0 });
  });
  it("rejects duplicate login email and rolls back membership changes", async () => {
    const email = (await service.get(other)).email;
    await expect(
      service.update(
        admin,
        user,
        await input({
          email,
          memberships: [
            { storeId: store, status: "ACTIVE", roleIds: [storeRole] },
          ],
        }),
      ),
    ).rejects.toMatchObject(code("USER_EMAIL_CONFLICT"));
    expect(
      await db.organizationMembership.count({ where: { userId: user } }),
    ).toBe(0);
  });
  it("rejects stale versions without overwriting a newer edit", async () => {
    const old = await input();
    await service.update(admin, user, { ...old, displayName: "First save" });
    await expect(
      service.update(admin, user, { ...old, displayName: "Stale save" }),
    ).rejects.toMatchObject(code("USER_EDIT_CONFLICT"));
    expect((await service.get(user)).displayName).toBe("First save");
  });
  it("does not allow Store users or inactive admins to edit accounts", async () => {
    await expect(
      service.update(other, user, await input()),
    ).rejects.toMatchObject(code("PLATFORM_PERMISSION_DENIED"));
    await db.user.update({
      where: { id: admin },
      data: { status: "DISABLED" },
    });
    await expect(
      service.update(admin, user, await input()),
    ).rejects.toMatchObject(code("PLATFORM_PERMISSION_DENIED"));
  });
  it("protects Superadmin accounts even when called directly", async () => {
    const current = await service.get(admin);
    await expect(
      service.update(admin, admin, {
        version: current.version,
        displayName: "Changed",
        email: current.email,
        status: "DISABLED",
        memberships: [],
      }),
    ).rejects.toMatchObject(code("SELFX_SUPERADMIN_PROTECTED"));
  });
  it("links multiple Stores without altering an archived owner membership", async () => {
    await owner(user, archived);
    const result = await service.update(
      admin,
      user,
      await input({
        memberships: [
          { storeId: store, status: "ACTIVE", roleIds: [storeRole] },
          { storeId: second, status: "ACTIVE", roleIds: [otherRole] },
        ],
      }),
    );
    expect(result.memberships).toHaveLength(3);
    expect(
      result.memberships.find((m) => m.storeId === archived),
    ).toMatchObject({ membershipRole: "ORGANIZATION_OWNER", status: "ACTIVE" });
    expect(
      result.memberships
        .find((m) => m.storeId === store)
        ?.roles.map((r) => r.id),
    ).toEqual([storeRole]);
  });
  it("rejects roles from a different Store atomically", async () => {
    await expect(
      service.update(
        admin,
        user,
        await input({
          displayName: "Invalid",
          memberships: [
            { storeId: store, status: "ACTIVE", roleIds: [otherRole] },
          ],
        }),
      ),
    ).rejects.toMatchObject(code("STORE_ROLE_TENANT_MISMATCH"));
    expect((await service.get(user)).displayName).toBe("Avinash");
  });
  it("rejects tampered membership IDs", async () => {
    const member = await db.organizationMembership.create({
      data: {
        id: createSelfxId(),
        userId: other,
        orgId: store,
        role: "STORE_STAFF",
      },
    });
    await expect(
      service.update(
        admin,
        user,
        await input({
          memberships: [
            {
              storeId: store,
              membershipId: member.id,
              updatedAt: member.updatedAt.toISOString(),
              status: "ACTIVE",
              roleIds: [storeRole],
            },
          ],
        }),
      ),
    ).rejects.toMatchObject(code("STORE_MEMBERSHIP_CONFLICT"));
  });
  it("updates and revokes a normal membership while preserving its scope", async () => {
    const staffRole = await db.storeRole.findUniqueOrThrow({
      where: { orgId_systemCode: { orgId: store, systemCode: "staff" } },
    });
    await service.update(
      admin,
      user,
      await input({
        memberships: [
          { storeId: store, status: "ACTIVE", roleIds: [staffRole.id] },
        ],
      }),
    );
    const current = (await service.get(user)).memberships[0]!;
    const result = await service.update(
      admin,
      user,
      await input({
        memberships: [
          {
            storeId: store,
            membershipId: current.membershipId,
            updatedAt: current.updatedAt,
            status: "REVOKED",
            roleIds: [staffRole.id],
          },
        ],
      }),
    );
    expect(result.memberships[0]).toMatchObject({
      status: "REVOKED",
      storeScopeMode: current.storeScopeMode,
    });
  });
  it("protects final active owners from account disabling and ordinary membership edits", async () => {
    const member = await owner();
    await expect(
      service.update(admin, user, await input({ status: "DISABLED" })),
    ).rejects.toMatchObject(code("STORE_FINAL_OWNER_PROTECTED"));
    await expect(
      service.update(
        admin,
        user,
        await input({
          memberships: [
            {
              storeId: store,
              membershipId: member.id,
              updatedAt: member.updatedAt.toISOString(),
              status: "SUSPENDED",
              roleIds: [storeRole],
            },
          ],
        }),
      ),
    ).rejects.toMatchObject(code("STORE_OWNER_PROTECTED"));
  });
  it("assigns the first owner with confirmation and retains existing memberships and ceiling", async () => {
    await owner(user, archived);
    const grantsBefore = await db.storePermissionGrant.count({
      where: { storeTenantId: store },
    });
    const result = await service.assignFirstOwner(admin, user, {
      version: (await service.get(user)).version,
      storeId: store,
      confirmStoreName: "Avinash stores",
    });
    expect(result.memberships.find((m) => m.storeId === store)).toMatchObject({
      membershipRole: "ORGANIZATION_OWNER",
      storeScopeMode: "ALL_STORES",
      status: "ACTIVE",
    });
    expect(
      result.memberships
        .find((m) => m.storeId === store)
        ?.roles.some((r) => r.id === storeRole),
    ).toBe(true);
    expect(result.memberships).toHaveLength(2);
    expect(
      await db.storePermissionGrant.count({ where: { storeTenantId: store } }),
    ).toBe(grantsBefore);
    expect(
      await db.auditLog.count({
        where: { action: "STORE_FIRST_OWNER_ASSIGNED", actorUserId: admin },
      }),
    ).toBe(1);
  });
  it("rejects ownership transfer and wrong Store confirmation", async () => {
    const version = (await service.get(user)).version;
    await expect(
      service.assignFirstOwner(admin, user, {
        version,
        storeId: store,
        confirmStoreName: "wrong",
      }),
    ).rejects.toMatchObject(code("STORE_OWNER_CONFIRMATION_REQUIRED"));
    await owner(other);
    await expect(
      service.assignFirstOwner(admin, user, {
        version,
        storeId: store,
        confirmStoreName: "Avinash stores",
      }),
    ).rejects.toMatchObject(code("STORE_ALREADY_HAS_OWNER"));
  });
  it("allows only one winner when assigning first owners concurrently", async () => {
    const outcomes = await Promise.allSettled(
      [user, other].map(async (id) =>
        service.assignFirstOwner(admin, id, {
          version: (await service.get(id)).version,
          storeId: store,
          confirmStoreName: "Avinash stores",
        }),
      ),
    );
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.organizationMembership.count({
        where: { orgId: store, role: "ORGANIZATION_OWNER", status: "ACTIVE" },
      }),
    ).toBe(1);
  });
  it("assigns dynamic Platform roles without modifying bootstrap roles", async () => {
    const result = await service.update(
      admin,
      user,
      await input({ platformRoleIds: [platformRole] }),
    );
    expect(result.platformRoles.map((r) => r.id)).toEqual([platformRole]);
    expect(result.staticPlatformRoles).toEqual([]);
    expect(
      (
        await service.list({ page: 1, pageSize: 25, access: "platform" })
      ).data.some((u) => u.id === user),
    ).toBe(true);
    expect(
      (
        await service.list({ page: 1, pageSize: 25, role: platformRole })
      ).data.map((u) => u.id),
    ).toEqual([user]);
  });
  it("keeps an active owner when two owner accounts are disabled concurrently", async () => {
    await owner(user);
    await owner(other);
    const changes = await Promise.all(
      [user, other].map(async (id) => ({
        id,
        value: {
          version: (await service.get(id)).version,
          displayName: "Owner",
          email: (await service.get(id)).email,
          status: "DISABLED" as const,
          memberships: [],
        },
      })),
    );
    const outcomes = await Promise.allSettled(
      changes.map((change) => service.update(admin, change.id, change.value)),
    );
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.organizationMembership.count({
        where: {
          orgId: store,
          role: "ORGANIZATION_OWNER",
          status: "ACTIVE",
          user: { status: "ACTIVE" },
        },
      }),
    ).toBe(1);
  });
  it("does not assign first ownership without an existing Store viewing grant", async () => {
    await db.storePermissionGrant.deleteMany({
      where: { storeTenantId: store },
    });
    await expect(
      service.assignFirstOwner(admin, user, {
        version: (await service.get(user)).version,
        storeId: store,
        confirmStoreName: "Avinash stores",
      }),
    ).rejects.toMatchObject(code("STORE_PERMISSION_NOT_GRANTED"));
    expect(
      await db.organizationMembership.count({
        where: { orgId: store, userId: user },
      }),
    ).toBe(0);
  });
  it("does not count a disabled owner as a replacement in existing Store membership controls", async () => {
    const remaining = await owner(user);
    await owner(other);
    const disabled = await service.get(other);
    await service.update(admin, other, {
      version: disabled.version,
      displayName: disabled.displayName!,
      email: disabled.email,
      status: "DISABLED",
      memberships: [],
    });
    await expect(
      rbac.updateUserStatus(admin, store, remaining.id, {
        status: "SUSPENDED",
      }),
    ).rejects.toMatchObject(code("STORE_SYSTEM_ROLE_PROTECTED"));
    expect(
      (
        await db.organizationMembership.findUniqueOrThrow({
          where: { id: remaining.id },
        })
      ).status,
    ).toBe("ACTIVE");
  });
  it("edits a Store Admin email preserving null profile, credentials, Store links and contact details", async () => {
    await owner();
    await owner(user, second);
    await db.user.update({ where: { id: user }, data: { displayName: null } });
    await db.organization.update({
      where: { id: store },
      data: {
        settings: { storeProfile: { contactEmail: "contact@example.invalid" } },
      },
    });
    await db.userSession.create({
      data: {
        id: createSelfxId(),
        userId: user,
        refreshTokenHash: "email-test-session",
        expiresAt: new Date(Date.now() + 100000),
      },
    });
    await db.passwordResetToken.create({
      data: {
        id: createSelfxId(),
        userId: user,
        tokenHash: "a".repeat(64),
        credentialsVersion: 0,
        expiresAt: new Date(Date.now() + 100000),
      },
    });
    const before = await service.get(user);
    const changed = await service.updateStoreAdminEmail(admin, user, {
      version: before.version,
      storeId: store,
      email: "new-admin@example.invalid",
    });
    expect(changed).toMatchObject({
      email: "new-admin@example.invalid",
      displayName: null,
      status: "ACTIVE",
      memberships: before.memberships,
      platformRoles: before.platformRoles,
    });
    expect(await db.user.findUnique({ where: { id: user } })).toMatchObject({
      passwordHash: hash,
      credentialsVersion: 1,
    });
    expect(
      (await db.userSession.findFirstOrThrow({ where: { userId: user } }))
        .revokedAt,
    ).toBeTruthy();
    expect(
      (
        await db.passwordResetToken.findFirstOrThrow({
          where: { userId: user },
        })
      ).usedAt,
    ).toBeTruthy();
    expect(
      (await db.organization.findUniqueOrThrow({ where: { id: store } }))
        .settings,
    ).toMatchObject({
      storeProfile: { contactEmail: "contact@example.invalid" },
    });
    expect(
      (
        await db.auditLog.findFirstOrThrow({
          where: { actorUserId: admin, action: "USER_ACCOUNT_UPDATED" },
        })
      ).metadata,
    ).toMatchObject({
      source_store_id: store,
      change: "STORE_ADMIN_LOGIN_EMAIL",
      sessions_revoked: true,
    });
  });
  it("rejects admin email edits for unlinked users, Staff, duplicate emails and stale snapshots", async () => {
    let before = await service.get(user);
    await expect(
      service.updateStoreAdminEmail(admin, user, {
        version: before.version,
        storeId: store,
        email: "unlinked@example.invalid",
      }),
    ).rejects.toMatchObject(code("STORE_ADMIN_NOT_LINKED"));
    const staff = await db.storeRole.findUniqueOrThrow({
      where: { orgId_systemCode: { orgId: store, systemCode: "staff" } },
    });
    await service.update(
      admin,
      user,
      await input({
        memberships: [
          { storeId: store, status: "ACTIVE", roleIds: [staff.id] },
        ],
      }),
    );
    before = await service.get(user);
    await expect(
      service.updateStoreAdminEmail(admin, user, {
        version: before.version,
        storeId: store,
        email: "staff@example.invalid",
      }),
    ).rejects.toMatchObject(code("STORE_ADMIN_NOT_LINKED"));
    await service.assignStoreAdmin(admin, user, {
      version: before.version,
      storeId: store,
      confirmStoreName: "Avinash stores",
    });
    before = await service.get(user);
    await expect(
      service.updateStoreAdminEmail(admin, user, {
        version: before.version,
        storeId: store,
        email: (await service.get(other)).email,
      }),
    ).rejects.toMatchObject(code("USER_EMAIL_CONFLICT"));
    await db.user.update({
      where: { id: user },
      data: { displayName: "Changed elsewhere" },
    });
    await expect(
      service.updateStoreAdminEmail(admin, user, {
        version: before.version,
        storeId: store,
        email: "stale@example.invalid",
      }),
    ).rejects.toMatchObject(code("USER_EDIT_CONFLICT"));
  });
  it("adds another Store Admin preserving ownership, other access, credentials and permission ceilings", async () => {
    const originalOwner = await owner(other);
    await owner(user, second);
    const before = await service.get(user);
    expect(
      (
        await service.list({
          page: 1,
          pageSize: 25,
          storeId: store,
          role: "store-admin",
        })
      ).data.map((account) => account.id),
    ).toEqual([other]);
    const result = await service.assignStoreAdmin(admin, user, {
      version: before.version,
      storeId: store,
      confirmStoreName: "Avinash stores",
    });
    expect(result.memberships.find((m) => m.storeId === store)).toMatchObject({
      isStoreAdmin: true,
      membershipRole: "ORGANIZATION_ADMIN",
      status: "ACTIVE",
      storeScopeMode: "ALL_STORES",
    });
    expect(result.memberships.find((m) => m.storeId === second)).toEqual(
      before.memberships[0],
    );
    expect(
      (
        await service.list({
          page: 1,
          pageSize: 25,
          storeId: store,
          role: "store-admin",
        })
      ).data
        .map((account) => account.id)
        .sort(),
    ).toEqual([other, user].sort());
    expect(
      (
        await db.organizationMembership.findUniqueOrThrow({
          where: { id: originalOwner.id },
        })
      ).role,
    ).toBe("ORGANIZATION_OWNER");
    expect(await db.user.findUnique({ where: { id: user } })).toMatchObject({
      email: before.email,
      passwordHash: hash,
      credentialsVersion: 0,
    });
    expect(
      await db.storePermissionGrant.count({ where: { storeTenantId: store } }),
    ).toBe(1);
    expect(
      (
        await db.auditLog.findFirstOrThrow({
          where: { action: "STORE_ADMIN_ASSIGNED", actorUserId: admin },
        })
      ).metadata,
    ).toMatchObject({ user_id: user, first_admin: false });
    await expect(
      service.assignStoreAdmin(admin, user, {
        version: result.version,
        storeId: store,
        confirmStoreName: "Avinash stores",
      }),
    ).rejects.toMatchObject(code("STORE_ADMIN_ALREADY_ASSIGNED"));
  });
  it("repairs an ownerless Store and rejects unauthorized actors, protected targets and wrong confirmations", async () => {
    const before = await service.get(user);
    await expect(
      service.assignStoreAdmin(other, user, {
        version: before.version,
        storeId: store,
        confirmStoreName: "Avinash stores",
      }),
    ).rejects.toMatchObject(code("PLATFORM_PERMISSION_DENIED"));
    await expect(
      service.assignStoreAdmin(admin, user, {
        version: before.version,
        storeId: store,
        confirmStoreName: "Wrong",
      }),
    ).rejects.toMatchObject(code("STORE_OWNER_CONFIRMATION_REQUIRED"));
    const assigned = await service.assignStoreAdmin(admin, user, {
      version: before.version,
      storeId: store,
      confirmStoreName: "Avinash stores",
    });
    expect(assigned.memberships[0]).toMatchObject({
      membershipRole: "ORGANIZATION_OWNER",
      isStoreAdmin: true,
    });
    await db.platformRoleAssignment.create({
      data: { id: createSelfxId(), userId: other, role: "SELFX_SUPER_ADMIN" },
    });
    await expect(
      service.assignStoreAdmin(admin, other, {
        version: (await service.get(other)).version,
        storeId: store,
        confirmStoreName: "Avinash stores",
      }),
    ).rejects.toMatchObject(code("STORE_OWNER_ACCOUNT_INVALID"));
    await expect(
      service.updateStoreAdminEmail(admin, user, {
        version: assigned.version,
        storeId: second,
        email: "cross-store@example.invalid",
      }),
    ).rejects.toMatchObject(code("STORE_ADMIN_NOT_LINKED"));
  });
  it("creates and links a new admin atomically while preserving Store products, stock, plan and history", async () => {
    const planId = createSelfxId(),
      categoryId = createSelfxId(),
      productId = createSelfxId(),
      variantId = createSelfxId();
    planIds.push(planId);
    await db.organization.update({
      where: { id: store },
      data: {
        settings: {
          storeProfile: { contactEmail: "contact@example.invalid" },
          retained: "original",
        },
      },
    });
    const previousStore = await db.organization.findUniqueOrThrow({
      where: { id: store },
    });
    await db.pricingPlan.create({
      data: {
        id: planId,
        code: planId,
        name: "Existing plan",
        channels: ["KIOSK"],
      },
    });
    const subscription = await db.storeSubscription.create({
      data: {
        id: createSelfxId(),
        organizationId: store,
        pricingPlanId: planId,
        channels: ["KIOSK"],
        includedCredits: 100,
      },
    });
    await db.productCategory.create({
      data: {
        id: categoryId,
        catalogKey: categoryId,
        organizationId: store,
        scope: "STORE",
        slug: "tops",
        name: "Tops",
      },
    });
    const product = await db.product.create({
      data: {
        id: productId,
        catalogKey: productId,
        organizationId: store,
        scope: "STORE",
        categoryId,
        name: "Existing shirt",
        imageStorageKey: "stores/test/existing-shirt.png",
        slug: productId,
        audience: "UNISEX",
        garmentIntent: "TOP",
        garmentCategory: "TOP",
      },
    });
    await db.productStockSettings.create({
      data: {
        productId,
        organizationId: store,
        optionMode: "SIZE",
        pricingMode: "CONSTANT",
      },
    });
    const stock = await db.productVariant.create({
      data: {
        id: variantId,
        productId,
        organizationId: store,
        optionKey: "M",
        size: "M",
        stockQuantity: 8,
      },
    });
    const historicalEvent = await db.auditLog.create({
      data: {
        id: createSelfxId(),
        actorUserId: admin,
        organizationId: store,
        action: "OLD_STORE_EVENT",
        resourceType: "store",
      },
    });
    const result = await service.createStoreAdmin(admin, {
      storeId: store,
      confirmStoreName: "Avinash stores",
      displayName: "New Store Admin",
      email: "NEW-ADMIN@example.invalid",
      password: "New admin password 123!",
    });
    ids.push(result.id);
    expect(result).toMatchObject({
      email: "new-admin@example.invalid",
      displayName: "New Store Admin",
      status: "ACTIVE",
      staticPlatformRoles: [],
      platformRoles: [],
      memberships: [
        {
          storeId: store,
          isStoreAdmin: true,
          membershipRole: "ORGANIZATION_OWNER",
          storeScopeMode: "ALL_STORES",
          status: "ACTIVE",
        },
      ],
    });
    const saved = await db.user.findUniqueOrThrow({ where: { id: result.id } });
    expect(
      await passwords.verifyPassword(
        saved.passwordHash,
        "New admin password 123!",
      ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain(saved.passwordHash);
    expect(JSON.stringify(result)).not.toContain("New admin password 123!");
    expect(await db.organization.findUnique({ where: { id: store } })).toEqual(
      previousStore,
    );
    expect(
      await db.storeSubscription.findUnique({ where: { id: subscription.id } }),
    ).toEqual(subscription);
    expect(await db.product.findUnique({ where: { id: productId } })).toEqual(
      product,
    );
    expect(
      await db.productVariant.findUnique({ where: { id: variantId } }),
    ).toEqual(stock);
    expect(
      await db.auditLog.findUnique({ where: { id: historicalEvent.id } }),
    ).toEqual(historicalEvent);
    expect(
      (await rbac.effectivePermissions(result.id, store)).permissions,
    ).toEqual(["stores.view"]);
    const event = await db.auditLog.findFirstOrThrow({
      where: { action: "STORE_ADMIN_ACCOUNT_CREATED", resourceId: result.id },
    });
    expect(event.actorUserId).toBe(admin);
    expect(JSON.stringify(event)).not.toContain("New admin password 123!");
    expect(JSON.stringify(event)).not.toContain(saved.passwordHash);
  });
  it("rejects existing and deleted login emails without changing their credentials or links", async () => {
    const existing = await service.get(user);
    const request = {
      storeId: store,
      confirmStoreName: "Avinash stores",
      displayName: "Replacement",
      email: existing.email.toUpperCase(),
      password: "Must never replace 123!",
    };
    await expect(
      service.createStoreAdmin(admin, request),
    ).rejects.toMatchObject(code("USER_EMAIL_CONFLICT"));
    expect(await service.get(user)).toEqual(existing);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user } })).passwordHash,
    ).toBe(hash);
    await db.user.update({
      where: { id: user },
      data: { status: "DISABLED", deletedAt: new Date() },
    });
    await expect(
      service.createStoreAdmin(admin, request),
    ).rejects.toMatchObject(code("USER_EMAIL_CONFLICT"));
    expect(
      await db.organizationMembership.count({ where: { orgId: store } }),
    ).toBe(0);
  });
  it("rolls back new users when Store Admin assignment cannot be completed", async () => {
    await db.storePermissionGrant.deleteMany({
      where: { storeTenantId: store },
    });
    await expect(
      service.createStoreAdmin(admin, {
        storeId: store,
        confirmStoreName: "Avinash stores",
        displayName: "No orphan",
        email: "no-orphan@example.invalid",
        password: "New admin password 123!",
      }),
    ).rejects.toMatchObject(code("STORE_PERMISSION_NOT_GRANTED"));
    expect(
      await db.user.findUnique({
        where: { email: "no-orphan@example.invalid" },
      }),
    ).toBeNull();
    expect(
      await db.organizationMembership.count({ where: { orgId: store } }),
    ).toBe(0);
    expect(
      await db.auditLog.count({
        where: {
          action: {
            in: ["STORE_ADMIN_ACCOUNT_CREATED", "STORE_FIRST_OWNER_ASSIGNED"],
          },
          organizationId: store,
        },
      }),
    ).toBe(0);
  });
  it("rejects unauthorized creation, inactive or renamed Stores and existing admin links", async () => {
    const request = {
      storeId: store,
      confirmStoreName: "Avinash stores",
      displayName: "Not created",
      email: "not-created@example.invalid",
      password: "New admin password 123!",
    };
    await expect(
      service.createStoreAdmin(other, request),
    ).rejects.toMatchObject(code("PLATFORM_PERMISSION_DENIED"));
    await expect(
      service.createStoreAdmin(admin, {
        ...request,
        confirmStoreName: "Old name",
      }),
    ).rejects.toMatchObject(code("STORE_EDIT_CONFLICT"));
    await expect(
      service.createStoreAdmin(admin, {
        ...request,
        storeId: archived,
        confirmStoreName: "Archived Store",
      }),
    ).rejects.toMatchObject(code("STORE_INACTIVE"));
    await owner(user);
    await db.user.update({
      where: { id: user },
      data: { status: "SUSPENDED" },
    });
    await expect(
      service.createStoreAdmin(admin, request),
    ).rejects.toMatchObject(code("STORE_ADMIN_ALREADY_LINKED"));
    expect(
      await db.user.findUnique({ where: { email: request.email } }),
    ).toBeNull();
  });
  it("allows one concurrent creation for an unlinked Store without leaving an orphan account", async () => {
    const attempts = await Promise.allSettled(
      ["one", "two"].map((label) =>
        service.createStoreAdmin(admin, {
          storeId: store,
          confirmStoreName: "Avinash stores",
          displayName: label,
          email: `${label}@create-admin.invalid`,
          password: "New admin password 123!",
        }),
      ),
    );
    const successes = attempts.filter(
      (
        attempt,
      ): attempt is PromiseFulfilledResult<
        Awaited<ReturnType<typeof service.createStoreAdmin>>
      > => attempt.status === "fulfilled",
    );
    successes.forEach((success) => ids.push(success.value.id));
    expect(successes).toHaveLength(1);
    expect(
      await db.organizationMembership.count({ where: { orgId: store } }),
    ).toBe(1);
    expect(
      await db.user.count({
        where: {
          email: {
            in: ["one@create-admin.invalid", "two@create-admin.invalid"],
          },
        },
      }),
    ).toBe(1);
  });
  it("rejects unsupported role filters and keeps inactive Store memberships read-only", async () => {
    await expect(
      service.list({ page: 1, pageSize: 25, role: "-".repeat(36) }),
    ).rejects.toMatchObject(code("USER_ROLE_FILTER_INVALID"));
    await expect(
      service.update(
        admin,
        user,
        await input({
          memberships: [
            { storeId: archived, status: "ACTIVE", roleIds: [storeRole] },
          ],
        }),
      ),
    ).rejects.toMatchObject(code("STORE_INACTIVE"));
  });
});
