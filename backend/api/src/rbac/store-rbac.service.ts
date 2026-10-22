import { HttpStatus, Injectable } from "@nestjs/common";
import {
  MembershipStatus,
  OrganizationMembershipRole,
  OrganizationStatus,
  PermissionApplicability,
  PlatformRole,
  PlatformRoleAssignmentStatus,
  Prisma,
  UserStatus,
  type Permission,
  type StoreRole,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";
import { platformRoleAuthority, roleDenied } from "./role-management-policy.js";

import { readGlobalStoreRoles } from "./global-store-roles.service.js";

import { normalizeEmail } from "../auth/auth.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  adminMembershipWhere,
  isStoreAdmin,
  STORE_ROLE_CODES,
} from "./role-policy.js";
import {
  STORE_PERMISSION_REGISTRY,
  type StorePermissionCode,
} from "./store-permissions.js";
import {
  type AddStoreUserDto,
  type CreateStoreRoleDto,
  type EffectiveStorePermissionsResponseDto,
  type ReplaceStoreRolePermissionsDto,
  type ReplaceStoreUserRolesDto,
  type StorePermissionDto,
  type StoreRbacListQueryDto,
  type StoreRoleListResponseDto,
  type StoreRoleResponseDto,
  type StoreUserListResponseDto,
  type StoreUserResponseDto,
  type StoreUsersQueryDto,
  type UpdateStoreRoleDto,
  type UpdateStoreUserStatusDto,
} from "./dto/store-rbac.dto.js";

export const STORE_RBAC_ERROR_CODES = {
  permissionDenied: "STORE_PERMISSION_DENIED",
  storeNotFound: "STORE_NOT_FOUND",
  storeInactive: "STORE_INACTIVE",
  membershipNotFound: "STORE_MEMBERSHIP_NOT_FOUND",
  membershipAlreadyExists: "STORE_MEMBERSHIP_ALREADY_EXISTS",
  userNotFound: "STORE_USER_NOT_FOUND",
  invitationDeferred: "EMAIL_INVITATION_FLOW_DEFERRED",
  roleNotFound: "STORE_ROLE_NOT_FOUND",
  roleConflict: "STORE_ROLE_CONFLICT",
  roleAssigned: "STORE_ROLE_ASSIGNED",
  systemRoleProtected: "STORE_SYSTEM_ROLE_PROTECTED",
  permissionInvalid: "STORE_PERMISSION_INVALID",
  permissionNotGranted: "STORE_PERMISSION_NOT_GRANTED",
  crossStoreRoleAssignment: "STORE_ROLE_TENANT_MISMATCH",
} as const;

const RBAC_AUDIT_ACTIONS = {
  roleCreated: "STORE_ROLE_CREATED",
  roleUpdated: "STORE_ROLE_UPDATED",
  roleDeleted: "STORE_ROLE_DELETED",
  rolePermissionsUpdated: "STORE_ROLE_PERMISSIONS_UPDATED",
  membershipCreated: "STORE_MEMBERSHIP_CREATED",
  membershipStatusUpdated: "STORE_MEMBERSHIP_STATUS_UPDATED",
  membershipRolesUpdated: "STORE_MEMBERSHIP_ROLES_UPDATED",
} as const;

const defaultPage = 1;
const defaultPageSize = 25;
const maxPageSize = 100;

const DEFAULT_ROLE_DEFINITIONS = [
  {
    systemCode: "store-admin",
    name: "Store Admin",
    description:
      "Full operational Store administration without platform authority.",
  },
  {
    systemCode: "staff",
    name: "Staff",
    description:
      "Store permissions configured by authorized Platform role managers.",
  },
] as const;

const LEGACY_ROLE_DEFAULTS = {
  [OrganizationMembershipRole.ORGANIZATION_OWNER]: "store-admin",
  [OrganizationMembershipRole.ORGANIZATION_ADMIN]: "store-admin",
  [OrganizationMembershipRole.ORGANIZATION_STAFF]: "staff",
  [OrganizationMembershipRole.STORE_OWNER]: "store-admin",
  [OrganizationMembershipRole.STORE_MANAGER]: "staff",
  [OrganizationMembershipRole.STORE_STAFF]: "staff",
  [OrganizationMembershipRole.KIOSK_OPERATOR]: "staff",
} satisfies Record<OrganizationMembershipRole, string>;

type RoleWithRelations = StoreRole & {
  permissions: Array<{ permission: Permission }>;
  _count: { membershipRoles: number; permissions: number };
};

type MembershipWithRoles = {
  id: string;
  status: MembershipStatus;
  joinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    deletedAt: Date | null;
  };
  roleAssignments: Array<{ role: RoleWithRelations }>;
};

@Injectable()
export class StoreRbacService {
  constructor(private readonly prisma: PrismaService) {}

  async listPermissions(
    storeId: string,
  ): Promise<{ data: StorePermissionDto[] }> {
    await this.ensureStoreRbac(storeId);
    const permissions = await this.prisma.permission.findMany({
      where: {
        applicability: {
          in: [PermissionApplicability.STORE, PermissionApplicability.BOTH],
        },
      },
      orderBy: [{ module: "asc" }, { action: "asc" }, { code: "asc" }],
    });
    return {
      data: permissions.map((permission) => mapPermission(permission)),
    };
  }

  async listRoles(
    storeId: string,
    query: StoreRbacListQueryDto,
  ): Promise<StoreRoleListResponseDto> {
    await this.ensureStoreRbac(storeId);
    const page = boundedPositiveInt(query.page, defaultPage);
    const pageSize = Math.min(
      boundedPositiveInt(query.pageSize, defaultPageSize),
      maxPageSize,
    );
    const where: Prisma.StoreRoleWhereInput = {
      orgId: storeId,
      systemCode: { in: STORE_ROLE_CODES },
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              {
                description: { contains: query.search, mode: "insensitive" },
              },
            ],
          }
        : {}),
    };
    const [total, roles] = await Promise.all([
      this.prisma.storeRole.count({ where }),
      this.prisma.storeRole.findMany({
        where,
        include: roleInclude(),
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: await this.mapSharedRoles(roles),
      pagination: pagination(page, pageSize, total),
    };
  }

  async createRole(
    actorUserId: string,
    storeId: string,
    input: CreateStoreRoleDto,
  ): Promise<StoreRoleResponseDto> {
    void [actorUserId, storeId, input];
    throw new ApiErrorException(
      HttpStatus.CONFLICT,
      "FIXED_ROLES_ONLY",
      "Store role definitions are application-wide and cannot be created per Store.",
    );
  }

  async updateRole(
    actorUserId: string,
    storeId: string,
    roleId: string,
    input: UpdateStoreRoleDto,
  ): Promise<StoreRoleResponseDto> {
    await this.ensureStoreRbac(storeId);
    const existing = await this.findRoleOrThrow(storeId, roleId);
    if (input.name && input.name.trim() !== existing.name)
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        "FIXED_ROLES_ONLY",
        "Built-in role names cannot be changed.",
      );
    if (existing.isSystem && input.isActive === false) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        STORE_RBAC_ERROR_CODES.systemRoleProtected,
        "System Store roles cannot be deactivated.",
      );
    }
    const role = await this.prisma
      .$transaction(async (tx) => {
        await tx.storeRole.update({
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
          action: RBAC_AUDIT_ACTIONS.roleUpdated,
          actorUserId,
          storeId,
          resourceType: "store_role",
          resourceId: roleId,
          metadata: { changed_fields: Object.keys(input) },
        });
        return tx.storeRole.findUniqueOrThrow({
          where: { id: roleId },
          include: roleInclude(),
        });
      })
      .catch(mapUniqueRoleError);
    return (await this.mapSharedRoles([role]))[0]!;
  }

  async replaceRolePermissions(
    _actorUserId: string,
    _storeId: string,
    _roleId: string,
    _input: ReplaceStoreRolePermissionsDto,
  ): Promise<StoreRoleResponseDto> {
    void [_actorUserId, _storeId, _roleId, _input];
    roleDenied(
      "Store role permissions are application-wide. Use User Management > Roles with Platform role management authority.",
    );
  }

  async deleteRole(
    actorUserId: string,
    storeId: string,
    roleId: string,
  ): Promise<StoreRoleResponseDto> {
    await this.ensureStoreRbac(storeId);
    const role = await this.findRoleOrThrow(storeId, roleId);
    if (role.isSystem) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        STORE_RBAC_ERROR_CODES.systemRoleProtected,
        "System Store roles cannot be deleted.",
      );
    }
    const assigned = await this.prisma.storeMembershipRole.count({
      where: { roleId },
    });
    if (assigned > 0) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        STORE_RBAC_ERROR_CODES.roleAssigned,
        "Remove this role from Store users before deleting it.",
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.storeRole.delete({ where: { id: roleId } });
      await createAudit(tx, {
        action: RBAC_AUDIT_ACTIONS.roleDeleted,
        actorUserId,
        storeId,
        resourceType: "store_role",
        resourceId: roleId,
      });
    });
    return mapRole(role as RoleWithRelations);
  }

  async listUsers(
    storeId: string,
    query: StoreUsersQueryDto,
  ): Promise<StoreUserListResponseDto> {
    await this.ensureStoreRbac(storeId);
    const page = boundedPositiveInt(query.page, defaultPage);
    const pageSize = Math.min(
      boundedPositiveInt(query.pageSize, defaultPageSize),
      maxPageSize,
    );
    const where: Prisma.OrganizationMembershipWhereInput = {
      orgId: storeId,
      deletedAt:
        query.deleted === "only"
          ? { not: null }
          : query.deleted === "all"
            ? undefined
            : null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            user: {
              OR: [
                { email: { contains: query.search, mode: "insensitive" } },
                {
                  displayName: {
                    contains: query.search,
                    mode: "insensitive",
                  },
                },
              ],
            },
          }
        : {}),
    };
    const [total, memberships] = await Promise.all([
      this.prisma.organizationMembership.count({ where }),
      this.prisma.organizationMembership.findMany({
        where,
        include: membershipRoleInclude(),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const sharedRoles = await this.mapSharedRoles(
      memberships.flatMap((membership) =>
        membership.roleAssignments.map((assignment) => assignment.role),
      ),
    );
    const sharedById = new Map(sharedRoles.map((role) => [role.id, role]));
    return {
      data: memberships.map((membership) => ({
        ...mapUser(membership),
        roles: membership.roleAssignments.map((assignment) =>
          sharedById.get(assignment.role.id)!,
        ),
      })),
      pagination: pagination(page, pageSize, total),
    };
  }

  async addUser(
    actorUserId: string,
    storeId: string,
    input: AddStoreUserDto,
  ): Promise<StoreUserResponseDto> {
    await this.ensureStoreRbac(storeId);
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(input.email) },
      select: { id: true, deletedAt: true },
    });
    if (!user) {
      throw new ApiErrorException(
        HttpStatus.NOT_IMPLEMENTED,
        STORE_RBAC_ERROR_CODES.invitationDeferred,
        "Email invitation flow deferred. Add an existing SelfX user for RBAC-1.",
      );
    }
    if (user.deletedAt)
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        "USER_DELETED",
        "Deleted accounts cannot be added to a Store.",
      );
    const roleIds =
      input.roleIds && input.roleIds.length > 0
        ? input.roleIds
        : [await this.defaultRoleId(storeId, "staff")];
    await this.assertRolesBelongToStore(storeId, roleIds);
    const membership = await this.prisma
      .$transaction(async (tx) => {
        const membershipId = createSelfxId();
        await tx.organizationMembership.create({
          data: {
            id: membershipId,
            orgId: storeId,
            userId: user.id,
            role: OrganizationMembershipRole.STORE_STAFF,
            status: MembershipStatus.ACTIVE,
            joinedAt: new Date(),
          },
        });
        await tx.storeMembershipRole.createMany({
          data: roleIds.map((roleId) => ({
            id: createSelfxId(),
            orgId: storeId,
            membershipId,
            roleId,
            assignedByUserId: actorUserId,
          })),
          skipDuplicates: true,
        });
        await createAudit(tx, {
          action: RBAC_AUDIT_ACTIONS.membershipCreated,
          actorUserId,
          storeId,
          resourceType: "organization_membership",
          resourceId: membershipId,
          metadata: { user_id: user.id, role_ids: roleIds },
        });
        return tx.organizationMembership.findUniqueOrThrow({
          where: { id: membershipId },
          include: membershipRoleInclude(),
        });
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new ApiErrorException(
            HttpStatus.CONFLICT,
            STORE_RBAC_ERROR_CODES.membershipAlreadyExists,
            "Store membership already exists.",
          );
        }
        throw error;
      });
    return this.mapSharedUser(membership);
  }

  async updateUserStatus(
    actorUserId: string,
    storeId: string,
    membershipId: string,
    input: UpdateStoreUserStatusDto,
  ): Promise<StoreUserResponseDto> {
    await this.ensureStoreRbac(storeId);
    const membership = await this.findMembershipOrThrow(storeId, membershipId);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${storeId})::bigint)`;
      await this.assertNotProtectedOwner(
        tx,
        storeId,
        membershipId,
        input.status,
      );
      await tx.organizationMembership.update({
        where: { id: membershipId },
        data: {
          status: input.status,
          suspendedAt: input.status === "SUSPENDED" ? new Date() : null,
          joinedAt:
            input.status === "ACTIVE"
              ? (membership.joinedAt ?? new Date())
              : membership.joinedAt,
        },
      });
      await createAudit(tx, {
        action: RBAC_AUDIT_ACTIONS.membershipStatusUpdated,
        actorUserId,
        storeId,
        resourceType: "organization_membership",
        resourceId: membershipId,
        metadata: { status: input.status },
      });
      return tx.organizationMembership.findUniqueOrThrow({
        where: { id: membershipId },
        include: membershipRoleInclude(),
      });
    });
    return this.mapSharedUser(updated);
  }

  async replaceUserRoles(
    actorUserId: string,
    storeId: string,
    membershipId: string,
    input: ReplaceStoreUserRolesDto,
  ): Promise<StoreUserResponseDto> {
    await this.ensureStoreRbac(storeId);
    await this.findMembershipOrThrow(storeId, membershipId);
    const roleIds = [...new Set(input.roleIds)];
    await this.assertRolesBelongToStore(storeId, roleIds);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${storeId})::bigint)`;
      await this.assertNotProtectedOwner(
        tx,
        storeId,
        membershipId,
        "SUSPENDED",
      );
      await tx.storeMembershipRole.deleteMany({ where: { membershipId } });
      if (roleIds.length > 0) {
        await tx.storeMembershipRole.createMany({
          data: roleIds.map((roleId) => ({
            id: createSelfxId(),
            orgId: storeId,
            membershipId,
            roleId,
            assignedByUserId: actorUserId,
          })),
          skipDuplicates: true,
        });
      }
      await createAudit(tx, {
        action: RBAC_AUDIT_ACTIONS.membershipRolesUpdated,
        actorUserId,
        storeId,
        resourceType: "organization_membership",
        resourceId: membershipId,
        metadata: { role_ids: roleIds },
      });
      return tx.organizationMembership.findUniqueOrThrow({
        where: { id: membershipId },
        include: membershipRoleInclude(),
      });
    });
    return this.mapSharedUser(updated);
  }

  async effectivePermissions(
    userId: string,
    storeId: string,
    allowPlatformBypass = true,
  ): Promise<EffectiveStorePermissionsResponseDto> {
    await this.ensureStoreRbac(storeId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, deletedAt: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt) {
      return {
        storeId,
        permissions: [],
        platformBypass: false,
        featureKeys: [],
        membershipId: null,
      };
    }
    const platformBypass =
      allowPlatformBypass && (await this.hasPlatformStoreBypass(userId));
    if (platformBypass) {
      const resources = await this.effectivePermissions(userId, storeId, false);
      return {
        storeId,
        resourcePermissions: resources.permissions,
        paymentAccess: resources.paymentAccess ?? {
          view: false,
          manage: false,
        },
        permissions: STORE_PERMISSION_REGISTRY.filter(
          (permission) =>
            permission.code !== "products.manage" &&
            !permission.code.startsWith("kiosks."),
        ).map((permission) => permission.code),
        platformBypass: true,
        featureKeys: [],
        membershipId: null,
      };
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: storeId },
      select: { status: true },
    });
    if (!organization) {
      throwStoreNotFound();
    }
    if (organization.status !== OrganizationStatus.ACTIVE) {
      return {
        storeId,
        permissions: [],
        platformBypass: false,
        featureKeys: [],
        membershipId: null,
      };
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        orgId: storeId,
        userId,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
      },
      select: {
        id: true,
        role: true,
        roleAssignments: {
          where: {
            role: { isActive: true, systemCode: { in: STORE_ROLE_CODES } },
          },
          select: {
            role: {
              select: {
                systemCode: true,
                isActive: true,
                permissions: {
                  select: { permission: { select: { code: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!membership) {
      return {
        storeId,
        permissions: [],
        platformBypass: false,
        featureKeys: [],
        membershipId: null,
      };
    }
    const definitions = await readGlobalStoreRoles(this.prisma);
    const permissions = [
      ...new Set(
        membership.roleAssignments.flatMap((assignment) =>
          (
            definitions.find(
              (role) => role.systemCode === assignment.role.systemCode,
            )?.permissions ?? []
          ).map((entry) => entry.permission.code),
        ),
      ),
    ].sort();
    return {
      storeId,
      permissions,
      paymentAccess: {
        view: permissions.includes("integrations.view"),
        manage:
          isStoreAdmin(membership) &&
          permissions.includes("integrations.manage"),
      },
      platformBypass: false,
      featureKeys: [],
      membershipId: membership.id,
    };
  }

  async requireStorePermission(
    userId: string,
    storeId: string,
    permission: StorePermissionCode,
  ): Promise<void> {
    if (permission === "products.manage" || permission.startsWith("kiosks.")) {
      return this.requireStoreResourcePermission(userId, storeId, permission);
    }
    const resolved = await this.effectivePermissions(userId, storeId);
    if (resolved.platformBypass || resolved.permissions.includes(permission)) {
      return;
    }
    throw new ApiErrorException(
      HttpStatus.FORBIDDEN,
      STORE_RBAC_ERROR_CODES.permissionDenied,
      "Store permission denied.",
    );
  }

  async requireStoreResourcePermission(
    userId: string,
    storeId: string,
    permission: StorePermissionCode,
  ): Promise<void> {
    const resolved = await this.effectivePermissions(userId, storeId, false);
    if (!resolved.permissions.includes(permission))
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        STORE_RBAC_ERROR_CODES.permissionDenied,
        "Store membership and permission are required for products and kiosks.",
      );
  }

  async requireStorePaymentPermission(
    userId: string,
    storeId: string,
    managing: boolean,
  ) {
    const access = await this.effectivePermissions(userId, storeId, false);
    if (!(managing ? access.paymentAccess?.manage : access.paymentAccess?.view))
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        STORE_RBAC_ERROR_CODES.permissionDenied,
        managing
          ? "Store Admin membership and payment management permission are required."
          : "Store payment viewing permission is required.",
      );
  }

  async ensureStoreRbac(storeId: string): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.ensureStoreRbacInTransaction(tx, storeId),
    );
  }

  async roleManagementPolicy(actorId: string, storeId: string) {
    const authority = await platformRoleAuthority(this.prisma, actorId);
    const access = await this.effectivePermissions(actorId, storeId, false);
    const globalView =
      authority.isSuperadmin ||
      authority.permissions.some((code) =>
        [
          "STORE_ROLES_VIEW",
          "STORE_ROLES_MANAGE",
          "PERMISSIONS_VIEW",
          "PERMISSIONS_MANAGE",
        ].includes(code),
      );
    return {
      canView: globalView || access.permissions.includes("roles.view"),
      canEditAdmin: false,
      canEditStaff: false,
      assignableCodes: [],
      staffAssignableCodes: [],
      requiredAdminCodes: [],
    };
  }

  async ensureStoreRbacInTransaction(
    tx: Prisma.TransactionClient,
    storeId: string,
    seedPermissionGrants = false,
  ): Promise<void> {
    await this.ensurePermissionCatalog(tx);
    const store = await tx.organization.findUnique({
      where: { id: storeId },
      select: { id: true },
    });
    if (!store) {
      throwStoreNotFound();
    }
    await this.ensureDefaultRoles(tx, storeId);
    void seedPermissionGrants; // Legacy call compatibility; no Store-specific grants are created.
    await this.ensureLegacyMembershipRoleAssignments(tx, storeId);
  }

  private async ensurePermissionCatalog(
    prisma: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    for (const permission of STORE_PERMISSION_REGISTRY) {
      await prisma.permission.upsert({
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

  private async mapSharedUser(
    membership: MembershipWithRoles,
  ): Promise<StoreUserResponseDto> {
    return {
      ...mapUser(membership),
      roles: await this.mapSharedRoles(
        membership.roleAssignments.map((assignment) => assignment.role),
      ),
    };
  }

  private async mapSharedRoles(
    roles: RoleWithRelations[],
  ): Promise<StoreRoleResponseDto[]> {
    const definitions = await readGlobalStoreRoles(this.prisma);
    return roles.map((role) => {
      const shared = definitions.find(
        (definition) => definition.systemCode === role.systemCode,
      );
      return {
        ...mapRole(role),
        permissions:
          shared?.permissions.map((p) => mapPermission(p.permission)) ?? [],
        permissionsCount: shared?.permissions.length ?? 0,
        updatedAt:
          shared?.updatedAt.toISOString() ?? role.updatedAt.toISOString(),
      };
    });
  }

  private async ensureDefaultRoles(
    prisma: PrismaService | Prisma.TransactionClient,
    storeId: string,
  ): Promise<void> {
    for (const definition of DEFAULT_ROLE_DEFINITIONS) {
      await prisma.storeRole.upsert({
        where: {
          orgId_systemCode: {
            orgId: storeId,
            systemCode: definition.systemCode,
          },
        },
        create: {
          id: createSelfxId(),
          orgId: storeId,
          systemCode: definition.systemCode,
          name: definition.name,
          description: definition.description,
          isSystem: true,
          isActive: true,
        },
        update: {},
      });
    }
  }

  private async ensureLegacyMembershipRoleAssignments(
    prisma: PrismaService | Prisma.TransactionClient,
    storeId: string,
  ): Promise<void> {
    const memberships = await prisma.organizationMembership.findMany({
      where: { orgId: storeId, roleAssignments: { none: {} } },
      select: { id: true, role: true },
      take: 200,
    });
    if (memberships.length === 0) {
      return;
    }
    const roles = await prisma.storeRole.findMany({
      where: {
        orgId: storeId,
        systemCode: { in: Object.values(LEGACY_ROLE_DEFAULTS) },
      },
      select: { id: true, systemCode: true },
    });
    const roleBySystemCode = new Map(
      roles.map((role) => [role.systemCode, role.id]),
    );
    await prisma.storeMembershipRole.createMany({
      data: memberships.flatMap((membership) => {
        const roleId = roleBySystemCode.get(
          LEGACY_ROLE_DEFAULTS[membership.role],
        );
        return roleId
          ? [
              {
                id: createSelfxId(),
                orgId: storeId,
                membershipId: membership.id,
                roleId,
              },
            ]
          : [];
      }),
      skipDuplicates: true,
    });
  }

  private async hasPlatformStoreBypass(userId: string): Promise<boolean> {
    const assignment = await this.prisma.platformRoleAssignment.findFirst({
      where: {
        userId,
        status: PlatformRoleAssignmentStatus.ACTIVE,
        role: {
          in: [PlatformRole.SELFX_SUPER_ADMIN, PlatformRole.SELFX_STAFF_ADMIN],
        },
      },
      select: { id: true },
    });
    return Boolean(assignment);
  }

  private async findRoleOrThrow(
    storeId: string,
    roleId: string,
  ): Promise<RoleWithRelations> {
    const role = await this.prisma.storeRole.findFirst({
      where: { id: roleId, orgId: storeId },
      include: roleInclude(),
    });
    if (!role) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        STORE_RBAC_ERROR_CODES.roleNotFound,
        "Store role was not found.",
      );
    }
    return role;
  }

  private async findMembershipOrThrow(
    storeId: string,
    membershipId: string,
  ): Promise<MembershipWithRoles> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        id: membershipId,
        orgId: storeId,
        deletedAt: null,
        user: { deletedAt: null },
      },
      include: membershipRoleInclude(),
    });
    if (!membership) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        STORE_RBAC_ERROR_CODES.membershipNotFound,
        "Store membership was not found.",
      );
    }
    return membership;
  }

  private async assertRolesBelongToStore(
    storeId: string,
    roleIds: string[],
  ): Promise<void> {
    const uniqueRoleIds = [...new Set(roleIds)];
    if (uniqueRoleIds.length === 0) {
      return;
    }
    const count = await this.prisma.storeRole.count({
      where: {
        orgId: storeId,
        id: { in: uniqueRoleIds },
        isActive: true,
        systemCode: { in: STORE_ROLE_CODES },
      },
    });
    if (count !== uniqueRoleIds.length) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        STORE_RBAC_ERROR_CODES.crossStoreRoleAssignment,
        "Every assigned role must belong to the same Store.",
      );
    }
  }

  private async defaultRoleId(
    storeId: string,
    systemCode: string,
  ): Promise<string> {
    const role = await this.prisma.storeRole.findUnique({
      where: { orgId_systemCode: { orgId: storeId, systemCode } },
      select: { id: true },
    });
    if (!role) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        STORE_RBAC_ERROR_CODES.roleNotFound,
        "Default Store role was not found.",
      );
    }
    return role.id;
  }

  private async assertNotProtectedOwner(
    prisma: Prisma.TransactionClient,
    storeId: string,
    membershipId: string,
    nextStatus: "ACTIVE" | "SUSPENDED",
  ): Promise<void> {
    if (nextStatus === "ACTIVE") {
      return;
    }
    const membership = await prisma.organizationMembership.findFirst({
      where: { id: membershipId, orgId: storeId },
      select: {
        role: true,
        status: true,
        roleAssignments: {
          select: { role: { select: { systemCode: true, isActive: true } } },
        },
      },
    });
    if (
      !membership ||
      !isStoreAdmin(membership) ||
      membership.status !== MembershipStatus.ACTIVE
    ) {
      return;
    }
    const activeOwners = await prisma.organizationMembership.count({
      where: {
        orgId: storeId,
        ...adminMembershipWhere,
        status: MembershipStatus.ACTIVE,
        id: { not: membershipId },
        deletedAt: null,
        user: { status: UserStatus.ACTIVE, deletedAt: null },
      },
    });
    if (activeOwners === 0) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        STORE_RBAC_ERROR_CODES.systemRoleProtected,
        "A Store cannot lose its final active Store Admin.",
      );
    }
  }
}

function roleInclude() {
  return {
    permissions: {
      include: { permission: true },
      orderBy: { permission: { code: "asc" } },
    },
    _count: { select: { membershipRoles: true, permissions: true } },
  } as const;
}

function membershipRoleInclude() {
  return {
    user: {
      select: { id: true, email: true, displayName: true, deletedAt: true },
    },
    roleAssignments: {
      include: { role: { include: roleInclude() } },
      orderBy: { assignedAt: "asc" },
    },
  } as const;
}

function mapPermission(
  permission: Permission,
  granted = true,
): StorePermissionDto {
  return {
    id: permission.id,
    code: permission.code,
    module: permission.module,
    action: permission.action,
    label: permission.label,
    description: permission.description,
    isSystem: permission.isSystem,
    applicability: permission.applicability,
    granted,
  };
}

function mapRole(role: RoleWithRelations): StoreRoleResponseDto {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    systemCode: role.systemCode,
    isSystem: role.isSystem,
    isActive: role.isActive,
    permissionsCount: role._count.permissions,
    assignedUsersCount: role._count.membershipRoles,
    permissions: role.permissions.map((entry) =>
      mapPermission(entry.permission),
    ),
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

function mapUser(membership: MembershipWithRoles): StoreUserResponseDto {
  return {
    membershipId: membership.id,
    userId: membership.user.id,
    email: membership.user.email,
    displayName: membership.user.displayName,
    deletedAt:
      (membership.deletedAt ?? membership.user.deletedAt)?.toISOString() ??
      null,
    status: membership.status,
    roles: membership.roleAssignments.map((assignment) =>
      mapRole(assignment.role),
    ),
    joinedAt: membership.joinedAt?.toISOString() ?? null,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  };
}

function pagination(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    hasMore: page * pageSize < total,
  };
}

function boundedPositiveInt(
  value: number | undefined,
  fallback: number,
): number {
  if (!value || !Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return Math.floor(value);
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
      STORE_RBAC_ERROR_CODES.roleConflict,
      "Store role name already exists.",
    );
  }
  throw error;
}

function throwStoreNotFound(): never {
  throw new ApiErrorException(
    HttpStatus.NOT_FOUND,
    STORE_RBAC_ERROR_CODES.storeNotFound,
    "Store was not found.",
  );
}

async function createAudit(
  prisma: Pick<Prisma.TransactionClient, "auditLog">,
  input: {
    action: string;
    actorUserId: string;
    storeId: string;
    resourceType: string;
    resourceId: string;
    metadata?: Prisma.InputJsonObject;
  },
) {
  await prisma.auditLog.create({
    data: {
      id: createSelfxId(),
      action: input.action,
      actorUserId: input.actorUserId,
      organizationId: input.storeId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata,
    },
  });
}
