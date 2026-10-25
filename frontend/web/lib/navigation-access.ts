import type { SelfxNavItem } from "@selfx/ui";
import type { CurrentPlatformAccess } from "./access-control";
import { storeResourcePermissions } from "./current-store";
import type { EffectiveStorePermissions } from "./stores";

export type NavigationAccess = {
  isSuperadmin: boolean;
  hasPlatformAccess: boolean;
  platformPermissions: string[];
  storePermissions: string[];
  storeResourcePermissions?: string[];
  storePaymentAccess?: { view: boolean; manage: boolean };
  storePlatformBypass: boolean;
  storeFeatureKeys: string[];
  storeLocationLimit?: number | null;
  hasActiveStore: boolean;
};

export function navigationAccess({
  sessionHasPlatformAccess,
  platformAccess,
  storeAccess,
  hasActiveStore,
}: {
  sessionHasPlatformAccess: boolean;
  platformAccess: CurrentPlatformAccess | null;
  storeAccess: EffectiveStorePermissions | null;
  hasActiveStore: boolean;
}): NavigationAccess {
  return {
    isSuperadmin: platformAccess?.isSuperadmin ?? false,
    hasPlatformAccess:
      sessionHasPlatformAccess ||
      (platformAccess?.permissions.length ?? 0) > 0 ||
      (platformAccess?.isSuperadmin ?? false),
    platformPermissions: platformAccess?.permissions ?? [],
    storePermissions: storeAccess?.permissions ?? [],
    storeResourcePermissions: storeResourcePermissions(storeAccess),
    storePaymentAccess: storeAccess?.paymentAccess,
    storePlatformBypass: storeAccess?.platformBypass ?? false,
    storeFeatureKeys: storeAccess?.featureKeys ?? [],
    storeLocationLimit: storeAccess?.storeLocationLimit,
    hasActiveStore,
  };
}

const platformPermissionsByHref: Record<string, string[]> = {
  "/app/dashboard/mobile": ["USAGE_VIEW"],
  "/app/apps-downloads": ["APP_RELEASES_VIEW", "APP_RELEASES_MANAGE"],
  "/app/stores": ["STORES_VIEW"],
  "/app/locations": ["STORES_VIEW"],
  "/app/analytics": ["USAGE_VIEW"],
  "/app/billing": ["USAGE_VIEW"],
  "/app/developer": ["DEVELOPER_API_VIEW", "DEVELOPER_API_MANAGE"],
  "/app/staff": [
    "PLATFORM_USERS_MANAGE",
    "STORE_USERS_VIEW",
    "STORE_USERS_MANAGE",
  ],
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
    "STORE_ROLES_VIEW",
    "STORE_ROLES_MANAGE",
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
  "/app/platform/pricing": ["PRICING_VIEW", "PRICING_MANAGE"],
  "/app/platform/payment-gateways": ["INTEGRATIONS_VIEW"],
  "/app/platform/pricing/features": ["PRICING_VIEW", "PRICING_MANAGE"],
};

const storePermissionsByHref: Record<string, string[]> = {
  "/app/roles": ["roles.view"],
  "/app/products": ["stores.view"],
  "/app/locations": ["stores.view"],
  "/app/kiosks": ["kiosks.view", "kiosks.pair", "kiosks.configure"],
  "/app/staff": ["users.view"],
  "/app/analytics": ["analytics.view"],
  "/app/billing": ["analytics.view"],
  "/app/integrations/shopify": ["integrations.view"],
  "/app/integrations/woocommerce": ["integrations.view"],
};

const storeFeaturesByHref: Record<string, string[]> = {
  "/app/kiosks": ["KIOSK_MANAGEMENT", "KIOSK_RENTAL"],
  "/app/analytics": ["ANALYTICS"],
  "/app/integrations/shopify": ["SHOPIFY_INTEGRATION"],
  "/app/integrations/woocommerce": ["WOOCOMMERCE_INTEGRATION"],
};

const storeTeamLocationHrefs = new Set(["/app/locations", "/app/staff"]);

const platformOrStoreAccessHrefs = new Set([
  "/app/try-on-lab",
  "/app/try-on-lab/garments",
  "/app/try-on-lab/jewellery",
]);

const alwaysVisibleHrefs = new Set([
  "/app/dashboard",
  "/app/activity",
  "/app/account",
]);

// Nested detail pages inherit their workspace's navigation rule. Resource-level
// authorization is still checked by the page and backend using the explicit ID.
export function canReturnToAppPath(
  pathname: string,
  access: NavigationAccess,
): boolean {
  const routes = new Set([
    ...Object.keys(platformPermissionsByHref),
    ...Object.keys(storePermissionsByHref),
    ...platformOrStoreAccessHrefs,
    ...alwaysVisibleHrefs,
    "/app/payments",
    "/app/platform/mail-settings",
  ]);
  const route = [...routes]
    .sort((a, b) => b.length - a.length)
    .find(
      (candidate) =>
        pathname === candidate || pathname.startsWith(`${candidate}/`),
    );
  return !!route && canSeeHref(route, access);
}

export function filterNavigationItems(
  items: SelfxNavItem[],
  access: NavigationAccess,
): SelfxNavItem[] {
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

export function isMerchantOnlyRoute(href: string): boolean {
  const route = normalizeAccessRoute(href);
  return [
    "/app/locations",
    "/app/staff",
    "/app/analytics",
    "/app/products",
    "/app/kiosks",
    "/app/payments",
  ].some(
    (merchantRoute) =>
      route === merchantRoute || route.startsWith(`${merchantRoute}/`),
  );
}

export function canSeeHref(href: string, access: NavigationAccess): boolean {
  const route = normalizeAccessRoute(href);
  if (route === "/app/payments")
    return (
      !access.hasPlatformAccess &&
      !access.isSuperadmin &&
      access.hasActiveStore &&
      access.storePaymentAccess?.view === true
    );
  if (route === "/app/platform/mail-settings") return access.isSuperadmin;
  if (
    route === "/app/kiosks" ||
    route.startsWith("/app/kiosks/") ||
    route === "/app/products"
  ) {
    if (
      access.hasPlatformAccess ||
      access.isSuperadmin ||
      !access.hasActiveStore
    )
      return false;
    const codes =
      access.storeResourcePermissions ??
      (access.storePlatformBypass ? [] : access.storePermissions);
    if (route === "/app/products") return codes.includes("stores.view");
    return (
      codes.some((code) =>
        ["kiosks.view", "kiosks.pair", "kiosks.configure"].includes(code),
      ) && hasAny(access.storeFeatureKeys, ["KIOSK_MANAGEMENT", "KIOSK_RENTAL"])
    );
  }
  if (
    isMerchantOnlyRoute(route) &&
    (access.hasPlatformAccess || access.isSuperadmin)
  ) {
    return false;
  }
  if (route === "/app/developer") {
    return (
      access.isSuperadmin ||
      (access.hasPlatformAccess &&
        hasAny(access.platformPermissions, [
          "DEVELOPER_API_VIEW",
          "DEVELOPER_API_MANAGE",
        ]))
    );
  }
  if (access.isSuperadmin) return true;
  if (alwaysVisibleHrefs.has(route)) {
    return true;
  }
  if (platformOrStoreAccessHrefs.has(route)) {
    return access.hasPlatformAccess || hasResolvedStoreAccess(access);
  }

  const platformPermissions = platformPermissionsByHref[route] ?? [];
  const storePermissions = storePermissionsByHref[route] ?? [];
  const storeFeatures = storeFeaturesByHref[route] ?? [];
  const hasStoreRule = storePermissions.length > 0;
  const hasStoreEntitlement =
    storeFeatures.length === 0 ||
    hasAny(access.storeFeatureKeys, storeFeatures);
  const hasStorePlanEntitlement =
    !storeTeamLocationHrefs.has(route) || hasStoreTeamLocations(access);

  return (
    hasAny(access.platformPermissions, platformPermissions) ||
    (hasStoreRule &&
      access.hasActiveStore &&
      hasStoreEntitlement &&
      hasStorePlanEntitlement &&
      ((route !== "/app/roles" && access.storePlatformBypass) ||
        hasAny(access.storePermissions, storePermissions)))
  );
}

function hasResolvedStoreAccess(access: NavigationAccess): boolean {
  return (
    access.hasActiveStore &&
    (access.storePlatformBypass || access.storePermissions.length > 0)
  );
}

function hasStoreTeamLocations(access: NavigationAccess): boolean {
  return (
    access.storeLocationLimit === null ||
    (typeof access.storeLocationLimit === "number" &&
      access.storeLocationLimit > 0)
  );
}

function normalizeAccessRoute(href: string): string {
  const route = href.split("?")[0] ?? href;
  if (
    route === "/app/products/garments" ||
    route === "/app/products/jewellery"
  ) {
    return "/app/products";
  }
  return route;
}

function hasAny(actual: string[], required: string[]): boolean {
  return (
    required.length > 0 &&
    required.some((permission) => actual.includes(permission))
  );
}
