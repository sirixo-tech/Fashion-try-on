"use client";

import type { ReactNode } from "react";
import { AppShell as MantineAppShell, ScrollArea } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

import { AppHeader } from "@selfx/ui/selfx/app-header";
import { AppSidebar } from "@selfx/ui/selfx/app-sidebar";
import type {
  SelfxNavItem,
  SelfxOrganizationOption,
  SelfxUserSummary,
} from "./types.js";

export function AppShell({
  children,
  navItems,
  activePath,
  organizations,
  activeOrganizationId,
  onSelectOrganization,
  user,
  onLogout,
}: {
  children: ReactNode;
  navItems: SelfxNavItem[];
  activePath?: string;
  organizations: SelfxOrganizationOption[];
  activeOrganizationId?: string | null;
  onSelectOrganization?: (organizationId: string) => void;
  user?: SelfxUserSummary | null;
  onLogout?: () => void;
}) {
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] =
    useDisclosure(false);
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);

  return (
    <MantineAppShell
      header={{ height: 60 }}
      navbar={{
        width: 280,
        breakpoint: "md",
        collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
      }}
      padding={0}
    >
      <MantineAppShell.Header>
        <AppHeader
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          onSelectOrganization={onSelectOrganization}
          user={user}
          onLogout={onLogout}
          mobileOpened={mobileOpened}
          desktopOpened={desktopOpened}
          onToggleMobile={toggleMobile}
          onToggleDesktop={toggleDesktop}
        />
      </MantineAppShell.Header>
      <MantineAppShell.Navbar p={0}>
        <ScrollArea>
          <AppSidebar
            items={navItems}
            activePath={activePath}
            onNavigate={closeMobile}
          />
        </ScrollArea>
      </MantineAppShell.Navbar>
      <MantineAppShell.Main>{children}</MantineAppShell.Main>
    </MantineAppShell>
  );
}
