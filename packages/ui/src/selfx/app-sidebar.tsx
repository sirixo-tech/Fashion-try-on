import type { MouseEvent, ReactNode } from "react";
import { NavLink, Stack, ThemeIcon } from "@mantine/core";

import { SelfxLogo } from "@selfx/ui/selfx/selfx-logo";
import type { SelfxNavItem } from "./types.js";
import classes from "./app-sidebar.module.css";

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
    <Stack h="100%" gap={0} className={classes.sidebar}>
      <Stack px="md" py="md" className={classes.brand}>
        <SelfxLogo />
      </Stack>
      <Stack
        component="nav"
        gap={4}
        px="sm"
        py="md"
        aria-label="Primary"
        className={classes.nav}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            activePath === item.href ||
            (item.href !== "/app/dashboard" &&
              activePath?.startsWith(item.href));
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
            <NavLink
              key={item.href}
              component="a"
              className={classes.navItem}
              classNames={{
                label: classes.navLabel,
                section: classes.navSection,
              }}
              href={item.disabled ? undefined : item.href}
              label={item.label}
              leftSection={
                Icon ? (
                  <ThemeIcon
                    className={classes.navIcon}
                    color={active ? "selfx" : "gray"}
                    variant={active ? "filled" : "subtle"}
                    size={30}
                    radius="md"
                  >
                    <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                  </ThemeIcon>
                ) : undefined
              }
              active={active}
              disabled={item.disabled}
              aria-current={active ? "page" : undefined}
              onClick={handleClick}
              variant="subtle"
            />
          );
        })}
      </Stack>
      {footer ? (
        <Stack mt="auto" p="sm">
          {footer}
        </Stack>
      ) : null}
    </Stack>
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
