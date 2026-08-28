import { HttpStatus, Injectable } from "@nestjs/common";
import {
  PermissionApplicability,
  PlatformRole,
  PlatformRoleAssignmentStatus,
  Prisma,
  type Permission,
  type PlatformAccessRole,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { normalizeEmail } from "../auth/auth.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  STORE_PERMISSION_REGISTRY,
  STORE_PERMISSION_SET,
} from "../rbac/store-permissions.js";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_PERMISSION_REGISTRY,
  permissionsForPlatformRole,
} from "./platform-permissions.js";
import {
  type AccessPermissionDto,
  type AddPlatformUserDto,
  type AssignPlatformRolesDto,
  type CreatePlatformRoleDto,
  type PlatformRoleDto,
  type PlatformUserDto,
  type ReplacePermissionCodesDto,
  type StorePermissionGrantDto,
  type UpdatePlatformRoleDto,
} from "./dto/access-control.dto.js";

export const ACCESS_CONTROL_ERROR_CODES = {
  roleNotFound: "PLATFORM_ROLE_NOT_FOUND",
  roleConflict: "PLATFORM_ROLE_CONFLICT",
  permissionInvalid: "GLOBAL_PERMISSION_INVALID",
  permissionDenied: "PLATFORM_PERMISSION_DENIED",
  userNotFound: "PLATFORM_USER_NOT_FOUND",
  invitationDeferred: "PLATFORM_USER_INVITATION_DEFERRED",
  protectedSuperadmin: "SELFX_SUPERADMIN_PROTECTED",
  storeNotFound: "STORE_NOT_FOUND",
} as const;

const SUPERADMIN_ONLY_PERMISSION_CODES = new Set<string>([
  PLATFORM_PERMISSIONS.permissionsManage,
  PLATFORM_PERMISSIONS.organizationSuspend,
]);

const PLATFORM_ACCESS_AUDIT_ACTIONS = {
  platformRoleCreated: "PLATFORM_ROLE_CREATED",
  platformRoleUpdated: "PLATFORM_ROLE_UPDATED",
  platformRolePermissionsUpdated: "PLATFORM_ROLE_PERMISSIONS_UPDATED",
  platformUserRolesUpdated: "PLATFORM_USER_ROLES_UPDATED",
  storePermissionCeilingUpdated: "STORE_PERMISSION_CEILING_UPDATED",
} as const;

const DEFAULT_PLATFORM_ACCESS_ROLES = [
  {
    systemCode: "platform-staff-admin",
    name: "Platform Staff Admin",
    description:
      "Broad SelfX platform operations except Superadmin-only access control and suspension authorities.",
    permissions: permissionsForPlatformRole(PlatformRole.SELFX_STAFF_ADMIN),
  },
  {
    systemCode: "platform-support-admin",
    name: "Platform Support Admin",
    description: "Support access for Store onboarding review.",
    permissions: permissionsForPlatformRole(PlatformRole.SELFX_SUPPORT_ADMIN),
  },
] as const;

type PlatformRoleWithRelations = PlatformAccessRole & {
  permissions: Array<{ permission: Permission }>;
  _count: { assignments: number; permissions: number };
};

@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  async listPermissions(): Promise<{ data: AccessPermissionDto[] }> {
    await this.ensureGlobalPermissionCatalog();
    const permissions = await this.prisma.permission.findMany({
      orderBy: [
        { applicability: "asc" },
        { module: "asc" },
        { action: "asc" },
        { code: "asc" },
      ],
    });
    return { data: permissions.map(mapPermission) };
  }

  async listPlatformRoles(): Promise<{ data: PlatformRoleDto[] }> {
    await this.ensurePlatformAccessRoles();
    const roles = await this.prisma.platformAccessRole.findMany({
      include: platformRoleInclude(),
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
    return { data: roles.map(mapPlatformRole) };
  }

  async createPlatformRole(
    actorUserId: string,
    input: CreatePlatformRoleDto,
  ): Promise<PlatformRoleDto> {
    await this.ensureGlobalPermissionCatalog();
    await this.assertActorCanManagePermissionCodes(
      actorUserId,
      input.permissionCodes ?? [],
    );
    const permissionIds = await this.platformPermissionIdsForCodes(
      input.permissionCodes ?? [],
    );
    const role = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.platformAccessRole.create({
          data: {
            id: createSelfxId(),
            name: input.name.trim(),
            description: cleanNullable(input.description),
            isSystem: false,
            isActive: true,
          },
        });
        await tx.platformAccessRolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            id: createSelfxId(),
            roleId: created.id,
            permissionId,
          })),
          skipDuplicates: true,
        });
        await createAudit(tx, {
          actorUserId,
          action: PLATFORM_ACCESS_AUDIT_ACTIONS.platformRoleCreated,
          resourceType: "platform_role",
          resourceId: created.id,
          metadata: { permission_codes: input.permissionCodes ?? [] },
        });
        return tx.platformAccessRole.findUniqueOrThrow({
          where: { id: created.id },
          include: platformRoleInclude(),
        });
      })
      .catch(mapUniqueRoleError);
    return mapPlatformRole(role);
  }

  async updatePlatformRole(
    actorUserId: string,
    roleId: string,
    input: UpdatePlatformRoleDto,
  ): Promise<PlatformRoleDto> {
    await this.findPlatformRoleOrThrow(roleId);
    const role = await this.prisma
      .$transaction(async (tx) => {
        await tx.platformAccessRole.update({
          where: { id: roleId },
          data: {
            ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(input.description !== undefined
              ? { description: cleanNullable(input.description) }
              : {}),
            ...(input.isActive !== undefined
              ? { isActive: input.isActive }
              : {}),
          },
        });
        await createAudit(tx, {
          actorUserId,
          action: PLATFORM_ACCESS_AUDIT_ACTIONS.platformRoleUpdated,
          resourceType: "platform_role",
          resourceId: roleId,
          metadata: { changed_fields: Object.keys(input) },
        });
        return tx.platformAccessRole.findUniqueOrThrow({
          where: { id: roleId },
          include: platformRoleInclude(),
        });
      })
      .catch(mapUniqueRoleError);
    return mapPlatformRole(role);
  }

  async replacePlatformRolePermissions(
    actorUserId: string,
    roleId: string,
    input: ReplacePermissionCodesDto,
  ): Promise<PlatformRoleDto> {
    await this.findPlatformRoleOrThrow(roleId);
    const uniqueCodes = [...new Set(input.permissionCodes)];
    await this.assertActorCanManagePermissionCodes(actorUserId, uniqueCodes);
    const permissionIds = await this.platformPermissionIdsForCodes(uniqueCodes);
    const role = await this.prisma.$transaction(async (tx) => {
      await tx.platformAccessRolePermission.deleteMany({ where: { roleId } });
      await tx.platformAccessRolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          id: createSelfxId(),
          roleId,
          permissionId,
        })),
        skipDuplicates: true,
      });
      await createAudit(tx, {
        actorUserId,
        action: PLATFORM_ACCESS_AUDIT_ACTIONS.platformRolePermissionsUpdated,
        resourceType: "platform_role",
        resourceId: roleId,
        metadata: { permission_codes: uniqueCodes },
      });
      return tx.platformAccessRole.findUniqueOrThrow({
        where: { id: roleId },
        include: platformRoleInclude(),
      });
    });
    return mapPlatformRole(role);
  }

  async listPlatformUsers(): Promise<{ data: PlatformUserDto[] }> {
    await this.ensurePlatformAccessRoles();
    const users = await this.prisma.user.findMany({
      include: {
        platformRoleAssignments: {
          where: { status: PlatformRoleAssignmentStatus.ACTIVE },
          select: { role: true },
        },
        platformAccessRoleAssignments: {
          where: { status: PlatformRoleAssignmentStatus.ACTIVE },
          include: { role: { include: platformRoleInclude() } },
        },
      },
      orderBy: [{ createdAt: "desc" }, { email: "asc" }],
      take: 250,
    });
    return {
      data: users.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        status: user.status,
        isProtectedSuperadmin: user.platformRoleAssignments.some(
          (assignment) => assignment.role === PlatformRole.SELFX_SUPER_ADMIN,
        ),
        platformRoles: user.platformAccessRoleAssignments.map((assignment) =>
          mapPlatformRole(assignment.role),
        ),
      })),
    };
  }

  async addPlatformUser(
    actorUserId: string,
    input: AddPlatformUserDto,
  ): Promise<PlatformUserDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(input.email) },
      select: { id: true },
    });
    if (!user) {
      throw new ApiErrorException(
        HttpStatus.NOT_IMPLEMENTED,
        ACCESS_CONTROL_ERROR_CODES.invitationDeferred,
        "Email invitation flow deferred. Add an existing SelfX user for RBAC-2.",
      );
    }
    return this.replaceUserPlatformRoles(actorUserId, user.id, {
      roleIds: input.roleIds ?? [],
    });
  }

  async replaceUserPlatformRoles(
    actorUserId: string,
    userId: string,
    input: AssignPlatformRolesDto,
  ): Promise<PlatformUserDto> {
    await this.assertUserIsNotProtectedSuperadmin(userId);
    const roleIds = [...new Set(input.roleIds)];
    await this.assertPlatformRolesExist(roleIds);
    await this.prisma.$transaction(async (tx) => {
      await tx.platformUserAccessRole.deleteMany({ where: { userId } });
      await tx.platformUserAccessRole.createMany({
        data: roleIds.map((roleId) => ({
          id: createSelfxId(),
          userId,
          roleId,
          status: PlatformRoleAssignmentStatus.ACTIVE,
          assignedByUserId: actorUserId,
        })),
        skipDuplicates: true,
      });
      await createAudit(tx, {
        actorUserId,
        action: PLATFORM_ACCESS_AUDIT_ACTIONS.platformUserRolesUpdated,
        resourceType: "user",
        resourceId: userId,
        metadata: { role_ids: roleIds },
      });
    });
    const user = (await this.listPlatformUsers()).data.find(
      (entry) => entry.id === userId,
    );
    if (!user) {
      throwUserNotFound();
    }
    return user;
  }

  async listStorePermissionGrants(
    storeId: string,
  ): Promise<{ data: StorePermissionGrantDto[] }> {
    await this.ensureGlobalPermissionCatalog();
    await this.assertStoreExists(storeId);
    const granted = await this.storeGrantedPermissionCodes(storeId);
    const permissions = await this.prisma.permission.findMany({
      where: {
        applicability: {
          in: [PermissionApplicability.STORE, PermissionApplicability.BOTH],
        },
      },
      orderBy: [{ module: "asc" }, { action: "asc" }, { code: "asc" }],
    });
    return {
      data: permissions.map((permission) => ({
        ...mapPermission(permission),
        granted: granted.has(permission.code),
      })),
    };
  }

  async replaceStorePermissionGrants(
    actorUserId: string,
    storeId: string,
    input: ReplacePermissionCodesDto,
  ): Promise<{ data: StorePermissionGrantDto[] }> {
    await this.ensureGlobalPermissionCatalog();
    await this.assertStoreExists(storeId);
    const uniqueCodes = uniqueStorePermissionCodes(input.permissionCodes);
    const permissionIds = await this.storePermissionIdsForCodes(uniqueCodes);
    await this.prisma.$transaction(async (tx) => {
      await tx.storePermissionGrant.deleteMany({
        where: {
          storeTenantId: storeId,
          permission: { code: { notIn: uniqueCodes } },
        },
      });
      await tx.storePermissionGrant.createMany({
        data: permissionIds.map((permissionId) => ({
          id: createSelfxId(),
          storeTenantId: storeId,
          permissionId,
          grantedByUserId: actorUserId,
        })),
        skipDuplicates: true,
      });
      await createAudit(tx, {
        actorUserId,
        organizationId: storeId,
        action: PLATFORM_ACCESS_AUDIT_ACTIONS.storePermissionCeilingUpdated,
        resourceType: "store_permission_grant",
        resourceId: storeId,
        metadata: { permission_codes: uniqueCodes },
      });
    });
    return this.listStorePermissionGrants(storeId);
  }

  private async ensureGlobalPermissionCatalog(): Promise<void> {
    for (const permission of PLATFORM_PERMISSION_REGISTRY) {
      await this.prisma.permission.upsert({
        where: { code: permission.code },
        create: {
          id: createSelfxId(),
          code: permission.code,
          module: permission.module,
          action: permission.action,
          label: permission.label,
          description: permission.description,
          applicability: PermissionApplicability.PLATFORM_ONLY,
          isSystem: true,
        },
        update: {
          module: permission.module,
          action: permission.action,
          label: permission.label,
          description: permission.description,
          applicability: PermissionApplicability.PLATFORM_ONLY,
          isSystem: true,
        },
      });
    }
    for (const permission of STORE_PERMISSION_REGISTRY) {
      await this.prisma.permission.upsert({
        where: { code: permission.code },
        create: {
          id: createSelfxId(),
          code: permission.code,
          module: permission.module,
          action: permission.action,
          label: permission.label,
          description: permission.description,
          applicability: PermissionApplicability.STORE,
          isSystem: true,
        },
        update: {
          module: permission.module,
          action: permission.action,
          label: permission.label,
          description: permission.description,
          applicability: PermissionApplicability.STORE,
          isSystem: true,
        },
      });
    }
  }

  private async ensurePlatformAccessRoles(): Promise<void> {
    await this.ensureGlobalPermissionCatalog();
    for (const definition of DEFAULT_PLATFORM_ACCESS_ROLES) {
      const role = await this.prisma.platformAccessRole.upsert({
        where: { systemCode: definition.systemCode },
        create: {
          id: createSelfxId(),
          systemCode: definition.systemCode,
          name: definition.name,
          description: definition.description,
          isSystem: true,
          isActive: true,
        },
        update: {
          name: definition.name,
          description: definition.description,
          isSystem: true,
          isActive: true,
        },
      });
      const permissionIds = await this.platformPermissionIdsForCodes([
        ...definition.permissions,
      ]);
      await this.prisma.platformAccessRolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          id: createSelfxId(),
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
    }
  }

  private async platformPermissionIdsForCodes(
    codes: string[],
  ): Promise<string[]> {
    const uniqueCodes = [...new Set(codes)];
    if (uniqueCodes.length === 0) {
      return [];
    }
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: uniqueCodes } },
      select: { id: true, code: true, applicability: true },
    });
    const validPlatformPermissions = permissions.filter(
      (permission) =>
        permission.applicability === PermissionApplicability.PLATFORM_ONLY ||
        permission.applicability === PermissionApplicability.BOTH,
    );
    if (
      validPlatformPermissions.length !== uniqueCodes.length ||
      uniqueCodes.some((code) => !permissions.some((p) => p.code === code))
    ) {
      throwInvalidPermission();
    }
    return validPlatformPermissions.map((permission) => permission.id);
  }

  private async storePermissionIdsForCodes(codes: string[]): Promise<string[]> {
    if (codes.length === 0) {
      return [];
    }
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true, applicability: true },
    });
    const validStorePermissions = permissions.filter(
      (permission) =>
        permission.applicability === PermissionApplicability.STORE ||
        permission.applicability === PermissionApplicability.BOTH,
    );
    if (
      validStorePermissions.length !== codes.length ||
      codes.some((code) => !permissions.some((p) => p.code === code))
    ) {
      throwInvalidPermission();
    }
    return validStorePermissions.map((permission) => permission.id);
  }

  private async findPlatformRoleOrThrow(
    roleId: string,
  ): Promise<PlatformRoleWithRelations> {
    const role = await this.prisma.platformAccessRole.findUnique({
      where: { id: roleId },
      include: platformRoleInclude(),
    });
    if (!role) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        ACCESS_CONTROL_ERROR_CODES.roleNotFound,
        "Platform role was not found.",
      );
    }
    return role;
  }

  private async assertPlatformRolesExist(roleIds: string[]): Promise<void> {
    if (roleIds.length === 0) {
      return;
    }
    const count = await this.prisma.platformAccessRole.count({
      where: { id: { in: roleIds }, isActive: true },
    });
    if (count !== roleIds.length) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        ACCESS_CONTROL_ERROR_CODES.roleNotFound,
        "Every assigned Platform role must exist and be active.",
      );
    }
  }

  private async assertUserIsNotProtectedSuperadmin(
    userId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        platformRoleAssignments: {
          where: {
            role: PlatformRole.SELFX_SUPER_ADMIN,
            status: PlatformRoleAssignmentStatus.ACTIVE,
          },
          select: { id: true },
        },
      },
    });
    if (!user) {
      throwUserNotFound();
    }
    if (user.platformRoleAssignments.length > 0) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        ACCESS_CONTROL_ERROR_CODES.protectedSuperadmin,
        "SelfX Superadmin bootstrap authority cannot be changed here.",
      );
    }
  }

  private async assertActorCanManagePermissionCodes(
    actorUserId: string,
    permissionCodes: readonly string[],
  ): Promise<void> {
    const uniqueCodes = [...new Set(permissionCodes)];
    if (uniqueCodes.length === 0) {
      return;
    }
    if (await this.actorIsProtectedSuperadmin(actorUserId)) {
      return;
    }
    if (uniqueCodes.some((code) => SUPERADMIN_ONLY_PERMISSION_CODES.has(code))) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        ACCESS_CONTROL_ERROR_CODES.protectedSuperadmin,
        "Only the protected SelfX Superadmin can assign Superadmin-only permissions.",
      );
    }
    const actorPermissions =
      await this.platformPermissionCodesForUser(actorUserId);
    const unassignableCodes = uniqueCodes.filter(
      (code) => !actorPermissions.has(code),
    );
    if (unassignableCodes.length === 0) {
      return;
    }
    throw new ApiErrorException(
      HttpStatus.FORBIDDEN,
      ACCESS_CONTROL_ERROR_CODES.permissionDenied,
      "Platform role managers can assign only permissions they already hold.",
    );
  }

  private async actorIsProtectedSuperadmin(
    actorUserId: string,
  ): Promise<boolean> {
    const superadmin = await this.prisma.platformRoleAssignment.findFirst({
      where: {
        userId: actorUserId,
        role: PlatformRole.SELFX_SUPER_ADMIN,
        status: PlatformRoleAssignmentStatus.ACTIVE,
      },
      select: { id: true },
    });
    return Boolean(superadmin);
  }

  private async platformPermissionCodesForUser(
    userId: string,
  ): Promise<Set<string>> {
    const [staticAssignments, dynamicAssignments] = await Promise.all([
      this.prisma.platformRoleAssignment.findMany({
        where: {
          userId,
          status: PlatformRoleAssignmentStatus.ACTIVE,
        },
        select: { role: true },
      }),
      this.prisma.platformUserAccessRole.findMany({
        where: {
          userId,
          status: PlatformRoleAssignmentStatus.ACTIVE,
          role: { isActive: true },
        },
        select: {
          role: {
            select: {
              permissions: {
                select: { permission: { select: { code: true } } },
              },
            },
          },
        },
      }),
    ]);
    return new Set([
      ...staticAssignments.flatMap((assignment) =>
        permissionsForPlatformRole(assignment.role),
      ),
      ...dynamicAssignments.flatMap((assignment) =>
        assignment.role.permissions.map((entry) => entry.permission.code),
      ),
    ]);
  }

  private async assertStoreExists(storeId: string): Promise<void> {
    const store = await this.prisma.organization.findUnique({
      where: { id: storeId },
      select: { id: true },
    });
    if (!store) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        ACCESS_CONTROL_ERROR_CODES.storeNotFound,
        "Store was not found.",
      );
    }
  }

  private async storeGrantedPermissionCodes(
    storeId: string,
  ): Promise<Set<string>> {
    const grants = await this.prisma.storePermissionGrant.findMany({
      where: { storeTenantId: storeId },
      select: { permission: { select: { code: true } } },
    });
    return new Set(grants.map((grant) => grant.permission.code));
  }
}

function uniqueStorePermissionCodes(codes: string[]): string[] {
  const unique = [...new Set(codes)];
  if (unique.some((code) => !STORE_PERMISSION_SET.has(code))) {
    throwInvalidPermission();
  }
  return unique;
}

function platformRoleInclude() {
  return {
    permissions: {
      include: { permission: true },
      orderBy: { permission: { code: "asc" } },
    },
    _count: { select: { assignments: true, permissions: true } },
  } as const;
}

function mapPermission(permission: Permission): AccessPermissionDto {
  return {
    id: permission.id,
    code: permission.code,
    module: permission.module,
    action: permission.action,
    label: permission.label,
    description: permission.description,
    applicability: permission.applicability,
    isSystem: permission.isSystem,
  };
}

function mapPlatformRole(role: PlatformRoleWithRelations): PlatformRoleDto {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    systemCode: role.systemCode,
    isSystem: role.isSystem,
    isActive: role.isActive,
    permissionsCount: role._count.permissions,
    assignedUsersCount: role._count.assignments,
    permissions: role.permissions.map((entry) =>
      mapPermission(entry.permission),
    ),
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

function cleanNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mapUniqueRoleError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new ApiErrorException(
      HttpStatus.CONFLICT,
      ACCESS_CONTROL_ERROR_CODES.roleConflict,
      "A Platform role with that name already exists.",
    );
  }
  throw error;
}

function throwInvalidPermission(): never {
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    ACCESS_CONTROL_ERROR_CODES.permissionInvalid,
    "One or more permissions are invalid for this scope.",
  );
}

function throwUserNotFound(): never {
  throw new ApiErrorException(
    HttpStatus.NOT_FOUND,
    ACCESS_CONTROL_ERROR_CODES.userNotFound,
    "User was not found.",
  );
}

async function createAudit(
  prisma: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    organizationId?: string;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      id: createSelfxId(),
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata ?? Prisma.JsonNull,
    },
  });
}
