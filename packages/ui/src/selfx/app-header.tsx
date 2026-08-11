"use client";

import {
  ActionIcon,
  Burger,
  Divider,
  Group,
  useMantineTheme,
} from "@mantine/core";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";

import { OrganizationSwitcher } from "@selfx/ui/selfx/organization-switcher";
import { UserMenu } from "@selfx/ui/selfx/user-menu";
import type { SelfxOrganizationOption, SelfxUserSummary } from "./types.js";

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
  const theme = useMantineTheme();

  return (
    <Group h="100%" px="md" gap="sm" wrap="nowrap">
      <Burger
        opened={mobileOpened}
        onClick={onToggleMobile}
        hiddenFrom="md"
        size="sm"
        aria-label="Open navigation"
      />
      <ActionIcon
        visibleFrom="md"
        variant="subtle"
        color="gray"
        size="lg"
        onClick={onToggleDesktop}
        aria-label={desktopOpened ? "Collapse navigation" : "Expand navigation"}
      >
        {desktopOpened ? (
          <PanelLeftCloseIcon size={18} aria-hidden="true" />
        ) : (
          <PanelLeftOpenIcon size={18} aria-hidden="true" />
        )}
      </ActionIcon>
      <Group visibleFrom="sm">
        <OrganizationSwitcher
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          onSelect={onSelectOrganization}
        />
      </Group>
      <Group ml="auto" gap="sm" wrap="nowrap">
        <Group hiddenFrom="sm">
          <OrganizationSwitcher
            organizations={organizations}
            activeOrganizationId={activeOrganizationId}
            onSelect={onSelectOrganization}
          />
        </Group>
        <Divider
          orientation="vertical"
          visibleFrom="sm"
          color={theme.colors.gray[3]}
        />
        <UserMenu user={user} onLogout={onLogout} />
      </Group>
    </Group>
  );
}
