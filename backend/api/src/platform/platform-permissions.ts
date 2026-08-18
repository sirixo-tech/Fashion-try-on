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

export type PlatformPermissionDefinition = {
  code: PlatformPermission;
  module: string;
  action: string;
  label: string;
  description: string;
  applicability: "PLATFORM_ONLY";
};

export const PLATFORM_PERMISSION_REGISTRY: readonly PlatformPermissionDefinition[] =
  [
    {
      code: PLATFORM_PERMISSIONS.organizationApplicationReview,
      module: "platform.organizations",
      action: "review_application",
      label: "Review Store Applications",
      description: "Review submitted Store onboarding applications.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.organizationApplicationApprove,
      module: "platform.organizations",
      action: "approve_application",
      label: "Approve Store Applications",
      description: "Approve Store applications and activation requirements.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.organizationApplicationReject,
      module: "platform.organizations",
      action: "reject_application",
      label: "Reject Store Applications",
      description: "Reject Store onboarding applications.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.organizationActivate,
      module: "platform.organizations",
      action: "activate",
      label: "Activate Stores",
      description: "Activate approved Stores for operational use.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.organizationSuspend,
      module: "platform.organizations",
      action: "suspend",
      label: "Suspend Stores",
      description: "Suspend Stores from operational use.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.storesView,
      module: "platform.stores",
      action: "view",
      label: "View All Stores",
      description: "View Stores across the SelfX platform.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.storesCreate,
      module: "platform.stores",
      action: "create",
      label: "Create Stores",
      description: "Create Stores from the SelfX platform console.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.storesUpdate,
      module: "platform.stores",
      action: "update",
      label: "Update Stores",
      description: "Update Store records from the SelfX platform console.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.storesDeactivate,
      module: "platform.stores",
      action: "deactivate",
      label: "Deactivate Stores",
      description: "Deactivate Stores from the SelfX platform console.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.storeUsersView,
      module: "platform.store_users",
      action: "view",
      label: "View Store Users Globally",
      description: "View Store users across Store tenants.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.storeUsersManage,
      module: "platform.store_users",
      action: "manage",
      label: "Manage Store Users Globally",
      description: "Manage Store users across Store tenants.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.storeRolesView,
      module: "platform.store_roles",
      action: "view",
      label: "View Store Roles Globally",
      description: "View Store roles across Store tenants.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.storeRolesManage,
      module: "platform.store_roles",
      action: "manage",
      label: "Manage Store Roles Globally",
      description: "Manage Store roles across Store tenants.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.permissionsView,
      module: "platform.access",
      action: "view_permissions",
      label: "View Permission Registry",
      description: "View the global SelfX permission registry.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.permissionsManage,
      module: "platform.access",
      action: "manage_permissions",
      label: "Manage Access Control",
      description:
        "Manage platform roles, platform users and Store permission ceilings.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.kiosksView,
      module: "platform.kiosks",
      action: "view",
      label: "View Kiosks Globally",
      description: "View kiosks across the SelfX platform.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.kiosksPair,
      module: "platform.kiosks",
      action: "pair",
      label: "Pair Kiosks Globally",
      description: "Pair kiosks from the SelfX platform console.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.kiosksUpdate,
      module: "platform.kiosks",
      action: "update",
      label: "Update Kiosks Globally",
      description: "Update kiosk metadata across the SelfX platform.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.kiosksAssign,
      module: "platform.kiosks",
      action: "assign",
      label: "Assign Kiosks Globally",
      description: "Assign kiosks to Store tenants.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.kiosksRevoke,
      module: "platform.kiosks",
      action: "revoke",
      label: "Revoke Kiosks Globally",
      description: "Revoke kiosk devices or sessions.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.kiosksDelete,
      module: "platform.kiosks",
      action: "delete",
      label: "Delete Kiosks Globally",
      description: "Delete kiosk devices from the platform console.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.kiosksConfigure,
      module: "platform.kiosks",
      action: "configure",
      label: "Configure Kiosks Globally",
      description: "Configure kiosk runtime settings across Store tenants.",
      applicability: "PLATFORM_ONLY",
    },
  ] as const;

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
