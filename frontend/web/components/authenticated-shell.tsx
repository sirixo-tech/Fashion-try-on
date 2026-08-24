"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ActivityIcon,
  BarChart3Icon,
  BlocksIcon,
  Building2Icon,
  Code2Icon,
  CreditCardIcon,
  FlaskConicalIcon,
  LayoutDashboardIcon,
  LockKeyholeIcon,
  MonitorIcon,
  PackageIcon,
  SettingsIcon,
  ShieldIcon,
  StoreIcon,
  UsersIcon,
} from "lucide-react";

import {
  AppShell,
  ErrorState,
  LoadingState,
  PermissionDeniedState,
  type SelfxNavItem,
} from "@selfx/ui";

import {
  listActiveOrganizations,
  type TenantOrganization,
} from "@/lib/organizations";
import { useSession } from "@/lib/session";

const navItems: SelfxNavItem[] = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/app/kiosks", label: "Kiosks", icon: MonitorIcon },
  {
    label: "Stores",
    icon: StoreIcon,
    children: [
      { href: "/app/stores", label: "Stores", icon: StoreIcon },
      {
        href: "/app/onboarding",
        label: "Onboarding Status",
        icon: Building2Icon,
      },
    ],
  },
  { href: "/app/products", label: "Products", icon: PackageIcon },
  { href: "/app/try-on-lab", label: "Try-On Lab", icon: FlaskConicalIcon },
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
  { href: "/app/staff", label: "Staff", icon: UsersIcon },
  { href: "/app/billing", label: "Usage & Billing", icon: CreditCardIcon },
  {
    label: "Platform",
    icon: SettingsIcon,
    children: [
      { href: "/app/settings", label: "Settings", icon: SettingsIcon },
      { href: "/app/platform", label: "Platform Admin", icon: ShieldIcon },
    ],
  },
];

export function AuthenticatedShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const [organizations, setOrganizations] = useState<TenantOrganization[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<
    string | null
  >(null);
  const [organizationError, setOrganizationError] = useState(false);

  useEffect(() => {
    if (session.status !== "authenticated") {
      setOrganizations([]);
      setActiveOrganizationId(null);
      return;
    }

    let cancelled = false;

    listActiveOrganizations(session.accessToken)
      .then((data) => {
        if (cancelled) {
          return;
        }

        setOrganizationError(false);
        setOrganizations(data);
        setActiveOrganizationId((current) => current ?? data[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setOrganizationError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session.accessToken, session.status]);

  if (session.status === "loading") {
    return <LoadingState label="Checking session" />;
  }

  if (session.status === "unauthenticated") {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <PermissionDeniedState
          title="Sign in required"
          description="Use your SelfX staff or platform account to open the admin shell."
          action={{ label: "Sign in", href: "/login" }}
        />
      </main>
    );
  }

  return (
    <AppShell
      navItems={navItems}
      activePath={pathname}
      organizations={organizations}
      activeOrganizationId={activeOrganizationId}
      onSelectOrganization={setActiveOrganizationId}
      user={session.user}
      onNavigateTo={(href) => router.push(href)}
      onLogout={() => {
        void session.logout().then(() => router.push("/login"));
      }}
    >
      {organizationError ? (
        <div className="flex min-h-[calc(100dvh-3.75rem)] items-center justify-center p-4">
          <ErrorState
            title="Store context unavailable"
            description="The shell could not load active Stores from SelfX."
            action={{ label: "Retry", onClick: () => void session.refresh() }}
          />
        </div>
      ) : (
        children
      )}
    </AppShell>
  );
}
