"use client";

import { MenuIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";

import { Button } from "@selfx/ui/components/button";
import { OrganizationSwitcher } from "./organization-switcher";
import { UserMenu } from "./user-menu";
import type { SelfxOrganizationOption, SelfxUserSummary } from "./types";

export function AppHeader({
  organizations,
  activeOrganizationId,
  onSelectOrganization,
  user,
  onLogout,
  mobileOpened,
  desktopOpened,
  onToggleMobile,
  onToggleDesktop,
}: {
  organizations: SelfxOrganizationOption[];
  activeOrganizationId?: string | null;
  onSelectOrganization?: (organizationId: string) => void;
  user?: SelfxUserSummary | null;
  onLogout?: () => void;
  mobileOpened: boolean;
  desktopOpened: boolean;
  onToggleMobile: () => void;
  onToggleDesktop: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onToggleMobile}
        aria-label={mobileOpened ? "Close navigation" : "Open navigation"}
      >
        <MenuIcon aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden md:inline-flex"
        onClick={onToggleDesktop}
        aria-label={desktopOpened ? "Collapse navigation" : "Expand navigation"}
      >
        {desktopOpened ? (
          <PanelLeftCloseIcon aria-hidden="true" />
        ) : (
          <PanelLeftOpenIcon aria-hidden="true" />
        )}
      </Button>
      <div className="hidden min-w-0 sm:block">
        <OrganizationSwitcher
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          onSelect={onSelectOrganization}
        />
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-3">
        <div className="min-w-0 sm:hidden">
          <OrganizationSwitcher
            organizations={organizations}
            activeOrganizationId={activeOrganizationId}
            onSelect={onSelectOrganization}
          />
        </div>
        <div className="h-8 w-px bg-border" />
        <UserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}
