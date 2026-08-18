import { PlatformRole } from "@prisma/client";

export const PLATFORM_PERMISSIONS = {
  organizationApplicationReview: "ORGANIZATION_APPLICATION_REVIEW",
  organizationApplicationApprove: "ORGANIZATION_APPLICATION_APPROVE",
  organizationApplicationReject: "ORGANIZATION_APPLICATION_REJECT",
  organizationActivate: "ORGANIZATION_ACTIVATE",
  organizationSuspend: "ORGANIZATION_SUSPEND",
  storesView: "STORES_VIEW",
  storesCreate: "STORES_CREATE",
  storesUpdate: "STORES_UPDATE",
  storesDeactivate: "STORES_DEACTIVATE",
  storeUsersView: "STORE_USERS_VIEW",
  storeUsersManage: "STORE_USERS_MANAGE",
  storeRolesView: "STORE_ROLES_VIEW",
  storeRolesManage: "STORE_ROLES_MANAGE",
  permissionsView: "PERMISSIONS_VIEW",
  permissionsManage: "PERMISSIONS_MANAGE",
  kiosksView: "KIOSKS_VIEW",
  kiosksPair: "KIOSKS_PAIR",
  kiosksUpdate: "KIOSKS_UPDATE",
  kiosksAssign: "KIOSKS_ASSIGN",
  kiosksRevoke: "KIOSKS_REVOKE",
  kiosksDelete: "KIOSKS_DELETE",
  kiosksConfigure: "KIOSKS_CONFIGURE",
} as const;

export type PlatformPermission =
  (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

const SUPER_ADMIN_PERMISSIONS = Object.values(PLATFORM_PERMISSIONS);

const STAFF_ADMIN_PERMISSIONS: readonly PlatformPermission[] =
  SUPER_ADMIN_PERMISSIONS.filter(
    (permission) =>
      permission !== PLATFORM_PERMISSIONS.permissionsManage &&
      permission !== PLATFORM_PERMISSIONS.organizationSuspend,
  );

const ROLE_PERMISSIONS = {
  [PlatformRole.SELFX_SUPER_ADMIN]: SUPER_ADMIN_PERMISSIONS,
  [PlatformRole.SELFX_STAFF_ADMIN]: STAFF_ADMIN_PERMISSIONS,
  [PlatformRole.SELFX_SUPPORT_ADMIN]: [
    PLATFORM_PERMISSIONS.organizationApplicationReview,
  ],
} satisfies Record<PlatformRole, readonly PlatformPermission[]>;

export function permissionsForPlatformRole(
  role: PlatformRole,
): readonly PlatformPermission[] {
  return ROLE_PERMISSIONS[role];
}
