import { HttpStatus, Injectable } from "@nestjs/common";
import { MembershipStatus, OrganizationStatus } from "@prisma/client";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { ORGANIZATION_ERROR_CODES } from "./organization-error-codes.js";

@Injectable()
export class OrganizationTenantGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async requireActiveTenantMembership(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        status: true,
        memberships: {
          where: { userId },
          select: { id: true, status: true },
          take: 1,
        },
      },
    });

    if (!organization || organization.memberships.length === 0) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        ORGANIZATION_ERROR_CODES.applicationAccessDenied,
        "Organization access denied.",
      );
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
        ORGANIZATION_ERROR_CODES.applicationAccessDenied,
        "Organization access denied.",
      );
    }
  }
}
