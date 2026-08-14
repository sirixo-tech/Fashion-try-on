"use client";

import { useState, type ReactNode } from "react";

import { AppHeader } from "./app-header.js";
import { AppSidebar } from "./app-sidebar.js";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@selfx/ui/components/sheet";
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
  onNavigateTo,
}: {
  children: ReactNode;
  navItems: SelfxNavItem[];
  activePath?: string;
  organizations: SelfxOrganizationOption[];
  activeOrganizationId?: string | null;
  onSelectOrganization?: (organizationId: string) => void;
  user?: SelfxUserSummary | null;
  onLogout?: () => void;
  onNavigateTo?: (href: string) => void;
}) {
  const [mobileOpened, setMobileOpened] = useState(false);
  const [desktopOpened, setDesktopOpened] = useState(true);

  const sidebar = (
    <AppSidebar
      items={navItems}
      activePath={activePath}
      onNavigate={() => setMobileOpened(false)}
      onNavigateTo={onNavigateTo}
    />
  );

  return (
    <div className="min-h-dvh bg-background">
      <AppHeader
        organizations={organizations}
        activeOrganizationId={activeOrganizationId}
        onSelectOrganization={onSelectOrganization}
        user={user}
        onLogout={onLogout}
        mobileOpened={mobileOpened}
        desktopOpened={desktopOpened}
        onToggleMobile={() => setMobileOpened((opened) => !opened)}
        onToggleDesktop={() => setDesktopOpened((opened) => !opened)}
      />
      <Sheet open={mobileOpened} onOpenChange={setMobileOpened}>
        <SheetContent side="left" className="w-72 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Primary navigation</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>
      <div className="flex">
        {desktopOpened ? (
          <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-72 shrink-0 border-r bg-card md:block">
            {sidebar}
          </aside>
        ) : null}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
