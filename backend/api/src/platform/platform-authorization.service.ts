import { HttpStatus, Injectable } from "@nestjs/common";
import { PlatformRoleAssignmentStatus } from "@prisma/client";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  type PlatformPermission,
  permissionsForPlatformRole,
} from "./platform-permissions.js";

export const PLATFORM_ERROR_CODES = {
  permissionDenied: "PLATFORM_PERMISSION_DENIED",
} as const;

@Injectable()
export class PlatformAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async hasPermission(
    userId: string,
    permission: PlatformPermission,
  ): Promise<boolean> {
    const assignments = await this.prisma.platformRoleAssignment.findMany({
      where: {
        userId,
        status: PlatformRoleAssignmentStatus.ACTIVE,
      },
      select: { role: true },
    });

    return assignments.some((assignment) =>
      permissionsForPlatformRole(assignment.role).includes(permission),
    );
  }

  async requirePermission(
    userId: string,
    permission: PlatformPermission,
  ): Promise<void> {
    if (await this.hasPermission(userId, permission)) {
      return;
    }

    throw new ApiErrorException(
      HttpStatus.FORBIDDEN,
      PLATFORM_ERROR_CODES.permissionDenied,
      "Platform permission denied.",
    );
  }
}
