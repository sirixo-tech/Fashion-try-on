import type { SelfxNavItem } from "@selfx/ui";

export type NavigationAccess = {
  isSuperadmin: boolean;
  hasPlatformAccess: boolean;
  platformPermissions: string[];
  storePermissions: string[];
  storePlatformBypass: boolean;
  hasActiveStore: boolean;
};

const platformPermissionsByHref: Record<string, string[]> = {
  "/app/stores": ["STORES_VIEW"],
  "/app/onboarding": ["ORGANIZATION_APPLICATION_REVIEW"],
  "/app/products": ["PLATFORM_PRODUCTS_VIEW", "PLATFORM_PRODUCTS_MANAGE"],
  "/app/kiosks": ["KIOSKS_VIEW"],
  "/app/billing": ["USAGE_VIEW"],
  "/app/staff": ["STORE_USERS_VIEW", "STORE_USERS_MANAGE"],
  "/app/permissions": [
    "PERMISSIONS_VIEW",
    "PERMISSIONS_MANAGE",
    "PLATFORM_ROLES_MANAGE",
    "STORE_ROLES_VIEW",
    "STORE_ROLES_MANAGE",
  ],
  "/app/roles": [
    "PERMISSIONS_MANAGE",
    "PERMISSIONS_VIEW",
    "PLATFORM_ROLES_MANAGE",
    "PLATFORM_USERS_MANAGE",
  ],
  "/app/users": [
    "PERMISSIONS_MANAGE",
    "PERMISSIONS_VIEW",
    "PLATFORM_USERS_MANAGE",
  ],
  "/app/settings": ["PERMISSIONS_MANAGE"],
  "/app/platform": [
    "ORGANIZATION_APPLICATION_REVIEW",
    "ORGANIZATION_APPLICATION_APPROVE",
    "ORGANIZATION_APPLICATION_REJECT",
    "ORGANIZATION_ACTIVATE",
    "ORGANIZATION_SUSPEND",
  ],
};

const storePermissionsByHref: Record<string, string[]> = {
  "/app/staff": ["users.view"],
  "/app/analytics": ["analytics.view"],
  "/app/billing": ["analytics.view"],
  "/app/integrations/shopify": ["integrations.view"],
  "/app/integrations/woocommerce": ["integrations.view"],
};

const platformOnlyHrefs = new Set(["/app/developer", "/app/try-on-lab"]);

const alwaysVisibleHrefs = new Set(["/app/dashboard", "/app/activity"]);

export function filterNavigationItems(
  items: SelfxNavItem[],
  access: NavigationAccess,
): SelfxNavItem[] {
  if (access.isSuperadmin) {
    return items;
  }

  return items
    .map((item) => filterNavigationItem(item, access))
    .filter((item): item is SelfxNavItem => item !== null);
}

function filterNavigationItem(
  item: SelfxNavItem,
  access: NavigationAccess,
): SelfxNavItem | null {
  const children = item.children
    ?.map((child) => filterNavigationItem(child, access))
    .filter((child): child is SelfxNavItem => child !== null);

  if (children && children.length > 0) {
    return { ...item, children };
  }

  if (item.href && canSeeHref(item.href, access)) {
    return item;
  }

  return null;
}

function canSeeHref(href: string, access: NavigationAccess): boolean {
  if (alwaysVisibleHrefs.has(href)) {
    return true;
  }
  if (platformOnlyHrefs.has(href)) {
    return access.hasPlatformAccess;
  }

  const platformPermissions = platformPermissionsByHref[href] ?? [];
  const storePermissions = storePermissionsByHref[href] ?? [];
  const hasStoreRule = storePermissions.length > 0;

  return (
    hasAny(access.platformPermissions, platformPermissions) ||
    (hasStoreRule &&
      access.hasActiveStore &&
      (access.storePlatformBypass ||
        hasAny(access.storePermissions, storePermissions)))
  );
}

function hasAny(actual: string[], required: string[]): boolean {
  return (
    required.length > 0 &&
    required.some((permission) => actual.includes(permission))
  );
}
