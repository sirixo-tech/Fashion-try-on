import { HttpStatus } from "@nestjs/common";
import type { PrismaService } from "../database/prisma.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";

export const STORE_ADMIN_REQUIRED_PERMISSIONS = [
  "stores.view",
  "users.view",
  "users.invite",
  "users.update",
  "users.deactivate",
  "roles.view",
  "roles.assign",
];

export async function platformRoleAuthority(
  prisma: PrismaService,
  actorId: string,
) {
  const actor = await prisma.user.findFirst({
    where: { id: actorId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (!actor) roleDenied();
  const authorization = new PlatformAuthorizationService(prisma);
  const [isSuperadmin, permissions, impersonation] = await Promise.all([
    authorization.isSuperadmin(actorId),
    authorization.allPlatformPermissionsForUser(actorId),
    prisma.impersonationSession.findFirst({
      where: {
        actorUserId: actorId,
        status: "ACTIVE",
        endedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    }),
  ]);
  return { isSuperadmin, permissions, impersonating: !!impersonation };
}
export function roleDenied(
  message = "Role management is not permitted.",
): never {
  throw new ApiErrorException(
    HttpStatus.FORBIDDEN,
    "ROLE_MANAGEMENT_DENIED",
    message,
  );
}
