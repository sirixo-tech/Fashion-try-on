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
    roleIds: string[] = [];
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
    ids.length = storeIds.length = roleIds.length = 0;
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
