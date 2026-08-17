"use client";

import { useState, type ReactNode } from "react";

import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { Sheet, SheetContent, SheetTitle } from "@selfx/ui/components/sheet";
import { cn } from "@selfx/ui/lib/utils";
import type {
  SelfxNavItem,
  SelfxOrganizationOption,
  SelfxUserSummary,
} from "./types";

export function AppShell({
  children,
  navItems,
  activePath,
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
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  const mobileSidebar = (
    <AppSidebar
      items={navItems}
      activePath={activePath}
      user={user}
      onLogout={onLogout}
      onNavigate={() => setMobileOpened(false)}
      onNavigateTo={onNavigateTo}
    />
  );
  const desktopSidebar = (
    <AppSidebar
      items={navItems}
      activePath={activePath}
      user={user}
      collapsed={desktopCollapsed}
      onToggleCollapsed={() => setDesktopCollapsed((collapsed) => !collapsed)}
      onLogout={onLogout}
      onNavigateTo={onNavigateTo}
    />
  );

  return (
    <div className="min-h-dvh bg-background">
      <AppHeader
        mobileOpened={mobileOpened}
        onToggleMobile={() => setMobileOpened((opened) => !opened)}
      />
      <Sheet open={mobileOpened} onOpenChange={setMobileOpened}>
        <SheetContent side="left" className="w-64 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Primary navigation</SheetTitle>
          {mobileSidebar}
        </SheetContent>
      </Sheet>
      <div className="flex">
        <aside
          className={cn(
            "sticky top-0 hidden h-dvh shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:block",
            desktopCollapsed ? "w-20" : "w-64",
          )}
        >
          {desktopSidebar}
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
