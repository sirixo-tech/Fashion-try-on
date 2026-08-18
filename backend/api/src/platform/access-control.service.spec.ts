import {
  PlatformRole,
  PlatformRoleAssignmentStatus,
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
import { AccessControlService } from "./access-control.service.js";
import { PLATFORM_PERMISSIONS } from "./platform-permissions.js";
import { PlatformAuthorizationService } from "./platform-authorization.service.js";

loadSelfxEnv();

describe("RBAC-2 global access control", () => {
  let prisma: PrismaService;
  let accessControl: AccessControlService;
  let authorization: PlatformAuthorizationService;
  let userIds: string[];
  let platformRoleIds: string[];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    accessControl = new AccessControlService(prisma);
    authorization = new PlatformAuthorizationService(prisma);
  }, 15_000);

  beforeEach(() => {
    userIds = [];
    platformRoleIds = [];
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    await prisma.platformUserAccessRole.deleteMany({
      where: {
        OR: [{ userId: { in: userIds } }, { roleId: { in: platformRoleIds } }],
      },
    });
    await prisma.platformAccessRolePermission.deleteMany({
      where: { roleId: { in: platformRoleIds } },
    });
    await prisma.platformAccessRole.deleteMany({
      where: { id: { in: platformRoleIds } },
    });
    await prisma.platformRoleAssignment.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("grants Platform permissions through configurable Platform roles", async () => {
    const actor = await createUser("actor");
    const platformUser = await createUser("platform-user");
    await assignBootstrapRole(actor.id, PlatformRole.SELFX_SUPER_ADMIN);

    const role = await accessControl.createPlatformRole(actor.id, {
      name: `Kiosk Viewer ${createSelfxId()}`,
      permissionCodes: [PLATFORM_PERMISSIONS.kiosksView],
    });
    platformRoleIds.push(role.id);

    await accessControl.replaceUserPlatformRoles(actor.id, platformUser.id, {
      roleIds: [role.id],
    });

    await expect(
      authorization.requirePermission(
        platformUser.id,
        PLATFORM_PERMISSIONS.kiosksView,
      ),
    ).resolves.toBeUndefined();

    await accessControl.updatePlatformRole(actor.id, role.id, {
      isActive: false,
    });

    await expectApiCode(
      authorization.requirePermission(
        platformUser.id,
        PLATFORM_PERMISSIONS.kiosksView,
      ),
      "PLATFORM_PERMISSION_DENIED",
    );
  }, 15_000);

  it("protects bootstrap Superadmin users from normal Platform role assignment", async () => {
    const actor = await createUser("super-actor");
    const protectedSuperadmin = await createUser("protected-super");
    await assignBootstrapRole(actor.id, PlatformRole.SELFX_SUPER_ADMIN);
    await assignBootstrapRole(
      protectedSuperadmin.id,
      PlatformRole.SELFX_SUPER_ADMIN,
    );

    await expectApiCode(
      accessControl.replaceUserPlatformRoles(actor.id, protectedSuperadmin.id, {
        roleIds: [],
      }),
      "SELFX_SUPERADMIN_PROTECTED",
    );
  });

  async function createUser(label: string) {
    const id = createSelfxId();
    userIds.push(id);
    return prisma.user.create({
      data: {
        id,
        email: `${label}-${id}@rbac2.test`,
        passwordHash: "not-used",
        status: UserStatus.ACTIVE,
      },
    });
  }

  async function assignBootstrapRole(userId: string, role: PlatformRole) {
    await prisma.platformRoleAssignment.create({
      data: {
        id: createSelfxId(),
        userId,
        role,
        status: PlatformRoleAssignmentStatus.ACTIVE,
      },
    });
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
