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
import { PLATFORM_PERMISSIONS } from "./platform-permissions.js";
import { PlatformAuthorizationService } from "./platform-authorization.service.js";

loadSelfxEnv();

describe("RBAC-1.1 platform authority boundaries", () => {
  let prisma: PrismaService;
  let authorization: PlatformAuthorizationService;
  let userIds: string[];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    authorization = new PlatformAuthorizationService(prisma);
  });

  beforeEach(() => {
    userIds = [];
  });

  afterEach(async () => {
    await prisma.platformRoleAssignment.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("keeps Superadmin global while Staff Admin cannot reach Superadmin-only authorities", async () => {
    const superadmin = await createUser("super");
    const staffAdmin = await createUser("staff");
    await assign(superadmin.id, PlatformRole.SELFX_SUPER_ADMIN);
    await assign(staffAdmin.id, PlatformRole.SELFX_STAFF_ADMIN);

    for (const permission of Object.values(PLATFORM_PERMISSIONS)) {
      await expect(
        authorization.requirePermission(superadmin.id, permission),
      ).resolves.toBeUndefined();
    }

    await expectApiCode(
      authorization.requirePermission(
        staffAdmin.id,
        PLATFORM_PERMISSIONS.permissionsManage,
      ),
      "PLATFORM_PERMISSION_DENIED",
    );
    await expectApiCode(
      authorization.requirePermission(
        staffAdmin.id,
        PLATFORM_PERMISSIONS.organizationSuspend,
      ),
      "PLATFORM_PERMISSION_DENIED",
    );
  });

  async function createUser(label: string) {
    const id = createSelfxId();
    userIds.push(id);
    return prisma.user.create({
      data: {
        id,
        email: `${label}-${id}@platform-rbac11.test`,
        passwordHash: "not-used",
        status: UserStatus.ACTIVE,
      },
    });
  }

  async function assign(userId: string, role: PlatformRole) {
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
  await expect(promise).rejects.toBeInstanceOf(ApiErrorException);
  await expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({
      error: expect.objectContaining({ code }),
    }),
  });
}
