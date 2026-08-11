import type { ReactNode } from "react";
import { NavLink, Stack } from "@mantine/core";

import { SelfxLogo } from "@selfx/ui/selfx/selfx-logo";
import type { SelfxNavItem } from "./types.js";

export function AppSidebar({
  items,
  activePath,
  footer,
  onNavigate,
}: {
  items: SelfxNavItem[];
  activePath?: string;
  footer?: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Stack h="100%" gap={0}>
      <Stack px="md" py="md">
        <SelfxLogo />
      </Stack>
      <Stack component="nav" gap={4} px="xs" py="xs" aria-label="Primary">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            activePath === item.href ||
            (item.href !== "/app/dashboard" &&
              activePath?.startsWith(item.href));

          return (
            <NavLink
              key={item.href}
              component="a"
              href={item.disabled ? undefined : item.href}
              label={item.label}
              leftSection={
                Icon ? <Icon size={18} strokeWidth={1.8} /> : undefined
              }
              active={active}
              disabled={item.disabled}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
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
