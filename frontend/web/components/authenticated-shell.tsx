"use client";
import { RegionalDateTime } from "@/lib/regional-settings";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ActivityIcon,
  BarChart3Icon,
  BlocksIcon,
  Code2Icon,
  DownloadIcon,
  CreditCardIcon,
  FlaskConicalIcon,
  GemIcon,
  LayersIcon,
  LayoutDashboardIcon,
  LockKeyholeIcon,
  MapPinIcon,
  MonitorIcon,
  MailIcon,
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
  navigationAccess,
} from "@/lib/navigation-access";
import {
  getCurrentMerchantStoreAccess,
  type CurrentStore,
} from "@/lib/current-store";
import { useSession } from "@/lib/session";
import { safeLoginNextPath } from "@/lib/login-next";
import { WorkspaceLoading } from "@/components/workspace-loading";
import {
  endStoreImpersonation,
  type EffectiveStorePermissions,
  type StoreImpersonationSession,
} from "@/lib/stores";

const navItems: SelfxNavItem[] = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/app/stores", label: "Stores", icon: StoreIcon },
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
  { href: "/app/kiosks", label: "Kiosks", icon: MonitorIcon },
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
    label: "Team & Locations",
    icon: UsersIcon,
    children: [
      { href: "/app/locations", label: "Locations", icon: MapPinIcon },
      { href: "/app/staff", label: "Staff", icon: UsersIcon },
    ],
  },
  { href: "/app/platform/pricing", label: "Plans", icon: CreditCardIcon },
  {
    label: "User Management",
    icon: LockKeyholeIcon,
    children: [
      {
        href: "/app/permissions",
        label: "Permissions",
        icon: ShieldIcon,
      },
      { href: "/app/roles", label: "Roles", icon: LockKeyholeIcon },
      { href: "/app/users", label: "Users", icon: UsersIcon },
    ],
  },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3Icon },
  { href: "/app/activity", label: "Activity", icon: ActivityIcon },
  { href: "/app/developer", label: "Developer / API", icon: Code2Icon },
  { href: "/app/billing", label: "Usage & Billing", icon: CreditCardIcon },
  {
    href: "/app/apps-downloads",
    label: "Apps & Downloads",
    icon: DownloadIcon,
  },
  {
    label: "Settings",
    icon: SettingsIcon,
    children: [
      {
        href: "/app/payments",
        label: "Payment Settings",
        icon: CreditCardIcon,
      },
    ],
  },
  {
    label: "Platform Settings",
    icon: SettingsIcon,
    children: [
      { href: "/app/settings", label: "General Settings", icon: SettingsIcon },
      {
        href: "/app/platform/mail-settings",
        label: "Mail Settings",
        icon: MailIcon,
      },
      {
        href: "/app/platform/pricing/features",
        label: "Plan features",
        icon: LayersIcon,
      },
      { href: "/app/platform", label: "Platform Admin", icon: ShieldIcon },
      {
        href: "/app/platform/payment-gateways",
        label: "Payment Gateways",
        icon: CreditCardIcon,
      },
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
    window.addEventListener(
      "selfx:permissions-changed",
      refreshImpersonationContext,
    );
    return () => {
      window.removeEventListener(
        "selfx:impersonation-changed",
        refreshImpersonationContext,
      );
      window.removeEventListener(
        "selfx:permissions-changed",
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
  }, [contextReloadKey, session.accessToken, session.status]);

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
  const mobileDashboard = pathname === "/app/dashboard/mobile";
  const canSwitchDashboard =
    storeContextLoaded &&
    !organizationError &&
    !impersonation &&
    !!platformAccess &&
    (platformAccess.isSuperadmin ||
      platformAccess.permissions.includes("USAGE_VIEW"));

  if (session.status === "loading") {
    return <WorkspaceLoading description="Restoring your session…" />;
  }

  if (session.status === "unauthenticated") {
    return <WorkspaceLoading description="Opening sign in…" />;
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
      appearance={
        pathname.startsWith("/app/dashboard") ? "capitalio" : "default"
      }
      dashboardSwitch={
        canSwitchDashboard
          ? {
              type: mobileDashboard ? "mobile" : "business",
              onChange: (type) =>
                router.push(
                  type === "mobile"
                    ? "/app/dashboard/mobile"
                    : "/app/dashboard",
                ),
            }
          : undefined
      }
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
                Ends{" "}
                {
                  <RegionalDateTime
                    value={impersonation.expiresAt}
                    kind="time"
                  />
                }
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
      ) : mobileDashboard && !canSwitchDashboard ? (
        <ErrorState
          title="Mobile Dashboard access required"
          description="Platform usage permission is required to view mobile customer metrics."
          action={{
            label: "Open Business Dashboard",
            onClick: () => router.push("/app/dashboard"),
          }}
        />
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
  if (pathname === "/app/dashboard/mobile") return "/app/dashboard";
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
