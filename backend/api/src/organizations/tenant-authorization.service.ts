import { HttpStatus, Injectable } from "@nestjs/common";
import {
  MembershipStatus,
  MembershipStoreScopeMode,
  OrganizationMembershipRole,
  OrganizationStatus,
  type OrganizationMembership,
} from "@prisma/client";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  type MerchantPermission,
  permissionsForMerchantRole,
} from "./merchant-permissions.js";
import { ORGANIZATION_ERROR_CODES } from "./organization-error-codes.js";

export interface TenantAuthorizationResult {
  organizationId: string;
  membership: Pick<
    OrganizationMembership,
    "id" | "role" | "status" | "storeScopeMode"
  >;
}

@Injectable()
export class TenantAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async authorize(
    userId: string,
    organizationId: string,
    permission: MerchantPermission,
    options: { storeId?: string } = {},
  ): Promise<TenantAuthorizationResult> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        status: true,
        memberships: {
          where: { userId },
          select: {
            id: true,
            role: true,
            status: true,
            storeScopeMode: true,
          },
          take: 1,
        },
      },
    });

    if (!organization || organization.memberships.length === 0) {
      throwAccessDenied();
    }

    if (organization.status === OrganizationStatus.SUSPENDED) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        ORGANIZATION_ERROR_CODES.suspended,
        "Organization is suspended.",
      );
    }

    if (organization.status !== OrganizationStatus.ACTIVE) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        ORGANIZATION_ERROR_CODES.organizationNotActive,
        "Organization is not active.",
      );
    }

    const membership = organization.memberships[0]!;
    if (membership.status !== MembershipStatus.ACTIVE) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        ORGANIZATION_ERROR_CODES.membershipInactive,
        "Membership is not active.",
      );
    }

    if (!permissionsForMerchantRole(membership.role).includes(permission)) {
      throwPermissionDenied();
    }

    if (options.storeId) {
      await this.assertStoreScope(membership, organizationId, options.storeId);
    }

    return { organizationId, membership };
  }

  async authorizedStoreIdsForMembership(
    organizationId: string,
    membershipId: string,
    storeScopeMode: MembershipStoreScopeMode,
  ): Promise<string[] | null> {
    if (storeScopeMode === MembershipStoreScopeMode.ALL_STORES) {
      return null;
    }

    const scopes = await this.prisma.membershipStoreScope.findMany({
      where: { orgId: organizationId, membershipId },
      select: { storeId: true },
      orderBy: { createdAt: "asc" },
    });
    return scopes.map((scope) => scope.storeId);
  }

  private async assertStoreScope(
    membership: Pick<
      OrganizationMembership,
      "id" | "storeScopeMode" | "role" | "status"
    >,
    organizationId: string,
    storeId: string,
  ): Promise<void> {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, orgId: organizationId },
      select: { id: true },
    });
    if (!store) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        ORGANIZATION_ERROR_CODES.storeNotFound,
        "Store was not found.",
      );
    }

    if (membership.storeScopeMode === MembershipStoreScopeMode.ALL_STORES) {
      return;
    }

    const scope = await this.prisma.membershipStoreScope.findUnique({
      where: {
        membershipId_storeId: {
          membershipId: membership.id,
          storeId,
        },
      },
      select: { id: true },
    });
    if (!scope) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        ORGANIZATION_ERROR_CODES.storeAccessDenied,
        "Store access denied.",
      );
    }
  }
}

export function throwAccessDenied(): never {
  throw new ApiErrorException(
    HttpStatus.FORBIDDEN,
    ORGANIZATION_ERROR_CODES.organizationAccessDenied,
    "Organization access denied.",
  );
}

export function throwPermissionDenied(): never {
  throw new ApiErrorException(
    HttpStatus.FORBIDDEN,
    ORGANIZATION_ERROR_CODES.permissionDenied,
    "Permission denied.",
  );
}

export function isOwnerRole(role: OrganizationMembershipRole): boolean {
  return role === OrganizationMembershipRole.ORGANIZATION_OWNER;
}
