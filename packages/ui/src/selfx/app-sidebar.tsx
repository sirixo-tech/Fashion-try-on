import type { MouseEvent, ReactNode } from "react";

import { SelfxLogo } from "./selfx-logo.js";
import { cn } from "@selfx/ui/lib/utils";
import type { SelfxNavItem } from "./types.js";

export function AppSidebar({
  items,
  activePath,
  footer,
  onNavigate,
  onNavigateTo,
}: {
  items: SelfxNavItem[];
  activePath?: string;
  footer?: ReactNode;
  onNavigate?: () => void;
  onNavigateTo?: (href: string) => void;
}) {
  return (
    <div className="flex h-full flex-col bg-card">
      <div className="border-b px-5 py-4">
        <SelfxLogo />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Primary">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            activePath === item.href ||
            (item.href !== "/app/dashboard" && activePath?.startsWith(item.href));
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
              key={item.href}
              href={item.disabled ? undefined : item.href}
              aria-current={active ? "page" : undefined}
              aria-disabled={item.disabled ? true : undefined}
              onClick={handleClick}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors",
                "hover:border-border hover:bg-muted/60 hover:text-foreground",
                active &&
                  "border-[color-mix(in_srgb,var(--selfx-primary),white_72%)] bg-[color-mix(in_srgb,var(--selfx-primary),white_92%)] text-foreground before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-primary",
                item.disabled && "pointer-events-none opacity-50",
              )}
            >
              {Icon ? (
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md border bg-background text-muted-foreground",
                    active &&
                      "border-[color-mix(in_srgb,var(--selfx-primary),white_72%)] bg-white text-primary",
                  )}
                >
                  <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                </span>
              ) : null}
              <span className="truncate">{item.label}</span>
            </a>
          );
        })}
      </nav>
      {footer ? <div className="border-t p-3">{footer}</div> : null}
    </div>
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
