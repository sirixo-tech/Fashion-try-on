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
  platformProductsView: "PLATFORM_PRODUCTS_VIEW",
  platformProductsManage: "PLATFORM_PRODUCTS_MANAGE",
  usageView: "USAGE_VIEW",
  developerApiView: "DEVELOPER_API_VIEW",
  developerApiManage: "DEVELOPER_API_MANAGE",
  permissionsView: "PERMISSIONS_VIEW",
  permissionsManage: "PERMISSIONS_MANAGE",
  platformRolesManage: "PLATFORM_ROLES_MANAGE",
  platformUsersManage: "PLATFORM_USERS_MANAGE",
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
      code: PLATFORM_PERMISSIONS.platformProductsView,
      module: "platform.products",
      action: "view",
      label: "View Platform Products",
      description: "View the SelfX platform default product catalog.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.platformProductsManage,
      module: "platform.products",
      action: "manage",
      label: "Manage Platform Products",
      description: "Manage SelfX platform default catalog products.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.usageView,
      module: "platform.usage",
      action: "view",
      label: "View Usage & Billing",
      description: "View privacy-safe usage and billing rollups.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.developerApiView,
      module: "platform.developer_api",
      action: "view",
      label: "View Developer API",
      description: "View Store developer API keys across SelfX.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.developerApiManage,
      module: "platform.developer_api",
      action: "manage",
      label: "Manage Developer API",
      description: "Create and revoke Store developer API keys.",
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
      action: "manage_protected_access",
      label: "Manage Protected Access Control",
      description:
        "Manage protected Superadmin-level access control authorities.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.platformRolesManage,
      module: "platform.access",
      action: "manage_platform_roles",
      label: "Manage Platform Roles",
      description:
        "Create and update non-protected SelfX Platform roles and their permissions.",
      applicability: "PLATFORM_ONLY",
    },
    {
      code: PLATFORM_PERMISSIONS.platformUsersManage,
      module: "platform.access",
      action: "manage_platform_users",
      label: "Manage Platform Users",
      description:
        "Assign non-protected SelfX Platform roles to Platform users.",
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
      permission !== PLATFORM_PERMISSIONS.organizationSuspend &&
      permission !== PLATFORM_PERMISSIONS.platformProductsView &&
      permission !== PLATFORM_PERMISSIONS.platformProductsManage,
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
