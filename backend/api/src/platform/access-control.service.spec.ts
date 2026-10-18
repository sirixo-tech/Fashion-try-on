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
  beforeAll(() => db.$connect());
  beforeEach(() => {
    ids = [];
  });
  afterEach(async () => {
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
      authorization.requirePermission(target, PLATFORM_PERMISSIONS.kiosksView),
    ).resolves.toBeUndefined();
    await access.replaceUserPlatformRoles(actor, target, { roleIds: [] });
    await expect(
      authorization.requirePermission(target, PLATFORM_PERMISSIONS.kiosksView),
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
    await expect(
      access.replacePlatformRolePermissions(ordinary, role.id, {
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
});
