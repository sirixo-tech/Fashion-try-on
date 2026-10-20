import { HttpStatus } from "@nestjs/common";
import {
  PermissionApplicability,
  type Permission,
  type Prisma,
} from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import {
  platformRoleAuthority,
  roleDenied,
  STAFF_OPERATIONAL_PERMISSIONS,
  STORE_ADMIN_REQUIRED_PERMISSIONS,
} from "./role-management-policy.js";
import { STORE_ROLE_CODES } from "./role-policy.js";
import { STORE_PERMISSION_SET } from "./store-permissions.js";
import type { ReplaceStoreRolePermissionsDto } from "./dto/store-rbac.dto.js";
import type { StorePermissionDto } from "./dto/store-rbac.dto.js";
import type { AccessPermissionDto } from "../platform/dto/access-control.dto.js";

export type GlobalStoreRolesWorkspace = {
  canEdit: boolean;
  requiredAdminCodes: string[];
  staffAssignableCodes: string[];
  permissions: StorePermissionDto[];
  roles: {
    id: string;
    systemCode: string;
    name: string;
    description: string | null;
    permissions: AccessPermissionDto[];
    updatedAt: string;
    assignedUsersCount: number | null;
  }[];
};

function permissionView(permission: Permission): AccessPermissionDto {
  return {
    id: permission.id,
    code: permission.code,
    label: permission.label,
    module: permission.module,
    action: permission.action,
    description: permission.description,
    applicability: permission.applicability,
    isSystem: permission.isSystem,
  };
}

export const globalStoreRoleInclude = {
  permissions: {
    include: { permission: true },
    orderBy: { permission: { code: "asc" as const } },
  },
};

export async function readGlobalStoreRoles(
  db: Pick<Prisma.TransactionClient, "globalStoreRole">,
) {
  // These rows are migration-owned. Never recreate defaults on a read.
  const roles = await db.globalStoreRole.findMany({
    where: { systemCode: { in: STORE_ROLE_CODES } },
    include: globalStoreRoleInclude,
    orderBy: { systemCode: "desc" },
  });
  return roles.map((role) => ({
    ...role,
    permissions: role.permissions.filter((entry) =>
      STORE_PERMISSION_SET.has(entry.permission.code),
    ),
  }));
}

export class GlobalStoreRolesService {
  constructor(private readonly prisma: PrismaService) {}

  async policy(actorId: string) {
    const authority = await platformRoleAuthority(this.prisma, actorId);
    const platformView =
      !authority.impersonating &&
      (authority.isSuperadmin ||
        authority.permissions.some((code) =>
          [
            "STORE_ROLES_VIEW",
            "STORE_ROLES_MANAGE",
            "PERMISSIONS_VIEW",
            "PERMISSIONS_MANAGE",
          ].includes(code),
        ));
    const canEdit =
      !authority.impersonating &&
      (authority.isSuperadmin ||
        authority.permissions.includes("STORE_ROLES_MANAGE"));
    const definitions = await readGlobalStoreRoles(this.prisma);
    const viewCodes = definitions
      .filter((role) =>
        role.permissions.some((p) => p.permission.code === "roles.view"),
      )
      .map((role) => role.systemCode);
    const impersonation = authority.impersonating
      ? await this.prisma.impersonationSession.findFirst({
          where: {
            actorUserId: actorId,
            status: "ACTIVE",
            endedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { targetStoreId: true },
        })
      : null;
    const member = !platformView
      ? await this.prisma.organizationMembership.findFirst({
          where: {
            userId: actorId,
            status: "ACTIVE",
            deletedAt: null,
            ...(impersonation ? { orgId: impersonation.targetStoreId } : {}),
            organization: { status: "ACTIVE" },
            roleAssignments: {
              some: { role: { isActive: true, systemCode: { in: viewCodes } } },
            },
          },
          select: { id: true },
        })
      : null;
    // Impersonation remains a scoped Store read workflow, not global role access.
    return {
      canView: platformView || (!authority.impersonating && !!member),
      canEdit,
      platformView,
    };
  }

  async workspace(actorId: string): Promise<GlobalStoreRolesWorkspace> {
    const policy = await this.policy(actorId);
    if (!policy.canView)
      return {
        roles: [],
        permissions: [],
        canEdit: false,
        requiredAdminCodes: [],
        staffAssignableCodes: [],
      };
    const [roles, permissions] = await Promise.all([
      readGlobalStoreRoles(this.prisma),
      this.prisma.permission.findMany({
        where: {
          applicability: {
            in: [PermissionApplicability.STORE, PermissionApplicability.BOTH],
          },
        },
        orderBy: [{ module: "asc" }, { code: "asc" }],
      }),
    ]);
    const counts = policy.platformView
      ? await this.prisma.$queryRaw<{ system_code: string; count: bigint }[]>`
      SELECT r.system_code, COUNT(DISTINCT m.user_id) AS count
      FROM store_membership_roles mr JOIN store_roles r ON r.id=mr.role_id
      JOIN organization_memberships m ON m.id=mr.membership_id AND m.organization_id=mr.organization_id
      JOIN users u ON u.id=m.user_id JOIN organizations o ON o.id=m.organization_id
      WHERE r.system_code IN ('store-admin','staff') AND r.is_active=true
      AND m.status='ACTIVE' AND m.deleted_at IS NULL AND u.status='ACTIVE' AND u.deleted_at IS NULL AND o.status='ACTIVE'
      GROUP BY r.system_code`
      : [];
    return {
      canEdit: policy.canEdit,
      requiredAdminCodes: STORE_ADMIN_REQUIRED_PERMISSIONS,
      staffAssignableCodes: STAFF_OPERATIONAL_PERMISSIONS,
      permissions: permissions
        .filter((p) => STORE_PERMISSION_SET.has(p.code))
        .map((p) => ({
          ...permissionView(p),
          granted: true,
        })),
      roles: roles.map((role) => ({
        id: role.id,
        systemCode: role.systemCode,
        name: role.name,
        description: role.description,
        permissions: role.permissions.map((p) => permissionView(p.permission)),
        updatedAt: role.updatedAt.toISOString(),
        assignedUsersCount: policy.platformView
          ? Number(
              counts.find((c) => c.system_code === role.systemCode)?.count ?? 0,
            )
          : null,
      })),
    };
  }

  async replace(
    actorId: string,
    systemCode: string,
    input: ReplaceStoreRolePermissionsDto,
  ) {
    if (!STORE_ROLE_CODES.includes(systemCode))
      throw new ApiErrorException(
        404,
        "GLOBAL_STORE_ROLE_NOT_FOUND",
        "Role was not found.",
      );
    if (!(await this.policy(actorId)).canEdit)
      roleDenied(
        "Platform Store role management authority is required to edit application-wide roles.",
      );
    const codes = [...new Set(input.permissionCodes)];
    if (codes.some((code) => !STORE_PERMISSION_SET.has(code)))
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        "STORE_PERMISSION_INVALID",
        "One or more permissions are invalid.",
      );
    if (
      systemCode === "staff" &&
      codes.some((code) => !STAFF_OPERATIONAL_PERMISSIONS.includes(code))
    )
      roleDenied(
        "Store Staff cannot receive account, payment, user or role administration permissions.",
      );
    if (
      systemCode === "store-admin" &&
      STORE_ADMIN_REQUIRED_PERMISSIONS.some((code) => !codes.includes(code))
    )
      roleDenied("Core Store Admin access must remain enabled.");
    if (!input.expectedUpdatedAt)
      throw new ApiErrorException(
        409,
        "ROLE_VERSION_REQUIRED",
        "Reload the role before saving.",
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM global_store_roles WHERE system_code = ${systemCode} FOR UPDATE`;
      // Recheck actor authority in the transaction before a global mutation.
      const authority = await platformRoleAuthority(
        tx as PrismaService,
        actorId,
      );
      if (
        authority.impersonating ||
        !(
          authority.isSuperadmin ||
          authority.permissions.includes("STORE_ROLES_MANAGE")
        )
      )
        roleDenied();
      const role = await tx.globalStoreRole.findUniqueOrThrow({
        where: { systemCode },
      });
      if (role.updatedAt.toISOString() !== input.expectedUpdatedAt)
        throw new ApiErrorException(
          409,
          "ROLE_CHANGED",
          "This role changed. Reload before saving.",
        );
      const permissions = await tx.permission.findMany({
        where: {
          code: { in: codes },
          applicability: {
            in: [PermissionApplicability.STORE, PermissionApplicability.BOTH],
          },
        },
        select: { id: true },
      });
      if (permissions.length !== codes.length)
        throw new ApiErrorException(
          400,
          "STORE_PERMISSION_INVALID",
          "One or more permissions are invalid.",
        );
      const previous = await tx.globalStoreRolePermission.findMany({
        where: { roleId: role.id },
        select: { permission: { select: { code: true } } },
      });
      await tx.globalStoreRolePermission.deleteMany({
        where: { roleId: role.id },
      });
      if (permissions.length)
        await tx.globalStoreRolePermission.createMany({
          data: permissions.map((p) => ({
            id: createSelfxId(),
            roleId: role.id,
            permissionId: p.id,
          })),
        });
      await tx.globalStoreRole.update({
        where: { id: role.id },
        data: {
          updatedAt: new Date(
            Math.max(Date.now(), role.updatedAt.getTime() + 1),
          ),
        },
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId: actorId,
          action: "GLOBAL_STORE_ROLE_PERMISSIONS_UPDATED",
          resourceType: "global_store_role",
          resourceId: role.id,
          metadata: {
            system_code: systemCode,
            scope: "ALL_STORES",
            previous_permission_codes: previous.map((p) => p.permission.code),
            permission_codes: codes,
          },
        },
      });
    });
    return this.workspace(actorId);
  }
}
