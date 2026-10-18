import { createHash } from "node:crypto";
import { isUUID } from "class-validator";
import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { PasswordService } from "../auth/password.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import {
  adminMembershipWhere,
  isStoreAdmin,
  PLATFORM_ROLE_CODES,
  STORE_ROLE_CODES,
} from "../rbac/role-policy.js";
import {
  type AssignFirstOwnerDto,
  type UpdateUserDto,
  type UsersQueryDto,
} from "./dto/users.dto.js";

// Explicit safe projection: hashes, reset links and session credentials never
// enter the user-management response or its optimistic-concurrency digest.
export const userSelect = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  credentialsVersion: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  platformRoleAssignments: {
    where: { status: "ACTIVE" },
    orderBy: { id: "asc" },
    select: { role: true },
  },
  platformAccessRoleAssignments: {
    where: { status: "ACTIVE" },
    orderBy: { id: "asc" },
    select: { role: { select: { id: true, name: true, isActive: true } } },
  },
  memberships: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      orgId: true,
      role: true,
      status: true,
      updatedAt: true,
      deletedAt: true,
      storeScopeMode: true,
      organization: { select: { name: true, status: true } },
      roleAssignments: {
        orderBy: { roleId: "asc" },
        select: {
          role: {
            select: { id: true, name: true, isActive: true, systemCode: true },
          },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;
type UserRecord = Prisma.UserGetPayload<{ select: typeof userSelect }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly db: PrismaService,
    private readonly passwords: PasswordService,
    private readonly rbac: StoreRbacService,
  ) {}

  async assignFirstOwner(
    actorUserId: string,
    userId: string,
    input: AssignFirstOwnerDto,
  ) {
    try {
      await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.storeId})::bigint)`;
          const actor = await tx.user.findFirst({
            where: {
              id: actorUserId,
              status: "ACTIVE",
              platformRoleAssignments: {
                some: { role: "SELFX_SUPER_ADMIN", status: "ACTIVE" },
              },
            },
            select: { id: true },
          });
          if (!actor)
            fail(
              "PLATFORM_PERMISSION_DENIED",
              "Only SelfX Superadmins can assign the first Store Admin.",
              HttpStatus.FORBIDDEN,
            );
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: userSelect,
          });
          if (!user)
            fail("USER_NOT_FOUND", "User was not found.", HttpStatus.NOT_FOUND);
          if (user!.deletedAt)
            fail(
              "USER_DELETED",
              "Deleted users cannot be edited or reactivated.",
            );
          if (
            user!.memberships.some(
              (member) => member.orgId === input.storeId && member.deletedAt,
            )
          )
            fail("USER_DELETED", "A deleted Store link cannot be restored.");
          if (mapUser(user!).version !== input.version)
            fail(
              "USER_EDIT_CONFLICT",
              "This account changed. Close and reopen Edit.",
            );
          if (user!.status !== "ACTIVE" || mapUser(user!).isProtectedSuperadmin)
            fail(
              "STORE_OWNER_ACCOUNT_INVALID",
              "Select an active, non-protected account for Store ownership.",
            );
          const store = await tx.organization.findUnique({
            where: { id: input.storeId },
            select: { name: true, status: true },
          });
          if (!store || store.status !== "ACTIVE")
            fail("STORE_INACTIVE", "Select an active Store.");
          if (store!.name !== input.confirmStoreName)
            fail(
              "STORE_OWNER_CONFIRMATION_REQUIRED",
              "Type the Store name exactly to confirm.",
              HttpStatus.BAD_REQUEST,
            );
          const owners = await tx.organizationMembership.count({
            where: {
              orgId: input.storeId,
              ...adminMembershipWhere,
              status: "ACTIVE",
              user: { status: "ACTIVE" },
            },
          });
          if (owners)
            fail(
              "STORE_ALREADY_HAS_OWNER",
              "This Store already has an active owner. Ownership transfer requires a separate controlled operation.",
            );
          // Reuse default Store RBAC; never seed or broaden the Store's permission ceiling.
          await this.rbac.ensureStoreRbacInTransaction(tx, input.storeId);
          const grant = await tx.storePermissionGrant.findFirst({
            where: {
              storeTenantId: input.storeId,
              permission: { code: "stores.view" },
            },
            select: { id: true },
          });
          if (!grant)
            fail(
              "STORE_PERMISSION_NOT_GRANTED",
              "Grant Store viewing permission before assigning its first owner.",
            );
          const role = await tx.storeRole.findUniqueOrThrow({
            where: {
              orgId_systemCode: {
                orgId: input.storeId,
                systemCode: "store-admin",
              },
            },
          });
          if (!role.isActive)
            fail("STORE_ROLE_INVALID", "The Store Admin role must be active.");
          const membership = await tx.organizationMembership.upsert({
            where: { orgId_userId: { orgId: input.storeId, userId } },
            create: {
              id: createSelfxId(),
              orgId: input.storeId,
              userId,
              role: "ORGANIZATION_OWNER",
              status: "ACTIVE",
              storeScopeMode: "ALL_STORES",
              joinedAt: new Date(),
            },
            update: {
              role: "ORGANIZATION_OWNER",
              status: "ACTIVE",
              storeScopeMode: "ALL_STORES",
              suspendedAt: null,
              joinedAt: new Date(),
            },
          });
          await tx.membershipStoreScope.deleteMany({
            where: { membershipId: membership.id },
          });
          await tx.storeMembershipRole.upsert({
            where: {
              membershipId_roleId: {
                membershipId: membership.id,
                roleId: role.id,
              },
            },
            create: {
              id: createSelfxId(),
              orgId: input.storeId,
              membershipId: membership.id,
              roleId: role.id,
              assignedByUserId: actorUserId,
            },
            update: {},
          });
          await tx.auditLog.create({
            data: {
              id: createSelfxId(),
              actorUserId,
              organizationId: input.storeId,
              action: "STORE_FIRST_OWNER_ASSIGNED",
              resourceType: "organization_membership",
              resourceId: membership.id,
              metadata: { user_id: userId, role_id: role.id },
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 20000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      )
        fail(
          "USER_EDIT_CONFLICT",
          "Another change happened. Reopen Edit and try again.",
        );
      throw error;
    }
    return this.get(userId);
  }

  async list(query: UsersQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(query.search?.trim()
        ? {
            OR: [
              { email: { contains: query.search.trim(), mode: "insensitive" } },
              {
                displayName: {
                  contains: query.search.trim(),
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      deletedAt:
        query.deleted === "only"
          ? { not: null }
          : query.deleted === "all"
            ? undefined
            : null,
      ...(query.storeId
        ? { memberships: { some: { orgId: query.storeId } } }
        : {}),
    };
    const platform: Prisma.UserWhereInput = {
      OR: [
        { platformRoleAssignments: { some: { status: "ACTIVE" } } },
        {
          platformAccessRoleAssignments: {
            some: { status: "ACTIVE", role: { isActive: true } },
          },
        },
      ],
    };
    if (query.access === "platform") where.AND = [platform];
    if (query.access === "superadmin")
      where.AND = [
        {
          platformRoleAssignments: {
            some: { status: "ACTIVE", role: "SELFX_SUPER_ADMIN" },
          },
        },
      ];
    if (query.access === "store") where.AND = [{ memberships: { some: {} } }];
    if (query.access === "unlinked")
      where.AND = [{ NOT: platform }, { memberships: { none: {} } }];
    if (query.role) {
      let roleFilter: Prisma.UserWhereInput;
      if (query.role === "owner")
        roleFilter = {
          memberships: {
            some: {
              role: "ORGANIZATION_OWNER",
              ...(query.storeId ? { orgId: query.storeId } : {}),
            },
          },
        };
      else if (STORE_ROLE_CODES.includes(query.role))
        roleFilter = {
          memberships: {
            some: {
              ...(query.storeId ? { orgId: query.storeId } : {}),
              roleAssignments: { some: { role: { systemCode: query.role } } },
            },
          },
        };
      else if (isUUID(query.role))
        roleFilter = {
          platformAccessRoleAssignments: {
            some: { roleId: query.role, status: "ACTIVE" },
          },
        };
      else
        fail(
          "USER_ROLE_FILTER_INVALID",
          "Select a supported role filter.",
          HttpStatus.BAD_REQUEST,
        );
      const previous = Array.isArray(where.AND) ? where.AND : [];
      where.AND = [...previous, roleFilter!];
    }
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 25;
    const [total, users] = await this.db.$transaction([
      this.db.user.count({ where }),
      this.db.user.findMany({
        where,
        select: userSelect,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    ]);
    return {
      data: users.map(mapUser),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async get(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });
    if (!user)
      fail("USER_NOT_FOUND", "User was not found.", HttpStatus.NOT_FOUND);
    return mapUser(user!);
  }

  async deletionHistory(query: UsersQueryDto) {
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 25;
    const where = {
      action: {
        in: [
          "USER_SOFT_DELETED",
          "USER_HARD_DELETED",
          "STORE_USER_DELETED",
          "STORE_PERMANENTLY_DELETED",
        ],
      },
    };
    const [total, data] = await this.db.$transaction([
      this.db.auditLog.count({ where }),
      this.db.auditLog.findMany({
        where,
        select: { id: true, action: true, metadata: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async stores(query: UsersQueryDto) {
    const where: Prisma.OrganizationWhereInput = query.search?.trim()
      ? {
          OR: [
            { name: { contains: query.search.trim(), mode: "insensitive" } },
            { slug: { contains: query.search.trim(), mode: "insensitive" } },
          ],
        }
      : {};
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 25;
    const [total, stores] = await this.db.$transaction([
      this.db.organization.count({ where }),
      this.db.organization.findMany({
        where,
        select: { id: true, name: true, status: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: stores,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async update(actorUserId: string, userId: string, input: UpdateUserDto) {
    // Recheck authority in the transaction as well as at the controller boundary.
    const passwordHash = input.newPassword
      ? await this.passwords.hashPassword(input.newPassword)
      : undefined;
    try {
      await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
          const actor = await tx.user.findFirst({
            where: {
              id: actorUserId,
              status: "ACTIVE",
              platformRoleAssignments: {
                some: { role: "SELFX_SUPER_ADMIN", status: "ACTIVE" },
              },
            },
            select: { id: true },
          });
          if (!actor)
            fail(
              "PLATFORM_PERMISSION_DENIED",
              "Only SelfX Superadmins can edit accounts.",
              HttpStatus.FORBIDDEN,
            );
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: userSelect,
          });
          if (!user)
            fail("USER_NOT_FOUND", "User was not found.", HttpStatus.NOT_FOUND);
          if (user!.deletedAt)
            fail(
              "USER_DELETED",
              "Deleted users cannot be edited or reactivated.",
            );
          if (mapUser(user!).version !== input.version)
            fail(
              "USER_EDIT_CONFLICT",
              "This account changed. Close and reopen Edit before saving.",
            );
          // Protected bootstrap authority is never changed by an ordinary editor.
          if (
            user!.platformRoleAssignments.some(
              (a) => a.role === "SELFX_SUPER_ADMIN",
            )
          )
            fail(
              "SELFX_SUPERADMIN_PROTECTED",
              "Protected Superadmin accounts require controlled account maintenance.",
            );
          const email = input.email.trim().toLowerCase();
          const storeIds = [
            ...new Set([
              ...user!.memberships.map((m) => m.orgId),
              ...input.memberships.map((m) => m.storeId),
            ]),
          ].sort();
          for (const storeId of storeIds)
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${storeId})::bigint)`;
          if (input.status !== "ACTIVE") {
            for (const membership of user!.memberships.filter(
              (m) => isStoreAdmin(m) && m.status === "ACTIVE",
            )) {
              const others = await tx.organizationMembership.count({
                where: {
                  orgId: membership.orgId,
                  ...adminMembershipWhere,
                  status: "ACTIVE",
                  userId: { not: userId },
                  user: { status: "ACTIVE" },
                },
              });
              if (!others)
                fail(
                  "STORE_FINAL_OWNER_PROTECTED",
                  "Assign another active Store Owner before disabling this account.",
                );
            }
          }
          if (
            new Set(input.memberships.map((m) => m.storeId)).size !==
            input.memberships.length
          )
            fail(
              "STORE_MEMBERSHIP_DUPLICATE",
              "Each Store may appear only once.",
              HttpStatus.BAD_REQUEST,
            );
          for (const link of input.memberships) {
            const current = user!.memberships.find(
              (m) => m.orgId === link.storeId,
            );
            if (current?.deletedAt)
              fail(
                "USER_DELETED",
                "Deleted Store memberships cannot be reactivated.",
              );
            if (
              (current &&
                (current.id !== link.membershipId ||
                  current.updatedAt.toISOString() !== link.updatedAt)) ||
              (!current && link.membershipId)
            )
              fail(
                "STORE_MEMBERSHIP_CONFLICT",
                "Store membership changed. Reopen Edit.",
              );
            const store = await tx.organization.findUnique({
              where: { id: link.storeId },
              select: { status: true },
            });
            if (store?.status !== "ACTIVE")
              fail(
                "STORE_INACTIVE",
                "Only active Stores can have memberships edited.",
              );
            if (current && isStoreAdmin(current))
              fail(
                "STORE_OWNER_PROTECTED",
                "Owner memberships require a controlled ownership action.",
              );
            if (link.status === "ACTIVE" && !link.roleIds.length)
              fail(
                "STORE_ROLE_REQUIRED",
                "Select at least one role for an active Store membership.",
                HttpStatus.BAD_REQUEST,
              );
            const count = await tx.storeRole.count({
              where: {
                id: { in: link.roleIds },
                orgId: link.storeId,
                isActive: true,
                systemCode: { in: STORE_ROLE_CODES },
              },
            });
            if (count !== link.roleIds.length)
              fail(
                "STORE_ROLE_TENANT_MISMATCH",
                "Select active roles belonging to the selected Store.",
                HttpStatus.BAD_REQUEST,
              );
            const membership = current
              ? await tx.organizationMembership.update({
                  where: { id: current.id },
                  data: {
                    status: link.status,
                    suspendedAt:
                      link.status === "SUSPENDED" ? new Date() : null,
                    joinedAt:
                      current.status !== "ACTIVE" && link.status === "ACTIVE"
                        ? new Date()
                        : undefined,
                  },
                })
              : await tx.organizationMembership.create({
                  data: {
                    id: createSelfxId(),
                    userId,
                    orgId: link.storeId,
                    role: "STORE_STAFF",
                    storeScopeMode: "ALL_STORES",
                    status: link.status,
                    joinedAt: link.status === "ACTIVE" ? new Date() : null,
                  },
                });
            await tx.storeMembershipRole.deleteMany({
              where: { membershipId: membership.id },
            });
            await tx.storeMembershipRole.createMany({
              data: link.roleIds.map((roleId) => ({
                id: createSelfxId(),
                orgId: link.storeId,
                membershipId: membership.id,
                roleId,
                assignedByUserId: actorUserId,
              })),
            });
            await tx.auditLog.create({
              data: {
                id: createSelfxId(),
                actorUserId,
                organizationId: link.storeId,
                action: current
                  ? "STORE_MEMBERSHIP_UPDATED"
                  : "STORE_MEMBERSHIP_CREATED",
                resourceType: "organization_membership",
                resourceId: membership.id,
                metadata: {
                  user_id: userId,
                  status: link.status,
                  role_ids: link.roleIds,
                },
              },
            });
          }
          if (input.platformRoleIds) {
            const count = await tx.platformAccessRole.count({
              where: {
                id: { in: input.platformRoleIds },
                isActive: true,
                systemCode: { in: PLATFORM_ROLE_CODES },
              },
            });
            if (count !== input.platformRoleIds.length)
              fail(
                "PLATFORM_ROLE_INVALID",
                "Select active Platform roles.",
                HttpStatus.BAD_REQUEST,
              );
            await tx.platformUserAccessRole.deleteMany({ where: { userId } });
            await tx.platformUserAccessRole.createMany({
              data: input.platformRoleIds.map((roleId) => ({
                id: createSelfxId(),
                userId,
                roleId,
                assignedByUserId: actorUserId,
              })),
            });
          }
          const credentialsChanged =
            email !== user!.email || Boolean(passwordHash);
          const invalidate =
            credentialsChanged || input.status !== user!.status;
          const now = new Date();
          await tx.user.update({
            where: { id: userId },
            data: {
              displayName: input.displayName.trim(),
              email,
              status: input.status,
              ...(email !== user!.email ? { emailVerifiedAt: null } : {}),
              ...(passwordHash ? { passwordHash } : {}),
              ...(invalidate
                ? {
                    credentialsVersion: { increment: 1 },
                    passwordChangedAt: now,
                  }
                : {}),
            },
          });
          if (invalidate) {
            await tx.userSession.updateMany({
              where: { userId, revokedAt: null },
              data: { revokedAt: now },
            });
            await tx.passwordResetToken.updateMany({
              where: { userId, usedAt: null },
              data: { usedAt: now },
            });
            await tx.impersonationSession.updateMany({
              where: { actorUserId: userId, status: "ACTIVE" },
              data: { status: "ENDED", endedAt: now },
            });
          }
          await tx.auditLog.create({
            data: {
              id: createSelfxId(),
              actorUserId,
              action: "USER_ACCOUNT_UPDATED",
              resourceType: "user",
              resourceId: userId,
              metadata: {
                profile_changed: input.displayName.trim() !== user!.displayName,
                email_changed: email !== user!.email,
                password_changed: Boolean(passwordHash),
                status: input.status,
                sessions_revoked: invalidate,
                ...(input.platformRoleIds
                  ? { platform_role_ids: input.platformRoleIds }
                  : {}),
              },
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 15000,
        },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002")
          fail(
            "USER_EMAIL_CONFLICT",
            "This login email is already used by another account.",
          );
        if (error.code === "P2034")
          fail(
            "USER_EDIT_CONFLICT",
            "Another change happened at the same time. Reopen Edit and try again.",
          );
      }
      throw error;
    }
    return this.get(userId);
  }
}

export function mapUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    deletedAt: user.deletedAt?.toISOString() ?? null,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    version: createHash("sha256").update(JSON.stringify(user)).digest("hex"),
    isProtectedSuperadmin: user.platformRoleAssignments.some(
      (a) => a.role === "SELFX_SUPER_ADMIN",
    ),
    staticPlatformRoles: user.platformRoleAssignments.map((a) => a.role),
    platformRoles: user.platformAccessRoleAssignments.map((a) => a.role),
    memberships: user.memberships.map((m) => ({
      membershipId: m.id,
      storeId: m.orgId,
      storeName: m.organization.name,
      storeStatus: m.organization.status,
      membershipRole: m.role,
      status: m.status,
      deletedAt: m.deletedAt?.toISOString() ?? null,
      isStoreAdmin: isStoreAdmin(m),
      storeScopeMode: m.storeScopeMode,
      updatedAt: m.updatedAt.toISOString(),
      roles: m.roleAssignments.map((a) => a.role),
    })),
  };
}

function fail(
  code: string,
  message: string,
  status: HttpStatus = HttpStatus.CONFLICT,
): never {
  throw new ApiErrorException(status, code, message);
}
