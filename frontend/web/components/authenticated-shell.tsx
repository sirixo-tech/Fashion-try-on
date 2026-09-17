"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ActivityIcon,
  BarChart3Icon,
  BlocksIcon,
  Code2Icon,
  CreditCardIcon,
  FlaskConicalIcon,
  GemIcon,
  LayersIcon,
  LayoutDashboardIcon,
  LockKeyholeIcon,
  MapPinIcon,
  MonitorIcon,
  PackageIcon,
  SettingsIcon,
  ShieldIcon,
  StoreIcon,
  UsersIcon,
} from "lucide-react";

import {
  AppShell,
  Button,
  ErrorState,
  LoadingState,
  type SelfxNavItem,
} from "@selfx/ui";

import {
  getCurrentPlatformAccess,
  type CurrentPlatformAccess,
} from "@/lib/access-control";
import {
  filterNavigationItems,
  canSeeHref,
  isMerchantOnlyRoute,
  type NavigationAccess,
} from "@/lib/navigation-access";
import {
  getCurrentMerchantStoreAccess,
  type CurrentStore,
} from "@/lib/current-store";
import { useSession } from "@/lib/session";
import { safeLoginNextPath } from "@/lib/login-next";
import {
  endStoreImpersonation,
  type EffectiveStorePermissions,
  type StoreImpersonationSession,
} from "@/lib/stores";

const navItems: SelfxNavItem[] = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/app/kiosks", label: "Kiosks", icon: MonitorIcon },
  { href: "/app/stores", label: "Stores", icon: StoreIcon },
  {
    label: "Team & locations",
    icon: UsersIcon,
    children: [
      { href: "/app/locations", label: "Locations", icon: MapPinIcon },
      { href: "/app/staff", label: "Staff", icon: UsersIcon },
    ],
  },
  {
    label: "Products",
    icon: PackageIcon,
    children: [
      {
        href: "/app/products/garments",
        label: "Garments",
        icon: PackageIcon,
      },
      {
        href: "/app/products/jewellery",
        label: "Jewellery",
        icon: GemIcon,
      },
    ],
  },
  {
    label: "Try-On Lab",
    icon: FlaskConicalIcon,
    children: [
      {
        href: "/app/try-on-lab/garments",
        label: "Garment Lab",
        icon: PackageIcon,
      },
      {
        href: "/app/try-on-lab/jewellery",
        label: "Jewellery Lab",
        icon: GemIcon,
      },
    ],
  },
  { href: "/app/platform/pricing", label: "Plans", icon: CreditCardIcon },
  {
    label: "Integrations",
    icon: BlocksIcon,
    children: [
      { href: "/app/integrations/shopify", label: "Shopify", icon: StoreIcon },
      {
        href: "/app/integrations/woocommerce",
        label: "WooCommerce",
        icon: BlocksIcon,
      },
    ],
  },
  {
    label: "Access Control",
    icon: LockKeyholeIcon,
    children: [
      {
        href: "/app/permissions",
        label: "Permissions",
        icon: ShieldIcon,
      },
      { href: "/app/roles", label: "Platform Roles", icon: LockKeyholeIcon },
      { href: "/app/users", label: "Platform Users", icon: UsersIcon },
    ],
  },
  { href: "/app/activity", label: "Activity", icon: ActivityIcon },
  { href: "/app/developer", label: "Developer / API", icon: Code2Icon },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3Icon },
  { href: "/app/billing", label: "Usage & Billing", icon: CreditCardIcon },
  {
    label: "Platform",
    icon: SettingsIcon,
    children: [
      { href: "/app/settings", label: "Settings", icon: SettingsIcon },
      {
        href: "/app/platform/pricing/features",
        label: "Plan features",
        icon: LayersIcon,
      },
      { href: "/app/platform", label: "Platform Admin", icon: ShieldIcon },
    ],
  },
];

export function AuthenticatedShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const [currentStore, setCurrentStore] = useState<CurrentStore | null>(null);
  const [storeContextLoaded, setStoreContextLoaded] = useState(false);
  const [impersonation, setImpersonation] =
    useState<StoreImpersonationSession | null>(null);
  const [endingImpersonation, setEndingImpersonation] = useState(false);
  const [contextReloadKey, setContextReloadKey] = useState(0);
  const [organizationError, setOrganizationError] = useState(false);
  const [platformAccess, setPlatformAccess] =
    useState<CurrentPlatformAccess | null>(null);
  const [storeAccess, setStoreAccess] =
    useState<EffectiveStorePermissions | null>(null);
  const [platformAccessError, setPlatformAccessError] = useState(false);
  const [storeAccessError, setStoreAccessError] = useState(false);

  useEffect(() => {
    if (session.status !== "authenticated") {
      setCurrentStore(null);
      setImpersonation(null);
      setPlatformAccess(null);
      setStoreAccess(null);
      setPlatformAccessError(false);
      setStoreAccessError(false);
      return;
    }

    let cancelled = false;

    setStoreContextLoaded(false);
    getCurrentMerchantStoreAccess(session.accessToken)
      .then((access) => {
        if (cancelled) {
          return;
        }

        setOrganizationError(false);
        setStoreAccessError(false);
        setCurrentStore(access.store);
        setStoreAccess(access.permissions);
        setImpersonation(access.impersonation);
        setStoreContextLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setOrganizationError(true);
          setStoreContextLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [contextReloadKey, session.accessToken, session.status]);

  useEffect(() => {
    function refreshImpersonationContext() {
      setContextReloadKey((current) => current + 1);
    }

    window.addEventListener(
      "selfx:impersonation-changed",
      refreshImpersonationContext,
    );
    return () => {
      window.removeEventListener(
        "selfx:impersonation-changed",
        refreshImpersonationContext,
      );
    };
  }, []);

  useEffect(() => {
    if (session.status !== "authenticated") {
      return;
    }

    let cancelled = false;
    setPlatformAccessError(false);

    getCurrentPlatformAccess(session.accessToken)
      .then((nextAccess) => {
        if (!cancelled) {
          setPlatformAccess(nextAccess);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlatformAccessError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session.accessToken, session.status]);

  useEffect(() => {
    if (session.status !== "unauthenticated") {
      return;
    }
    router.replace(loginUrlForCurrentPage());
  }, [pathname, router, session.status]);

  const resolvedNavigationAccess = navigationAccess({
    sessionHasPlatformAccess: impersonation
      ? false
      : (session.user?.hasPlatformAccess ?? false),
    platformAccess: impersonation ? null : platformAccess,
    storeAccess,
    hasActiveStore: currentStore !== null,
  });
  const filteredNavItems = filterNavigationItems(
    navItems,
    resolvedNavigationAccess,
  );
  const merchantRoute = isMerchantOnlyRoute(pathname);
  const merchantContextPending =
    merchantRoute && (!storeContextLoaded || !platformAccess);
  const merchantRouteAllowed =
    !merchantRoute || canSeeHref(pathname, resolvedNavigationAccess);

  if (session.status === "loading") {
    return <LoadingState label="Checking session" />;
  }

  if (session.status === "unauthenticated") {
    return <LoadingState label="Opening sign in" />;
  }

  async function endActiveImpersonation() {
    if (session.status !== "authenticated" || !impersonation) {
      return;
    }

    setEndingImpersonation(true);
    setStoreAccessError(false);
    try {
      await endStoreImpersonation(session.accessToken, impersonation.id);
      setImpersonation(null);
      setContextReloadKey((current) => current + 1);
      router.push("/app/stores");
    } catch {
      setStoreAccessError(true);
    } finally {
      setEndingImpersonation(false);
    }
  }

  return (
    <AppShell
      navItems={filteredNavItems}
      activePath={activePathFor(pathname)}
      organizations={currentStore ? [currentStore] : []}
      activeOrganizationId={currentStore?.id ?? null}
      user={session.user}
      onNavigateTo={(href) => router.push(href)}
      onLogout={() => {
        void session.logout().then(() => router.push("/login"));
      }}
    >
      {impersonation ? (
        <div className="border-b border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="font-semibold">Impersonating Store:</span>{" "}
              {impersonation.targetStoreName}
              <span className="ml-2 text-orange-800">
                Ends {new Date(impersonation.expiresAt).toLocaleTimeString()}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={endingImpersonation}
              onClick={() => void endActiveImpersonation()}
            >
              End impersonation
            </Button>
          </div>
        </div>
      ) : null}
      {organizationError || platformAccessError || storeAccessError ? (
        <div className="flex min-h-[calc(100dvh-3.75rem)] items-center justify-center p-4">
          <ErrorState
            title="Access context unavailable"
            description="The shell could not load your current Store and permission context from SelfX."
            action={{ label: "Retry", onClick: () => void session.refresh() }}
          />
        </div>
      ) : merchantContextPending ? (
        <LoadingState label="Checking Store access" />
      ) : !merchantRouteAllowed ? (
        <ErrorState
          title="Store access required"
          description="This page requires a Store workspace with the appropriate plan and permissions."
          action={{
            label: "Open dashboard",
            onClick: () => router.push("/app/dashboard"),
          }}
        />
      ) : (
        children
      )}
    </AppShell>
  );
}

function activePathFor(pathname: string): string {
  if (pathname === "/app/try-on-lab") {
    return "/app/try-on-lab/garments";
  }
  if (pathname === "/app/products") {
    return "/app/products/garments";
  }
  return pathname;
}

function loginUrlForCurrentPage(): string {
  const next = safeLoginNextPath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
  return `/login?next=${encodeURIComponent(next)}`;
}

function navigationAccess({
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
    storePlatformBypass: storeAccess?.platformBypass ?? false,
    storeFeatureKeys: storeAccess?.featureKeys ?? [],
    storeLocationLimit: storeAccess?.storeLocationLimit,
    hasActiveStore,
  };
}
