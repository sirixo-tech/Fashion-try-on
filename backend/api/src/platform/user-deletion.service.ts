import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import {
  type DeleteUserDto,
  type DeleteStoreMemberDto,
} from "./dto/users.dto.js";
import { userSelect, mapUser } from "./users.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";

import { adminMembershipWhere } from "../rbac/role-policy.js";

@Injectable()
export class UserDeletionService {
  constructor(
    private readonly db: PrismaService,
    private readonly rbac: StoreRbacService,
  ) {}

  async deleteAccount(actorId: string, userId: string, input: DeleteUserDto) {
    return this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      await requireSuperadmin(tx, actorId);
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: userSelect,
      });
      if (!user)
        deletionError(
          "USER_NOT_FOUND",
          "User was not found.",
          HttpStatus.NOT_FOUND,
        );
      if (user!.deletedAt)
        deletionError("USER_ALREADY_DELETED", "This user is already deleted.");
      if (actorId === userId)
        deletionError(
          "USER_SELF_DELETE_BLOCKED",
          "You cannot delete your own account.",
        );
      if (mapUser(user!).version !== input.version)
        deletionError(
          "USER_EDIT_CONFLICT",
          "This account changed. Refresh and try again.",
        );
      if (input.confirmEmail.trim().toLowerCase() !== user!.email.toLowerCase())
        deletionError(
          "USER_DELETE_CONFIRMATION_REQUIRED",
          "Type the user's login email to confirm.",
          HttpStatus.BAD_REQUEST,
        );
      if (mapUser(user!).isProtectedSuperadmin)
        deletionError(
          "SELFX_SUPERADMIN_PROTECTED",
          "Superadmin removal is not available.",
        );
      for (const storeId of user!.memberships.map((m) => m.orgId).sort())
        await lockStore(tx, storeId);
      const admins = await tx.organizationMembership.findMany({
        where: {
          userId,
          status: "ACTIVE",
          deletedAt: null,
          ...adminMembershipWhere,
        },
        select: { orgId: true },
      });
      for (const membership of admins) {
        const others = await tx.organizationMembership.count({
          where: {
            orgId: membership.orgId,
            userId: { not: userId },
            status: "ACTIVE",
            deletedAt: null,
            user: { status: "ACTIVE", deletedAt: null },
            ...adminMembershipWhere,
          },
        });
        if (!others)
          deletionError(
            "STORE_FINAL_ADMIN_PROTECTED",
            "Assign another active Store Admin before deleting this user.",
          );
      }
      const kind = user!.memberships.length ? "SOFT" : "HARD";
      if (kind === "SOFT") await softDeleteAccount(tx, userId);
      else await hardDeleteAccount(tx, userId);
      const snapshot = identitySnapshot(user!);
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId: actorId,
          action: `USER_${kind}_DELETED`,
          resourceType: "user",
          resourceId: userId,
          metadata: { deleted_user: snapshot },
        },
      });
      return { kind, user: snapshot };
    });
  }

  async deleteStoreMember(
    actorId: string,
    storeId: string,
    membershipId: string,
    input: DeleteStoreMemberDto,
  ) {
    await this.rbac.requireStorePermission(
      actorId,
      storeId,
      "users.deactivate",
    );
    return this.transaction(async (tx) => {
      // All account mutations lock the user before the Store to avoid deadlocks.
      const candidate = await tx.organizationMembership.findFirst({
        where: { id: membershipId, orgId: storeId },
        select: { userId: true },
      });
      if (!candidate)
        deletionError(
          "STORE_MEMBERSHIP_NOT_FOUND",
          "Store user was not found.",
          HttpStatus.NOT_FOUND,
        );
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${candidate!.userId}::uuid FOR UPDATE`;
      await lockStore(tx, storeId);
      const actor = await tx.user.findFirst({
        where: { id: actorId, status: "ACTIVE", deletedAt: null },
        select: {
          id: true,
          platformRoleAssignments: {
            where: { status: "ACTIVE", role: "SELFX_SUPER_ADMIN" },
            select: { id: true },
          },
        },
      });
      const actorMembership = await tx.organizationMembership.findFirst({
        where: {
          orgId: storeId,
          userId: actorId,
          status: "ACTIVE",
          deletedAt: null,
          organization: { status: "ACTIVE" },
          ...adminMembershipWhere,
          roleAssignments: {
            some: {
              role: {
                isActive: true,
                systemCode: "store-admin",
              },
            },
          },
        },
        select: { id: true },
      });
      const sharedPermission = await tx.globalStoreRolePermission.findFirst({
        where: {
          role: { systemCode: "store-admin" },
          permission: { code: "users.deactivate" },
        },
        select: { id: true },
      });
      if (
        !actor ||
        (!(actorMembership && sharedPermission) &&
          !actor.platformRoleAssignments.length)
      )
        deletionError(
          "STORE_PERMISSION_DENIED",
          "Only an authorized Store Admin can remove Store staff.",
          HttpStatus.FORBIDDEN,
        );
      const member = await tx.organizationMembership.findFirst({
        where: { id: membershipId, orgId: storeId },
        include: { user: true, roleAssignments: { include: { role: true } } },
      });
      if (!member || member.deletedAt)
        deletionError(
          "STORE_MEMBERSHIP_NOT_FOUND",
          "Store user was not found or is already deleted.",
          HttpStatus.NOT_FOUND,
        );
      if (member!.updatedAt.toISOString() !== input.updatedAt)
        deletionError(
          "USER_EDIT_CONFLICT",
          "This membership changed. Refresh and try again.",
        );
      if (
        member!.user.email.toLowerCase() !==
        input.confirmEmail.trim().toLowerCase()
      )
        deletionError(
          "USER_DELETE_CONFIRMATION_REQUIRED",
          "Type the user's login email to confirm.",
          HttpStatus.BAD_REQUEST,
        );
      if (member!.userId === actorId)
        deletionError(
          "USER_SELF_DELETE_BLOCKED",
          "You cannot remove yourself.",
        );
      const targetAdmin = await tx.organizationMembership.count({
        where: { id: membershipId, ...adminMembershipWhere },
      });
      const platformTarget = await tx.platformRoleAssignment.count({
        where: {
          userId: member!.userId,
          role: "SELFX_SUPER_ADMIN",
          status: "ACTIVE",
        },
      });
      if (targetAdmin || platformTarget)
        deletionError(
          "STORE_ADMIN_PROTECTED",
          "Store staff removal cannot remove a Store Admin or protected Superadmin.",
        );
      await tx.organizationMembership.update({
        where: { id: membershipId },
        data: { status: "REVOKED", deletedAt: new Date() },
      });
      const remaining = await tx.organizationMembership.count({
        where: {
          userId: member!.userId,
          deletedAt: null,
          id: { not: membershipId },
        },
      });
      const platform = await hasPlatformIdentity(tx, member!.userId);
      if (!remaining && !platform) await softDeleteAccount(tx, member!.userId);
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId: actorId,
          organizationId: storeId,
          action: "STORE_USER_DELETED",
          resourceType: "organization_membership",
          resourceId: membershipId,
          metadata: {
            deleted_user: identitySnapshot(member!.user),
            global_account_deleted: !remaining && !platform,
          },
        },
      });
      return {
        kind: "SOFT",
        sharedAccountPreserved: Boolean(remaining || platform),
      };
    });
  }

  private async transaction<T>(
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    try {
      return await this.db.$transaction(action, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 20000,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      )
        deletionError(
          "USER_EDIT_CONFLICT",
          "Another change happened. Refresh and try again.",
        );
      throw error;
    }
  }
}

export async function requireSuperadmin(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const actor = await tx.user.findFirst({
    where: {
      id,
      status: "ACTIVE",
      deletedAt: null,
      platformRoleAssignments: {
        some: { role: "SELFX_SUPER_ADMIN", status: "ACTIVE" },
      },
    },
    select: { id: true },
  });
  if (!actor)
    deletionError(
      "PLATFORM_PERMISSION_DENIED",
      "Only Superadmins can delete accounts or permanently delete Stores.",
      HttpStatus.FORBIDDEN,
    );
}
export async function hasPlatformIdentity(
  tx: Prisma.TransactionClient,
  id: string,
) {
  // Preserve platform identities even when their assignment has been revoked.
  return Boolean(
    (await tx.platformRoleAssignment.count({ where: { userId: id } })) ||
    (await tx.platformUserAccessRole.count({ where: { userId: id } })),
  );
}
export async function lockStore(tx: Prisma.TransactionClient, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id})::bigint)`;
}
export function identitySnapshot(user: {
  id: string;
  displayName: string | null;
  email: string;
}) {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    label: `${user.displayName || user.email} (Deleted user)`,
  };
}
export async function softDeleteAccount(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const now = new Date();
  await tx.user.update({
    where: { id },
    data: {
      status: "DISABLED",
      deletedAt: now,
      passwordHash: "DELETED",
      credentialsVersion: { increment: 1 },
      passwordChangedAt: now,
      emailVerifiedAt: null,
    },
  });
  await tx.organizationMembership.updateMany({
    where: { userId: id, deletedAt: null },
    data: { status: "REVOKED", deletedAt: now },
  });
  await tx.userSession.deleteMany({ where: { userId: id } });
  await tx.passwordResetToken.deleteMany({ where: { userId: id } });
  await tx.impersonationSession.updateMany({
    where: { actorUserId: id, status: "ACTIVE" },
    data: { status: "ENDED", endedAt: now },
  });
}
export async function hardDeleteAccount(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const user = await tx.user.findUniqueOrThrow({
    where: { id },
    select: { id: true, email: true, displayName: true },
  });
  const snapshot = identitySnapshot(user);
  await tx.auditLog.updateMany({
    where: { actorUserId: id },
    data: { actorSnapshot: snapshot },
  });
  await tx.impersonationSession.updateMany({
    where: { actorUserId: id },
    data: { actorSnapshot: snapshot, status: "ENDED", endedAt: new Date() },
  });
  await tx.organizationApplication.updateMany({
    where: { submittedByUserId: id },
    data: { submittedBySnapshot: snapshot },
  });
  await tx.integrationCredential.updateMany({
    where: { createdByUserId: id },
    data: { createdBySnapshot: snapshot },
  });
  await tx.apiKey.updateMany({
    where: { createdByUserId: id },
    data: { createdBySnapshot: snapshot },
  });
  await tx.platformPaymentTest.updateMany({
    where: { createdById: id },
    data: { createdBySnapshot: snapshot },
  });
  await tx.platformUserAccessRole.deleteMany({ where: { userId: id } });
  await tx.platformRoleAssignment.deleteMany({ where: { userId: id } });
  await tx.user.delete({ where: { id } });
}
export function deletionError(
  code: string,
  message: string,
  status: HttpStatus = HttpStatus.CONFLICT,
): never {
  throw new ApiErrorException(status, code, message);
}
