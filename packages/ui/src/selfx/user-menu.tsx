"use client";

import { LogOutIcon, UserIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@selfx/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@selfx/ui/components/dropdown-menu";
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
}: {
  user?: SelfxUserSummary | null;
  onLogout?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/35">
        <Avatar>
          <AvatarFallback>{user ? initialsFor(user) : "SX"}</AvatarFallback>
        </Avatar>
        <span className="sr-only">Open user menu</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-semibold text-foreground">
            {user?.displayName ?? "SelfX user"}
          </span>
          {user?.email ? (
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <UserIcon aria-hidden="true" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onLogout}>
          <LogOutIcon aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
