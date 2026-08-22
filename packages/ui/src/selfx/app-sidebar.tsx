"use client";

import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import {
  BadgeCheckIcon,
  BellIcon,
  ChevronRightIcon,
  CreditCardIcon,
  LogOutIcon,
  MoonIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SparklesIcon,
  SunIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@selfx/ui/components/avatar";
import { Button } from "@selfx/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@selfx/ui/components/dropdown-menu";
import { SelfxLogo } from "./selfx-logo";
import { cn } from "@selfx/ui/lib/utils";
import { useSelfxTheme } from "../theme/selfx-ui-provider";
import type { SelfxNavItem, SelfxUserSummary } from "./types";

export function AppSidebar({
  items,
  activePath,
  user,
  collapsed = false,
  footer,
  onNavigate,
  onNavigateTo,
  onLogout,
  onToggleCollapsed,
}: {
  items: SelfxNavItem[];
  activePath?: string;
  user?: SelfxUserSummary | null;
  collapsed?: boolean;
  footer?: ReactNode;
  onNavigate?: () => void;
  onNavigateTo?: (href: string) => void;
  onLogout?: () => void;
  onToggleCollapsed?: () => void;
}) {
  const initiallyOpen = useMemo(
    () =>
      new Set(
        items
          .filter((item) =>
            item.children?.some((child) => isActive(child, activePath)),
          )
          .map((item) => item.label),
      ),
    [activePath, items],
  );
  const [openGroups, setOpenGroups] = useState<Set<string>>(initiallyOpen);

  function toggleGroup(label: string) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          "flex items-center py-4",
          collapsed
            ? "flex-col justify-center gap-2 px-2"
            : "justify-between gap-2 px-4",
        )}
      >
        <SelfxLogo compact={collapsed} />
        {onToggleCollapsed ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="hidden shrink-0 md:inline-flex"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {collapsed ? (
              <PanelLeftOpenIcon aria-hidden="true" />
            ) : (
              <PanelLeftCloseIcon aria-hidden="true" />
            )}
          </Button>
        ) : null}
      </div>
      <nav
        className={cn(
          "flex-1 space-y-1 overflow-y-auto pb-4",
          collapsed ? "px-2" : "px-2.5",
        )}
        aria-label="Primary"
      >
        {items.map((item) => {
          const hasChildren = Boolean(item.children?.length);
          const active = isActive(item, activePath);
          const open = openGroups.has(item.label);

          if (hasChildren) {
            return (
              <div key={item.label} className="space-y-1">
                <NavButton
                  item={item}
                  active={active}
                  collapsed={collapsed}
                  expanded={open}
                  onClick={() => toggleGroup(item.label)}
                />
                {!collapsed && open ? (
                  <div className="ml-4 space-y-1 border-l border-sidebar-border pl-3">
                    {item.children!.map((child) => (
                      <NavLink
                        key={child.href ?? child.label}
                        item={child}
                        active={isActive(child, activePath)}
                        collapsed={false}
                        onNavigate={onNavigate}
                        onNavigateTo={onNavigateTo}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          }

          return (
            <NavLink
              key={item.href ?? item.label}
              item={item}
              active={active}
              collapsed={collapsed}
              onNavigate={onNavigate}
              onNavigateTo={onNavigateTo}
            />
          );
        })}
      </nav>
      <div
        className={cn(
          "border-t border-sidebar-border",
          collapsed ? "p-2" : "p-3",
        )}
      >
        <SidebarAccount user={user} onLogout={onLogout} collapsed={collapsed} />
        {footer ? <div className="mt-3">{footer}</div> : null}
      </div>
    </div>
  );
}

function NavButton({
  item,
  active,
  collapsed,
  expanded,
  onClick,
}: {
  item: SelfxNavItem;
  active: boolean;
  collapsed: boolean;
  expanded: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      title={collapsed ? item.label : undefined}
      aria-expanded={expanded}
      onClick={onClick}
      className={navItemClass(active, collapsed)}
    >
      {Icon ? <NavIcon icon={Icon} active={active} /> : null}
      <span className={cn("truncate", collapsed && "sr-only")}>
        {item.label}
      </span>
      {!collapsed ? (
        <ChevronRightIcon
          size={16}
          strokeWidth={1.9}
          aria-hidden="true"
          className={cn(
            "ml-auto text-sidebar-muted transition-transform",
            expanded && "rotate-90 text-primary",
          )}
        />
      ) : null}
    </button>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
  onNavigateTo,
}: {
  item: SelfxNavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  onNavigateTo?: (href: string) => void;
}) {
  const Icon = item.icon;
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (item.disabled || !item.href) {
      return;
    }

    if (isPlainLeftClick(event) && onNavigateTo) {
      event.preventDefault();
      onNavigateTo(item.href);
      onNavigate?.();
    }
  };

  return (
    <a
      href={item.disabled || !item.href ? undefined : item.href}
      aria-current={active ? "page" : undefined}
      aria-disabled={item.disabled ? true : undefined}
      onClick={handleClick}
      title={collapsed ? item.label : undefined}
      className={navItemClass(active, collapsed)}
    >
      {Icon ? <NavIcon icon={Icon} active={active} /> : null}
      <span className={cn("truncate", collapsed && "sr-only")}>
        {item.label}
      </span>
    </a>
  );
}

function NavIcon({
  icon: Icon,
  active,
}: {
  icon: NonNullable<SelfxNavItem["icon"]>;
  active: boolean;
}) {
  return (
    <span
      className={cn(
        "flex size-5 items-center justify-center text-sidebar-muted",
        active && "text-primary",
      )}
    >
      <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
    </span>
  );
}

function navItemClass(active: boolean, collapsed: boolean): string {
  return cn(
    "group relative flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 font-sans text-[15px] font-medium leading-5 text-sidebar-muted transition-colors",
    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    active &&
      "bg-[color-mix(in_srgb,var(--selfx-primary),white_88%)] text-sidebar-accent-foreground shadow-[0_1px_3px_rgba(15,23,42,0.14)] before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-primary dark:bg-[color-mix(in_srgb,var(--selfx-primary),black_76%)] dark:shadow-none",
    collapsed && "justify-center gap-0 px-0",
  );
}

function isActive(item: SelfxNavItem, activePath?: string): boolean {
  const selfActive = item.href
    ? activePath === item.href ||
      (item.href !== "/app/dashboard" && activePath?.startsWith(item.href))
    : false;
  return Boolean(
    selfActive || item.children?.some((child) => isActive(child, activePath)),
  );
}

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function SidebarAccount({
  user,
  onLogout,
  collapsed,
}: {
  user?: SelfxUserSummary | null;
  onLogout?: () => void;
  collapsed: boolean;
}) {
  const initials = user ? initialsFor(user) : "SX";
  const { theme, toggleTheme } = useSelfxTheme();
  const nextThemeLabel = theme === "dark" ? "Light mode" : "Dark mode";
  const ThemeIcon = theme === "dark" ? SunIcon : MoonIcon;
  const showStoreCommercialActions = !user?.hasPlatformAccess;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full min-w-0 items-center rounded-xl border border-sidebar-border bg-background text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/35",
          collapsed ? "justify-center p-2" : "gap-3 p-3",
        )}
        title={
          collapsed
            ? [user?.displayName, user?.email].filter(Boolean).join(" - ") ||
              "SelfX user"
            : undefined
        }
        aria-label="Open account menu"
      >
        <Avatar>
          <AvatarFallback className="bg-muted font-sans text-sm font-semibold text-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        {!collapsed ? (
          <>
            <div className="min-w-0 flex-1">
              <span className="block truncate font-sans text-[15px] font-medium leading-5 text-sidebar-foreground">
                {user?.displayName ?? "SelfX user"}
              </span>
              {user?.email ? (
                <span className="block truncate font-sans text-[13px] font-normal leading-4 text-sidebar-muted">
                  {user.email}
                </span>
              ) : null}
            </div>
            <ChevronRightIcon
              size={16}
              strokeWidth={1.9}
              aria-hidden="true"
              className="rotate-90 text-sidebar-muted"
            />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-72 rounded-xl border-sidebar-border bg-sidebar p-0 text-sidebar-foreground shadow-xl"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar size="lg">
                <AvatarFallback className="bg-muted font-sans text-sm font-semibold text-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <span className="block truncate font-sans text-[15px] font-medium leading-5">
                  {user?.displayName ?? "SelfX user"}
                </span>
                {user?.email ? (
                  <span className="block truncate font-sans text-[13px] font-normal leading-4 text-sidebar-muted">
                    {user.email}
                  </span>
                ) : null}
              </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {showStoreCommercialActions ? (
          <>
            <AccountMenuItem
              icon={SparklesIcon}
              label="Upgrade to Pro"
              disabled
            />
            <DropdownMenuSeparator />
          </>
        ) : null}
        <AccountMenuItem icon={BadgeCheckIcon} label="Account" disabled />
        {showStoreCommercialActions ? (
          <AccountMenuItem icon={CreditCardIcon} label="Billing" disabled />
        ) : null}
        <AccountMenuItem icon={BellIcon} label="Notifications" disabled />
        <AccountMenuItem
          icon={ThemeIcon}
          label={nextThemeLabel}
          onClick={toggleTheme}
        />
        <DropdownMenuSeparator />
        <AccountMenuItem icon={LogOutIcon} label="Log out" onClick={onLogout} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountMenuItem({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: NonNullable<SelfxNavItem["icon"]>;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <DropdownMenuItem
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 cursor-pointer gap-3 px-3 font-sans text-[15px] font-medium leading-5 text-sidebar-foreground focus:bg-[color-mix(in_srgb,var(--selfx-primary),white_90%)] focus:text-sidebar-accent-foreground dark:focus:bg-[color-mix(in_srgb,var(--selfx-primary),black_76%)]"
    >
      <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
      {label}
    </DropdownMenuItem>
  );
}

function initialsFor(user: SelfxUserSummary): string {
  const source = user.displayName || user.email;
  return source
    .split(/[.\s@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join("");
}
