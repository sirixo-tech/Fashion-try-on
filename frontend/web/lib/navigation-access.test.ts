import { describe, expect, it } from "vitest";
import type { SelfxNavItem } from "@selfx/ui";

import {
  filterNavigationItems,
  canSeeHref,
  isMerchantOnlyRoute,
  type NavigationAccess,
} from "@/lib/navigation-access";

const items: SelfxNavItem[] = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/stores", label: "Stores" },
  { href: "/app/products", label: "Products" },
  { href: "/app/kiosks", label: "Kiosks" },
  {
    label: "Team & locations",
    children: [
      { href: "/app/locations", label: "Locations" },
      { href: "/app/staff", label: "Staff" },
    ],
  },
  {
    label: "Try-On Lab",
    children: [
      { href: "/app/try-on-lab/garments", label: "Garment Lab" },
      { href: "/app/try-on-lab/jewellery", label: "Jewellery Lab" },
    ],
  },
  { href: "/app/platform/pricing", label: "Plans" },
  {
    label: "Integrations",
    children: [
      { href: "/app/integrations/shopify", label: "Shopify" },
      { href: "/app/integrations/woocommerce", label: "WooCommerce" },
    ],
  },
  {
    label: "Access Control",
    children: [
      { href: "/app/permissions", label: "Permissions" },
      { href: "/app/roles", label: "Roles" },
    ],
  },
  { href: "/app/developer", label: "Developer / API" },
  { href: "/app/activity", label: "Activity" },
  {
    label: "Platform",
    children: [
      { href: "/app/settings", label: "Settings" },
      { href: "/app/platform/pricing/features", label: "Plan features" },
      { href: "/app/platform", label: "Platform Admin" },
    ],
  },
  { href: "/app/unknown", label: "Unknown" },
];

const baseAccess: NavigationAccess = {
  isSuperadmin: false,
  hasPlatformAccess: false,
  platformPermissions: [],
  storePermissions: [],
  storePlatformBypass: false,
  storeFeatureKeys: [],
  hasActiveStore: false,
};
it("keeps Mobile Dashboard platform-usage-only without adding a sidebar item", () => {
  expect(canSeeHref("/app/dashboard/mobile", baseAccess)).toBe(false);
  expect(
    canSeeHref("/app/dashboard/mobile", {
      ...baseAccess,
      hasActiveStore: true,
      storePermissions: ["analytics.view", "USAGE_VIEW"],
    }),
  ).toBe(false);
  expect(
    canSeeHref("/app/dashboard/mobile", {
      ...baseAccess,
      hasPlatformAccess: true,
      platformPermissions: ["USAGE_VIEW"],
    }),
  ).toBe(true);
  expect(
    canSeeHref("/app/dashboard/mobile", { ...baseAccess, isSuperadmin: true }),
  ).toBe(true);
});
it("keeps Apps & Downloads platform-only and Account available to every signed-in user", () => {
  expect(canSeeHref("/app/account", baseAccess)).toBe(true);
  expect(
    canSeeHref("/app/apps-downloads", {
      ...baseAccess,
      hasActiveStore: true,
      storePermissions: ["APP_RELEASES_MANAGE"],
    }),
  ).toBe(false);
  expect(
    canSeeHref("/app/apps-downloads", {
      ...baseAccess,
      hasPlatformAccess: true,
      platformPermissions: ["APP_RELEASES_VIEW"],
    }),
  ).toBe(true);
});
it("shows unified Roles for Store role viewers without a location-count plan gate", () => {
  const merchant = {
    ...baseAccess,
    hasActiveStore: true,
    storePermissions: ["roles.view"],
    storeLocationLimit: 0,
  };
  expect(canSeeHref("/app/roles", merchant)).toBe(true);
  expect(
    canSeeHref("/app/roles", {
      ...merchant,
      storePermissions: ["products.manage"],
    }),
  ).toBe(false);
  expect(
    canSeeHref("/app/roles", {
      ...baseAccess,
      hasPlatformAccess: true,
      platformPermissions: ["STORE_ROLES_VIEW"],
    }),
  ).toBe(true);
});
it("shows Store Payment Settings only for actual Store payment viewing access", () => {
  const merchant = {
    ...baseAccess,
    hasActiveStore: true,
    storePaymentAccess: { view: true, manage: true },
  };
  expect(isMerchantOnlyRoute("/app/payments")).toBe(true);
  expect(canSeeHref("/app/payments", merchant)).toBe(true);
  expect(
    canSeeHref("/app/payments", { ...merchant, hasActiveStore: false }),
  ).toBe(false);
  expect(
    canSeeHref("/app/payments", { ...merchant, hasPlatformAccess: true }),
  ).toBe(false);
  expect(
    canSeeHref("/app/payments", {
      ...baseAccess,
      isSuperadmin: true,
      hasActiveStore: true,
      storePlatformBypass: true,
    }),
  ).toBe(false);
  expect(
    canSeeHref("/app/payments", {
      ...baseAccess,
      hasActiveStore: true,
      storePermissions: ["integrations.view", "integrations.manage"],
    }),
  ).toBe(false);
});

it("exposes Mail Settings only to protected Superadmins", () => {
  const path = "/app/platform/mail-settings";
  expect(
    canSeeHref(path, {
      ...baseAccess,
      hasPlatformAccess: true,
      platformPermissions: ["PERMISSIONS_MANAGE"],
    }),
  ).toBe(false);
  expect(
    canSeeHref(path, {
      ...baseAccess,
      hasActiveStore: true,
      storePermissions: ["stores.update"],
    }),
  ).toBe(false);
  expect(canSeeHref(path, { ...baseAccess, isSuperadmin: true })).toBe(true);
});

it("restricts platform gateway navigation to platform integration viewers", () => {
  const route = "/app/platform/payment-gateways";
  expect(
    canSeeHref(route, {
      ...baseAccess,
      hasActiveStore: true,
      storePermissions: ["integrations.view", "integrations.manage"],
    }),
  ).toBe(false);
  expect(
    canSeeHref(route, {
      ...baseAccess,
      hasPlatformAccess: true,
      platformPermissions: ["INTEGRATIONS_VIEW"],
    }),
  ).toBe(true);
});

describe("permission-aware navigation", () => {
  it("keeps only shell basics without platform or Store access", () => {
    expect(labelsFor(baseAccess)).toEqual(["Dashboard", "Activity"]);
  });

  it("shows Store-scoped modules from the selected Store permissions", () => {
    expect(
      labelsFor({
        ...baseAccess,
        hasActiveStore: true,
        storePermissions: [
          "kiosks.view",
          "stores.view",
          "users.view",
          "integrations.view",
          "developer_api.view",
        ],
        storeFeatureKeys: [
          "KIOSK_MANAGEMENT",
          "SHOPIFY_INTEGRATION",
          "WOOCOMMERCE_INTEGRATION",
          "PUBLIC_API",
        ],
        storeLocationLimit: 1,
      }),
    ).toEqual([
      "Dashboard",
      "Products",
      "Kiosks",
      "Team & locations",
      "Locations",
      "Staff",
      "Try-On Lab",
      "Garment Lab",
      "Jewellery Lab",
      "Integrations",
      "Shopify",
      "WooCommerce",
      "Activity",
    ]);
  });

  it("shows platform modules from platform permissions", () => {
    expect(
      labelsFor({
        ...baseAccess,
        hasPlatformAccess: true,
        platformPermissions: [
          "STORES_VIEW",
          "KIOSKS_VIEW",
          "DEVELOPER_API_VIEW",
          "PRICING_VIEW",
        ],
      }),
    ).toEqual([
      "Dashboard",
      "Stores",
      "Try-On Lab",
      "Garment Lab",
      "Jewellery Lab",
      "Plans",
      "Developer / API",
      "Activity",
      "Platform",
      "Plan features",
    ]);
  });

  it("shows Try-On Lab to any platform role", () => {
    expect(
      labelsFor({
        ...baseAccess,
        hasPlatformAccess: true,
      }),
    ).toEqual([
      "Dashboard",
      "Try-On Lab",
      "Garment Lab",
      "Jewellery Lab",
      "Activity",
    ]);
  });

  it("shows Try-On Lab to any resolved Store role", () => {
    expect(
      labelsFor({
        ...baseAccess,
        hasActiveStore: true,
        storePermissions: ["stores.view"],
      }),
    ).toEqual([
      "Dashboard",
      "Products",
      "Try-On Lab",
      "Garment Lab",
      "Jewellery Lab",
      "Activity",
    ]);
  });

  it("hides Store modules when the current plan does not include their features", () => {
    expect(
      labelsFor({
        ...baseAccess,
        hasActiveStore: true,
        storePermissions: [
          "kiosks.view",
          "integrations.view",
          "developer_api.view",
        ],
        storeFeatureKeys: ["SHOPIFY_INTEGRATION"],
      }),
    ).toEqual([
      "Dashboard",
      "Try-On Lab",
      "Garment Lab",
      "Jewellery Lab",
      "Integrations",
      "Shopify",
      "Activity",
    ]);
  });

  it("hides Store team and locations when the plan does not unlock locations", () => {
    expect(
      labelsFor({
        ...baseAccess,
        hasActiveStore: true,
        storePermissions: ["stores.view", "users.view"],
        storeLocationLimit: 0,
      }),
    ).toEqual([
      "Dashboard",
      "Products",
      "Try-On Lab",
      "Garment Lab",
      "Jewellery Lab",
      "Activity",
    ]);
  });

  it("does not let Store platform bypass reveal unrelated platform modules", () => {
    expect(
      labelsFor({
        ...baseAccess,
        hasActiveStore: true,
        storePlatformBypass: true,
        storeLocationLimit: null,
        storeFeatureKeys: [
          "KIOSK_MANAGEMENT",
          "SHOPIFY_INTEGRATION",
          "WOOCOMMERCE_INTEGRATION",
          "PUBLIC_API",
        ],
      }),
    ).toEqual([
      "Dashboard",
      "Team & locations",
      "Locations",
      "Staff",
      "Try-On Lab",
      "Garment Lab",
      "Jewellery Lab",
      "Integrations",
      "Shopify",
      "WooCommerce",
      "Activity",
    ]);
  });

  it("keeps merchant-only modules out of Superadmin navigation", () => {
    expect(labelsFor({ ...baseAccess, isSuperadmin: true })).toEqual([
      "Dashboard",
      "Stores",
      "Try-On Lab",
      "Garment Lab",
      "Jewellery Lab",
      "Plans",
      "Integrations",
      "Shopify",
      "WooCommerce",
      "Access Control",
      "Permissions",
      "Roles",
      "Developer / API",
      "Activity",
      "Platform",
      "Settings",
      "Plan features",
      "Platform Admin",
      "Unknown",
    ]);
  });

  it("blocks merchant routes for platform roles even with Store bypass", () => {
    const access = {
      ...baseAccess,
      isSuperadmin: true,
      hasPlatformAccess: true,
      hasActiveStore: true,
      storePlatformBypass: true,
      storeLocationLimit: 3,
      storeFeatureKeys: ["ANALYTICS"],
    };
    for (const href of [
      "/app/analytics",
      "/app/staff",
      "/app/locations",
      "/app/products",
      "/app/products/garments",
      "/app/products/jewellery",
    ]) {
      expect(canSeeHref(href, access)).toBe(false);
      expect(isMerchantOnlyRoute(`${href}/details`)).toBe(true);
    }
  });

  it("shows Store kiosks with permission and plan even before any device exists", () => {
    const access = {
      ...baseAccess,
      hasActiveStore: true,
      storePermissions: ["kiosks.view", "kiosks.pair"],
      storeFeatureKeys: ["KIOSK_MANAGEMENT"],
    };
    expect(canSeeHref("/app/kiosks", access)).toBe(true);
    expect(canSeeHref("/app/kiosks/device/edit", access)).toBe(true);
    expect(canSeeHref("/app/kiosks", { ...access, storePermissions: [] })).toBe(
      false,
    );
    expect(canSeeHref("/app/kiosks", { ...access, storeFeatureKeys: [] })).toBe(
      false,
    );
    expect(
      canSeeHref("/app/kiosks", {
        ...access,
        storePlatformBypass: true,
        storeResourcePermissions: [],
      }),
    ).toBe(false);
    expect(
      canSeeHref("/app/products", {
        ...access,
        storePermissions: ["stores.view"],
        storePlatformBypass: true,
        storeResourcePermissions: [],
      }),
    ).toBe(false);
    expect(
      canSeeHref("/app/kiosks", {
        ...access,
        hasPlatformAccess: true,
        isSuperadmin: true,
      }),
    ).toBe(false);
  });

  it("requires Store analytics permission and plan, including impersonation", () => {
    const access = {
      ...baseAccess,
      hasActiveStore: true,
      storePermissions: ["analytics.view"],
      storeFeatureKeys: ["ANALYTICS"],
    };
    expect(canSeeHref("/app/analytics", access)).toBe(true);
    expect(
      canSeeHref("/app/analytics", { ...access, storePermissions: [] }),
    ).toBe(false);
    expect(
      canSeeHref("/app/analytics", { ...access, storeFeatureKeys: [] }),
    ).toBe(false);
    expect(
      canSeeHref("/app/analytics", {
        ...access,
        storePermissions: [],
        storePlatformBypass: true,
      }),
    ).toBe(true);
  });
});

function labelsFor(access: NavigationAccess): string[] {
  return flattenLabels(filterNavigationItems(items, access));
}

function flattenLabels(itemsToFlatten: SelfxNavItem[]): string[] {
  return itemsToFlatten.flatMap((item) => [
    item.label,
    ...flattenLabels(item.children ?? []),
  ]);
}
