import {
  MembershipStatus,
  OrganizationMembershipRole,
  OrganizationStatus,
  PlatformRole,
  PlatformRoleAssignmentStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { loadSelfxEnv } from "../config/load-env.js";
import { PrismaService } from "../database/prisma.service.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import {
  STORE_PERMISSION_CODES,
  STORE_PERMISSION_REGISTRY,
} from "./store-permissions.js";
import {
  STORE_RBAC_ERROR_CODES,
  StoreRbacService,
} from "./store-rbac.service.js";

loadSelfxEnv();

describe("RBAC-1.1 Store authorization security", () => {
  let prisma: PrismaService;
  let rbac: StoreRbacService;
  let platformAuth: PlatformAuthorizationService;
  let userIds: string[];
  let storeIds: string[];
  let kioskIds: string[];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    rbac = new StoreRbacService(prisma);
    platformAuth = new PlatformAuthorizationService(prisma);
  }, 15_000);

  beforeEach(() => {
    userIds = [];
    storeIds = [];
    kioskIds = [];
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("keeps platform authority separate from Store role names and staff-admin limits", async () => {
    const superadmin = await createUser("super");
    const staffAdmin = await createUser("staff-admin");
    const storeUser = await createUser("store-user");
    const store = await createStore("platform-boundary");
    await assignPlatformRole(superadmin.id, PlatformRole.SELFX_SUPER_ADMIN);
    await assignPlatformRole(staffAdmin.id, PlatformRole.SELFX_STAFF_ADMIN);
    await createMembershipWithRole(
      store.id,
      storeUser.id,
      "SELFX_SUPER_ADMIN",
      [STORE_PERMISSION_CODES.rolesUpdate],
    );

    await expect(
      platformAuth.requirePermission(
        superadmin.id,
        PLATFORM_PERMISSIONS.permissionsManage,
      ),
    ).resolves.toBeUndefined();
    await expectApiCode(
      platformAuth.requirePermission(
        staffAdmin.id,
        PLATFORM_PERMISSIONS.permissionsManage,
      ),
      "PLATFORM_PERMISSION_DENIED",
    );
    await expectApiCode(
      platformAuth.requirePermission(
        staffAdmin.id,
        PLATFORM_PERMISSIONS.organizationSuspend,
      ),
      "PLATFORM_PERMISSION_DENIED",
    );
    await expectApiCode(
      platformAuth.requirePermission(
        storeUser.id,
        PLATFORM_PERMISSIONS.kiosksView,
      ),
      "PLATFORM_PERMISSION_DENIED",
    );
  });

  it("enforces cross-Store isolation and role assignment Store matching", async () => {
    const userA = await createUser("store-a-user");
    const storeA = await createStore("isolation-a");
    const storeB = await createStore("isolation-b");
    const { membership, role } = await createMembershipWithRole(
      storeA.id,
      userA.id,
      "A Kiosk Manager",
      [
        STORE_PERMISSION_CODES.kiosksConfigure,
        STORE_PERMISSION_CODES.usersView,
      ],
    );
    const roleB = await createRole(storeB.id, "B Role", [
      STORE_PERMISSION_CODES.kiosksConfigure,
    ]);

    await expect(
      rbac.requireStorePermission(
        userA.id,
        storeA.id,
        STORE_PERMISSION_CODES.kiosksConfigure,
      ),
    ).resolves.toBeUndefined();
    await expectApiCode(
      rbac.requireStorePermission(
        userA.id,
        storeB.id,
        STORE_PERMISSION_CODES.kiosksConfigure,
      ),
      STORE_RBAC_ERROR_CODES.permissionDenied,
    );
    await expectApiCode(
      rbac.replaceUserRoles(userA.id, storeA.id, membership.id, {
        roleIds: [roleB.id],
      }),
      STORE_RBAC_ERROR_CODES.crossStoreRoleAssignment,
    );
    await expectApiCode(
      rbac.updateRole(userA.id, storeB.id, role.id, { name: "Nope" }),
      STORE_RBAC_ERROR_CODES.roleNotFound,
    );
    await expectApiCode(
      rbac.updateUserStatus(userA.id, storeB.id, membership.id, {
        status: "SUSPENDED",
      }),
      STORE_RBAC_ERROR_CODES.membershipNotFound,
    );
  }, 15_000);

  it("resolves effective permissions from active DB state and denies inactive subjects", async () => {
    const user = await createUser("effective");
    const inactiveUser = await createUser("inactive", UserStatus.SUSPENDED);
    const store = await createStore("effective");
    const inactiveStore = await createStore(
      "inactive-store",
      OrganizationStatus.SUSPENDED,
    );
    await createMembershipWithRole(store.id, user.id, "Empty", []);
    await createMembershipWithRole(
      store.id,
      inactiveUser.id,
      "Inactive User Role",
      [STORE_PERMISSION_CODES.storesView],
    );
    const second = await createRole(store.id, "View Custom", [
      STORE_PERMISSION_CODES.storesView,
    ]);
    await rbac.replaceUserRoles(
      user.id,
      store.id,
      await membershipId(store.id, user.id),
      {
        roleIds: [second.id],
      },
    );

    await expect(
      rbac.requireStorePermission(
        user.id,
        store.id,
        STORE_PERMISSION_CODES.storesView,
      ),
    ).resolves.toBeUndefined();
    await expectApiCode(
      rbac.requireStorePermission(
        user.id,
        store.id,
        STORE_PERMISSION_CODES.kiosksPair,
      ),
      STORE_RBAC_ERROR_CODES.permissionDenied,
    );
    await expectApiCode(
      rbac.requireStorePermission(
        inactiveUser.id,
        store.id,
        STORE_PERMISSION_CODES.storesView,
      ),
      STORE_RBAC_ERROR_CODES.permissionDenied,
    );
    await expectApiCode(
      rbac.requireStorePermission(
        user.id,
        inactiveStore.id,
        STORE_PERMISSION_CODES.storesView,
      ),
      STORE_RBAC_ERROR_CODES.permissionDenied,
    );
    await prisma.storeRole.update({
      where: { id: second.id },
      data: { isActive: false },
    });
    await expectApiCode(
      rbac.requireStorePermission(
        user.id,
        store.id,
        STORE_PERMISSION_CODES.storesView,
      ),
      STORE_RBAC_ERROR_CODES.permissionDenied,
    );
    await expectApiCode(
      rbac.requireStorePermission(
        user.id,
        store.id,
        "unknown.permission" as never,
      ),
      STORE_RBAC_ERROR_CODES.permissionDenied,
    );
  }, 15_000);

  it("unions multiple roles and revokes permissions immediately from DB changes", async () => {
    const user = await createUser("stale-token");
    const store = await createStore("stale-token");
    const configureRole = await createRole(store.id, "Configure", [
      STORE_PERMISSION_CODES.kiosksConfigure,
    ]);
    const viewRole = await createRole(store.id, "View", [
      STORE_PERMISSION_CODES.kiosksView,
    ]);
    const membership = await createMembership(store.id, user.id);
    await rbac.replaceUserRoles(user.id, store.id, membership.id, {
      roleIds: [configureRole.id, viewRole.id],
    });

    const unioned = await rbac.effectivePermissions(user.id, store.id);
    expect(unioned.permissions).toEqual(
      expect.arrayContaining([
        STORE_PERMISSION_CODES.kiosksConfigure,
        STORE_PERMISSION_CODES.kiosksView,
      ]),
    );
    await expect(
      rbac.requireStorePermission(
        user.id,
        store.id,
        STORE_PERMISSION_CODES.kiosksConfigure,
      ),
    ).resolves.toBeUndefined();

    await rbac.replaceRolePermissions(user.id, store.id, configureRole.id, {
      permissionCodes: [],
    });
    await expectApiCode(
      rbac.requireStorePermission(
        user.id,
        store.id,
        STORE_PERMISSION_CODES.kiosksConfigure,
      ),
      STORE_RBAC_ERROR_CODES.permissionDenied,
    );

    await rbac.replaceUserRoles(user.id, store.id, membership.id, {
      roleIds: [configureRole.id],
    });
    await expectApiCode(
      rbac.requireStorePermission(
        user.id,
        store.id,
        STORE_PERMISSION_CODES.kiosksView,
      ),
      STORE_RBAC_ERROR_CODES.permissionDenied,
    );

    await rbac.updateUserStatus(user.id, store.id, membership.id, {
      status: "SUSPENDED",
    });
    await expectApiCode(
      rbac.requireStorePermission(
        user.id,
        store.id,
        STORE_PERMISSION_CODES.storesView,
      ),
      STORE_RBAC_ERROR_CODES.permissionDenied,
    );
  }, 15_000);

  it("protects uniqueness invariants and safe role deletion behavior", async () => {
    const user = await createUser("invariants");
    const store = await createStore("invariants");
    const role = await createRole(store.id, "Unique Role", [
      STORE_PERMISSION_CODES.storesView,
      STORE_PERMISSION_CODES.storesView,
    ]);
    const membership = await createMembership(store.id, user.id);
    await rbac.replaceUserRoles(user.id, store.id, membership.id, {
      roleIds: [role.id, role.id],
    });

    await expectApiCode(
      rbac.createRole(user.id, store.id, {
        name: "Unique Role",
        permissionCodes: [],
      }),
      STORE_RBAC_ERROR_CODES.roleConflict,
    );
    await expectApiCode(
      rbac.addUser(user.id, store.id, { email: user.email, roleIds: [] }),
      STORE_RBAC_ERROR_CODES.membershipAlreadyExists,
    );
    await expectApiCode(
      rbac.deleteRole(user.id, store.id, role.id),
      STORE_RBAC_ERROR_CODES.roleAssigned,
    );
    await expect(
      prisma.storeMembershipRole.count({
        where: { membershipId: membership.id },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.storeRolePermission.count({ where: { roleId: role.id } }),
    ).resolves.toBe(1);

    await expect(
      prisma.permission.create({
        data: {
          id: createSelfxId(),
          code: STORE_PERMISSION_CODES.storesView,
          module: "stores",
          action: "view",
          label: "Duplicate",
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  }, 15_000);

  it("initializes default Store RBAC idempotently and safely under concurrency", async () => {
    const store = await createStore("defaults");

    await rbac.ensureStoreRbac(store.id);
    const roleCount = await prisma.storeRole.count({
      where: { orgId: store.id },
    });
    const rolePermissionCount = await prisma.storeRolePermission.count({
      where: { role: { orgId: store.id } },
    });
    await Promise.all([
      rbac.ensureStoreRbac(store.id),
      rbac.ensureStoreRbac(store.id),
      rbac.ensureStoreRbac(store.id),
    ]);

    await expect(
      prisma.storeRole.count({ where: { orgId: store.id } }),
    ).resolves.toBe(roleCount);
    await expect(
      prisma.storeRolePermission.count({
        where: { role: { orgId: store.id } },
      }),
    ).resolves.toBe(rolePermissionCount);
    await expect(
      prisma.permission.count({
        where: {
          code: { in: STORE_PERMISSION_REGISTRY.map((entry) => entry.code) },
        },
      }),
    ).resolves.toBe(STORE_PERMISSION_REGISTRY.length);
  });

  async function createUser(
    label: string,
    status: UserStatus = UserStatus.ACTIVE,
  ) {
    const id = createSelfxId();
    userIds.push(id);
    return prisma.user.create({
      data: {
        id,
        email: `${label}-${id}@rbac11.test`,
        passwordHash: "not-used",
        status,
      },
    });
  }

  async function createStore(
    label: string,
    status: OrganizationStatus = OrganizationStatus.ACTIVE,
  ) {
    const id = createSelfxId();
    storeIds.push(id);
    const store = await prisma.organization.create({
      data: {
        id,
        name: `RBAC ${label}`,
        slug: `rbac-${label}-${id}`,
        status,
      },
    });
    await rbac.ensureStoreRbac(store.id);
    return store;
  }

  async function createMembership(storeId: string, userId: string) {
    return prisma.organizationMembership.create({
      data: {
        id: createSelfxId(),
        orgId: storeId,
        userId,
        role: OrganizationMembershipRole.STORE_STAFF,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });
  }

  async function createRole(
    storeId: string,
    name: string,
    permissionCodes: string[],
  ) {
    return rbac.createRole(userIds[0] ?? createSelfxId(), storeId, {
      name,
      permissionCodes,
    });
  }

  async function createMembershipWithRole(
    storeId: string,
    userId: string,
    roleName: string,
    permissionCodes: string[],
  ) {
    const role = await rbac.createRole(userId, storeId, {
      name: roleName,
      permissionCodes,
    });
    const membership = await createMembership(storeId, userId);
    await rbac.replaceUserRoles(userId, storeId, membership.id, {
      roleIds: [role.id],
    });
    return { membership, role };
  }

  async function membershipId(storeId: string, userId: string) {
    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { orgId_userId: { orgId: storeId, userId } },
    });
    return membership.id;
  }

  async function assignPlatformRole(userId: string, role: PlatformRole) {
    await prisma.platformRoleAssignment.create({
      data: {
        id: createSelfxId(),
        userId,
        role,
        status: PlatformRoleAssignmentStatus.ACTIVE,
      },
    });
  }

  async function cleanup() {
    await prisma.kioskDeviceSession.deleteMany({
      where: { kioskDeviceId: { in: kioskIds } },
    });
    await prisma.kioskDevice.deleteMany({ where: { id: { in: kioskIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { organizationId: { in: storeIds } },
        ],
      },
    });
    await prisma.storeMembershipRole.deleteMany({
      where: { orgId: { in: storeIds } },
    });
    await prisma.storeRolePermission.deleteMany({
      where: { role: { orgId: { in: storeIds } } },
    });
    await prisma.storeRole.deleteMany({ where: { orgId: { in: storeIds } } });
    await prisma.organizationMembership.deleteMany({
      where: {
        OR: [{ orgId: { in: storeIds } }, { userId: { in: userIds } }],
      },
    });
    await prisma.platformRoleAssignment.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: storeIds } } });
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

async function expectApiCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiErrorException);
    expect((error as ApiErrorException).getResponse()).toMatchObject({
      error: { code },
    });
  }
}
