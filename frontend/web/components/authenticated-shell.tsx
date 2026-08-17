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
  { href: "/app/stores", label: "Stores", icon: StoreIcon },
  { href: "/app/staff", label: "Staff", icon: UsersIcon },
  { href: "/app/products", label: "Products", icon: PackageIcon },
  { href: "/app/kiosks", label: "Kiosks", icon: MonitorIcon },
  {
    href: "/app/try-on-activity",
    label: "Try-On Activity",
    icon: ActivityIcon,
  },
  { href: "/app/try-on-lab", label: "Try-On Lab", icon: FlaskConicalIcon },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3Icon },
  { href: "/app/integrations", label: "Integrations", icon: BlocksIcon },
  { href: "/app/developer", label: "Developer / API", icon: Code2Icon },
  { href: "/app/billing", label: "Usage & Billing", icon: CreditCardIcon },
  { href: "/app/settings", label: "Settings", icon: SettingsIcon },
  { href: "/app/onboarding", label: "Onboarding Status", icon: Building2Icon },
  { href: "/app/platform", label: "Platform", icon: ShieldIcon },
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
