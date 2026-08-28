import { describe, expect, it } from "vitest";
import type { SelfxNavItem } from "@selfx/ui";

import {
  filterNavigationItems,
  type NavigationAccess,
} from "@/lib/navigation-access";

const items: SelfxNavItem[] = [
  { href: "/app/dashboard", label: "Dashboard" },
  {
    label: "Stores",
    children: [
      { href: "/app/stores", label: "Stores" },
      { href: "/app/onboarding", label: "Onboarding" },
    ],
  },
  { href: "/app/products", label: "Products" },
  { href: "/app/kiosks", label: "Kiosks" },
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
  { href: "/app/staff", label: "Staff" },
  { href: "/app/developer", label: "Developer / API" },
  { href: "/app/activity", label: "Activity" },
  { href: "/app/unknown", label: "Unknown" },
];

const baseAccess: NavigationAccess = {
  isSuperadmin: false,
  hasPlatformAccess: false,
  platformPermissions: [],
  storePermissions: [],
  storePlatformBypass: false,
  hasActiveStore: false,
};

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
          "users.view",
          "integrations.view",
          "developer_api.view",
        ],
      }),
    ).toEqual([
      "Dashboard",
      "Integrations",
      "Shopify",
      "WooCommerce",
      "Staff",
      "Developer / API",
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
        ],
      }),
    ).toEqual([
      "Dashboard",
      "Stores",
      "Stores",
      "Kiosks",
      "Developer / API",
      "Activity",
    ]);
  });

  it("does not let Store platform bypass reveal unrelated platform modules", () => {
    expect(
      labelsFor({
        ...baseAccess,
        hasActiveStore: true,
        storePlatformBypass: true,
      }),
    ).toEqual([
      "Dashboard",
      "Integrations",
      "Shopify",
      "WooCommerce",
      "Staff",
      "Developer / API",
      "Activity",
    ]);
  });

  it("lets protected Superadmin see the complete navigation tree", () => {
    expect(labelsFor({ ...baseAccess, isSuperadmin: true })).toEqual([
      "Dashboard",
      "Stores",
      "Stores",
      "Onboarding",
      "Products",
      "Kiosks",
      "Integrations",
      "Shopify",
      "WooCommerce",
      "Access Control",
      "Permissions",
      "Roles",
      "Staff",
      "Developer / API",
      "Activity",
      "Unknown",
    ]);
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
