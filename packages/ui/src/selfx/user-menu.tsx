"use client";

import { LogOutIcon, SettingsIcon, UserRoundIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@selfx/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@selfx/ui/components/dropdown-menu";
import { cn } from "@selfx/ui/lib/utils";
import type { SelfxUserSummary } from "./types";

function initialsFor(user: SelfxUserSummary): string {
  const source = user.displayName || user.email;
  return source
    .split(/[.\s@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join("");
}

export function UserMenu({
  user,
  onLogout,
  onNavigateTo,
}: {
  user?: SelfxUserSummary | null;
  onLogout?: () => void;
  onNavigateTo?: (href: string) => void;
}) {
  const initials = user ? initialsFor(user) : "SX";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open user menu"
        className={cn(
          "group/user-menu inline-flex size-10 cursor-pointer items-center justify-center rounded-full border border-sidebar-border bg-background text-sidebar-muted shadow-xs transition-colors",
          "hover:border-[color-mix(in_srgb,var(--selfx-primary),white_72%)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35",
        )}
      >
        <Avatar>
          <AvatarFallback className="font-sans text-sm font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="sr-only">Open user menu</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border border-sidebar-border bg-sidebar p-2 text-sidebar-foreground shadow-lg ring-1 ring-foreground/10"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar size="lg">
                <AvatarFallback className="bg-sidebar-accent font-sans text-sm font-semibold text-sidebar-accent-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <span className="block truncate font-sans text-sm font-semibold text-sidebar-foreground">
                  {user?.displayName ?? "SelfX user"}
                </span>
                {user?.email ? (
                  <span className="block truncate font-sans text-xs font-normal text-sidebar-muted">
                    {user.email}
                  </span>
                ) : null}
              </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup className="space-y-1">
          <DropdownMenuItem
            disabled
            className="min-h-11 gap-3 rounded-lg border border-transparent px-2.5 py-2 font-sans text-sm font-semibold text-sidebar-muted"
          >
            <span className="flex size-8 items-center justify-center rounded-md border border-sidebar-border bg-background text-sidebar-muted">
              <UserRoundIcon size={16} strokeWidth={1.9} aria-hidden="true" />
            </span>
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!onNavigateTo}
            onClick={() => onNavigateTo?.("/app/settings")}
            className="min-h-11 cursor-pointer gap-3 rounded-lg border border-transparent px-2.5 py-2 font-sans text-sm font-semibold text-sidebar-muted hover:border-sidebar-border focus:border-sidebar-border focus:bg-sidebar-accent focus:text-sidebar-accent-foreground"
          >
            <span className="flex size-8 items-center justify-center rounded-md border border-sidebar-border bg-background text-sidebar-muted group-focus/dropdown-menu-item:border-[color-mix(in_srgb,var(--selfx-primary),white_72%)] group-focus/dropdown-menu-item:bg-white group-focus/dropdown-menu-item:text-primary">
              <SettingsIcon size={16} strokeWidth={1.9} aria-hidden="true" />
            </span>
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onLogout}
          className="min-h-11 cursor-pointer gap-3 rounded-lg border border-transparent px-2.5 py-2 font-sans text-sm font-semibold text-sidebar-muted hover:border-sidebar-border focus:border-sidebar-border focus:bg-sidebar-accent focus:text-sidebar-accent-foreground"
        >
          <span className="flex size-8 items-center justify-center rounded-md border border-sidebar-border bg-background text-sidebar-muted group-focus/dropdown-menu-item:border-[color-mix(in_srgb,var(--selfx-primary),white_72%)] group-focus/dropdown-menu-item:bg-white group-focus/dropdown-menu-item:text-primary">
            <LogOutIcon size={16} strokeWidth={1.9} aria-hidden="true" />
          </span>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
