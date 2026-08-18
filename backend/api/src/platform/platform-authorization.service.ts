import { HttpStatus, Injectable } from "@nestjs/common";
import {
  PermissionApplicability,
  PlatformRoleAssignmentStatus,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_PERMISSION_REGISTRY,
  type PlatformPermission,
  permissionsForPlatformRole,
} from "./platform-permissions.js";

export const PLATFORM_ERROR_CODES = {
  permissionDenied: "PLATFORM_PERMISSION_DENIED",
} as const;

@Injectable()
export class PlatformAuthorizationService {
  private platformPermissionCatalogReady = false;

  constructor(private readonly prisma: PrismaService) {}

  async hasPermission(
    userId: string,
    permission: PlatformPermission,
  ): Promise<boolean> {
    await this.ensurePlatformPermissionCatalog();
    const assignments = await this.prisma.platformRoleAssignment.findMany({
      where: {
        userId,
        status: PlatformRoleAssignmentStatus.ACTIVE,
      },
      select: { role: true },
    });

    if (
      assignments.some((assignment) =>
        permissionsForPlatformRole(assignment.role).includes(permission),
      )
    ) {
      return true;
    }

    const dynamicAssignment =
      await this.prisma.platformUserAccessRole.findFirst({
        where: {
          userId,
          status: PlatformRoleAssignmentStatus.ACTIVE,
          role: {
            isActive: true,
            permissions: { some: { permission: { code: permission } } },
          },
        },
        select: { id: true },
      });

    return Boolean(dynamicAssignment);
  }

  async isSuperadmin(userId: string): Promise<boolean> {
    const assignment = await this.prisma.platformRoleAssignment.findFirst({
      where: {
        userId,
        status: PlatformRoleAssignmentStatus.ACTIVE,
        role: "SELFX_SUPER_ADMIN",
      },
      select: { id: true },
    });
    return Boolean(assignment);
  }

  async ensurePlatformPermissionCatalog(): Promise<void> {
    if (this.platformPermissionCatalogReady) {
      return;
    }
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
    this.platformPermissionCatalogReady = true;
  }

  async staticPermissionsForUser(
    userId: string,
  ): Promise<PlatformPermission[]> {
    const assignments = await this.prisma.platformRoleAssignment.findMany({
      where: {
        userId,
        status: PlatformRoleAssignmentStatus.ACTIVE,
      },
      select: { role: true },
    });
    return [
      ...new Set(
        assignments.flatMap((assignment) =>
          permissionsForPlatformRole(assignment.role),
        ),
      ),
    ];
  }

  async allPlatformPermissionsForUser(
    userId: string,
  ): Promise<PlatformPermission[]> {
    await this.ensurePlatformPermissionCatalog();
    const dynamicAssignments =
      await this.prisma.platformUserAccessRole.findMany({
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
      });
    return [
      ...new Set([
        ...(await this.staticPermissionsForUser(userId)),
        ...dynamicAssignments.flatMap((assignment) =>
          assignment.role.permissions.map((entry) => entry.permission.code),
        ),
      ]),
    ].filter((code): code is PlatformPermission =>
      (Object.values(PLATFORM_PERMISSIONS) as string[]).includes(code),
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
