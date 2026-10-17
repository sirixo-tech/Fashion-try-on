import "reflect-metadata";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import {
  applyStoreOnlyAccount,
  previewStoreOnlyAccount,
  type AccountDatabase,
  type StoreOnlyPlan,
} from "./store-only-account.js";

const url = process.env.STORE_ONLY_ACCOUNT_TEST_DATABASE_URL;
if (
  url &&
  (!["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith("_test"))
)
  throw new Error("A disposable local test database is required.");
const env = {
  RAILWAY_PROJECT_ID: "account-fixture",
  RAILWAY_ENVIRONMENT_ID: "test",
};

describe.skipIf(!url)(
  "Store-only account maintenance — real PostgreSQL",
  () => {
    const db = new PrismaClient({
      datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
    });
    const users: string[] = [],
      stores: string[] = [],
      permissions: string[] = [],
      platformRoles: string[] = [];
    let targetId: string,
      adminId: string,
      storeId: string,
      memberId: string,
      staticId: string,
      customId: string;
    const selection = {
      targetEmail: "owner@account.invalid",
      remainingAdminEmail: "super@account.invalid",
      storeSlug: "account-store",
    };
    async function cleanup() {
      await db.auditLog.deleteMany({ where: { actorUserId: { in: users } } });
      await db.impersonationSession.deleteMany({
        where: { actorUserId: { in: users } },
      });
      await db.userSession.deleteMany({ where: { userId: { in: users } } });
      await db.platformUserAccessRole.deleteMany({
        where: { userId: { in: users } },
      });
      await db.platformRoleAssignment.deleteMany({
        where: { userId: { in: users } },
      });
      await db.platformAccessRole.deleteMany({
        where: { id: { in: platformRoles } },
      });
      await db.storeMembershipRole.deleteMany({
        where: { orgId: { in: stores } },
      });
      await db.storeRolePermission.deleteMany({
        where: { role: { orgId: { in: stores } } },
      });
      await db.storeRole.deleteMany({ where: { orgId: { in: stores } } });
      await db.storePermissionGrant.deleteMany({
        where: { storeTenantId: { in: stores } },
      });
      await db.organizationMembership.deleteMany({
        where: { orgId: { in: stores } },
      });
      await db.organization.deleteMany({ where: { id: { in: stores } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.permission.deleteMany({ where: { id: { in: permissions } } });
    }
    beforeAll(() => db.$connect());
    beforeEach(async () => {
      await cleanup();
      targetId = createSelfxId();
      adminId = createSelfxId();
      storeId = createSelfxId();
      memberId = createSelfxId();
      staticId = createSelfxId();
      customId = createSelfxId();
      users.push(targetId, adminId);
      stores.push(storeId);
      await db.user.createMany({
        data: [
          {
            id: targetId,
            email: selection.targetEmail,
            passwordHash: "private-password",
          },
          {
            id: adminId,
            email: selection.remainingAdminEmail,
            passwordHash: "other-private-password",
          },
        ],
      });
      await db.organization.create({
        data: {
          id: storeId,
          slug: selection.storeSlug,
          name: "Account Store",
          status: "ACTIVE",
        },
      });
      await db.organizationMembership.create({
        data: {
          id: memberId,
          orgId: storeId,
          userId: targetId,
          role: "ORGANIZATION_OWNER",
          storeScopeMode: "ALL_STORES",
        },
      });
      const roleId = createSelfxId(),
        newPermissionId = createSelfxId(),
        platformRoleId = createSelfxId();
      platformRoles.push(platformRoleId);
      // Existing migrations seed the global registry; reuse that immutable code.
      const permission = await db.permission.upsert({
        where: { code: "stores.view" },
        create: {
          id: newPermissionId,
          code: "stores.view",
          module: "stores",
          action: "view",
          label: "View Store",
          applicability: "STORE",
        },
        update: {},
      });
      const permissionId = permission.id;
      if (permissionId === newPermissionId) permissions.push(permissionId);
      await db.storePermissionGrant.create({
        data: { id: createSelfxId(), storeTenantId: storeId, permissionId },
      });
      await db.storeRole.create({
        data: {
          id: roleId,
          orgId: storeId,
          systemCode: "store-admin",
          name: "Store Admin",
        },
      });
      await db.storeRolePermission.create({
        data: { id: createSelfxId(), roleId, permissionId },
      });
      await db.storeMembershipRole.create({
        data: {
          id: createSelfxId(),
          orgId: storeId,
          membershipId: memberId,
          roleId,
        },
      });
      await db.platformRoleAssignment.createMany({
        data: [
          { id: staticId, userId: targetId, role: "SELFX_SUPER_ADMIN" },
          { id: createSelfxId(), userId: adminId, role: "SELFX_SUPER_ADMIN" },
        ],
      });
      // Login also checks assignments to inactive custom roles; revoke these too.
      await db.platformAccessRole.create({
        data: { id: platformRoleId, name: platformRoleId, isActive: false },
      });
      await db.platformUserAccessRole.create({
        data: { id: customId, userId: targetId, roleId: platformRoleId },
      });
      for (const userId of [targetId, adminId]) {
        await db.userSession.create({
          data: {
            id: createSelfxId(),
            userId,
            refreshTokenHash: "private-refresh-hash",
            expiresAt: new Date(Date.now() + 60_000),
          },
        });
        await db.impersonationSession.create({
          data: {
            id: createSelfxId(),
            actorUserId: userId,
            targetStoreId: storeId,
            expiresAt: new Date(Date.now() + 60_000),
          },
        });
      }
    });
    afterAll(async () => {
      await cleanup();
      await db.$disconnect();
    });
    const preview = () => previewStoreOnlyAccount(db, selection, env);
    const apply = (
      plan: StoreOnlyPlan,
      overrides: Partial<Parameters<typeof applyStoreOnlyAccount>[0]> = {},
    ) =>
      applyStoreOnlyAccount({
        db,
        plan,
        expectedHash: plan.hash,
        expectedUserId: targetId,
        expectedStoreId: storeId,
        writeBackup: vi.fn(async () => {}),
        env,
        ...overrides,
      });

    it("previews without exposing secrets or mutating authority/sessions", async () => {
      const plan = await preview();
      expect(plan.target.id).toBe(targetId);
      expect(plan.storePermissions).toEqual(["stores.view"]);
      expect(JSON.stringify(plan)).not.toMatch(
        /password|refreshToken|private-refresh/,
      );
      expect(await db.auditLog.count()).toBe(0);
      expect(
        await db.platformRoleAssignment.count({ where: { status: "ACTIVE" } }),
      ).toBe(2);
      expect(await db.userSession.count({ where: { revokedAt: null } })).toBe(
        2,
      );
    });
    it("revokes only target platform roles/sessions and preserves owner, password, RBAC and other admin", async () => {
      const membership = await db.organizationMembership.findUniqueOrThrow({
        where: { id: memberId },
      });
      const storeRoles = await db.storeMembershipRole.findMany();
      const plan = await preview(),
        backup = vi.fn(async () => {});
      expect(await apply(plan, { writeBackup: backup })).toEqual({
        status: "APPLIED",
        staticRolesRevoked: 1,
        customRolesRevoked: 1,
        refreshSessionsRevoked: 1,
        impersonationsEnded: 1,
      });
      expect(backup).toHaveBeenCalledWith(plan);
      expect(
        (
          await db.platformRoleAssignment.findUniqueOrThrow({
            where: { id: staticId },
          })
        ).status,
      ).toBe("REVOKED");
      expect(
        (
          await db.platformUserAccessRole.findUniqueOrThrow({
            where: { id: customId },
          })
        ).status,
      ).toBe("REVOKED");
      expect(
        await db.organizationMembership.findUniqueOrThrow({
          where: { id: memberId },
        }),
      ).toEqual(membership);
      expect(await db.storeMembershipRole.findMany()).toEqual(storeRoles);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: targetId } }))
          .passwordHash,
      ).toBe("private-password");
      expect(
        await db.platformRoleAssignment.count({
          where: { userId: adminId, status: "ACTIVE" },
        }),
      ).toBe(1);
      expect(
        await db.userSession.count({
          where: { userId: adminId, revokedAt: null },
        }),
      ).toBe(1);
      expect(
        await db.impersonationSession.count({
          where: { actorUserId: adminId, status: "ACTIVE" },
        }),
      ).toBe(1);
      expect((await db.auditLog.findFirstOrThrow()).metadata).toMatchObject({
        targetUserId: targetId,
        planHash: plan.hash,
      });
      const newSessionId = createSelfxId();
      await db.userSession.create({
        data: {
          id: newSessionId,
          userId: targetId,
          refreshTokenHash: "new-login",
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      backup.mockClear();
      expect(await apply(plan, { writeBackup: backup })).toEqual({
        status: "ALREADY_APPLIED",
      });
      expect(backup).not.toHaveBeenCalled();
      expect(
        (
          await db.userSession.findUniqueOrThrow({
            where: { id: newSessionId },
          })
        ).revokedAt,
      ).toBeNull();
      expect(await db.auditLog.count()).toBe(1);
    });
    it("rejects the same account as remaining admin", async () => {
      await expect(
        previewStoreOnlyAccount(
          db,
          { ...selection, remainingAdminEmail: selection.targetEmail },
          env,
        ),
      ).rejects.toThrow("different accounts");
    });
    it("refuses to create or promote a missing/inactive/non-owner membership", async () => {
      await db.organizationMembership.update({
        where: { id: memberId },
        data: { status: "SUSPENDED" },
      });
      await expect(preview()).rejects.toThrow("ACTIVE owner");
      await db.organizationMembership.update({
        where: { id: memberId },
        data: { status: "ACTIVE", role: "ORGANIZATION_ADMIN" },
      });
      await expect(preview()).rejects.toThrow("ACTIVE owner");
      await db.organizationMembership.delete({ where: { id: memberId } });
      await expect(preview()).rejects.toThrow("ACTIVE owner");
    });
    it("requires the other active protected Superadmin at preview and apply", async () => {
      const plan = await preview();
      await db.platformRoleAssignment.updateMany({
        where: { userId: adminId },
        data: { status: "REVOKED" },
      });
      await expect(preview()).rejects.toThrow(
        "not an active protected Superadmin",
      );
      await expect(apply(plan)).rejects.toThrow(
        "not an active protected Superadmin",
      );
      expect(
        (
          await db.platformRoleAssignment.findUniqueOrThrow({
            where: { id: staticId },
          })
        ).status,
      ).toBe("ACTIVE");
    });
    it("requires an active Store and effective Store Admin access", async () => {
      await db.organization.update({
        where: { id: storeId },
        data: { status: "SUSPENDED" },
      });
      await expect(preview()).rejects.toThrow("ACTIVE Store");
      await db.organization.update({
        where: { id: storeId },
        data: { status: "ACTIVE" },
      });
      await db.storeRole.updateMany({
        where: { orgId: storeId },
        data: { isActive: false },
      });
      await expect(preview()).rejects.toThrow("active Store Admin");
      await db.storeRole.updateMany({
        where: { orgId: storeId },
        data: { isActive: true },
      });
      await db.storePermissionGrant.deleteMany({
        where: { storeTenantId: storeId },
      });
      await expect(preview()).rejects.toThrow("stores.view");
    });
    it("rejects mismatched confirmations, tampered artifacts and another Railway environment", async () => {
      const plan = await preview();
      await expect(apply(plan, { expectedUserId: adminId })).rejects.toThrow(
        "does not match",
      );
      await expect(
        apply(plan, { expectedStoreId: createSelfxId() }),
      ).rejects.toThrow("does not match");
      await expect(
        apply({ ...plan, target: { ...plan.target, id: adminId } }),
      ).rejects.toThrow("artifact was edited");
      await expect(
        apply(plan, { env: { ...env, RAILWAY_ENVIRONMENT_ID: "other" } }),
      ).rejects.toThrow("environment differs");
      expect(await db.auditLog.count()).toBe(0);
    });
    it("detects stale roles before backup and again inside the commit", async () => {
      const plan = await preview();
      const backup = vi.fn(async () => {
        await db.platformRoleAssignment.update({
          where: { id: staticId },
          data: { assignedAt: new Date(Date.now() + 5000) },
        });
      });
      await expect(apply(plan, { writeBackup: backup })).rejects.toThrow(
        "changed since preview",
      );
      expect(backup).toHaveBeenCalledOnce();
      backup.mockClear();
      await expect(apply(plan, { writeBackup: backup })).rejects.toThrow(
        "changed since preview",
      );
      expect(backup).not.toHaveBeenCalled();
      expect(await db.userSession.count({ where: { revokedAt: null } })).toBe(
        2,
      );
    });
    it("prevents mutations if saving the backup fails", async () => {
      await expect(
        apply(await preview(), {
          writeBackup: async () => {
            throw new Error("Disk full");
          },
        }),
      ).rejects.toThrow("Disk full");
      expect(
        await db.platformRoleAssignment.count({ where: { status: "ACTIVE" } }),
      ).toBe(2);
    });
    it("rolls back roles/sessions/impersonations if the audit cannot be committed", async () => {
      const failingDb: AccountDatabase = {
        $transaction: (callback, options) =>
          db.$transaction(
            (tx) =>
              callback(
                new Proxy(tx, {
                  get: (object, key) =>
                    key === "auditLog"
                      ? {
                          ...tx.auditLog,
                          create: async () => {
                            throw new Error("Audit unavailable");
                          },
                        }
                      : Reflect.get(object, key),
                }),
              ),
            options,
          ),
      };
      await expect(apply(await preview(), { db: failingDb })).rejects.toThrow(
        "Audit unavailable",
      );
      expect(
        await db.platformRoleAssignment.count({ where: { status: "ACTIVE" } }),
      ).toBe(2);
      expect(
        await db.platformUserAccessRole.count({ where: { status: "ACTIVE" } }),
      ).toBe(1);
      expect(await db.userSession.count({ where: { revokedAt: null } })).toBe(
        2,
      );
      expect(
        await db.impersonationSession.count({ where: { status: "ACTIVE" } }),
      ).toBe(2);
      expect(await db.auditLog.count()).toBe(0);
    });
    it("refuses an old operation after platform access is granted again", async () => {
      const plan = await preview();
      await apply(plan);
      await db.platformRoleAssignment.update({
        where: { id: staticId },
        data: { status: "ACTIVE", revokedAt: null },
      });
      await expect(apply(plan)).rejects.toThrow("assigned again");
    });
  },
);
