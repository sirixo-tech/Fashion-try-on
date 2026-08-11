import {
  MembershipStoreScopeMode,
  OrganizationMembershipRole,
} from "@prisma/client";

export const MERCHANT_PERMISSIONS = {
  organizationRead: "ORGANIZATION_READ",
  organizationUpdate: "ORGANIZATION_UPDATE",
  storeRead: "STORE_READ",
  storeCreate: "STORE_CREATE",
  storeUpdate: "STORE_UPDATE",
  storeArchive: "STORE_ARCHIVE",
  membershipRead: "MEMBERSHIP_READ",
  membershipCreate: "MEMBERSHIP_CREATE",
  membershipUpdate: "MEMBERSHIP_UPDATE",
  membershipRoleUpdate: "MEMBERSHIP_ROLE_UPDATE",
  membershipScopeUpdate: "MEMBERSHIP_SCOPE_UPDATE",
  membershipSuspend: "MEMBERSHIP_SUSPEND",
  membershipReactivate: "MEMBERSHIP_REACTIVATE",
} as const;

export type MerchantPermission =
  (typeof MERCHANT_PERMISSIONS)[keyof typeof MERCHANT_PERMISSIONS];

const OWNER_PERMISSIONS = Object.values(MERCHANT_PERMISSIONS);

const ORGANIZATION_ADMIN_PERMISSIONS: readonly MerchantPermission[] = [
  MERCHANT_PERMISSIONS.organizationRead,
  MERCHANT_PERMISSIONS.organizationUpdate,
  MERCHANT_PERMISSIONS.storeRead,
  MERCHANT_PERMISSIONS.storeCreate,
  MERCHANT_PERMISSIONS.storeUpdate,
  MERCHANT_PERMISSIONS.storeArchive,
  MERCHANT_PERMISSIONS.membershipRead,
  MERCHANT_PERMISSIONS.membershipCreate,
  MERCHANT_PERMISSIONS.membershipUpdate,
  MERCHANT_PERMISSIONS.membershipRoleUpdate,
  MERCHANT_PERMISSIONS.membershipScopeUpdate,
  MERCHANT_PERMISSIONS.membershipSuspend,
  MERCHANT_PERMISSIONS.membershipReactivate,
];

const STORE_MANAGER_PERMISSIONS: readonly MerchantPermission[] = [
  MERCHANT_PERMISSIONS.organizationRead,
  MERCHANT_PERMISSIONS.storeRead,
  MERCHANT_PERMISSIONS.storeUpdate,
  MERCHANT_PERMISSIONS.membershipRead,
];

const ROLE_PERMISSIONS = {
  [OrganizationMembershipRole.ORGANIZATION_OWNER]: OWNER_PERMISSIONS,
  [OrganizationMembershipRole.ORGANIZATION_ADMIN]:
    ORGANIZATION_ADMIN_PERMISSIONS,
  [OrganizationMembershipRole.ORGANIZATION_STAFF]: [
    MERCHANT_PERMISSIONS.organizationRead,
    MERCHANT_PERMISSIONS.storeRead,
  ],
  [OrganizationMembershipRole.STORE_OWNER]: STORE_MANAGER_PERMISSIONS,
  [OrganizationMembershipRole.STORE_MANAGER]: STORE_MANAGER_PERMISSIONS,
  [OrganizationMembershipRole.STORE_STAFF]: [
    MERCHANT_PERMISSIONS.organizationRead,
    MERCHANT_PERMISSIONS.storeRead,
  ],
  [OrganizationMembershipRole.KIOSK_OPERATOR]: [
    MERCHANT_PERMISSIONS.organizationRead,
    MERCHANT_PERMISSIONS.storeRead,
  ],
} satisfies Record<OrganizationMembershipRole, readonly MerchantPermission[]>;

const ROLE_STORE_SCOPE_MODES = {
  [OrganizationMembershipRole.ORGANIZATION_OWNER]: [
    MembershipStoreScopeMode.ALL_STORES,
  ],
  [OrganizationMembershipRole.ORGANIZATION_ADMIN]: [
    MembershipStoreScopeMode.ALL_STORES,
  ],
  [OrganizationMembershipRole.ORGANIZATION_STAFF]: [
    MembershipStoreScopeMode.ALL_STORES,
    MembershipStoreScopeMode.SELECTED_STORES,
  ],
  [OrganizationMembershipRole.STORE_OWNER]: [
    MembershipStoreScopeMode.SELECTED_STORES,
  ],
  [OrganizationMembershipRole.STORE_MANAGER]: [
    MembershipStoreScopeMode.SELECTED_STORES,
  ],
  [OrganizationMembershipRole.STORE_STAFF]: [
    MembershipStoreScopeMode.SELECTED_STORES,
  ],
  [OrganizationMembershipRole.KIOSK_OPERATOR]: [
    MembershipStoreScopeMode.SELECTED_STORES,
  ],
} satisfies Record<
  OrganizationMembershipRole,
  readonly MembershipStoreScopeMode[]
>;

export function permissionsForMerchantRole(
  role: OrganizationMembershipRole,
): readonly MerchantPermission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasOwnershipAuthority(
  role: OrganizationMembershipRole,
): boolean {
  return role === OrganizationMembershipRole.ORGANIZATION_OWNER;
}

export function storeScopeModesForMerchantRole(
  role: OrganizationMembershipRole,
): readonly MembershipStoreScopeMode[] {
  return ROLE_STORE_SCOPE_MODES[role];
}

export function isStoreScopeModeAllowedForRole(
  role: OrganizationMembershipRole,
  storeScopeMode: MembershipStoreScopeMode,
): boolean {
  return (
    ROLE_STORE_SCOPE_MODES[role] as readonly MembershipStoreScopeMode[]
  ).includes(storeScopeMode);
}
